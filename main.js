const { app, BrowserWindow, ipcMain, screen, shell, dialog, Tray, Menu, session,globalShortcut} = require('electron')
const { clipboard, nativeImage,desktopCapturer  } = require('electron')
const { autoUpdater } = require('electron-updater')
const path = require('path')
const { spawn } = require('child_process')
const { randomBytes } = require('crypto')
const { exec, execSync } = require('child_process');
const { download } = require('electron-dl');
const fs = require('fs')
const os = require('os')
const net = require('net') // Port detection
const dgram = require('dgram');
const osc = require('osc');
const chokidar = require('chokidar');
let workspaceWatcher = null; // Global workspace watcher
// VMC UDP resources
let vmcUdpPort = null;          // osc.UDPPort instance
let vmcReceiverActive = false;  // Whether receiver is active
let vrmWindows = [];
let thaWindows = [];
let soulxWindows = [];
let shotOverlay = null
let minimalWindow = null
let dynamicIslandWindow = null
let isMac = process.platform === 'darwin';
const vmcSendSocket = dgram.createSocket('udp4'); // Reuse one socket for sending
const MAX_LOG_LINES = 2000; // Retain latest 2000 log lines
let logBuffer = []; // In-memory log buffer
let activeDownloads = new Map(); 
function appendLogToBuffer(source, data) {
  const timestamp = new Date().toLocaleTimeString();
  const lines = data.toString().split(/\r?\n/);
  
  lines.forEach(line => {
    if (line.trim()) {
      logBuffer.push(`[${timestamp}] [${source}] ${line}`);
    }
  });

  // Discard old logs to bound memory use
  if (logBuffer.length > MAX_LOG_LINES) {
    logBuffer = logBuffer.slice(logBuffer.length - MAX_LOG_LINES);
  }
}
async function cropDesktop(rect) {
  if (!rect || typeof rect.x !== 'number' || typeof rect.y !== 'number' ||
      typeof rect.width !== 'number' || typeof rect.height !== 'number') {
    throw new Error('cropDesktop requires numeric {x,y,width,height} values')
  }

  const { width, height } = screen.getPrimaryDisplay().bounds
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height }
  })
  if (!sources.length) throw new Error('Could not acquire a screen source')

  // 1. Capture full-screen PNG buffer
  const pngBuffer = sources[0].thumbnail.toPNG()

  // 2. Crop with Electron nativeImage
  const img  = nativeImage.createFromBuffer(pngBuffer)
  const cropped = img.crop({
    x: Math.floor(rect.x),
    y: Math.floor(rect.y),
    width: Math.floor(rect.width),
    height: Math.floor(rect.height)
  })

  // 3. Return Buffer directly
  return cropped.toPNG()
}

// Start VMC receiver
function startVMCReceiver(cfg) {
  if (vmcReceiverActive) return;
  vmcUdpPort = new osc.UDPPort({
    localAddress: '0.0.0.0',
    localPort: cfg.receive.port,
    metadata: true,
  });
  vmcUdpPort.open();
  vmcUdpPort.on('message', (oscMsg) => {

    /* -------- 1. Bones -------- */
    if (oscMsg.address === '/VMC/Ext/Bone/Pos') {
      if (!Array.isArray(oscMsg.args) || oscMsg.args.length < 8) return;
      const [boneName, x, y, z, qx, qy, qz, qw] = oscMsg.args.map(v => v.value ?? v);
      if (typeof boneName !== 'string') return;

      vrmWindows.forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('vmc-bone', { boneName, position:{x,y,z}, rotation:{x:qx,y:qy,z:qz,w:qw} });
          w.webContents.send('vmc-osc-raw', oscMsg);
        }
      });
      return;
    }

    /* -------- 2. Expressions -------- */
    if (oscMsg.address === '/VMC/Ext/Blend/Val') {
      if (!Array.isArray(oscMsg.args) || oscMsg.args.length < 2) return;
      vrmWindows.forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('vmc-osc-raw', oscMsg);
      });
      return;
    }

    /* -------- 3. Apply expressions -------- */
    if (oscMsg.address === '/VMC/Ext/Blend/Apply') {
      // Apply has no arguments; zero length is valid
      vrmWindows.forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('vmc-osc-raw', oscMsg);
      });
    }
  });


  vmcReceiverActive = true;
  console.log(`[VMC] Receiver started @ ${cfg.receive.port}`);
}
function stopVMCReceiver() {
  if (!vmcReceiverActive) return;
  vmcUdpPort.close();
  vmcUdpPort = null;
  vmcReceiverActive = false;
  console.log('[VMC] Receiver stopped');
}

// Send VMC Bone -------------------------------------------------
function sendVMCBoneMain(data) {
  if (!data) return;
  const { boneName, position, rotation } = data;
  if (!boneName || !position || !rotation) return;

  const { host, port } = global.vmcCfg.send;          // Panel configuration
  const oscMsg = osc.writePacket({
    address: `/VMC/Ext/Bone/Pos`,
    args: [
      { type: 's', value: boneName },
      { type: 'f', value: position.x || 0 },
      { type: 'f', value: position.y || 0 },
      { type: 'f', value: position.z || 0 },
      { type: 'f', value: rotation.x || 0 },
      { type: 'f', value: rotation.y || 0 },
      { type: 'f', value: rotation.z || 0 },
      { type: 'f', value: rotation.w || 1 },
    ],
  });
  vmcSendSocket.send(oscMsg, port, host, (err) => {
    if (err) console.error('VMC send error:', err);
  });
}

// Send VMC Blend ------------------------------------------------
function sendVMCBlendMain(data) {
  if (!data) return;
  const { blendName, weight } = data;
  if (typeof blendName !== 'string' || typeof weight !== 'number') return;

  const { host, port } = global.vmcCfg.send;          // Panel configuration
  const oscMsg = osc.writePacket({
    address: '/VMC/Ext/Blend/Val',
    args: [
      { type: 's', value: blendName },
      { type: 'f', value: Math.max(0, Math.min(1, weight)) },
    ],
  });
  vmcSendSocket.send(oscMsg, port, host, (err) => {
    if (err) console.error('VMC blend send error:', err);
  });
}

// Send VMC Blend Apply ------------------------------------------
function sendVMCBlendApplyMain() {
  const { host, port } = global.vmcCfg.send;          // Panel configuration
  const oscMsg = osc.writePacket({
    address: '/VMC/Ext/Blend/Apply',
    args: [],
  });
  vmcSendSocket.send(oscMsg, port, host);
}

let pythonExec;
let isQuitting = false;

// Determine operating system
if (os.platform() === 'win32') {
  // Windows
  pythonExec = path.join('.venv', 'Scripts', 'python.exe');
} else {
  // macOS / Linux
  pythonExec = path.join('.venv', 'bin', 'python3');
}


function getCleanUserAgent() {
  const chromeVersion = '124.0.0.0'; // Keep version consistent with frontend
  const baseUA = `Mozilla/5.0 ({os_info}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  
  let osInfo = '';
  // Use process.platform in Node.js
  switch (process.platform) {
    case 'darwin':
      osInfo = 'Macintosh; Intel Mac OS X 10_15_7';
      break;
    case 'win32':
      osInfo = 'Windows NT 10.0; Win64; x64';
      break;
    case 'linux':
      osInfo = 'X11; Linux x86_64';
      break;
    default:
      osInfo = 'Windows NT 10.0; Win64; x64';
  }

  return baseUA.replace('{os_info}', osInfo);
}

// Compute in advance
const REAL_CHROME_UA = getCleanUserAgent();

let mainWindow
let loadingWindow
let tray = null
let updateAvailable = false
// Keep inherited updater dormant until a fork-owned feed is verified.
const ENABLE_AUTO_UPDATES = false
let backendProcess = null
const HOST = '127.0.0.1'
let PORT = 3456 // Mutable active port
const desktopSessionToken = randomBytes(32).toString('hex');
const extensionWindows = new Map();

function authorizeDesktopRequests(electronSession) {
  electronSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://127.0.0.1/*', 'ws://127.0.0.1/*'] },
    (details, callback) => {
      const url = new URL(details.url);
      const origin = `http://127.0.0.1:${PORT}`;
      const managedWindows = [
        mainWindow, minimalWindow, dynamicIslandWindow, shotOverlay,
        ...vrmWindows, ...thaWindows, ...soulxWindows,
      ];
      const window = managedWindows.find(item =>
        item && !item.isDestroyed() && item.webContents.id === details.webContentsId);
      const headers = { ...details.requestHeaders };
      if (window && url.host === `127.0.0.1:${PORT}`) {
        const frameUrl = details.frame?.url || window.webContents.getURL();
        const firstNavigation = details.resourceType === 'mainFrame' &&
          (!frameUrl || frameUrl === 'about:blank' || frameUrl.startsWith('file:'));
        const sameFrame = frameUrl === origin || frameUrl.startsWith(origin + '/');
        if ((firstNavigation || sameFrame) &&
            (!details.initiatorOrigin || details.initiatorOrigin === origin || firstNavigation)) {
          headers['X-SAP-Session'] = desktopSessionToken;
        }
      }
      const extensionPath = extensionWindows.get(details.webContentsId);
      if (extensionPath && url.origin === origin &&
          (url.pathname.startsWith(extensionPath.assets) || url.pathname.startsWith(extensionPath.node))) {
        const source = details.frame?.url;
        if (details.resourceType === 'mainFrame' ||
            (source && new URL(source).origin === origin &&
             (new URL(source).pathname.startsWith(extensionPath.assets) ||
              new URL(source).pathname.startsWith(extensionPath.node)))) {
          headers['X-SAP-Session'] = desktopSessionToken;
        }
      }
      callback({ requestHeaders: headers });
    },
  );
}
const DEFAULT_PORT = 3456 // Default port
const isDev = process.env.NODE_ENV === 'development'
const locales = {
  'en-US': {
    show: 'Show Window',
    exit: 'Exit',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    copyImage: 'Copy Image',
    copyImageLink: 'Copy Image Link',
    saveImageAs: 'Save Image As...',
    supportedFiles: 'Supported Files',
    allFiles: 'All Files',
    supportedimages: 'Supported Images',
    // Context-menu entries
    openNewTab: 'Open in new tab',
    copyLink: 'Copy link address',
    copyLinkText: 'Copy link text',
    selectAll: 'Select All',
    inspect: 'Inspect'
  }
};
const ALLOWED_EXTENSIONS = [
  // Office documents
    'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'pdf', 'pages', 
    'numbers', 'key', 'rtf', 'odt', 'epub',
  
  // Software development
  'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'go', 'rs',
  'swift', 'kt', 'dart', 'rb', 'php', 'html', 'css', 'scss', 'less',
  'vue', 'svelte', 'jsx', 'tsx', 'json', 'xml', 'yml', 'yaml', 
  'sql', 'sh',
  
  // Data and configuration
  'csv', 'tsv', 'txt', 'md', 'log', 'conf', 'ini', 'env', 'toml'
  ];
const ALLOWED_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const ALLOWED_VIDEO_EXTENSIONS =['mp4', 'webm', 'ogg', 'mov', 'avi'];
let currentLanguage = 'en-US';

// Build menu items
let menu;

// Configure log path
const logDir = path.join(app.getPath('userData'), 'logs')
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true })
}

// Get configuration file path
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

// Load environment variables
function loadEnvVariables() {
  const configPath = getConfigPath();
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Load configuration into environment variables
      for (const key in config) {
        const val = config[key];
        // Load only primitive values into env
        if (typeof val === 'string' || typeof val === 'number') {
          process.env[key] = val;
        }
      }
      return config; // Return full configuration for CDP
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }
  return {};
}

function saveEnvVariable(key, value) {
  const configPath = getConfigPath();
  let config = {};
  
  // 1. Read existing file
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) { console.error('Settings file read error:', e); }

  // 2. Update file contents, including objects and strings
  config[key] = value;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  // 3. Check types
  // Write only strings or numbers into process.env, preventing object stringification
  if (typeof value === 'string' || typeof value === 'number') {
    process.env[key] = value;
  }
}

const globalConfig = loadEnvVariables();

// ============================================================
// Multi-account management
// ============================================================
let currentAccountId = null;
let currentAccountDataPath = null;
let launchAccountId = null;

function getAccountsPath() {
  return path.join(app.getPath('userData'), 'accounts.json');
}

function loadAccounts() {
  const accountsPath = getAccountsPath();
  if (fs.existsSync(accountsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(accountsPath, 'utf8'));
      return {
        accounts: data.accounts || [],
        defaultAccountId: data.defaultAccountId || null
      };
    } catch (e) {
      console.error('[Accounts] Failed to load accounts:', e);
    }
  }
  return { accounts: [], defaultAccountId: null };
}

function saveAccounts(data) {
  const accountsPath = getAccountsPath();
  const dir = path.dirname(accountsPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(accountsPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('[Accounts] Account list saved');
}

function getAccountById(id) {
  const data = loadAccounts();
  return data.accounts.find(a => a.id === id) || null;
}

// ============================================================
// Parse --account=<id> for multi-account startup
// ============================================================
const ACCOUNT_ARG_KEY = '--account=';
for (const arg of process.argv) {
  if (arg.startsWith(ACCOUNT_ARG_KEY)) {
    launchAccountId = arg.substring(ACCOUNT_ARG_KEY.length);
    console.log('[Accounts] Received --account argument:', launchAccountId);
    break;
  }
}

// Global variables
let SESSION_CDP_PORT = 0; // Initially zero
let IS_INTERNAL_MODE_ACTIVE = false;

// Always enable built-in CDP on loopback only,
// avoiding restart when browser control is needed.
// The chromeMCPSettings.enabled frontend switch controls tool availability.
app.commandLine.appendSwitch('remote-debugging-port', '0');
app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1');
app.commandLine.appendSwitch('remote-allow-origins', '*');
IS_INTERNAL_MODE_ACTIVE = true;
console.log('[CDP] Requested an automatically allocated browser debugging port...');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096'); // Allow up to 4GB of memory
if (isDev) {
  // Disable HTTP cache in development so frontend edits take effect immediately
  app.commandLine.appendSwitch('disable-http-cache');
  console.log('[DEV] HTTP cache disabled; frontend changes take effect immediately');
}
// Check whether port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(port, HOST, () => {
      server.once('close', () => resolve(true))
      server.close()
    })
    server.on('error', () => resolve(false))
  })
}

// Find available port
async function findAvailablePort(startPort = DEFAULT_PORT, maxAttempts = 20000) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    if (await isPortAvailable(port)) {
      return port
    }
  }
  throw new Error("No available port found; tried " + startPort + " to " + (startPort + maxAttempts - 1))
}


async function launchAppWithDebugging(appPath, port, forceNewInstance) {
  try {
    let profileDir = null;
    const debugArgs = [
      `--remote-debugging-port=${port}`,
      '--remote-debugging-address=127.0.0.1',
    ];
    if (forceNewInstance) {
      profileDir = path.join(os.tmpdir(), `sap-cdp-profile-${port}`);
      try { fs.mkdirSync(profileDir, { recursive: true }); } catch (e) {}
      debugArgs.push(`--user-data-dir=${profileDir}`);
    }
    debugArgs.push('--no-first-run', '--no-default-browser-check');

    let child;
    if (process.platform === 'darwin' && appPath.endsWith('.app')) {
      // macOS: launch the executable inside the app bundle directly; open -n can
      // exit immediately, misleading exitCode checks and NSApplication instance routing.
      const macosDir = path.join(appPath, 'Contents', 'MacOS');
      let execPath = appPath;
      if (fs.existsSync(macosDir)) {
        const files = fs.readdirSync(macosDir);
        const electronBin = files.find(f => f === 'Electron');
        const otherBin = files.find(f => !f.startsWith('.') && !f.endsWith('.plist') && f !== 'Electron');
        const chosen = electronBin || otherBin || (files.length > 0 ? files[0] : null);
        if (chosen) {
          execPath = path.join(macosDir, chosen);
        }
      }
      console.log('[LocalAppControl] Launch command:', execPath, debugArgs.join(' '));
      child = spawn(execPath, debugArgs, { detached: true, stdio: 'ignore' });
    } else {
      let execPath = appPath;

      // Windows: appPath may be a directory (from start menu scan) or missing .exe; resolve to actual exe
      if (process.platform === 'win32') {
        // Try .exe extension if path doesn't exist directly
        if (!fs.existsSync(appPath) && !appPath.toLowerCase().endsWith('.exe') && fs.existsSync(appPath + '.exe')) {
          execPath = appPath + '.exe';
        }
        try {
          const s = fs.statSync(execPath);
          if (s.isDirectory()) {
            const found = findElectronExe(execPath);
            if (found) {
              try {
                if (fs.statSync(found).isFile()) { execPath = found; }
              } catch (e) {}
            }
            if (execPath === appPath || (fs.existsSync(execPath) && fs.statSync(execPath).isDirectory())) {
              // findElectronExe returned a directory; scan for any .exe inside
              const entries = fs.readdirSync(execPath);
              const skip = /uninstall|update|setup|crashpad|notifier/i;
              let exe = entries.find(f => f.toLowerCase().endsWith('.exe') && !skip.test(f));
              if (!exe) exe = entries.find(f => f.toLowerCase().endsWith('.exe'));
              if (exe) execPath = path.join(execPath, exe);
            }
          }
        } catch (e) {}
      }

      console.log('[LocalAppControl] Launch command:', execPath, debugArgs.join(' '));
      child = spawn(execPath, debugArgs, { detached: true, stdio: 'ignore' });
    }
    child.on('error', (err) => {
      console.error('[LocalAppControl] Failed to launch process:', err.message);
    });
    child.on('exit', (code) => {
      console.log('[LocalAppControl] Process exited, code:', code);
    });
    child.unref();

    // Poll for CDP readiness for up to 20 seconds
    let portReady = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        await new Promise((resolve, reject) => {
          const req = require('http').get(`http://127.0.0.1:${port}/json/version`, (res) => {
            resolve(res.statusCode);
          });
          req.on('error', reject);
          req.setTimeout(800, () => { req.destroy(); reject(new Error('timeout')); });
        });
        portReady = true;
        console.log('[LocalAppControl] CDP port ready after:', (i+1), 'seconds');
        // Check that the process has not exited immediately
        await new Promise(r => setTimeout(r, 2000));
        if (child.exitCode !== null) {
          console.log("[LocalAppControl] Process exited code=" + child.exitCode + "; CDP port unavailable");
          return { success: false, pid: child.pid, port: port, error: `Process exited code=${child.exitCode}` };
        }
        break;
      } catch (e) {}
    }
    if (!portReady) {
      console.error('[LocalAppControl] CDP port did not become ready port:', port);
    }
    return { success: portReady, pid: child.pid, port: port };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function quitAppProcess(pid, appPath) {
  try {
    const platform = process.platform;
    if (platform === 'darwin' && appPath) {
      // macOS: quit gracefully using bundleId or app name
      const infoPlist = path.join(appPath, 'Contents', 'Info.plist');
      let bundleId = '';
      if (fs.existsSync(infoPlist)) {
        try {
          const json = execSync(`plutil -convert json -o - "${infoPlist}"`, { encoding: 'utf8', timeout: 2000 });
          const plist = JSON.parse(json);
          bundleId = plist.CFBundleIdentifier || '';
        } catch (e) {}
      }
      if (bundleId) {
        try { execSync(`osascript -e 'tell application id "${bundleId}" to quit'`, { timeout: 5000 }); } catch (e) {}
      } else {
        const appName = path.basename(appPath, '.app');
        try { execSync(`osascript -e 'tell application "${appName}" to quit'`, { timeout: 5000 }); } catch (e) {}
      }
      await new Promise(r => setTimeout(r, 2000));

      // Force-stop remaining processes
      const name = path.basename(appPath, '.app');
      try { execSync(`pkill -9 -f "${name}" 2>/dev/null || true`, { timeout: 3000 }); } catch (e) {}
      await new Promise(r => setTimeout(r, 1000));
      return { success: true };
    }

    if (pid && pid > 0) {
      // Windows: use taskkill for proper process termination
      if (platform === 'win32') {
        try { execSync(`taskkill /PID ${pid} /F 2>nul`, { timeout: 5000 }); } catch (e) {}
      } else {
        try { process.kill(pid, 'SIGTERM'); } catch (e) {}
        await new Promise(r => setTimeout(r, 1000));
        try { process.kill(pid, 'SIGKILL'); } catch (e) {}
      }
    }
    // Also try name-based kill (handles stale PIDs or PID=0 from scan)
    if (appPath) {
      const identifier = path.basename(appPath, '.app').replace(/\.exe$/i, '');
      if (platform === 'win32') {
        try { execSync(`taskkill /IM "${identifier}.exe" /F 2>nul`, { timeout: 5000 }); } catch (e) {}
      } else if (platform !== 'darwin') {
        try { execSync(`pkill -9 -f "${identifier}" 2>/dev/null || true`, { timeout: 3000 }); } catch (e) {}
      }
    }
    if (platform === 'win32') await new Promise(r => setTimeout(r, 1000));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ============================================================
// Get ports occupied by other accounts
// ============================================================
function getUsedPortsByOtherAccounts() {
  const data = loadAccounts();
  const used = [];
  for (const acc of data.accounts) {
    if (acc.lastPort && acc.id !== currentAccountId) {
      used.push(acc.lastPort);
    }
  }
  return used;
}

// ============================================================
// Get preferred account startup port
// ============================================================
async function getStartPortForAccount(accountData) {
  // Get ports occupied by other accounts
  const usedPorts = getUsedPortsByOtherAccounts();
  
  // Primary account (root) always prefers DEFAULT_PORT (3456), not lastPort
  if (accountData.type === 'root') {
    const available = await isPortAvailable(DEFAULT_PORT);
    if (available) {
      return DEFAULT_PORT;
    }
    let port = DEFAULT_PORT + 1;
    while (usedPorts.includes(port) || !(await isPortAvailable(port))) {
      port++;
      if (port > DEFAULT_PORT + 20000) {
        throw new Error('No available port found');
      }
    }
    return port;
  }
  
  // User accounts prefer lastPort
  if (accountData.lastPort) {
    if (!usedPorts.includes(accountData.lastPort)) {
      const available = await isPortAvailable(accountData.lastPort);
      if (available) {
        return accountData.lastPort;
      }
    }
  }
  
  // Allocate automatically from DEFAULT_PORT, avoiding occupied ports
  let port = DEFAULT_PORT;
  while (usedPorts.includes(port) || !(await isPortAvailable(port))) {
    port++;
    if (port > DEFAULT_PORT + 20000) {
      throw new Error('No available port found');
    }
  }
  return port;
}

// ============================================================
// Account selection window
// ============================================================
async function showAccountSelectionWindow(registry) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 520,
      resizable: false,
      frame: false,
      titleBarStyle: 'hiddenInset',
      show: false,
      icon: path.join(__dirname, 'static/source/icon.png'),
      webPreferences: {
        nodeIntegration: false,
        sandbox: true,
        contextIsolation: true,
        preload: path.join(__dirname, 'static/js/account-preload.js'),
      }
    });

    const escapeHtml = value => String(value).replace(/[&<>"']/g, char =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const accountsHtml = registry.accounts.map(acc => {
      const typeClass = acc.type === 'root' ? 'root' : 'user';
      const typeLabel = typeClass === 'root' ? 'Root' : 'User';
      const lastLaunch = acc.lastLaunched
        ? new Date(acc.lastLaunched).toLocaleString()
        : 'Never launched';
      const isDefault = acc.id === registry.defaultAccountId ? 'default' : '';
      return `<div class="account-item ${isDefault}" data-id="${escapeHtml(acc.id)}">
        <div class="acc-icon">${acc.type === 'root' ? '👑' : '👤'}</div>
        <div class="acc-info">
          <div class="acc-name">${escapeHtml(acc.name)} <span class="acc-type-badge ${typeClass}">${typeLabel}</span></div>
          <div class="acc-path">${escapeHtml(acc.dataPath)}</div>
          <div class="acc-last">Last launched: ${lastLaunch}</div>
        </div>
      </div>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
    background: #1a1a2e;
    color: #e0e0e0;
    user-select: none;
    -webkit-app-region: drag;
    overflow: hidden;
  }
  .header {
    padding: 24px 28px 16px;
    text-align: center;
  }
  .header h1 { font-size: 20px; font-weight: 600; color: #fff; }
  .header p { font-size: 13px; color: #888; margin-top: 6px; }
  .account-list {
    padding: 0 20px;
    max-height: 320px;
    overflow-y: auto;
  }
  .account-list::-webkit-scrollbar { width: 4px; }
  .account-list::-webkit-scrollbar-thumb { background: #444; border-radius: 2px; }
  .account-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    margin-bottom: 8px;
    background: #222244;
    border: 2px solid transparent;
    border-radius: 12px;
    cursor: pointer;
    -webkit-app-region: no-drag;
    transition: all 0.2s;
  }
  .account-item:hover { background: #2a2a55; border-color: #4a4a8a; transform: translateY(-1px); }
  .account-item.default { border-color: #4a90d9; }
  .acc-icon { font-size: 28px; width: 42px; text-align: center; }
  .acc-info { flex: 1; min-width: 0; }
  .acc-name { font-size: 15px; font-weight: 600; color: #fff; }
  .acc-type-badge { font-size: 10px; padding: 2px 8px; border-radius: 6px; margin-left: 6px; }
  .acc-type-badge.root { background: #d4a017; color: #000; }
  .acc-type-badge.user { background: #4a90d9; color: #fff; }
  .acc-path { font-size: 11px; color: #666; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .acc-last { font-size: 11px; color: #555; margin-top: 2px; }
  .footer {
    padding: 16px 28px;
    border-top: 1px solid #2a2a3e;
    display: flex;
    align-items: center;
    -webkit-app-region: no-drag;
  }
  .footer label { font-size: 13px; color: #888; cursor: pointer; display: flex; align-items: center; gap: 8px; }
  .footer input[type="checkbox"] { accent-color: #4a90d9; width: 15px; height: 15px; }
  .close-btn {
    position: absolute;
    top: 12px; right: 16px;
    width: 28px; height: 28px;
    background: transparent;
    border: none;
    color: #888;
    font-size: 18px;
    cursor: pointer;
    border-radius: 6px;
    -webkit-app-region: no-drag;
  }
  .close-btn:hover { background: #333; color: #fff; }
</style>
</head>
<body>
  <button class="close-btn" onclick="window.close()">&times;</button>
  <div class="header">
    <h1>Select account</h1>
    <p>Choose an account to start Agent Creation</p>
  </div>
  <div class="account-list" id="accountList">
    ${accountsHtml}
  </div>
  <div class="footer">
    <label><input type="checkbox" id="rememberChoice"> Remember my selection (set as default account)</label>
  </div>
  <script>
    document.querySelectorAll('.account-item').forEach(item => {
      item.addEventListener('click', () => {
        const accountId = item.dataset.id;
        const remember = document.getElementById('rememberChoice').checked;
        window.accountPicker.select(accountId, remember);
      });
    });
  </script>
</body>
</html>`;

    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

    const selectAccount = (event, selection) => {
      if (!event.senderFrame || event.senderFrame !== win.webContents.mainFrame) return;
      const account = registry.accounts.find(a => a.id === selection?.accountId);
      if (!account) return;
      win.webContents.ipc.removeListener('account-selected', selectAccount);
      if (selection.remember === true) {
        const data = loadAccounts();
        data.defaultAccountId = account.id;
        saveAccounts(data);
      }
      win.hide();
      resolve({ account, window: win });
    };
    win.webContents.ipc.on('account-selected', selectAccount);

    win.once('closed', () => resolve(null));

    win.once('ready-to-show', () => {
      win.show();
    });
  });
}

// Create splash window
function createSkeletonWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    frame: false,
    titleBarStyle: 'hiddenInset', // macOS: hide title bar while retaining native buttons
    trafficLightPosition: { x: 10, y: 12 }, // Optional custom button position
    show: true,
    icon: 'static/source/icon.png',
    webPreferences: {
      preload: path.join(__dirname, 'static/js/preload.js'),
      nodeIntegration: false,
      sandbox: true,
      contextIsolation: true,
      enableRemoteModule: false,
      devTools: isDev,
      partition: 'persist:main-session',
      webviewTag: true,
    }
  })

  
  // Load splash page
  mainWindow.loadFile(path.join(__dirname, 'static/skeleton.html'))
  
  // Configure auto-updates
  if (ENABLE_AUTO_UPDATES) setupAutoUpdater()
  
  // Synchronize window state
  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('window-state', 'maximized')
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('window-state', 'normal')
  })
  
  // Minimize to tray on close instead of exiting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
      return false
    }
    return true
  })
}

function getAcpxPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'acpx');
  } else {
    return path.join(__dirname, 'node_modules', 'acpx');
  }
}

// Backend startup function
/**
 * Start backend service.
 * Pass port 0, capture REAL_PORT_FOUND, and return the actual port.
 */
async function startBackend(startPort = DEFAULT_PORT, dataDir = null) {
  return new Promise((resolve, reject) => {
    try {
      console.log('🔍 Starting the backend process...');
      const npmCliPath = isDev 
        ? path.join(__dirname, 'node_modules', 'npm', 'bin', 'npm-cli.js')
        : path.join(process.resourcesPath, 'npm', 'bin', 'npm-cli.js');
      const spawnOptions = {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env: {
          ...process.env,
          NODE_ENV: isDev ? 'development' : 'production',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUNBUFFERED: '1',
          ELECTRON_NODE_EXEC: process.execPath, 
          ELECTRON_NPM_CLI: npmCliPath,
          ELECTRON_RESOURCES_PATH: app.isPackaged ? process.resourcesPath : path.join(__dirname),
          ELECTRON_ACPM_PATH: getAcpxPath(),
          SAP_DESKTOP_SESSION_TOKEN: desktopSessionToken,
        }
      };

      // Force data directory through environment variables for non-root accounts only
      // Root uses Python backend defaults (path_config.json or system default)
      if (dataDir && currentAccountId) {
        const acct = getAccountById(currentAccountId);
        if (acct && acct.type !== 'root') {
          spawnOptions.env.SUPER_AGENT_PARTY_DATA_DIR = dataDir;
          console.log(`[Accounts] Using account data directory: ${dataDir}`);
        }
      }

      if (process.platform === 'win32') {
        spawnOptions.windowsHide = !isDev;
      }

      const BACKEND_HOST = (globalConfig?.networkVisible === 'global') ? '0.0.0.0' : '127.0.0.1';

      let execPath = "";
      let backendArgs = [];
      const portStr = String(startPort);

      if (isDev) {
        execPath = pythonExec;
        backendArgs = ['-u', 'server.py', '--host', BACKEND_HOST, '--port', portStr];
      } else {
        const serverExecutable = process.platform === 'win32' ? 'server.exe' : 'server';
        const resourcesPath = process.resourcesPath || path.join(process.execPath, '..', 'resources');
        execPath = path.join(resourcesPath, 'server', serverExecutable);
        backendArgs = ['--host', BACKEND_HOST, '--port', portStr];
        spawnOptions.cwd = path.dirname(execPath);
      }

      // Pass data directory to backend
      if (dataDir) {
        backendArgs.push('--data-dir', dataDir);
      }

      console.log(`🚀 Executable path: ${execPath}`);
      backendProcess = spawn(execPath, backendArgs, spawnOptions);

      let isHandshaked = false;

      // Output listener
      const onData = (data) => {
        const output = data.toString();
        // 1. Keep logs in buffer for frontend display
        appendLogToBuffer('BACKEND', output);

        if (isDev) {
            // Print raw output in development for diagnostics
            process.stdout.write(`[PY] ${output}`);
        }

        // 2. Parse port handshake signal
        const match = output.match(/REAL_PORT_FOUND:(\d+)/);
        if (match && !isHandshaked) {
          const actualPort = parseInt(match[1], 10);
          if (actualPort > 0) {
            isHandshaked = true;
            PORT = actualPort; // Update global PORT
            console.log(`✅ Handshake complete. Backend port: ${PORT}`);
            resolve(PORT);
          }
        }
      };

      backendProcess.stdout.on('data', onData);
      backendProcess.stderr.on('data', onData);

      // Handle process errors
      backendProcess.on('error', (err) => {
        console.error('❌ Backend startup failed:', err);
        reject(err);
      });

      // Handle unexpected process exit
      backendProcess.on('close', (code) => {
        console.log(`ℹ️ Backend process exited (code ${code})`);
        if (!isHandshaked) {
          reject(new Error(`Backend exited before allocating a port; exit code: ${code}`));
        }
      });

      // Five-minute timeout
      setTimeout(() => {
        if (!isHandshaked) {
          if (backendProcess) backendProcess.kill();
          reject(new Error('Backend startup timeout: REAL_PORT_FOUND was not detected in Python logs'));
        }
      }, 360000*5);

    } catch (err) {
      reject(err);
    }
  });
}

// Wait for backend
async function waitForBackend() {
  const MAX_RETRIES = 60; // Wait up to 30 seconds
  const RETRY_INTERVAL = 500;
  let retries = 0;

  console.log(`⏳ Waiting for http://127.0.0.1:${PORT}/health response...`);
  console.log(`⏳ First launch after an update may take longer...`);
  console.log(`⏳ The first launch after an update may take longer, please be patient...`);
  while (retries < MAX_RETRIES) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) {
        console.log('✨ Backend health check passed！');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('backend-ready', { host: HOST, port: PORT });
        }
        return;
      }
    } catch (err) {
      retries++;
      await new Promise(resolve => setTimeout(resolve, RETRY_INTERVAL));
    }
  }
  throw new Error('Backend started but health check response timed out');
}
// Shared download handler
function handleDownloadItem(event, item, webContents) {
  // Use global mainWindow rather than getAllWindows()[0]
  if (!mainWindow || mainWindow.isDestroyed()) {
      console.log('Main window is missing; cannot send download status');
      return;
  }
  const win = mainWindow;

  const downloadId = Date.now().toString();
  
  // Store in download Map
  activeDownloads.set(downloadId, item);

  const fileName = item.getFilename();
  const filePath = item.getSavePath();

  // 1. Send start event
  win.webContents.send('download-started', {
      id: downloadId,
      filename: fileName,
      totalBytes: item.getTotalBytes(),
      path: filePath
  });

  // 2. Listen for state updates
  item.on('updated', (event, state) => {
      if (state === 'interrupted') {
          win.webContents.send('download-updated', { id: downloadId, state: 'interrupted' });
      } else if (state === 'progressing') {
          if (item.isPaused()) {
              win.webContents.send('download-updated', { id: downloadId, state: 'paused' });
          } else {
              win.webContents.send('download-updated', {
                  id: downloadId,
                  state: 'progressing',
                  receivedBytes: item.getReceivedBytes(),
                  totalBytes: item.getTotalBytes(),
                  progress: item.getTotalBytes() > 0 ? item.getReceivedBytes() / item.getTotalBytes() : 0
              });
          }
      }
  });

  // 3. Listen for completion
  item.once('done', (event, state) => {
      win.webContents.send('download-done', {
          id: downloadId,
          state: state,
          path: item.getSavePath()
      });
      // Remove completed download reference
      activeDownloads.delete(downloadId);
  });
}


// Handle frontend pause, resume and cancel commands
ipcMain.handle('download-control', (event, { id, action }) => {
  // Use shared activeDownloads
  const item = activeDownloads.get(id);
  
  if (!item) {
    console.log(`Download task ID not found: ${id}`);
    return;
  }

  switch (action) {
    case 'pause':
      if (!item.isPaused()) item.pause();
      break;
    case 'resume':
      if (item.canResume()) item.resume();
      break;
    case 'cancel':
      item.cancel();
      break;
  }
});

// Open containing folder
ipcMain.handle('show-item-in-folder', (event, filePath) => {
    if(filePath) shell.showItemInFolder(filePath);
});

// Configure auto-updates
function setupAutoUpdater() {
  autoUpdater.autoDownload = false; // Disable automatic download initially
  if (isDev) {
    autoUpdater.on('error', (err) => {
      mainWindow.webContents.send('update-error', err.message);
    });
  }
  autoUpdater.on('update-available', (info) => {
    updateAvailable = true;
    // Show update button and begin download
    mainWindow.webContents.send('update-available', info);
    autoUpdater.downloadUpdate(); // Start download automatically
  });
  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('download-progress', {
      percent: progressObj.percent.toFixed(1),
      transferred: (progressObj.transferred / 1024 / 1024).toFixed(2),
      total: (progressObj.total / 1024 / 1024).toFixed(2)
    });
  });
  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('update-downloaded');
  });
}

const PROTOCOL = 'sap';

// ============================================================
// Support multiple account processes without single-instance lock
// ============================================================
let pendingExtensionUrl = null;

// Protocol URL detection
const startUrl = process.argv.find(arg => arg.startsWith(`${PROTOCOL}://`));
if (startUrl) {
  pendingExtensionUrl = startUrl;
}

// Register protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Handle protocol links
function handleProtocolUrl(url) {
  if (!url) return;
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'install') {
      const type = urlObj.searchParams.get('type');
      const repo = urlObj.searchParams.get('repo');
      const mcpType = urlObj.searchParams.get('mcpType');
      const config = urlObj.searchParams.get('config');
      if (repo || config) {
        const payload = { type, repo, mcpType, config };
        if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
          mainWindow.webContents.send('remote-install-any', payload);
        } else {
          pendingExtensionUrl = url;
        }
      }
    }
  } catch (e) { console.error('Protocol parsing failed:', e); }
}

// macOS open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

ipcMain.handle('get-window-size', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win.getSize();
});
const CHROME_VERSION = '124.0.0.0';
const CHROME_MAJOR = '124';
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('enable-features', 'NetworkService,NetworkServiceInProcess');
app.commandLine.appendSwitch('disable-features', 'CrossOriginOpenerPolicy,SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure,LogAds');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
// Multi-account startup initialization
app.whenReady().then(async () => {
  let currentGlobalKey = null;

  ipcMain.handle('unregister-global-shortcut', () => {
    if (currentGlobalKey) {
      globalShortcut.unregister(currentGlobalKey);
      currentGlobalKey = null;
    }
    return true;
  });

  ipcMain.handle('register-global-shortcut', (event, key) => {
    // Unregister existing shortcut first
    if (currentGlobalKey) {
      globalShortcut.unregister(currentGlobalKey);
      currentGlobalKey = null;
    }
    try {
      // Register new shortcut
      const success = globalShortcut.register(key, () => {
        // Notify main window when global shortcut is pressed
        BrowserWindow.getAllWindows().forEach(w => {
          if (!w.isDestroyed()) w.webContents.send('global-shortcut-triggered');
        });
      });

      if (success) {
        currentGlobalKey = key;
        console.log("[ASR] Global shortcut " + key + " registered");
        return true;
      } else {
        console.warn("[ASR] Failed to register global shortcut " + key + "; it may be in use");
        return false;
      }
    } catch (e) {
      console.error('[ASR] Global shortcut error:', e);
      return false;
    }
  });
  try {

    // Keep cache in development by default to speed startup
    // Use --clear-cache to refresh modified static files immediately
    if (isDev && process.argv.includes('--clear-cache')) {
      const mainSession = session.fromPartition('persist:main-session');
      try { await mainSession.clearCache(); } catch (e) {}
      try { await mainSession.clearCodeCaches({}); } catch (e) {}
    }

    // ============================================================
    // Determine which account to launch
    // ============================================================
    let accountData = null;
    let accountPickerWindow = null;

    if (launchAccountId) {
      // Launch account specified by --account=<id>
      accountData = getAccountById(launchAccountId);
      if (!accountData) {
        console.error(`[Accounts] Account ${launchAccountId} not found; falling back to default`);
        launchAccountId = null;
      }
    }

    if (!launchAccountId) {
      // Main entry: load account registry
      const registry = loadAccounts();

      if (registry.accounts.length === 0) {
        // Create root account on first run
        const rootAccount = {
          id: require('crypto').randomUUID(),
          name: 'Primary account',
          type: 'root',
          dataPath: app.getPath('userData'),
          isDefault: true,
          createdAt: new Date().toISOString(),
          lastLaunched: new Date().toISOString(),
          lastPort: null,
          clonedFrom: null
        };
        registry.accounts.push(rootAccount);
        registry.defaultAccountId = rootAccount.id;
        saveAccounts(registry);
        accountData = rootAccount;
        console.log('[Accounts] First run: created the root account');
      } else if (registry.defaultAccountId) {
        // Use default account if configured
        accountData = registry.accounts.find(a => a.id === registry.defaultAccountId);
        if (accountData) {
          console.log(`[Accounts] Using default account: ${accountData.name}`);
        }
      } else if (registry.accounts.length === 1) {
        // Use sole account if only one exists
        accountData = registry.accounts[0];
        console.log(`[Accounts] Only account: ${accountData.name}`);
      } else {
        // Show account picker when multiple accounts have no default
        console.log('[Accounts] Multiple accounts without a default: showing account chooser');
        const selection = await showAccountSelectionWindow(registry);
        if (!selection) {
          console.log('[Accounts] Account chooser closed by user; quitting');
          app.quit();
          return;
        }
        accountData = selection.account;
        accountPickerWindow = selection.window;
      }
    }

    if (!accountData) {
      console.error('[Accounts] Could not determine startup account; quitting');
      app.quit();
      return;
    }

    currentAccountId = accountData.id;
    currentAccountDataPath = accountData.dataPath;

    // Update lastLaunched
    {
      const registry = loadAccounts();
      const idx = registry.accounts.findIndex(a => a.id === accountData.id);
      if (idx >= 0) {
        registry.accounts[idx].lastLaunched = new Date().toISOString();
        saveAccounts(registry);
      }
    }

    // Ensure data directory exists
    if (!fs.existsSync(currentAccountDataPath)) {
      fs.mkdirSync(currentAccountDataPath, { recursive: true });
      console.log(`[Accounts] Created data directory: ${currentAccountDataPath}`);
    }

    // Prefer lastPort, avoiding ports of other accounts
    const startPort = await getStartPortForAccount(accountData);
    console.log(`[Accounts] Using port: ${startPort}`);

    // ============================================================
    // Existing startup logic
    // ============================================================
    const partySession = session.fromPartition('persist:party-browser-session');

    partySession.on('will-download', (event, item, webContents) => {
        console.log('Download requested from WebView partition:', item.getFilename());
        handleDownloadItem(event, item, webContents);
    });

    // Intercept request headers for browser compatibility
    partySession.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
        const headers = details.requestHeaders;
        
        // 1. Set user-agent
        headers['User-Agent'] = REAL_CHROME_UA;

        // 2. Set Sec-Ch-Ua client hints
        // These headers are checked by Google
        const brand = `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not-A.Brand";v="99"`;
        headers['Sec-Ch-Ua'] = brand;
        headers['Sec-Ch-Ua-Mobile'] = '?0';
        headers['Sec-Ch-Ua-Full-Version'] = `"${CHROME_VERSION}"`;
        headers['Sec-Ch-Ua-Full-Version-List'] = brand;
        
        // 3. Set platform dynamically from process.platform
        let platform = 'Windows';
        if (process.platform === 'darwin') platform = 'macOS';
        else if (process.platform === 'linux') platform = 'Linux';
        headers['Sec-Ch-Ua-Platform'] = `"${platform}"`;

        // 4. Remove Electron-specific headers
        delete headers['Sec-Ch-Ua-Model']; // Desktop clients generally have no model identifier
        delete headers['Electron-Major-Version'];
        delete headers['X-Electron-App-Name'];

        callback({ requestHeaders: headers });
    });
    app.on('session-created', (sess) => {
        // console.log('New session created:', sess.getUserAgent());
        
        // Attach download listener to each new session, including webviews
        sess.on('will-download', (event, item, webContents) => {
            console.log('Download requested from WebView session:', item.getFilename());
            handleDownloadItem(event, item, webContents);
        });
    });
    session.defaultSession.on('will-download', (event, item, webContents) => {
        console.log('Download requested from main window:', item.getFilename());
        handleDownloadItem(event, item, webContents);
    });    
      // Default configuration
    global.vmcCfg = {
      receive: { enable: false, port: 39539,syncExpression: false },
      send:    { enable: false, host: '127.0.0.1', port: 39540 }
    };
    ipcMain.handle('get-vmc-config', () => {
      // Ensure fields exist
      global.vmcCfg.receive.syncExpression ??= false;
      return global.vmcCfg;
    });
    // Create splash window
    createSkeletonWindow()
    if (accountPickerWindow && !accountPickerWindow.isDestroyed()) accountPickerWindow.close();
    if (global.vmcCfg.receive.enable) startVMCReceiver(global.vmcCfg);
    // Start backend with account port and data directory
    await startBackend(startPort, currentAccountDataPath)
    // Update lastPort for non-primary accounts; root always prefers port 3456
    if (currentAccountId && PORT) {
      const registry = loadAccounts();
      const idx = registry.accounts.findIndex(a => a.id === currentAccountId);
      if (idx >= 0 && registry.accounts[idx].type !== 'root') {
        registry.accounts[idx].lastPort = PORT;
        saveAccounts(registry);
        console.log(`[Accounts] Updated account port: ${currentAccountId} -> ${PORT}`);
      }
    }
    ipcMain.handle('get-backend-logs', () => {
      return logBuffer.join('\n');
    });
    // Wait for backend readiness
    await waitForBackend()
    authorizeDesktopRequests(session.fromPartition('persist:main-session'));
    authorizeDesktopRequests(session.defaultSession);

    // Load full content after backend is ready
    console.log(`Backend server is running at http://${HOST}:${PORT}`)

    if (IS_INTERNAL_MODE_ACTIVE) {
        try {
            // Electron writes active port to DevToolsActivePort under userData
            const portFile = path.join(app.getPath('userData'), 'DevToolsActivePort');
            
            // Allow time for file creation; normally available by Ready
            // Wait 500ms if reading fails
            if (!fs.existsSync(portFile)) {
                await new Promise(r => setTimeout(r, 500));
            }
            
            if (fs.existsSync(portFile)) {
                const content = fs.readFileSync(portFile, 'utf8');
                // First line is port; second line is path
                const realPort = parseInt(content.split('\n')[0], 10);
                
                if (!isNaN(realPort)) {
                    SESSION_CDP_PORT = realPort;
                    console.log(`✅ [CDP] Acquired allocated browser debugging port: ${SESSION_CDP_PORT}`);
                }
            } else {
                console.error('❌ [CDP] DevToolsActivePort file not found; cannot determine port');
            }
        } catch (e) {
            console.error('❌ [CDP] Failed reading DevToolsActivePort file:', e);
        }
    }

    function requireAppFrame(event) {
      const origin = `http://127.0.0.1:${PORT}`;
      if (event.senderFrame !== event.sender.mainFrame || event.senderFrame.origin !== origin) {
        throw new Error('SAP desktop IPC requires the app frame');
      }
    }
    ipcMain.handle('shell:open-external', (event, value) => {
      requireAppFrame(event);
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported link protocol');
      return shell.openExternal(url.href);
    });
    ipcMain.handle('shell:open-path', (event, value) => {
      requireAppFrame(event);
      return shell.openPath(value);
    });
    ipcMain.handle('shell:join-path', (event, segments) => {
      requireAppFrame(event);
      return path.join(...segments);
    });

    ipcMain.handle('get-app-path', () => {
      return app.getAppPath();
    });

    // 1. Get CDP status for frontend initialization
    ipcMain.handle('get-internal-cdp-info', () => {
      return {
        active: IS_INTERNAL_MODE_ACTIVE,
        port: SESSION_CDP_PORT
      };
    });

    // 3. Save Chrome configuration via saveEnvVariable
    // Frontend settings object is supported by saveEnvVariable
    ipcMain.handle('save-chrome-config', async (event, settings) => {
      saveEnvVariable('chromeMCPSettings', settings);
      return true;
    });

    // IPC handler for port information
    ipcMain.handle('get-server-info', () => {
      return {
        host: HOST,
        port: PORT,
        defaultPort: DEFAULT_PORT,
        isDefaultPort: PORT === DEFAULT_PORT
      }
    })

    ipcMain.handle('set-env', async (event, arg) => {
      saveEnvVariable(arg.key, arg.value);
    });
    // Restart application
    ipcMain.handle('restart-app', () => {
      app.relaunch();
      app.quit();
    })

    // ============================================================
    // Local application control IPC handlers
    // ============================================================
    ipcMain.handle('launch-app-with-debugging', async (event, { path: appPath, port, forceNewInstance }) => {
      try {
        const result = await launchAppWithDebugging(appPath, port, forceNewInstance);
        return result;
      } catch (e) {
        console.error('[LocalAppControl] Launch failed:', e);
        return { success: false, error: e.message };
      }
    });

    ipcMain.handle('quit-app-process', async (event, { pid, path: appPath }) => {
      try {
        const result = await quitAppProcess(pid, appPath);
        return result;
      } catch (e) {
        console.error('[LocalAppControl] Exit failed:', e);
        return { success: false, error: e.message };
      }
    });

    // ============================================================
    // Account management IPC handlers
    // ============================================================
    ipcMain.handle('accounts:get-all', () => {
      const data = loadAccounts();
      return {
        accounts: data.accounts,
        defaultAccountId: data.defaultAccountId,
        currentAccountId: currentAccountId
      };
    });

    ipcMain.handle('accounts:get-current', () => {
      const data = loadAccounts();
      const current = data.accounts.find(a => a.id === currentAccountId);
      return {
        account: current || null,
        isRoot: current?.type === 'root'
      };
    });

    ipcMain.handle('accounts:create', async (event, { name, dataPath, cloneFromRoot, setAsDefault }) => {
      const data = loadAccounts();
      const currentAccount = data.accounts.find(a => a.id === currentAccountId);

      // Only root may create accounts
      if (!currentAccount || currentAccount.type !== 'root') {
        return { success: false, error: 'Only the root account can create additional accounts' };
      }

      // Validate path
      if (!dataPath || !path.isAbsolute(dataPath)) {
        return { success: false, error: 'Invalid storage path' };
      }

      // Append application subdirectory consistently with appdirs.user_data_dir
      // Windows: <selected>/Super-Agent-Party, macOS: <selected>/Super-Agent-Party, Linux: <selected>/Super-Agent-Party
      const actualDataPath = path.join(dataPath, 'Super-Agent-Party');

      // Ensure target directory exists
      if (!fs.existsSync(actualDataPath)) {
        fs.mkdirSync(actualDataPath, { recursive: true });
      }

      // Require empty directory when creating, except when cloning
      if (!cloneFromRoot) {
        const dirContents = fs.readdirSync(actualDataPath).filter(f => f !== '.DS_Store');
        if (dirContents.length > 0) {
          return { success: false, error: 'Destination directory must be empty' };
        }
      }

      // Cloning root data
      if (cloneFromRoot && currentAccount) {
        // Get root USER_DATA_DIR from backend API,
        // not Electron userData, which may differ.
        let sourceDataPath = currentAccount.dataPath;
        try {
          const resp = await fetch(`http://${HOST}:${PORT}/api/system/data-path`, { headers: { "X-SAP-Session": desktopSessionToken } });
          if (resp.ok) {
            const json = await resp.json();
            if (json.path && fs.existsSync(json.path)) {
              sourceDataPath = json.path;
              console.log(`[Accounts] Resolved actual root account data path from backend: ${sourceDataPath}`);
            }
          }
        } catch (e) {
          console.log(`[Accounts] Unable to resolve backend data path; using stored path: ${sourceDataPath}`);
        }

        console.log(`[Accounts] Cloning root data: ${sourceDataPath} -> ${actualDataPath}`);
        copyFolderSync(sourceDataPath, actualDataPath);
      }

      // Create subdirectory structure
      const subDirs = ['logs', 'memory_cache', 'uploaded_files', 'tool_temp', 'agents', 'kb', 'ext', 'asr', 'tts', 'ebd'];
      for (const dir of subDirs) {
        const d = path.join(actualDataPath, dir);
        if (!fs.existsSync(d)) {
          fs.mkdirSync(d, { recursive: true });
        }
      }

      const accountId = require('crypto').randomUUID();
      const newAccount = {
        id: accountId,
        name: name || `Account ${data.accounts.length + 1}`,
        type: 'user',
        dataPath: actualDataPath,
        isDefault: false,
        createdAt: new Date().toISOString(),
        lastLaunched: null,
        lastPort: null,
        clonedFrom: cloneFromRoot ? currentAccount.id : null
      };

      data.accounts.push(newAccount);

      if (setAsDefault) {
        data.defaultAccountId = accountId;
      }

      saveAccounts(data);
      console.log(`[Accounts] New account created: ${newAccount.name} (${accountId})`);
      return { success: true, account: newAccount };
    });

    ipcMain.handle('accounts:delete', async (event, { accountId, removeFolder }) => {
      const data = loadAccounts();
      const account = data.accounts.find(a => a.id === accountId);

      if (!account) {
        return { success: false, error: 'Account does not exist' };
      }

      // Root account cannot be deleted
      if (account.type === 'root') {
        return { success: false, error: 'Cannot delete the root account' };
      }

      // Delete directory
      if (removeFolder && account.dataPath) {
        try {
          if (fs.existsSync(account.dataPath)) {
            fs.rmSync(account.dataPath, { recursive: true, force: true });
            console.log(`[Accounts] Deleted account data directory: ${account.dataPath}`);
          }
        } catch (e) {
          console.error(`[Accounts] Failed to delete directory: ${e.message}`);
        }
      }

      // Remove from registry
      data.accounts = data.accounts.filter(a => a.id !== accountId);

      // Clear default if deleted account was default
      if (data.defaultAccountId === accountId) {
        data.defaultAccountId = null;
      }

      saveAccounts(data);
      return { success: true };
    });

    ipcMain.handle('accounts:rename', async (event, { accountId, newName }) => {
      const data = loadAccounts();
      const account = data.accounts.find(a => a.id === accountId);
      if (!account) {
        return { success: false, error: 'Account does not exist' };
      }
      account.name = newName;
      saveAccounts(data);
      return { success: true };
    });

    ipcMain.handle('accounts:set-default', async (event, { accountId }) => {
      const data = loadAccounts();
      const account = data.accounts.find(a => a.id === accountId);
      if (!account) {
        return { success: false, error: 'Account does not exist' };
      }
      data.defaultAccountId = accountId;
      data.accounts.forEach(a => { a.isDefault = (a.id === accountId); });
      saveAccounts(data);
      return { success: true };
    });

    ipcMain.handle('accounts:launch', async (event, { accountId }) => {
      const account = getAccountById(accountId);
      if (!account) {
        return { success: false, error: 'Account does not exist' };
      }

      const execPath = process.execPath;
      const args = process.argv.slice(1).filter(a => !a.startsWith('--account='));
      args.push(`--account=${accountId}`);

      console.log(`[Accounts] Launching additional instance: ${account.name} (${accountId})`);

      const child = spawn(execPath, args, {
        detached: true,
        stdio: 'ignore',
        shell: false
      });
      child.unref();

      return { success: true };
    });

    ipcMain.handle('accounts:switch', async (event, { accountId }) => {
      const account = getAccountById(accountId);
      if (!account) {
        return { success: false, error: 'Account does not exist' };
      }

      const execPath = process.execPath;
      const args = process.argv.slice(1).filter(a => !a.startsWith('--account='));
      args.push(`--account=${accountId}`);

      console.log(`[Accounts] Switching account: ${account.name} (${accountId})`);

      const child = spawn(execPath, args, {
        detached: true,
        stdio: 'ignore',
        shell: false
      });
      child.unref();

      // Set exit flag and quit current instance
      app.isQuitting = true;
      setTimeout(() => {
        app.quit();
      }, 500);

      return { success: true };
    });

    // Clipboard IPC
    ipcMain.handle('clipboard-read', async () => {
      try {
        return clipboard.readText() || '';
      } catch (e) { return ''; }
    });
    ipcMain.handle('clipboard-write', async (event, text) => {
      try {
        clipboard.writeText(String(text || ''));
        return { success: true };
      } catch (e) { return { success: false, error: e.message }; }
    });
    ipcMain.handle('clipboard-read-image', async () => {
      try {
        const img = clipboard.readImage();
        if (img.isEmpty()) return null;
        return img.toDataURL();
      } catch (e) { return null; }
    });
    ipcMain.handle('clipboard-read-file-paths', async () => {
      try {
        let paths = clipboard.readFilePaths() || [];
        if (!paths.length) {
          const fileUrl = clipboard.read('public.file-url');
          if (fileUrl) {
            const url = require('url');
            const fp = url.fileURLToPath(fileUrl.trim());
            if (fp && fs.existsSync(fp)) paths = [fp];
          }
        }
        return paths;
      } catch (e) { return []; }
    });

    // Recursively copy directory
    function copyFolderSync(src, dest) {
      if (!fs.existsSync(src)) return;
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const skipDirs = ['Partitions', 'logs', 'Cache', 'Code Cache', 'GPUCache', 'blob_storage', 'Crashpad', 'Local Storage', 'Session Storage'];
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.DS_Store') continue;
        if (entry.name.startsWith('.')) continue;
        if (entry.name.endsWith('-wal') || entry.name.endsWith('-shm') || entry.name.endsWith('-journal')) continue;
        if (entry.isDirectory() && skipDirs.includes(entry.name)) {
          console.log(`[Accounts] Skipping runtime directory: ${entry.name}`);
          continue;
        }
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          copyFolderSync(srcPath, destPath);
        } else {
          try {
            fs.copyFileSync(srcPath, destPath);
          } catch (e) {
            if (e.code === 'EBUSY' || e.code === 'EACCES' || e.code === 'EPERM') {
              // SQLite files may be held open by backend; copy by reading and writing
              try {
                const content = fs.readFileSync(srcPath);
                fs.writeFileSync(destPath, content);
                console.log(`[Accounts] Copied locked file using read/write fallback: ${path.basename(srcPath)}`);
              } catch (e2) {
                console.log(`[Accounts] Skipping file that could not be copied: ${srcPath}`);
              }
            } else {
              throw e;
            }
          }
        }
      }
    }

    ipcMain.handle('save-screenshot-direct', async (event, { buffer }) => {
      // 1. Set save path to userData/uploaded_files
      // Keep path consistent with Python backend static mount
      const uploadDir = path.join(app.getPath('userData'), 'uploaded_files');
      
      // 2. Ensure directory exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // 3. Generate filename
      const filename = `screenshot-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.jpg`;
      const filePath = path.join(uploadDir, filename);

      // 4. Write file
      fs.writeFileSync(filePath, Buffer.from(buffer));
      
      // 5. Return filename only; frontend constructs URL
      return filename;
    });

    // Handlers inside app.whenReady().then(async () => { ... })

    ipcMain.handle('open-extension-window', async (event, { url, extension }) => {
      requireAppFrame(event);
      const target = new URL(url);
      const origin = `http://127.0.0.1:${PORT}`;
      const id = encodeURIComponent(extension.id);
      const assets = `/ext/${id}/`;
      const node = `/api/extensions/${id}/node/`;
      if (target.origin !== origin ||
          !(target.pathname.startsWith(assets) || target.pathname.startsWith(node))) {
        throw new Error('Invalid extension entry point');
      }
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;
      
      // Determine window properties from extension configuration
      const windowConfig = {
        width: extension.width || 800,
        height: extension.height || 600,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: isDev,
          partition: `sap-extension-${randomBytes(16).toString('hex')}`,
        }
      };

      // If extension requires transparent frameless window
      if (extension.transparent) {
        Object.assign(windowConfig, {
          frame: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: false,
          hasShadow: false,
          backgroundColor: 'rgba(0, 0, 0, 0)',
        });
      } else {
        // Ordinary window configuration
        Object.assign(windowConfig, {
          frame: true,
          transparent: false,
          titleBarStyle: isMac ? 'hiddenInset' : 'default',
          icon: 'static/source/icon.png'
        });
      }

      const extensionWindow = new BrowserWindow(windowConfig);
      
      const contents = extensionWindow.webContents;
      const contentsId = contents.id;
      authorizeDesktopRequests(contents.session);
      extensionWindows.set(contentsId, { assets, node });
      contents.once('destroyed', () => extensionWindows.delete(contentsId));
      const keepExtensionNavigationScoped = navigation => {
        const destination = new URL(navigation.url);
        if (destination.origin !== origin || !(destination.pathname.startsWith(assets) || destination.pathname.startsWith(node))) {
          navigation.preventDefault();
        }
      };
      contents.on('will-navigate', keepExtensionNavigationScoped);
      contents.on('will-redirect', keepExtensionNavigationScoped);
      try {
        await extensionWindow.loadURL(target.href);
      } catch (error) {
        extensionWindow.destroy();
        throw error;
      }
      
      // Configure special behavior for transparent window
      if (extension.transparent) {
        // Set click-through behavior if needed
        // extensionWindow.setIgnoreMouseEvents(false);
      }
      
      return extensionWindow.id;
    });

    // === Compact mode window ===
    ipcMain.handle('open-minimal-window', async () => {
      // Close existing window first
      if (minimalWindow && !minimalWindow.isDestroyed()) {
        minimalWindow.close();
        minimalWindow = null;
      }

      const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize;
      const winW = 520;
      const winH = 420;

      minimalWindow = new BrowserWindow({
        width: winW,
        height: winH,
        x: Math.round((screenW - winW) / 2),
        y: Math.round(screenH - winH - 40),
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: false,
        hasShadow: false,
        resizable: true,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: isDev,
          preload: path.join(__dirname, 'static/js/preload.js')
        }
      });

      await minimalWindow.loadURL(`http://${HOST}:${PORT}/minimal.html`);

      minimalWindow.on('closed', () => {
        minimalWindow = null;
        // Notify main window that compact mode closed
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('minimal-window-closed');
        }
        // Notify dynamic island that compact mode closed
        if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) {
          dynamicIslandWindow.webContents.send('minimal-window-closed');
        }
      });

      return true;
    });

    ipcMain.handle('close-minimal-window', async () => {
      if (minimalWindow && !minimalWindow.isDestroyed()) {
        minimalWindow.close();
        minimalWindow = null;
      }
      return true;
    });

    ipcMain.handle('get-minimal-window-state', async () => {
      return !!(minimalWindow && !minimalWindow.isDestroyed());
    });

    // === Dynamic island window (full-screen overlay) ===
    ipcMain.handle('open-island-window', async () => {
      if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) {
        dynamicIslandWindow.close();
        dynamicIslandWindow = null;
      }

      const primaryDisplay = screen.getPrimaryDisplay();
      const { x, y, width: screenW, height: screenH } = primaryDisplay.bounds;
      const isWindows = process.platform === 'win32';
      const isLinux = process.platform === 'linux';
      const windowType = isWindows ? 'toolbar' : 'panel';

      dynamicIslandWindow = new BrowserWindow({
        width: screenW,
        height: screenH,
        x: x,
        y: y,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        resizable: false,
        backgroundColor: '#00000000',
        type: windowType,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: isDev,
          preload: path.join(__dirname, 'static/js/preload.js')
        }
      });


      dynamicIslandWindow.webContents.on('render-process-gone', (event, details) => {
        console.error('[Island] Render process gone:', details.reason, details.exitCode);
        if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) {
          dynamicIslandWindow.close();
          dynamicIslandWindow = null;
        }
      });

      dynamicIslandWindow.on('unresponsive', () => {
        console.warn('[Island] Renderer unresponsive, restoring mouse forwarding');
        if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) {
          if (isLinux) {
            dynamicIslandWindow.setIgnoreMouseEvents(true);
          } else {
            dynamicIslandWindow.setIgnoreMouseEvents(true, { forward: true });
          }
        }
      });

      if (isLinux) {
        dynamicIslandWindow.setIgnoreMouseEvents(true);
      } else {
        dynamicIslandWindow.setIgnoreMouseEvents(true, { forward: true });
      }

      await dynamicIslandWindow.loadURL(`http://${HOST}:${PORT}/island.html`);

      dynamicIslandWindow.on('closed', () => {
        dynamicIslandWindow = null;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('island-window-closed');
        }
      });

      return true;
    });

    ipcMain.handle('close-island-window', async () => {
      if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) {
        dynamicIslandWindow.close();
        dynamicIslandWindow = null;
      }
      return true;
    });

    ipcMain.handle('get-island-window-state', async () => {
      return !!(dynamicIslandWindow && !dynamicIslandWindow.isDestroyed());
    });


ipcMain.handle('upload-to-workspace', async (event, { targetDirPath, sourceFilePaths }) => {
  try {
    if (!fs.existsSync(targetDirPath)) {
      return { success: false, error: 'Destination path does not exist' };
    }

    for (const source of sourceFilePaths) {
      const fileName = path.basename(source);
      const destPath = path.join(targetDirPath, fileName);
      
      // Native synchronous copy supports files, not whole directories
      fs.copyFileSync(source, destPath);
    }
    return { success: true };
  } catch (error) {
    console.error('Upload failed:', error);
    return { success: false, error: error.message };
  }
});

    ipcMain.handle('start-vrm-window', async (_, windowConfig = {}) => {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;

      // Use supplied configuration or defaults
      const windowWidth = windowConfig.width || 540;
      const windowHeight = windowConfig.height || 960;

      const x = windowConfig.x !== undefined ? windowConfig.x : width - windowWidth - 40;
      // Avoid negative y when screen is shorter than window
      let defaultY;
      if (height >= windowHeight) {
        defaultY = height - windowHeight; // Place at bottom if screen is tall enough
      } else {
        defaultY = 0; // Place at top if screen is too short
      }
      const y = windowConfig.y !== undefined ? windowConfig.y : defaultY;

      const vrmWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x,
        y,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        acceptFirstMouse: true,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webgl: true,
          devTools: isDev,
          webAudio: true,
          autoplayPolicy: 'no-user-gesture-required',
          preload: path.join(__dirname, 'static/js/preload.js')
        }
      });

      // Load page
      await vrmWindow.loadURL(`http://${HOST}:${PORT}/vrm.html`);
      // Default: interactive, not click-through
      vrmWindow.setIgnoreMouseEvents(false);
      vrmWindow.setAlwaysOnTop(true);
      // Save window reference
      vrmWindows.push(vrmWindow);

      // Handle window close
      vrmWindow.on('closed', () => {
        vrmWindows = vrmWindows.filter(w => w !== vrmWindow);
      });

      return vrmWindow.id;  // Return window ID for later operations
    });
    // Desktop capture
    ipcMain.handle('capture-desktop', async () => {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 } // Adjust as needed
      })
      if (!sources.length) throw new Error('Could not acquire a screen source')
      const pngBuffer = sources[0].thumbnail.toPNG() // Return native Buffer
      return pngBuffer // Return to renderer
    })

    ipcMain.handle('crop-desktop', async (e, { rect }) => {
      const png = await cropDesktop(rect)          // Supports sharp or nativeImage
      return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)
    })

    ipcMain.handle('show-screenshot-overlay', async (_, { hideWindow = true } = {}) => {
      // 1. Hide main window according to hideWindow
      if (hideWindow) {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
      }

      // 2. Create full-screen frameless transparent window
      const { width, height } = screen.getPrimaryDisplay().bounds
      shotOverlay = new BrowserWindow({
        x: 0, y: 0, width, height,
        frame: false, 
        transparent: true, 
        alwaysOnTop: true,
        skipTaskbar: true, 
        resizable: false, 
        movable: false,
        enableLargerThanScreen: true,
        webPreferences: {
          contextIsolation: true,
          preload: path.join(__dirname, 'static/js/shotPreload.js')
        }
      })
      
      shotOverlay.setIgnoreMouseEvents(false)
      shotOverlay.loadFile(path.join(__dirname, 'static/shotOverlay.html'))
      shotOverlay.webContents.on('did-finish-load', () => {
        shotOverlay.webContents.send('set-shot-language', currentLanguage)
      })

      shotOverlay.setVisibleOnAllWorkspaces(true)

      return new Promise((resolve) => {
        ipcMain.once('screenshot-selected', (e, rect) => {
          shotOverlay.close()
          shotOverlay = null
          resolve(rect)
        })
      })
    })

    ipcMain.handle('cancel-screenshot-overlay', () => {
      if (shotOverlay && !shotOverlay.isDestroyed()) {
        shotOverlay.close()
        shotOverlay = null
      }
    })


    // IPC handlers
    ipcMain.handle('set-ignore-mouse-events', (event, ignore, options) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        win.setIgnoreMouseEvents(ignore, options);
    });
    ipcMain.handle('dialog:openDirectory', async () => {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
      });
      return result;
    });
    // Additional IPC handlers
    ipcMain.handle('get-ignore-mouse-status', (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        return win.isIgnoreMouseEvents();
    });
    ipcMain.handle('start-tha-window', async (_, windowConfig = {}) => {
      const { width, height } = screen.getPrimaryDisplay().workAreaSize;
      const windowWidth = windowConfig.width || 540;
      const windowHeight = windowConfig.height || 540;

      const x = windowConfig.x !== undefined ? windowConfig.x : width - windowWidth - 40;
      let defaultY;
      if (height >= windowHeight) {
        defaultY = height - windowHeight;
      } else {
        defaultY = 0;
      }
      const y = windowConfig.y !== undefined ? windowConfig.y : defaultY;

      const thaWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x,
        y,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        acceptFirstMouse: true,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          devTools: isDev,
          webAudio: true,
          autoplayPolicy: 'no-user-gesture-required',
          preload: path.join(__dirname, 'static/js/preload.js')
        }
      });

      await thaWindow.loadURL(`http://${HOST}:${PORT}/tha.html`);
      thaWindow.setIgnoreMouseEvents(false);
      thaWindow.setAlwaysOnTop(true);
      thaWindows.push(thaWindow);

      thaWindow.on('closed', () => {
        thaWindows = thaWindows.filter(w => w !== thaWindow);
      });

      return thaWindow.id;
    });

    ipcMain.handle('stop-tha-window', (_, windowId) => {
      if (windowId !== undefined) {
        const win = thaWindows.find(w => w.id === windowId);
        if (win && !win.isDestroyed()) {
          win.close();
        }
        thaWindows = thaWindows.filter(w => w.id !== windowId);
      } else {
        thaWindows.forEach(win => {
          if (!win.isDestroyed()) {
            win.close();
          }
        });
        thaWindows = [];
      }
    });

    ipcMain.handle('start-soulx-window', async (_, windowConfig = {}) => {
      // Reuse and focus existing SoulX window to prevent overlapping audio
      soulxWindows = soulxWindows.filter(w => !w.isDestroyed());
      if (soulxWindows.length > 0) {
        const existing = soulxWindows[0];
        if (existing.isMinimized()) existing.restore();
        existing.show();
        existing.focus();
        return existing.id;
      }

      const { width, height } = screen.getPrimaryDisplay().workAreaSize;
      const windowWidth = windowConfig.width || 540;
      const windowHeight = windowConfig.height || 540;

      const x = windowConfig.x !== undefined ? windowConfig.x : width - windowWidth - 40;
      let defaultY;
      if (height >= windowHeight) {
        defaultY = height - windowHeight;
      } else {
        defaultY = 0;
      }
      const y = windowConfig.y !== undefined ? windowConfig.y : defaultY;

      const soulxWindow = new BrowserWindow({
        width: windowWidth,
        height: windowHeight,
        x,
        y,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow: false,
        acceptFirstMouse: true,
        backgroundColor: 'rgba(0, 0, 0, 0)',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webgl: true,
          devTools: isDev,
          webAudio: true,
          autoplayPolicy: 'no-user-gesture-required',
          preload: path.join(__dirname, 'static/js/preload.js')
        }
      });

      await soulxWindow.loadURL(`http://${HOST}:${PORT}/soulx.html`);
      soulxWindow.setIgnoreMouseEvents(false);
      soulxWindow.setAlwaysOnTop(true);
      soulxWindows.push(soulxWindow);

      soulxWindow.on('closed', () => {
        soulxWindows = soulxWindows.filter(w => w !== soulxWindow);
      });

      return soulxWindow.id;
    });

    ipcMain.handle('stop-soulx-window', (_, windowId) => {
      if (windowId !== undefined) {
        const win = soulxWindows.find(w => w.id === windowId);
        if (win && !win.isDestroyed()) {
          win.close();
        }
        soulxWindows = soulxWindows.filter(w => w.id !== windowId);
      } else {
        soulxWindows.forEach(win => {
          if (!win.isDestroyed()) {
            win.close();
          }
        });
        soulxWindows = [];
      }
    });

    ipcMain.handle('stop-vrm-window', (_, windowId) => {
      if (windowId !== undefined) {
        const win = vrmWindows.find(w => w.id === windowId);
        if (win && !win.isDestroyed()) {
          win.close();
        }
        vrmWindows = vrmWindows.filter(w => w.id !== windowId);
      } else {
        // Close all windows
        vrmWindows.forEach(win => {
          if (!win.isDestroyed()) {
            win.close();
          }
        });
        vrmWindows = [];
      }
    });
    // Shared download handling
    ipcMain.handle('download-file', async (event, payload) => {

      const { url, filename } = payload;   // Destructure payload
      const dlItem = await download(mainWindow, url, {
        filename,
        saveAs: true,
        openFolderWhenDone: true
      });
      return { success: true, savePath: dlItem.getSavePath() };
    });
    // Check-update IPC
    ipcMain.handle('check-for-updates', async () => {
      if (isDev || !ENABLE_AUTO_UPDATES) {
        console.log('Auto updates are disabled for this fork.')
        return { updateAvailable: false }
      }
      try {
        const result = await autoUpdater.checkForUpdates()
        // Return only required serializable data
        return {
          updateAvailable: updateAvailable,
          updateInfo: result ? {
            version: result.updateInfo.version,
            releaseDate: result.updateInfo.releaseDate
          } : null
        }
      } catch (error) {
        console.error('Update check failed:', error)
        return { 
          updateAvailable: false, 
          error: error.message 
        }
      }
    })

    // Download-update IPC
    ipcMain.handle('download-update', () => {
      if (ENABLE_AUTO_UPDATES && updateAvailable) {
        return autoUpdater.downloadUpdate()
      }
    })

    // Install-update IPC
    ipcMain.handle('quit-and-install', () => {
      if (ENABLE_AUTO_UPDATES && updateAvailable) setTimeout(() => autoUpdater.quitAndInstall(), 500);
    });
            
    // Load main page
    await mainWindow.loadURL(`http://${HOST}:${PORT}`)
    ipcMain.on('set-language', () => {
      // Ignore legacy UI language preferences; English is the only shipped locale.
      currentLanguage = 'en-US';
      updateTrayMenu();
      updatecontextMenu();
      if (dynamicIslandWindow && !dynamicIslandWindow.isDestroyed()) {
        dynamicIslandWindow.webContents.send('language-changed');
      }
    });
    // Create system tray
    createTray();
    updatecontextMenu();
    // Main-process IPC and default configuration
    ipcMain.handle('set-vmc-config', async (_, cfg) => {
      if (cfg.receive.enable) {
        if (!vmcReceiverActive || cfg.receive.port !== global.vmcCfg?.receive.port) {
          if (vmcReceiverActive) stopVMCReceiver();
          startVMCReceiver(cfg);
        }
      } else {
        stopVMCReceiver();
      }
      global.vmcCfg = cfg;
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('vmc-config-changed', cfg);
      });
      return { success: true };
    });

    ipcMain.handle('send-vmc-frame', (event, frameData) => {
      if (!global.vmcCfg?.send.enable) return;

      const { host, port } = global.vmcCfg.send;
      const { bones, blends } = frameData;
      const packets = [];

      // 1. Send Root with existing zeroing logic
      packets.push({
        address: '/VMC/Ext/Root/Pos',
        args: [
          { type: 's', value: 'root' },
          { type: 'f', value: 0 }, { type: 'f', value: 0 }, { type: 'f', value: 0 },
          { type: 'f', value: 0 }, { type: 'f', value: 0 }, { type: 'f', value: 0 }, { type: 'f', value: 1 }
        ]
      });

      // 2. Send bones
      bones.forEach(b => {
        if (b.name === 'root') return;

        // Warudo requires PascalCase
        // Three.js uses hips; Warudo uses Hips
        // Three.js uses leftUpperArm; Warudo uses LeftUpperArm
        const vmcName = b.name.charAt(0).toUpperCase() + b.name.slice(1);

        packets.push({
          address: '/VMC/Ext/Bone/Pos',
          args: [
            { type: 's', value: vmcName },  // Use converted PascalCase name
            { type: 'f', value: b.pos.x },
            { type: 'f', value: b.pos.y },
            { type: 'f', value: b.pos.z },
            { type: 'f', value: b.rot.x },
            { type: 'f', value: b.rot.y },
            { type: 'f', value: b.rot.z },
            { type: 'f', value: b.rot.w }
          ]
        });
      });

      // 3. Send expressions with matching BlendShape names
      blends.forEach(blend => {
        // vrm.js already maps expression names (Joy, A, I, etc.)
        packets.push({
          address: '/VMC/Ext/Blend/Val',
          args: [
            { type: 's', value: blend.name },
            { type: 'f', value: blend.weight }
          ]
        });
      });

      // 4. Apply
      if (blends.length > 0) {
        packets.push({ address: '/VMC/Ext/Blend/Apply', args: [] });
      }

      // 5. OK is required by Warudo
      packets.push({ 
        address: '/VMC/Ext/OK', 
        args: [{ type: 'i', value: 1 }] 
      });

      // ... (retain sending logic) ...
      try {
        const bundleBuffer = osc.writePacket({
          timeTag: osc.timeTag(0),
          packets: packets
        });
        vmcSendSocket.send(bundleBuffer, port, host, (err) => {
            if (err) console.error(err);
        });
      } catch (e) { console.error(e); }
    });

    // Window control events
    ipcMain.handle('window-action', (_, action) => {
      switch (action) {
        case 'show':
          mainWindow.show()
          break
        case 'hide':
          mainWindow.hide()
          break
        case 'minimize':
          mainWindow.minimize()
          break
        case 'maximize':
          mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
          break
        case 'close':
          mainWindow.close()
          break
      }
    })
    ipcMain.handle('toggle-window-size', async (event, { width, height }) => {
      const win = BrowserWindow.fromWebContents(event.sender);

      if (win.isMaximized()) {
        // 1. Begin restoring window
        win.unmaximize();

        if (isMac){
          // 2. Wait until size remains stable for 50ms
          let last = win.getNormalBounds();
          for (let i = 0; i < 10; i++) {          // Up to 500ms
            await new Promise(r => setTimeout(r, 50));
            const curr = win.getNormalBounds();
            if (curr.width === last.width && curr.height === last.height) break;
            last = curr;
          }
        }else {
          // 2. Wait until window is fully restored
          for (let i = 0; i < 20; i++) {          // Up to one second
            await new Promise(r => setTimeout(r, 50));
            if (!win.isMaximized()) break;        // Exit loop after restoration
          }
        }


        // 3. Set assistant dimensions after system restoration
        win.setSize(width, height, true);
      } else {
        if (isMac) {
            win.maximize();
        }else{
            win.setSize(width, height, true);
        }
      }
    });

    ipcMain.handle('set-always-on-top', (e, flag) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      win.setAlwaysOnTop(flag, 'screen-saver');
    });

    ipcMain.handle('show-notification', (e, title, body) => {
      const { Notification } = require('electron');
      new Notification({ title, body }).show();
    });
    // Synchronize window state
    mainWindow.on('maximize', () => {
      mainWindow.webContents.send('window-state', 'maximized')
    })
    mainWindow.on('unmaximize', () => {
      mainWindow.webContents.send('window-state', 'normal')
    })
    
    // Minimize to tray on close instead of exiting
    mainWindow.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault()
        mainWindow.hide()
        return false
      }
      return true
    })
    mainWindow.on('resize', () => {
      const size = mainWindow.getSize();
      mainWindow.webContents.send('window-resized', size);
    });

    // Enhanced copy supports pasting both images and files
    function copyImageToClipboardWithFile(image) {
      try {
        // 1. Save image to temporary directory
        const tempDir = os.tmpdir();
        // Generate timestamped filename to avoid collisions
        const fileName = `image_${Date.now()}.png`;
        const filePath = path.join(tempDir, fileName);
        
        // Convert nativeImage to buffer and write to disk
        const buffer = image.toPNG();
        fs.writeFileSync(filePath, buffer);

        // 2. Prepare clipboard data
        const clipboardData = {
          image: image, // Write bitmap for pasting into chat or image editors
        };

        // 3. Add file path data for pasting into folders
        if (process.platform === 'win32') {
          // --- Windows (CF_HDROP) ---
          // Construct DROPFILES structure
          // Layout: offset(4) + pt(8) + fNC(4) + fWide(4) + path(UTF16) + double-null
          const pathBuffer = Buffer.from(filePath, 'ucs2');
          const dropFiles = Buffer.alloc(20 + pathBuffer.length + 4);
          
          dropFiles.writeUInt32LE(20, 0); // pFiles (offset)
          dropFiles.writeUInt32LE(1, 16); // fWide (Unicode flag)
          pathBuffer.copy(dropFiles, 20); // Write path
          dropFiles.writeUInt32LE(0, 20 + pathBuffer.length); // Trailing double null

          clipboardData['CF_HDROP'] = dropFiles;
          
        } else if (process.platform === 'darwin') {
          // --- macOS (NSFilenamesPboardType) ---
          // Write Property List XML
          const plist = `
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0">
              <array>
                <string>${filePath}</string>
              </array>
            </plist>
          `;
          clipboardData['NSFilenamesPboardType'] = plist;
        }
        // Linux text/uri-list is not implemented here

        // 4. Write all formats together
        clipboard.write(clipboardData);
        
        console.log(`Copied image and file path: ${filePath}`);

      } catch (err) {
        console.error('Enhanced copy failed; falling back to standard copy:', err);
        // On error, try writing image alone
        clipboard.writeImage(image);
      }
    }

    // show-context-menu IPC handler

    ipcMain.handle('show-context-menu', async (event, { menuType, data }) => {
      let menuTemplate = [];
      const win = BrowserWindow.fromWebContents(event.sender);
      
      // Use locales[currentLanguage] directly
      const lang = locales[currentLanguage]; 

      // --- A. Image menu ---
      if (menuType === 'image') {
        menuTemplate = [
          {
            label: lang.openNewTab,
            click: () => {
              win.webContents.send('create-tab', data.src);
            }
          },
          { type: 'separator' },
          {
            label: lang.copyImageLink,
            click: () => clipboard.writeText(data.src)
          },
          {
            label: lang.copyImage,
            click: async () => {
              try {
                if (data.src.startsWith('data:')) {
                  const image = nativeImage.createFromDataURL(data.src);
                  clipboard.writeImage(image);
                } else if (data.src.startsWith('http')) {
                  const response = await fetch(data.src);
                  const blob = await response.blob();
                  const buffer = await blob.arrayBuffer();
                  const image = nativeImage.createFromBuffer(Buffer.from(buffer));
                  clipboard.writeImage(image);
                } else {
                  const image = nativeImage.createFromPath(data.src);
                  clipboard.writeImage(image);
                }
              } catch (error) {
                console.error('Failed to copy image:', error);
              }
            }
          },
          {
            label: lang.saveImageAs,
            click: async () => {
              try {
                let buffer = null;
                let defaultExtension = 'png';

                if (data.src.startsWith('data:')) {
                  const image = nativeImage.createFromDataURL(data.src);
                  buffer = image.toPNG();
                } else if (data.src.startsWith('http')) {
                  const response = await fetch(data.src);
                  const blob = await response.blob();
                  buffer = Buffer.from(await blob.arrayBuffer());
                  const lowerSrc = data.src.toLowerCase();
                  if (lowerSrc.endsWith('.jpg') || lowerSrc.endsWith('.jpeg')) defaultExtension = 'jpg';
                  else if (lowerSrc.endsWith('.gif')) defaultExtension = 'gif';
                  else if (lowerSrc.endsWith('.webp')) defaultExtension = 'webp';
                } else {
                  buffer = fs.readFileSync(data.src);
                  defaultExtension = path.extname(data.src).replace('.', '') || 'png';
                }

                const { filePath } = await dialog.showSaveDialog(win, {
                  title: lang.saveImageAs,
                  defaultPath: `image_${Date.now()}.${defaultExtension}`,
                  filters: [
                    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] },
                    { name: 'All Files', extensions: ['*'] }
                  ]
                });

                if (filePath) {
                  fs.writeFileSync(filePath, buffer);
                }
              } catch (error) {
                console.error('Failed to save image as:', error);
                dialog.showErrorBox('Save failed', 'Could not save the image: ' + error.message);
              }
            }
          }
        ];
      } 
      // --- B. Link menu ---
      else if (menuType === 'link') {
        menuTemplate = [
          {
            label: lang.openNewTab,
            click: () => {
              win.webContents.send('create-tab', data.url);
            }
          },
          { type: 'separator' },
          {
            label: lang.copyLink,
            click: () => clipboard.writeText(data.url)
          },
          {
            label: lang.copyLinkText,
            click: () => clipboard.writeText(data.text || '')
          }
        ];
      }
      // --- C. Text/selection menu ---
      else if (menuType === 'text') {
        menuTemplate = [
          { label: lang.copy, role: 'copy' },
          { 
            label: `Search "${data.text.length > 15 ? data.text.slice(0, 15) + '...' : data.text}"`,
            click: () => {
               win.webContents.send('trigger-search', `Search "${data.text}"`);
            } 
          },
          { type: 'separator' },
          { label: lang.selectAll, role: 'selectAll' }
        ];
      }
      // --- D. Default/blank-area menu ---
      else {
        menuTemplate = [
          { label: lang.cut, role: 'cut' },
          { label: lang.copy, role: 'copy' },
          { label: lang.paste, role: 'paste' },
          { type: 'separator' },
          { label: lang.selectAll, role: 'selectAll' }
        ];
      }

      // --- E. Inspect element in development ---
      if (isDev) {
        menuTemplate.push({ type: 'separator' });
        menuTemplate.push({
          label: lang.inspect,
          click: () => {
            win.webContents.openDevTools({ mode: 'detach' });
          }
        });
      }

      menu = Menu.buildFromTemplate(menuTemplate);
      menu.popup({ window: win });
    });

    // Listen for close events
    ipcMain.handle('request-stop-telegrambot', async (event) => {
      const win = BrowserWindow.getAllWindows()[0]; // Get main window
      if (win && !win.isDestroyed()) {
        // Call renderer method via webContents
        await win.webContents.executeJavaScript(`
          window.stopTelegramBotHandler && window.stopTelegramBotHandler()
        `);
      }
    });
    ipcMain.handle('request-stop-discordbot', async (event) => {
      const win = BrowserWindow.getAllWindows()[0]; // Get main window
      if (win && !win.isDestroyed()) {
        // Call renderer method via webContents
        await win.webContents.executeJavaScript(`
          window.stopDiscordBotHandler && window.stopDiscordBotHandler()
        `);
      }
    });
    ipcMain.handle('request-stop-slackbot', async (event) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) {
        await win.webContents.executeJavaScript(`
          window.stopSlackBotHandler && window.stopSlackBotHandler()
        `);
      }
    });
    ipcMain.handle('exec-command', (event, command) => {
      return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve(stdout);
        });
      });
    });
    // Other IPC handlers
    ipcMain.on('open-external', (event, url) => {
      shell.openExternal(url)
        .then(() => console.log(`Opened ${url} in the default browser.`))
        .catch(err => console.error(`Error opening ${url}:`, err))
    })
    ipcMain.handle('readFile', async (_, path) => {
      return fs.promises.readFile(path);
    });
    // File dialog handler
    ipcMain.handle('open-file-dialog', async (options) => {
      const allAllowed = [...ALLOWED_EXTENSIONS, ...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_VIDEO_EXTENSIONS];
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          { name: locales[currentLanguage].supportedFiles, extensions: allAllowed },
          { name: locales[currentLanguage].allFiles, extensions: ['*'] }
        ]
      })
      return result
    })
    ipcMain.handle('open-image-dialog', async () => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: locales[currentLanguage].supportedimages, extensions: ALLOWED_IMAGE_EXTENSIONS },
          { name: locales[currentLanguage].allFiles, extensions: ['*'] }
        ]
      })
      // Return array of filenames and paths
      return result
    });
    ipcMain.handle('check-path-exists', (_, path) => {
      return fs.existsSync(path)
    })

  } catch (err) {
    console.error('Launch failed:', err)
    if (loadingWindow && !loadingWindow.isDestroyed()) {
      loadingWindow.close()
    }
    dialog.showErrorBox('Launch failed', "Service launch failed: " + err.message)
    app.quit()
  }


// ================= Workspace file tree backend =================
    // 1. Read directory contents lazily
    ipcMain.handle('read-directory', async (event, dirPath) => {
      try {
        if (!fs.existsSync(dirPath)) {
          return { success: false, error: 'Directory does not exist' };
        }
        const items = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        const result = items.map(item => ({
          name: item.name,
          path: path.join(dirPath, item.name),
          isDirectory: item.isDirectory()
        }));

        // Sort folders first, then alphabetically
        result.sort((a, b) => {
          if (a.isDirectory === b.isDirectory) {
            return a.name.localeCompare(b.name);
          }
          return a.isDirectory ? -1 : 1;
        });

        return { success: true, data: result };
      } catch (error) {
        console.error('Failed to read directory:', error);
        return { success: false, error: error.message };
      }
    });

    // 2. Move file or directory to recycle bin
    ipcMain.handle('delete-workspace-file', async (event, filePath) => {
      try {
        await shell.trashItem(filePath); // Move to system recycle bin rather than permanently deleting
        return { success: true };
      } catch (error) {
        console.error('Failed to delete file:', error);
        return { success: false, error: error.message };
      }
    });
    // ==============================================================

// ================= Watch workspace changes =================
ipcMain.handle('start-workspace-watch', (event, dirPath) => {
  console.log("[Chokidar] Starting workspace watcher: " + dirPath);
  
  if (!fs.existsSync(dirPath)) {
    console.log('[Chokidar] Directory does not exist; cannot watch');
    return { success: false, error: 'Directory does not exist' };
  }

  // Close existing watcher first
  if (workspaceWatcher) {
    workspaceWatcher.close();
  }

  workspaceWatcher = chokidar.watch(dirPath, {
    ignored: /(^|[\/\\])\..|node_modules/, 
    persistent: true,
    ignoreInitial: true, 
    awaitWriteFinish: {  
      stabilityThreshold: 100,
      pollInterval: 50
    }
  });

  // Get main window directly rather than relying on event.sender
  const notifyRenderer = (action, filePath) => {
    console.log("[Chokidar] File changed: " + action + " -> " + filePath);
    const win = BrowserWindow.getAllWindows()[0]; // Get main window
    if (win && !win.isDestroyed()) {
      win.webContents.send('workspace-changed', { action, path: filePath });
    }
  };

  workspaceWatcher
    .on('add', path => notifyRenderer('add', path))
    .on('unlink', path => notifyRenderer('unlink', path))
    .on('addDir', path => notifyRenderer('addDir', path))
    .on('unlinkDir', path => notifyRenderer('unlinkDir', path));

  console.log('[Chokidar] Watcher started');
  return { success: true };
});

ipcMain.handle('stop-workspace-watch', () => {
  if (workspaceWatcher) {
    workspaceWatcher.close();
    workspaceWatcher = null;
    console.log('[Chokidar] Watcher stopped');
  }
  return { success: true };
});
// ==============================================================

})

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Application shutdown
app.on('before-quit', async (event) => {
  // Prevent repeated shutdown handling
  if (isQuitting) return;
  
  // Set exit state and prevent default quit until asynchronous cleanup completes
  isQuitting = true;
  event.preventDefault();
  
  console.log('Preparing to exit application...');

  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    
    // 1. Stop frontend bots
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.webContents.executeJavaScript(`
        if (window.stopDiscordBotHandler) window.stopDiscordBotHandler();
        if (window.stopTelegramBotHandler) window.stopTelegramBotHandler();
        if (window.stopSlackBotHandler) window.stopSlackBotHandler();
      `);
      // Allow frontend cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 2. Request graceful Python backend shutdown
    // Send HTTP request if PORT exists
    if (PORT && backendProcess) {
      try {
        console.log('Requesting graceful backend shutdown...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // Two-second timeout

        await fetch(`http://${HOST}:${PORT}/sys/shutdown`, {
          headers: { "X-SAP-Session": desktopSessionToken },
          method: 'POST',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        // Allow Python 1.5 seconds for node_mgr.stop() in lifespan
        console.log('Waiting for backend cleanup...');
        await new Promise(resolve => setTimeout(resolve, 1500));
      } catch (err) {
        console.log('Graceful backend shutdown failed or timed out (backend may have exited):', err.message);
      }
    }

    // 3. Fallback process cleanup
    // Force-stop Python if still alive or cleanup failed
    if (backendProcess) {
      console.log('Performing forced process cleanup...');
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', backendProcess.pid, '/f', '/t']);
      } else {
        backendProcess.kill('SIGKILL');
      }
      backendProcess = null;
    }

  } catch (error) {
    console.error('Shutdown error:', error);
  } finally {
    // 4. Exit Electron
    app.exit(0);
  }
});


// Automatic quit handling
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Handle renderer crash
app.on('render-process-gone', (event, webContents, details) => {
  console.error('Renderer crashed:', details);
  console.error('Exit code:', details.exitCode, 'Reason:', details.reason);
  // Write details to file for diagnostics
  fs.appendFileSync('crash.log', JSON.stringify(details) + '\n');
});
// Handle uncaught main-process exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  if (loadingWindow && !loadingWindow.isDestroyed()) {
    loadingWindow.close()
  }
  dialog.showErrorBox('Fatal error', "Uncaught exception: " + err.message)
  app.quit()
})

function createTray() {
  const iconPath = path.join(__dirname, 'static/source/icon_tray.png');
  if (!tray) {
    tray = new Tray(iconPath);
    tray.setToolTip('Super Agent Party');
    tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      }
    });
  }
  updateTrayMenu();
}
function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: locales[currentLanguage].show,
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: locales[currentLanguage].exit,
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])
  
  tray.setContextMenu(contextMenu);
}

function updatecontextMenu() {
  menu = Menu.buildFromTemplate([
    {
      label: locales[currentLanguage].cut,
      role: 'cut'
    },
    {
      label: locales[currentLanguage].copy,
      role: 'copy'
    },
    {
      label: locales[currentLanguage].paste,
      role: 'paste'
    }
  ]);
}

// app.on('web-contents-created', (e, webContents) => {
//   webContents.on('new-window', (event, url) => {
//   event.preventDefault();
//   shell.openExternal(url);
//   });
// });

app.on('web-contents-created', (event, contents) => {
  contents.on('will-attach-webview', (event, preferences, params) => {
    let target;
    try { target = new URL(params.src); } catch { event.preventDefault(); return; }
    if (contents !== mainWindow?.webContents || params.partition !== 'persist:party-browser-session' ||
        !['https:', 'http:', 'about:'].includes(target.protocol) ||
        (target.protocol === 'about:' && target.href !== 'about:blank')) {
      event.preventDefault();
      return;
    }
    delete preferences.preload;
    preferences.preload = path.join(__dirname, 'static/js/webview-preload.js');
    Object.assign(preferences, { nodeIntegration: false, nodeIntegrationInSubFrames: false,
      contextIsolation: true, sandbox: true, webSecurity: true, allowRunningInsecureContent: false });
  });

  const keepAppNavigationScoped = event => {
    if (contents === mainWindow?.webContents || contents === minimalWindow?.webContents ||
        contents === dynamicIslandWindow?.webContents ||
        [...vrmWindows, ...thaWindows, ...soulxWindows].some(window => !window.isDestroyed() && window.webContents === contents)) {
      if (new URL(event.url).origin !== `http://127.0.0.1:${PORT}`) event.preventDefault();
    }
  };
  contents.on('will-navigate', keepAppNavigationScoped);
  contents.on('will-redirect', keepAppNavigationScoped);

  // Intercept new-window requests, including webview window.open and target="_blank"
  contents.setWindowOpenHandler((details) => {
    const { url } = details;
    if (!['http:', 'https:'].includes(new URL(url).protocol)) return { action: 'deny' };

    // If main window exists, ask its Vue frontend to create a tab
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('create-tab', url);
    }
    
    // Prevent Electron from opening a native popup
    return { action: 'deny' };
  });

  // Retain existing side-button back navigation handling
  contents.on('input-event', (_ev, input) => {
    if (input.type === 'mouseDown' && (input.button === 3 || input.button === 4)) {
      contents.stopNavigation();
    }
  });
    contents.on('before-input-event', (_ev, input) => {
        const { alt, key } = input;
        if (alt && (key === 'Left' || key === 'Right')) {
          input.preventDefault = true;
        }
    });
  });


  // Enable HTTP caching for faster startup (previous disable-http-cache switch)

// Corresponding check-pending-install handler
ipcMain.handle('check-pending-install', () => {
  if (pendingExtensionUrl) {
    try {
      const urlObj = new URL(pendingExtensionUrl);
      const res = {
        type: urlObj.searchParams.get('type'),
        repo: urlObj.searchParams.get('repo'),
        config: urlObj.searchParams.get('config'),
        mcpType: urlObj.searchParams.get('mcpType')
      };
      pendingExtensionUrl = null;
      return res;
    } catch (e) { return null; }
  }
  return null;
});
