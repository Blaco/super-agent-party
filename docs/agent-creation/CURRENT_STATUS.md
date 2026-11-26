# Current implementation status — 2026-11-26

**Fork:** https://github.com/Blaco/super-agent-party
**Development branch:** `agent-creation`
**Clean upstream comparison:** fork `main` at `3aac964122415fe289a1b8af1000474b397c916b`
**Latest functional commit:** `e3f7c49758c68d494095a55494c267583194f30c`

## Implemented in source

- English first-run UI locale and core TTS/ASR examples.
- Fresh generic character prompt is blank, rather than upstream's forced language-mirroring rule.
- A hash-based compatibility function suppresses only the exact legacy default in existing saved profiles; custom character prompts remain untouched.
- Two main character-chat assembly paths use English role labels for character details, dialogue, lore and relevant memories. Many feature-specific tool prompts still contain Chinese.
- Default main navigation focuses on Chat, Models, Character, Tools, Browser, Storage, System.
- **Additional features** restores optional SAP pages and panels, without deleting their code or settings.

## Verified by automation

- [English prompt commit run](https://github.com/Blaco/super-agent-party/actions/runs/45898426838): success.
- [Navigation commit run](https://github.com/Blaco/super-agent-party/actions/runs/45898627871): success.
- `npm test`: SAP JS syntax/JSON smoke check passed.
- `scripts/companion-ui-smoke.js`: static UI wiring assertions passed.
- Four `tests/test_companion_defaults.py` tests passed.
- `python -m py_compile py/companion_defaults.py server.py`: passed.
- Source inventory: 16,755 Han-flagged lines and 379 region-platform references among 199 inspected files.

## Not yet validated or completed

1. **Windows runtime test:** Electron UI navigation, font/layout, clean-profile startup, character chat and Qwen/TabbyAPI integration are not yet executed in a live Windows build.
2. **Complete English conversion:** current implementation still has Chinese source comments, UI literals, other locale data, optional system prompts, tool descriptions, errors, localization fallbacks and documentation. No claim of a fully English application.
3. **China-only services:** QQ, WeChat, Feishu, DingTalk, Bilibili and regional cloud integrations remain in upstream code. Bot deployment was hidden in the sidebar only; existing background services are not disabled or removed.
4. **Model reasoning:** Qwen/TabbyAPI thinking behavior and exposed reasoning remain to be tested and controlled per provider.
5. **Cloud data privacy:** do not switch a private local conversation to a remote model until a history-scope/consent gate has been implemented.
6. **Build pipeline:** package.json and upstream build workflow still contain upstream publisher/release configuration. Audit and fix before building a distributable. No build has been requested or produced.
7. **Avatar/voice:** WhisperBox remains independent; SAP ASR/TTS, AV sync and VRM/THA integration have not been validated in this fork.

## Next source work

- Inventory and translate remaining **model-facing** Chinese prompts and English fallback paths, prioritizing tool descriptions, optional ASR/TTS instructions, vision, diaries and agent/tool modes.
- Trace China-focused bot, provider and media platform dependencies in backend imports, startup hooks, UI, settings and documentation. Remove only after dependency and recovery review; use source-code preserving wrappers for shared core modules.
- Improve navigation layout and keyboard/screen reader behavior based on a real Windows build test.
- Implement cloud inference consent and scoped conversation export before enabling model switching with private histories.
- When the user says **build**, build and package Windows x64 from source at a specific SHA, verify it and provide an actual ZIP; do not treat GitHub source files as a build.

The current state is source-implemented and CI-reviewed, **not** Windows-tested or packaged.

## English-only runtime boundary follow-up (2026-11-26)

A source change narrows UI and backend message localization to English, translates shipped relationship/diary and topic generation prompts, removes Chinese registry mirror behavior and disables inherited auto-updating while a fork-owned feed is not verified. Other Chinese text and China-specific integrations remain and must be audited. Check the latest branch CI: the prior audit totals above are historical.
