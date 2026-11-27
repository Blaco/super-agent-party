// scripts/start.js
const { spawn } = require('child_process');
const path = require('path');

// Set NODE_ENV to development
process.env.NODE_ENV = 'development';

const platform = process.platform;
let cmd, args, options;

if (platform === 'win32') {
  // Windows: switch the code page to UTF-8 before launching Electron
  cmd = 'cmd.exe';
  args = ['/c', 'chcp 65001 >nul && electron .'];
} else {
  // macOS and Linux: launch Electron directly
  cmd = 'electron';
  args = ['.'];
}

options = {
  stdio: 'inherit',
  shell: false, // A shell is unnecessary; Windows already uses cmd.exe
  env: process.env,
  cwd: process.cwd(),
};

const child = spawn(cmd, args, options);

child.on('exit', (code) => {
  process.exit(code);
});