#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];

function rel(file) {
  return path.join(root, file);
}

function checkExists(file) {
  if (!fs.existsSync(rel(file))) {
    failures.push(`${file}: missing`);
    return false;
  }
  return true;
}

function checkJson(file) {
  if (!checkExists(file)) return;
  try {
    JSON.parse(fs.readFileSync(rel(file), 'utf8'));
  } catch (error) {
    failures.push(`${file}: invalid JSON (${error.message})`);
  }
}

function checkJavaScript(file) {
  if (!checkExists(file)) return;
  const result = spawnSync(process.execPath, ['--check', rel(file)], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    failures.push(`${file}: syntax check failed\n${result.stderr || result.stdout}`);
  }
}

[
  'package.json',
  'config/locales.json',
  'config/settings_template.json',
].forEach(checkJson);

[
  'main.js',
  'start.js',
  'static/js/vue_data.js',
  'static/js/vue_methods.js',
  'static/js/renderer.js',
  'static/js/locales/en-US.js',
  'static/js/locales.js',
].forEach(checkJavaScript);

// Model-generated Mermaid diagrams must not enable interactive HTML/callbacks.
[
  'static/index.html',
  'static/chat.html',
  'static/js/renderer.js',
].forEach(file => {
  if (!checkExists(file)) return;
  const source = fs.readFileSync(rel(file), 'utf8');
  const levels = [...source.matchAll(/securityLevel\s*:\s*['"]([^'"]+)['"]/g)];
  if (levels.length !== 1 || levels.some(match => match[1] !== 'strict')) {
    failures.push(file + ': expected exactly one strict Mermaid security configuration');
  }
});

if (failures.length > 0) {
  console.error('Smoke check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Smoke check passed: JSON files parsed and JavaScript files compiled.');
