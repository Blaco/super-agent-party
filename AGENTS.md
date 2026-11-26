# Agent Creation — repository agent instructions

This repository is the user-maintained fork of Super Agent Party (SAP). The authoritative development rules are in [docs/agent-creation/WORK_PROTOCOL.md](docs/agent-creation/WORK_PROTOCOL.md). Read that file, the [project charter](docs/agent-creation/PROJECT_CHARTER.md), and the [change ledger](docs/agent-creation/CHANGE_LEDGER.md) before editing any source. Read the [feature matrix](docs/agent-creation/FEATURE_MATRIX.md) before hiding or removing functionality.

## Mandatory working rules

1. **Scope:** Build a local-first Windows AI character companion. First achieve high-quality, low-latency, consistently characterized text conversation with local TabbyAPI/EXL3 Qwen; later implement opt-in cloud model switching, ASR, voice-cloned TTS, desktop avatars, memory and OpenClaw via ACPX.
2. **Persona is independent from inference.** One authoritative character card and lorebook; do not duplicate character instructions per provider. Do not silently copy private local conversation or memory to cloud services. Switching to a cloud model requires explicit disclosure/consent and scoped history handling.
3. **English-first:** all shipped interface text, prompts, defaults, tool descriptions, user documentation, errors, onboarding and sample data must be natural English. Do not blindly translate code identifiers, protocol strings, licenses, paths or copyrighted third-party assets. Search for Chinese text before delivery. See LOCALIZATION_POLICY.md.
4. **Preserve implemented functionality.** Never rewrite a working subsystem merely for aesthetics. Hide out-of-scope features behind a reversible advanced/legacy switch when practical. Remove region-specific China-platform adapters only after verifying dependencies, impact and rollback.
5. **Never regress future features:** preserve SillyTavern cards and world information, memory, context tools, TabbyAPI local inference, OpenRouter/cloud providers, multimodal vision, speech recognition, voice cloning, VRM/THA/Live2D, desktop integration, MCP/skills and OpenClaw/ACPX.
6. **Track every change:** maintain the append-only CHANGE_LEDGER.md with exact files, functionality, before/after, test evidence, upstream reference, reversibility and commit or PR. The Git diff is the byte-level source of truth; the ledger explains the intent and effect. Keep the FEATURE_MATRIX.md synchronized.
7. **Research before implementing:** inspect the local SAP implementation and reference projects at pinned commits, check license/asset rights, favor compatible patterns rather than wholesale copies. Record findings in REFERENCE_RESEARCH.md.
8. **Self-audit:** inspect diff and impacts, run suitable tests plus manual acceptance checks, check character privacy boundaries, and record unresolved limitations. Never claim an unperformed build or test succeeded.
9. **Commands:** "commit"/"push" means commit/push source to this fork; do not generate a downloadable build unless user explicitly says "build". "build" means a Windows x64 source-built distributable ZIP for the verified commit, plus SHA-256, logs and validation status. See RELEASE_AND_TEST.md.
10. **No silent structural edits:** keep existing user-facing behavior, comments, headers and formatting unless change is required; explain every meaningful changed section. Keep WhisperBox an independently maintained service, not code merged into SAP.
11. **Versioning:** compare against upstream commit 3aac964122415fe289a1b8af1000474b397c916b. Work on branch agent-creation; preserve fork main as a clean upstream comparison until an intentional integration decision.
12. **Respect AGPL-3.0 and notices.** Other projects' MIT/MIT-0 licenses do not grant rights to their separately licensed Live2D models/assets. Do not include third-party code or binaries without documenting provenance and obligations.

## Upstream architecture reference (translated and condensed)

- Original project: https://github.com/heshengtao/super-agent-party ; author Heshengtao; license AGPL-3.0.
- Desktop shell: Electron 39 and electron-builder. Node package management uses npm.
- Frontend: Vue 3 in static/index.html (not Vue single-file components), Element Plus, Three.js/VRM; data in static/js/vue_data.js; methods in static/js/vue_methods.js; English locale in static/js/locales/en-US.js.
- Backend: Python 3.12, FastAPI, SQLite. Python dependencies use uv, pyproject.toml and uv.lock. Main backend is server.py; helper modules in py/.
- Main Electron process: main.js (windows, IPC, tray, updater, child process, multi-account storage); start.js handles development startup.
- Runtime: start.js -> main.js -> backend server.py process -> REAL_PORT_FOUND signal -> BrowserWindow opens 127.0.0.1 on the detected port.
- Communication: HTTP API, WebSockets for ASR/TTS/VRM/THA/subtitles, Electron contextBridge/IPC for native operations and desktop interaction.
- Per-account data directories: Electron passes --data-dir to backend; chat, settings, uploads, knowledge and memory are separated by account.
- Settings defaults in config/settings_template.json; runtime persistence via SQLite/config management; API credentials may be stored in account data. Never commit secrets, real user character cards, transcripts or API keys.
- Character and memory: SAP's memorySettings, memories, diary and worldbook are separate from its main model-provider configuration.
- Extensibility: static frontend extensions and embedded windows; node sidecar extensions managed by py/node_runner.py; MCP servers via mcpServers; skills in skills/; acpx and other agent adapters.
- Static asset cache: server.py inject_asset_versions adds content-MD5 version suffixes to HTML-referenced static assets. static/sw.js uses version-aware caching. If changing cache structure, bump its CACHE_NAME; if new asset types are added, update server.py _ASSET_VERSION_RE and sw.js VERSIONED_ASSET_RE together.
- Build: npm start / npm run dev; npm run build:win for Windows installer; npm run pack for unpacked output; PyInstaller via server.spec prepares Python backend. Verify the actual pipeline before claiming a distributable is produced. The package.json test script currently runs scripts/smoke-check.js, contrary to older upstream prose that said no tests existed.
- Core modules include py/cli_tool.py, py/computer_use_tool.py, py/cdp_tool.py, py/knowledge_base.py, py/diary_*.py, py/moss_tts.py, py/sherpa_asr.py, py/skills.py, py/mcp_clients.py, py/task_center.py, py/scheduler.py and py/ws_manager.py.
