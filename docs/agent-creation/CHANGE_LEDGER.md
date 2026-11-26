# Fork change ledger (append-only)

Every code, UI, translation, configuration, file, provider, dependency, build and documentation change must be recorded here. Never rewrite previous entries silently. Git diffs are the byte-exact record; entries supply semantics and review evidence.

## Entry template (copy for each future change)

- **Date / branch / commit or PR:** YYYY-MM-DD; agent-creation; full SHA/link.
- **Scope and reason:** concise objective, explicit current project requirement.
- **Upstream baseline:** full SHA and exact original file/function/setting names.
- **Files changed:** one item per file, plus prior/new behavior and any changed public schema.
- **Disposition:** retained, hidden, replaced, removed or documented; list disabled features and how to restore.
- **User-facing effect:** labels, default values, UI locations, visible errors, data and APIs affected.
- **Alternative source research:** repository, exact commit and file, license, reuse/rejection reasoning.
- **Checks performed:** unit/smoke/syntax/manual/Windows/package and actual result. Never mark unrun as passing.
- **Self-review:** performance, privacy, security, compatibility, localization, undo/migration, unresolved issues.
- **Rollback:** exact commit/feature flag/upstream implementation.
- **Build artifact:** only when user explicitly requested "build"; filename, checksum and tested version.

## 2026-11-26 — Bootstrapping development governance

- **Branch:** `agent-creation`; based on fork/upstream `main` at `3aac964122415fe289a1b8af1000474b397c916b`.
- **Objective:** establish durable project guidance and exhaustive per-change tracking *before* changing SAP runtime code.
- **Changed:** root `AGENTS.md` translated into English and expanded with companion-specific constraints while retaining upstream architecture/caching/build details. Added `docs/agent-creation/README.md`, `PROJECT_CHARTER.md`, `WORK_PROTOCOL.md`, `LOCALIZATION_POLICY.md`, `FEATURE_MATRIX.md`, `UPSTREAM_TRACKING.md`, `REFERENCE_RESEARCH.md`, `RELEASE_AND_TEST.md`, `DECISIONS.md` and this `CHANGE_LEDGER.md`.
- **Disposition:** documentation added/replaced; **no runtime feature removed, hidden, translated, rewired or tested yet**. Existing upstream Chinese strings and services remain. No Windows build requested or produced.
- **References:** waifuai/hermes-waifu, waifuai/waifu-companion, moeru-ai/airi, NousResearch/hermes-agent metadata and README at the pins in REFERENCE_RESEARCH.md.
- **Verification:** GitHub fork/admin permission and branch starting SHA confirmed; file content checked for consistency; code/runtime tests not applicable to documentation-only revision. GitHub commit confirmation recorded in history.
- **Caveats:** existing upstream settings, documentation, UI, hardcoded Chinese prompts and packaging remain unmodified. Future audit must inventory each separately.
- **Rollback:** compare/revert this single documentation-bootstrap commit; upstream implementation remains in the root Git history at baseline SHA.

## 2026-11-26 — Add read-only English-surface audit and CI smoke checks

- **Branch / parent:** `agent-creation`, parent `fb1ecc1bc5cad2e5528400b819b7ee590b465bca`; current commit discoverable from Git history for this file.
- **Files added:** `scripts/audit_english_surface.py` inventories Han code points and China-specific platform names in source text, with path/line/category and optional JSON. It never edits source and does not pretend Han detection is linguistic classification. Optional `--fail-on-han` is disabled by default while the upstream baseline remains non-English.
- **Files added:** `.github/workflows/companion-audit.yml` runs the upstream `npm test` smoke check plus source inventory on pushes/PRs to this development branch; uploads a short-lived machine-readable report. It does not build, release, publish, or modify existing application behavior.
- **Disposition:** audit tooling added; no SAP runtime feature removed or hidden; no user-facing text translated yet.
- **Review focus:** repo contains legacy non-English locales and media/provider references; human review required before removal. Scanner skips vendored/binary directories by explicit rules (see script). No automatic deletion or translation.
- **Tests:** static code review completed; GitHub Actions result must be inspected after push. No Windows runtime test or application build performed.
- **Rollback:** revert the commit that added these two files and this log entry.

## 2026-11-26 — Automated audit verification and frozen baseline

- **Prior commit:** `290eeca71f23b06c3673624c3d94b05a8c5bd8a9`; source script and workflow unchanged.
- **Observed CI:** [run 45897427966](https://github.com/Blaco/super-agent-party/actions/runs/45897427966) completed successfully. Existing `npm test` smoke check passed; the source language inventory completed and produced a JSON artifact.
- **Baseline:** 194 files inspected; 16,793 Han-matching lines, 378 region-platform matching lines; zero unreadable files. See `AUDIT_BASELINE.md` for categories and limitations.
- **Changed:** added `AUDIT_BASELINE.md` to preserve measurements after CI artifact expiration; appended this evidence to ledger. No application code changed and no Windows build performed.
- **Self-audit:** scanner is a coarse source-inventory tool, not a language classifier or prompt trace. Automated test covers syntax/JSON only, not functional SAP interactions. Next step requires per-file, model-facing and UI inspection.
- **Rollback:** revert the documentation-only commit; run data remains attached to its original SHA.

## 2026-11-26 — First English-first runtime patch: defaults and main character chat

- **Branch and parent:** `agent-creation`; parent commit `27d518fb9e7f0c4168449704596f36975e876f93`; upstream comparison `3aac964122415fe289a1b8af1000474b397c916b`.
- **Intent:** remove unintended Chinese default prompts from local Qwen roleplay while preserving character instructions and functioning SAP modules. No full UI redesign or Chinese-provider removal is claimed.
- **`config/settings_template.json`:** new accounts default to English for `currentLanguage`, `systemSettings.language`, and blank `memorySettings.genericSystemPrompt` (the old default forced multilingual conversation behavior). Initial ASR wake/end phrases and hotword list are English; initial TTS sample, Edge voice/language and GPT-SoVITS language options become English. Existing saved settings are not overwritten. One unrelated, legacy QQ-bot wake phrase remains for later module removal audit.
- **`static/js/vue_data.js`:** matching frontend defaults, English target translation language and disabled language tool's default, new-character voice/sample defaults; all existing character/memory/model data structures retained. Existing non-English voice lists and alternative language support remain for later audit.
- **`static/js/vue_methods.js`:** auto-selected UI language now means en-US regardless of host OS; explicitly selected saved languages remain selectable. Translation lookup tolerates an absent language dictionary and falls back to English. New TTS configuration samples and defaults changed to English.
- **`static/js/locales/en-US.js`:** generic character prompt placeholder changed to an explicitly optional shared instruction rather than a covert instruction to mirror language.
- **`py/companion_defaults.py`:** pure, dependency-free helper that uses the SHA-256 of upstream's exact generic prompt to suppress only that inherited default in existing profiles, without storing its legacy Chinese text in new source. Preserves user-authored instructions and `{{user}}`/`{{char}}` substitutions, and does not mutate stored data. **Note:** suppression only covers the exact unmodified default string, not values previously rewritten/interpolated in a persisted profile.
- **`server.py`:** both main chat assembly paths now call this helper without assigning back to the stored generic prompt; inherited Chinese headings for username, character description, personality, dialogue examples, retrieved lore/memory, uploaded file context and selected knowledge/search context translated to English. One diary injection heading translated. Logging strings, tool descriptions, optional system prompts and many other features remain to translate in later commits.
- **`tests/test_companion_defaults.py`:** tests empty strings, user-authored English and non-English preservation, placeholder replacement, and exact-match suppression logic. Tests avoid requiring installed SAP model dependencies.
- **`.github/workflows/companion-audit.yml`:** added Python unittest + compilation of edited modules before the unchanged source-language inventory and existing `npm test` checks. No automated builds/releases triggered.
- **Verification:** exact source replacement counts validated while generating the Git tree; `config/settings_template.json` parsed successfully during staging. GitHub Actions results to be checked after push. No Windows UI/backend inference benchmark or app package performed.
- **Research check:** current SAP source and pinned waifuai/hermes-waifu, waifuai/waifu-companion, moeru-ai/airi, NousResearch/hermes-agent references evaluated; no code copied because an isolated compatibility shim is smaller and safer than replacing SAP's chat pipeline.
- **Self-audit:** preserving saved settings prevents character/data loss, but explicit old language selection and voice choices survive. Native TabbyAPI thinking/reasoning is unaffected and may still be exposed by model settings. Not all Chinese strings or region-specific integrations have been removed. UI simplification and complete English audit remain pending.
- **Rollback:** revert this change commit to return to `27d518fb9e7f0c4168449704596f36975e876f93`, or inspect baseline at upstream `3aac964`. All original code remains in Git history.

## 2026-11-26 — Reversible companion-focused navigation

- **Parent / upstream:** branch `agent-creation`, parent `f692ccf20f40cb763596cc668a0b287225f85839`; baseline `3aac964122415fe289a1b8af1000474b397c916b`.
- **Scope:** reduce default navigation to companion-related features, with one discoverable `Additional features` toggle for reversible access to all legacy menus. This is UI-only; backend modules, settings and saved data remain unchanged.
- **`static/index.html`:** always expose Chat, Model Configuration, Role, Toolkit, AI Browser (Electron), Storage and System Settings. Initially hide top-level Dashboard, Bot Deployment and API pages; filter Role's Sticker panel, Model's Text-to-Image panel, and Toolkit's Home Assistant, SQL, ComfyUI and Custom HTTP panels. The original markup and content for every hidden panel remain intact; enabling additional features reveals them. A toggle button is placed immediately below the main sidebar menu, with a title when sidebar is collapsed.
- **`static/js/vue_data.js`:** first launch opens Chat instead of Dashboard; `showOptionalFeatures` defaults false (session-only, no database migration).
- **`static/js/vue_methods.js`:** adds `toggleOptionalFeatures()` to show or hide optional navigation; if hiding an active optional page or subpanel, redirects to visible Chat/Character/Main Model/Tools rather than leaving a hidden selection.
- **`static/js/locales/en-US.js`:** English labels for Additional features and Hide additional features; existing language fallback resolves these labels to English.
- **`scripts/companion-ui-smoke.js`:** static structural assertions confirm core pages are present, optional pages remain in source, reversible filters and toggle methods exist; cannot substitute for manual Electron UI testing.
- **`.github/workflows/companion-audit.yml`:** adds UI structural smoke check before existing language and Python tests. No Windows build/release requested.
- **Verification:** source replacement counts validated and staged tree created. GitHub Actions to be checked after push. Visual responsiveness, keyboard navigation and user-profile persistence not yet Windows-tested.
- **Self-audit:** no China-specific integrations removed; hiding deployment pages does not disable any network integrations already enabled in a user's settings. No privacy protection added to model switching; separate future task. Settings for all planned features remain directly visible or accessible via one toggle.
- **Rollback:** revert this commit, or compare against `f692ccf20f40cb763596cc668a0b287225f85839`; no user data migration needed.

## 2026-11-26 — Verified CI for first functional iterations

- **Source commits:** `f692ccf20f40cb763596cc668a0b287225f85839` (English defaults/core character prompts) and `e3f7c49758c68d494095a55494c267583194f30c` (reversible navigation).
- **CI for first patch:** [run 45898426838](https://github.com/Blaco/super-agent-party/actions/runs/45898426838) completed successfully; SAP npm smoke checks, four Python prompt compatibility tests, Python compilation and source-language audit passed.
- **CI for second patch:** [run 45898627871](https://github.com/Blaco/super-agent-party/actions/runs/45898627871) completed successfully; SAP npm smoke checks, companion navigation structural smoke test, same four Python tests, Python compilation and inventory passed.
- **Latest scanner result:** 199 source-text files examined, 16,755 Han-matching lines, 379 region-platform matching lines; categories: interface 8,017, backend 5,502, locales 2,041, documentation 932, other 495, model-facing candidates 69. Counts are broad inventory, not confirmed translation defects; file counts differ as new source/docs are added.
- **Validation boundaries:** Node/JS syntax and structural checks do not establish a functioning GUI, integration tests with TabbyAPI, imported character-card behavior, speech quality or packaging readiness. No Windows runtime test or downloadable app build has been done.
- **Documentation:** added `CURRENT_STATUS.md` and linked it plus `UI_NAVIGATION.md` in the documentation index; no runtime source changes in this verification commit.

## 2026-11-26 — English runtime boundary and fork update safety

- **Branch / parent:** `agent-creation` based on `4af22a4f4a0a66a79674daa841e68b70586daee0`; this entry is in the corresponding source commit.
- **Scope:** Limit packaged UI chrome, menus and backend messages to English without changing any user-authored conversation, imported card, lorebook or memory data.
- **Files:** `config/locales.json` (English backend locale only); `static/js/locales.js` and `static/index.html` (English UI locale only, remove regional mirror control and upstream China-focused social links); `static/js/locales/zh-CN.js` (delete unreferenced Chinese UI bundle); `main.js` (English Electron menu/IPC, updater disabled until fork feed verified); `static/js/vue_data.js` and `static/js/vue_methods.js` (English UI selection, Western search defaults, topic prompts); `config/settings_template.json` (English wake words, relationship and diary instructions); `server.py` (English progress locale, remove China-only registry overrides); `package.json` (English description, fork publisher/release destination); `tests/test_english_runtime_contract.py` and `.github/workflows/companion-audit.yml` (regression checks).
- **Compatibility:** Persisted UI language is normalized to English, while voice recognition/translation language and user content retain their own controls. Existing China-mirror setting is ignored, generic proxy behavior stays intact. Removed locale can be restored from parent SHA if needed.
- **Preserved:** TabbyAPI, OpenRouter, WhisperBox boundary, ASR/TTS, character, memory, avatars, OpenClaw/ACPX, Western bot and streaming internals, AGPL notices and upstream commit history.
- **Self-review/limitations:** No wholesale deletion of platform bot adapters, vendor IDs or all Chinese source comments/model instructions. This is not a complete China-free product. GitHub Actions, Windows runtime and packaged build still require verification. Roll back via commit revert.
