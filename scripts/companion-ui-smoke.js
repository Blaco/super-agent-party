#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'static', 'index.html'), 'utf8');
const data = fs.readFileSync(path.join(root, 'static', 'js', 'vue_data.js'), 'utf8');
const methods = fs.readFileSync(path.join(root, 'static', 'js', 'vue_methods.js'), 'utf8');
const english = fs.readFileSync(path.join(root, 'static', 'js', 'locales', 'en-US.js'), 'utf8');

assert(html.includes('index="home"'), 'Chat navigation must remain exposed');
assert(html.includes('index="model-config"'), 'Model configuration must remain exposed');
assert(html.includes('index="role"'), 'Character configuration must remain exposed');
assert(html.includes('index="toolkit"'), 'Agent and tool settings must remain exposed');
assert(html.includes('index="system"'), 'System settings must remain exposed');

for (const page of ['dashboard', 'deploy-bot', 'api-group']) {
  assert(html.includes('index="' + page + '"'), 'Original page was deleted: ' + page);
}
assert(html.includes('index="dashboard" id="menu-dashboard" v-if="showOptionalFeatures"'));
assert(html.includes('index="deploy-bot" v-if="showOptionalFeatures"'));
assert(html.includes('index="api-group" v-if="showOptionalFeatures"'));

for (const panel of ['roleTiles', 'modelTiles', 'toolkitTiles']) {
  assert(html.includes('v-for="tile in ' + panel + '.filter('),
    'Expected reversible filtering for ' + panel);
}
assert(html.includes('@click="toggleOptionalFeatures"'));
assert(data.includes('showOptionalFeatures: false'));
assert(data.includes("activeMenu: 'home'"));
assert(methods.includes('toggleOptionalFeatures()'));
assert(methods.includes("this.activeMenu = 'home'"));
assert(english.includes("'showOptionalFeatures': 'Additional features'"));
assert(english.includes("'hideOptionalFeatures': 'Hide additional features'"));

console.log('Companion navigation smoke check passed (structural assertions only).');
