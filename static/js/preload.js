const { contextBridge, ipcRenderer, webFrame } = require('electron');


// Cache the most recent VMC configuration (disabled by default)
let vmcCfg = { receive:{enable:false,port:39539,syncExpression: false}, send:{enable:false,host:'127.0.0.1',port:39540} };

// Receive the latest configuration from the main process
ipcRenderer.on('vmc-config-changed', (_, cfg) => { vmcCfg = cfg; });

// Default server configuration matches main.js (fallback only; backend-ready supplies the actual port if occupied)
const HOST = '127.0.0.1'
const PORT = 3456
// Get configuration data passed from the main process
const windowConfig = {
    windowName: "default",
};
// Expose basic ipcRenderer functions for the loading screen
contextBridge.exposeInMainWorld('electron', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  ipcRenderer: {
    on: (channel, func) => {
      // Allow only specific channels
      const validChannels = ['backend-ready', 'trigger-search'];
      if (validChannels.includes(channel)) {
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },

  },
  // Expose dynamic server configuration: defaults until backend-ready supplies the actual values
  server: {
    host: HOST,
    port: PORT
  },
  // Get server information (host/port) synchronously
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  requestStopDiscordBot : () => ipcRenderer.invoke('request-stop-discordbot'),
  requestStopTelegramBot : () => ipcRenderer.invoke('request-stop-telegrambot'),
  requestStopSlackBot : () => ipcRenderer.invoke('request-stop-slackbot'), 
});

// Expose safe interfaces
contextBridge.exposeInMainWorld('electronAPI', {
  onNewTab: (callback) => ipcRenderer.on('create-tab', (_, url) => callback(url)),
  saveScreenshotDirect: (buffer) => ipcRenderer.invoke('save-screenshot-direct', { buffer }),
  // System functions
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  openPath: (filePath) => ipcRenderer.invoke('shell:open-path', filePath),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  // Window controls
  windowAction: (action) => ipcRenderer.invoke('window-action', action),
  onWindowState: (callback) => ipcRenderer.on('window-state', callback),

  // File dialogs
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  openImageDialog: () => ipcRenderer.invoke('open-image-dialog'),
  readFile: (filePath) => ipcRenderer.invoke('readFile', filePath),
  // Path handling
  pathJoin: (...args) => ipcRenderer.invoke('shell:join-path', args),
  sendLanguage: (lang) => ipcRenderer.send('set-language', lang),
  // Global zoom (font/interface scaling)
  setZoomFactor: (factor) => {
    try { webFrame.setZoomFactor(Number(factor) || 1); } catch (e) { /* noop */ }
  },
  getZoomFactor: () => {
    try { return webFrame.getZoomFactor(); } catch (e) { return 1; }
  },
  // Environment detection
  isElectron: true,

  // Automatic updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', callback),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', callback),
  onUpdateError: (callback) => ipcRenderer.on('update-error', callback),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', callback),
  showContextMenu: (menuType, data) => ipcRenderer.invoke('show-context-menu', { menuType, data }),
  // Save environment variables
  setNetworkVisibility: (visible) => ipcRenderer.invoke('set-env', { key: 'networkVisible', value: visible }), 
  
  saveChromeSettings: (settings) => ipcRenderer.invoke('save-chrome-config', settings),
  getInternalCDPInfo: () => ipcRenderer.invoke('get-internal-cdp-info'),
  // Restart the app
  restartApp: () => ipcRenderer.invoke('restart-app'),
  startVRMWindow: (windowConfig) => ipcRenderer.invoke('start-vrm-window', windowConfig),
  stopVRMWindow: () => ipcRenderer.invoke('stop-vrm-window'),
  startTHAWindow: (windowConfig) => ipcRenderer.invoke('start-tha-window', windowConfig),
  stopTHAWindow: () => ipcRenderer.invoke('stop-tha-window'),
  startSoulxWindow: (windowConfig) => ipcRenderer.invoke('start-soulx-window', windowConfig),
  stopSoulxWindow: () => ipcRenderer.invoke('stop-soulx-window'),
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  setIgnoreMouseEvents: (ignore, options) => ipcRenderer.invoke('set-ignore-mouse-events', ignore, options),
  getIgnoreMouseStatus: () => ipcRenderer.invoke('get-ignore-mouse-status'),
  downloadFile: (payload) => ipcRenderer.invoke('download-file', payload),
  // Accept a callback
  getWindowConfig: (callback) => {
      if (windowConfig.windowName !== "default") {
          // Return immediately if the configuration has been updated
          callback(windowConfig);
      } else {
          // Otherwise listen for the configuration update event
          const handler = (event) => {
              callback(event.detail);
              window.removeEventListener('window-config-updated', handler);
          };
          window.addEventListener('window-config-updated', handler);
      }
  },

  setVMCConfig: (cfg) => ipcRenderer.invoke('set-vmc-config', cfg),
  getVMCConfig: () => ipcRenderer.invoke('get-vmc-config'),
  onVMCConfigChanged: (cb) => ipcRenderer.on('vmc-config-changed', (_, cfg) => cb(cfg)),
  captureDesktop: () => ipcRenderer.invoke('capture-desktop'), // Desktop capture
  toggleWindowSize: (width, height) => ipcRenderer.invoke('toggle-window-size', { width, height }),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),
  showScreenshotOverlay: (hideWindow) => ipcRenderer.invoke('show-screenshot-overlay', { hideWindow }),
  cropDesktop:        (opts) => ipcRenderer.invoke('crop-desktop', opts),
  cancelScreenshotOverlay: () => ipcRenderer.invoke('cancel-screenshot-overlay'),
  openDirectoryDialog: async () => {
    return ipcRenderer.invoke('dialog:openDirectory');
  },
  execCommand: (command) => ipcRenderer.invoke('exec-command', command),
  getPlatform: () => process.platform,
  openExtensionWindow: (url, extension) => ipcRenderer.invoke('open-extension-window', { url, extension }),
  openMinimalWindow: () => ipcRenderer.invoke('open-minimal-window'),
  closeMinimalWindow: () => ipcRenderer.invoke('close-minimal-window'),
  getMinimalWindowState: () => ipcRenderer.invoke('get-minimal-window-state'),
  onMinimalWindowClosed: (callback) => {
    ipcRenderer.removeAllListeners('minimal-window-closed');
    ipcRenderer.on('minimal-window-closed', () => callback());
  },
  openIslandWindow: () => ipcRenderer.invoke('open-island-window'),
  closeIslandWindow: () => ipcRenderer.invoke('close-island-window'),
  getIslandWindowState: () => ipcRenderer.invoke('get-island-window-state'),
  onIslandWindowClosed: (callback) => {
    ipcRenderer.removeAllListeners('island-window-closed');
    ipcRenderer.on('island-window-closed', () => callback());
  },
  onLanguageChanged: (callback) => {
    ipcRenderer.removeAllListeners('language-changed');
    ipcRenderer.on('language-changed', () => callback());
  },
  getBackendLogs: () => ipcRenderer.invoke('get-backend-logs'),

  onRemoteInstall: (callback) => ipcRenderer.on('remote-install-any', (_, payload) => callback(payload)),
  checkPendingInstall: () => ipcRenderer.invoke('check-pending-install'),

  registerGlobalShortcut: (key) => ipcRenderer.invoke('register-global-shortcut', key),
  unregisterGlobalShortcut: () => ipcRenderer.invoke('unregister-global-shortcut'),
  onGlobalShortcutTriggered: (callback) => ipcRenderer.on('global-shortcut-triggered', callback),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  deleteWorkspaceFile: (filePath) => ipcRenderer.invoke('delete-workspace-file', filePath),
  uploadToWorkspace: (targetDirPath, sourceFilePaths) => ipcRenderer.invoke('upload-to-workspace', { targetDirPath, sourceFilePaths }),
  startWorkspaceWatch: (dirPath) => ipcRenderer.invoke('start-workspace-watch', dirPath),
  stopWorkspaceWatch: () => ipcRenderer.invoke('stop-workspace-watch'),
  onWorkspaceChanged: (callback) => {
    // Remove any old listener first to prevent repeated callbacks after remounting
    ipcRenderer.removeAllListeners('workspace-changed');
    ipcRenderer.on('workspace-changed', (_, data) => callback(data));
  },

  // Multi-account management
  accountsGetAll: () => ipcRenderer.invoke('accounts:get-all'),
  accountsGetCurrent: () => ipcRenderer.invoke('accounts:get-current'),
  accountsCreate: (name, dataPath, cloneFromRoot, setAsDefault) =>
    ipcRenderer.invoke('accounts:create', { name, dataPath, cloneFromRoot, setAsDefault }),
  accountsDelete: (accountId, removeFolder) =>
    ipcRenderer.invoke('accounts:delete', { accountId, removeFolder }),
  accountsRename: (accountId, newName) =>
    ipcRenderer.invoke('accounts:rename', { accountId, newName }),
  accountsSetDefault: (accountId) =>
    ipcRenderer.invoke('accounts:set-default', { accountId }),
  accountsLaunch: (accountId) =>
    ipcRenderer.invoke('accounts:launch', { accountId }),
  accountsSwitch: (accountId) =>
    ipcRenderer.invoke('accounts:switch', { accountId }),
  // Clipboard
  clipboardRead: () => ipcRenderer.invoke('clipboard-read'),
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard-write', text),
  clipboardReadImage: () => ipcRenderer.invoke('clipboard-read-image'),
  clipboardReadFilePaths: () => ipcRenderer.invoke('clipboard-read-file-paths'),

  // Local application control
  launchAppWithDebugging: (opts) => ipcRenderer.invoke('launch-app-with-debugging', opts),
  quitAppProcess: (opts) => ipcRenderer.invoke('quit-app-process', opts),
});

contextBridge.exposeInMainWorld('vmcAPI', {
  onVMCBone: (callback) => ipcRenderer.on('vmc-bone', (_, data) => callback(data)),

  onVMCOscRaw: (cb) => ipcRenderer.on('vmc-osc-raw', (_, oscMsg) => cb(oscMsg)),

  sendVMCBone: (data) => {
    if (!vmcCfg.send.enable) return;
    return ipcRenderer.invoke('send-vmc-bone', data);
  },
  sendVMCBlend: (data) => {
    if (!vmcCfg.send.enable) return;
    return ipcRenderer.invoke('send-vmc-blend', data);
  },
  sendVMCBlendApply: () => {
    if (!vmcCfg.send.enable) return;
    return ipcRenderer.invoke('send-vmc-blend-apply');
  },
  sendVMCFrame: (data) => ipcRenderer.invoke('send-vmc-frame', data),
});

contextBridge.exposeInMainWorld('downloadAPI', {
    // Listen for download events
    onDownloadStarted: (cb) => ipcRenderer.on('download-started', (_, data) => cb(data)),
    onDownloadUpdated: (cb) => ipcRenderer.on('download-updated', (_, data) => cb(data)),
    onDownloadDone: (cb) => ipcRenderer.on('download-done', (_, data) => cb(data)),
    
    // Send control commands
    controlDownload: (id, action) => ipcRenderer.invoke('download-control', { id, action }),
    showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path)
});

// Receive configuration passed from the main process
ipcRenderer.on('set-window-config', (event, config) => {
    Object.assign(windowConfig, config);
    console.log('Received window configuration:', windowConfig);
    
    // Notify the page after the configuration changes
    window.dispatchEvent(new CustomEvent('window-config-updated', {
        detail: windowConfig
    }));
});
