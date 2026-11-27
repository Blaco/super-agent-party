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

## 2026-11-26 — Update JS smoke test after locale removal

- **Parent:** `691ea14f652b78f3a90e73f63e58243adc70273c`. The first CI execution failed at `npm test` because `scripts/smoke-check.js` still required the intentionally removed `static/js/locales/zh-CN.js`.
- **Files:** `scripts/smoke-check.js` now checks `static/js/locales.js` alongside the English translation file; `docs/agent-creation/CHANGE_LEDGER.md` records the correction.
- **Behavior:** No runtime changes; test inventory is aligned with the English-only UI locale. The prior CI failure is preserved in GitHub Actions history.
- **Verification:** Re-run npm, UI, and Python checks on the resulting commit; Windows build remains untested. Roll back with a revert if needed.

## 2026-11-26 — Retire five region-only messaging backends

- **Parent:** `e0adee077d2fa499aaaf1640301feadb9739d438`; implementation on `agent-creation`.
- **Behavior:** Remove dedicated QQ, Feishu, DingTalk, personal WeChat and WeCom manager modules and their HTTP routes; slim `BotContainer` to Discord/Slack/Telegram. Behavior-configuration synchronization now iterates only supported optional managers and copies config before insertion. Existing account/chat/memory data remains intact.
- **Frontend:** Remove the five inactive region-platform configuration tabs and selectable bot targets; leave standard Western social bots in the already optional Bot Deployment view. Startup no longer polls deleted region-bot routes. Default optional messaging tab becomes Telegram.
- **Files:** `server.py`, `static/index.html`, `static/js/vue_methods.js`, `static/js/vue_data.js`, `py/qq_bot_manager.py`, `py/feishu_bot_manager.py`, `py/dingtalk_bot_manager.py`, `py/wechat_bot_manager.py`, `py/wecom_bot_manager.py`, `tests/test_legacy_bot_removal.py`, `.github/workflows/companion-audit.yml`, `docs/agent-creation/FEATURE_MATRIX.md` and this ledger.
- **Limits:** Additional frontend state/method definitions and dependency lock entries remain as inactive legacy references. Remove them only after another dependency scan. Bilibili streaming is independent and not covered here. No live runtime validation of Western bots yet.
- **Verification:** Static route assertions and Python syntax check added to CI; verify run after push. Roll back using the preceding commit and restore deleted files via Git.

## 2026-11-26 — Retire dedicated Bilibili client; preserve optional YouTube/Twitch

- **Parent:** `6ef3f77728070d414ed32d904ae56dbd18af7a95`; working branch `agent-creation`.
- **Files changed:** `py/live_router.py` retains REST and websocket routes, YouTube and Twitch clients, but removes dedicated Bilibili SDK, threaded client and credentials. `py/blivedm/**` deleted. `static/index.html` drops Bilibili tab. `config/settings_template.json` and `static/js/vue_data.js` drop Bilibili defaults and fix the `youtube_vedio_id` typo; `static/js/vue_methods.js` renames the shared stream socket from `bilibiliWs` to `liveWs` and does not falsely identify stream events as Bilibili. `static/js/renderer.js` checks YouTube/Twitch configurations. CI adds Python compile and static isolation checks.
- **Preservation:** YouTube, Twitch, optional streaming view, websocket event format, agent features, character and memory data. Persisted obsolete Bilibili config is ignored by Pydantic; no account data migration.
- **Validation:** CI source test pending; no YouTube/Twitch live integration tested. Region-specific SDK dependencies, translated labels, bot method remnants and source text still need review. Revert this commit to restore the client.

## 2026-11-26 — Strip obsolete messaging UI logic and fix TTS separator binding

- **Parent:** `42eac9bf4b7434b029af2faba5946f938e0af046`, branch `agent-creation`.
- **Files:** `static/js/vue_methods.js` removes old QQ/WeChat/WeCom/Feishu/DingTalk actions, QR login polling, the commented-out personal WeChat bot methods and no-longer-valid config restore/save keys. `static/js/vue_data.js` drops corresponding runtime objects and Chinese-only shortcut aliases; `static/js/renderer.js` drops the computed bot validation/separator UI and obsolete renderer cleanup hooks; `main.js` drops their IPC shutdown handlers and exit calls; `config/settings_template.json` no longer ships those bot config defaults; `static/index.html` cleans orphaned deleted-tab headings. The unrelated TTS separator UI no longer uses `qqBotConfig`; it now uses `ttsSettings.separators`. `tests/test_region_bot_frontend_contract.py` and CI enforce exclusions.
- **Preserved:** User messages, character data, independent speech backend settings and optional Discord/Telegram/Slack; previous source and old config values remain available in Git history. No automatic migration or user file deletion. Generic optional tool, Windows desktop and agent architecture remain enabled.
- **Validation:** Source/static tests pending CI; no packaged Windows runtime has been tested. English translation of remaining source messages and provider cleanup not completed. Revert the commit if needed.

## 2026-11-26 — Default model repository and SDK cleanup

- Parent: e4e0c69d0f1c356aaa7da8ce2430858a4286c6cd.
- Model downloading: the Sherpa ASR, MiniLM embedding and MOSS TTS model managers now use Hugging Face only, with their former regional mirror URLs and SDK-specific download code removed. Removed five ModelScope download buttons from the UI. Client defaults and region-detecting download-source selection now use Hugging Face.
- Dependencies: pyproject.toml removes five region-specific social SDKs and ModelScope; server.spec drops botpy hidden imports. MOSS status strings translated. Corrected Hugging Face snapshot call compatibility.
- Files: py/sherpa_model_manager.py, py/ebd_model_manager.py, py/moss_model_manager.py, static/index.html, static/js/vue_methods.js, pyproject.toml, server.spec, tests/test_model_source_policy.py, .github/workflows/companion-audit.yml and this ledger.
- Known limitation: uv.lock is still the inherited resolution and must be refreshed on Windows using uv sync before a reproducible build; no model-download integration test yet. The default Sherpa model identifier retains language-support codes as its existing on-disk folder; user models are not migrated. Revert this commit for rollback.

## 2026-11-26 — Contained Windows x64 development build workflow

- Parent: 73b3f99b66db86457c12829088d49f5eeacd0a2c; replaces the inherited publishing-capable multi-platform workflow with an English Windows x64 development packaging path at .github/workflows/build.yml.
- Safety: only a manual dispatch or a push changing the workflow file on agent-creation triggers the package. No tag creation, release publishing, GH_TOKEN publish access or signing. Actions permission is read-only; uses windows-2025, Python 3.12, Node 22, uv sync, npm ci, PyInstaller, electron-builder directory and ZIP with SHA-256 and an embedded manifest. Uploaded Actions artifact is a development snapshot, not a tested public release.
- Preservation: original multi-platform workflow remains available through Git history; source and Electron target configuration untouched, no user data or build artifacts committed.
- Testing: follow the triggered Windows run to determine if the archive was created; app launch, character/chat, TTS and installer testing require interactive Windows validation. Do not claim a successful binary build until Actions has completed.

## 2026-11-26 — Eliminate 166 hardcoded Chinese translation fallbacks

- Parent: 0a7f4c45c7980ce660699cc155be1175add5387c. Main static/index.html now uses English translation keys without the redundant Chinese fallback string, preserving existing t() localization behavior. Four missing English keys (upload, backToDefaultView, slack_bot_config, gotoSlackBot) have explicit English translations added to static/js/locales/en-US.js.
- Tests: tests/test_english_html_fallbacks.py and CI ensure this class of Chinese UI fallback does not return. No user data or markup structure removed. Existing English locale remains the only active UI bundle.
- Still pending: hardcoded Chinese UI text outside t() fallbacks, errors, comments and model-facing instructions. Do not claim a fully translated product based on this commit alone.

## 2026-11-26 — English visible markup and fork-specific About page

- Parent: 5ff5211853270e7eef79bcd041ee279e8f211df6. The old China-/regional-social About and donation/contact panel is replaced with English AGPLv3 information, source link to Blaco fork, original-project contributor attribution and third-party license notices. Preserve legal credits and original license files; no upstream donor or commercial licensing links remain in the displayed panel.
- Main UI: Translate direct file/browser, account, avatar-model and debug connection labels; update native language names to English labels; remove explicit simplified/traditional Chinese translation language options. This does not change user-authored text or model IDs.
- Renderer: Translate several generic UI component placeholders, rating labels, audio affordance, action events and feedback. Tests protect core visible strings.
- Files: static/index.html, static/js/renderer.js, tests/test_legal_and_visible_english.py, CI, this ledger. Large volumes of source comments, diagnostics and system prompts still need translation.

## 2026-11-26 — Translate core tool, task, memory and visual context instructions

- Parent: c6424daaa23bc7ed189bb0c63a76eb579f916f65. Critical model-visible messages in server.py are translated to English: vision descriptions, image metadata, execution/planning guardrails, subtask routing, LaTeX/language/sticker constraints, KB/web-search prefixes, saved-memory and skill-activation reminders, Dify prompt framing, async tool follow-up/error instructions, deep-research continuation and safety-filter output. Protocol field names and tool names unchanged.
- py/sub_agent.py translates mandatory finish_task directives, autonomous task report, consensus instructions. py/diary_chat_integration.py translates conversation diary-summary instructions and role names; py/autoBehavior.py translates scheduling prefix.
- tests/test_english_agent_instructions.py and .github/workflows/companion-audit.yml register static contracts and compile edited Python modules. User-authored card, user prompts, stored chat history and existing diary files remain unchanged.
- Not yet translated: A2UI reference guide, complex TTS/THA system prompts, other backend messages/comments, large UI JS error strings, China-specific vendor catalogs. Do not claim full English-only product until reviewed and tested.

## 2026-11-26 — Windows CI Electron CDN retry after first failed package attempt

- Parent: bfa30752ce8536863a289aaf4a577405c3e9d8bc. Windows development build run 45901818901 failed at `npm ci`: Electron install.js download received HTTP 504 Gateway Timeout. Python `uv sync` succeeded, the packaging stages did not start and no ZIP was produced. Do not mark that build complete.
- .github/workflows/build.yml adds up to three guarded npm ci attempts with progressive backoff and npm fetch retries; explicit final failure if all fail. The build still has no tag/release/signing access and uploads only a development ZIP if successful. Normalized electron-version manifest expression. Windows runner will retest this source commit when the workflow changes.

- Manifest refinement: Electron version is now read from package.json by PowerShell ConvertFrom-Json, eliminating nested command quoting in build.yml.

## 2026-11-26 — Rewrite generated A2UI and speech prompts into English

- Parent: 8080027404a4d579070acbd55afabfac3b552d71. Three large runtime injected instructions in server.py are now fully English: the optional A2UI component schema/examples, voice-specific TTS instructions and default TTS silence-tag rules. A2UI component names, input key requirements, button action strings and parser syntax retained; existing dynamic character voice labels are preserved unchanged. Sample spoken text now English.
- tests/test_english_model_prompt_blocks.py checks the blocks contain no Chinese text. CI audits and Python compile continue. Existing user-authored voices/cards and conversation history untouched. Other prompt blocks still contain Chinese text, especially VRM/THA and relationship/sandbox; next work remains.

## 2026-11-26 — Translate runtime environment, relationship and scheduler instructions

- Parent: 2fec3cea216f8c04b5d6ab5afc71f772fb160e33. server.py OS-specific shell environment prompt, Docker environment instruction, mandatory relationship speaker identification/tag format, goal/cowork permission mode, desktop screenshot context and scheduled reminder interpretation are translated to English. Existing task IDs, tool names, per-character values and actor names remain dynamically substituted; no user-data migration.
- Source contracts: tests/test_english_runtime_prompt_sections.py and CI test the runtime/relationship blocks for Chinese characters; Python compile remains active. Remaining THA and VRM motion prompts, Chinese provider options and source diagnostics require translation.

## 2026-11-26 — Translate VRM and THA avatar motion instructions

- Parent: e0234d7edfc5f5371dd648dd3c505dab35aae04e. First-party server.py injected expression/motion directions now English. All tag names and THA intensity semantics, weighted face-feature composition, narrator/voice compatibility and parser same-line constraints preserved. Workspace/global skill-summary labels and enabled-voice debug log also translated. Optional avatar functionality remains in scope and is not removed.
- Files: server.py, tests/test_english_avatar_instructions.py, CI and ledger. No changes to character cards or installed model assets; no actual avatar rendering/inference integration test yet.

## 2026-11-26 — Correct avatar prompt test boundary

- Parent: 5fd5d7888e037432083209f822612a9831bd8321. CI failure 45902813090 came from a test-only regex that assumed Expression_messages ended with a standalone closing parenthesis. It accidentally consumed the next Chinese comment, despite the actual English prompt being complete. tests/test_english_avatar_instructions.py now uses Python AST assignment source ranges, and also parses the entire edited server.py to catch syntax errors. Runtime source is unchanged. Re-run CI on this commit.

## 2026-11-26 — English project documentation and installation routing

- Parent: fefb3761a8d6fc2fdad0e907fd468efb5cc948f0. Replace inherited README.md and README_AGENT.md with fork-specific English documentation: actual Windows local-first target, TabbyAPI/WhisperBox/OpenClaw system boundaries, optional bot/livestream scope, privacy invariants, source setup, Windows build/test limitations, AGPL and attribution.
- Delete nine foreign-language upstream README variants (README_AR, README_DE, README_ES, README_FR, README_JA, README_KO, README_PT, README_RU, README_ZH) from the active branch; content remains recoverable from Git history and is not shipped as fork guidance. No license notices or user-created data were removed.
- This is documentation cleanup only. Do not infer successful Windows application validation from README; build status remains GitHub Actions dependent.

## 2026-11-26 — Correct THA Python f-string expression

- Parent: ea40da1959921566241bcf96df1f1e9335ffbc94. The AST regression test surfaced a real syntax error in server.py: a quotation-mark escape was emitted literally inside the THA f-string expression for motion tags. Replaced with the Python-valid `f"[Motion tags] {', '.join(motion_tags)}\\n\\n"` expression. CI source/test/compile must pass before packaging current HEAD; the prior preview Windows package uses older source and is not a build of this fix.

## 2026-11-26 — Restrict new model provider presets to general and Western endpoints

- Parent: 01ac395955a28b9f7188e8dd045765969520c73a. The UI vendorValues and API-key documentation catalog now lists generic OpenAI/OpenAI Responses/Anthropic-compatible setups, Ollama, vLLM, LM Studio, llama.cpp, SGLang, other self-hosted endpoints and selected Western cloud APIs (OpenAI, Anthropic, Gemini, Grok, Mistral, OpenRouter, Together, Fireworks, NVIDIA, Jina, Perplexity, GitHub).
- Removed active catalog and vendorSuggestedParams entries for China-specific API companies, mirrors, registration links and proprietary provider parameters. static/js/vue_methods.js no longer automatically inserts their preset API endpoints. A user may still type an arbitrary custom endpoint intentionally; previously stored provider settings remain in their profile rather than being silently rewritten. DeepSeek/Kimi model access via OpenRouter remains possible.
- Files: static/js/vue_data.js, static/js/vendor_params.js, static/js/vue_methods.js, tests/test_no_region_vendor_presets.py, CI and this ledger. Other inherited China-specific TTS code and obsolete locale keys still need removal.

## 2026-11-26 — Remove proprietary regional TTS providers

- Parent: 1ea0599809c2ffa46b11409e51299f99e644d3ea. Retired Volcengine, Baidu TTS, MiniMax and Xunfei from the two speech-engine selectors and their corresponding configuration controls, fresh Vue/config defaults, backend TTS synthesis and voice discovery paths, and frontend tetos configuration branches.
- Kept OpenAI-compatible custom TTS, Azure, Google, Fish Audio, local system TTS, GSV, MOSS and optional speech modes; WhisperBox remains an independent planned HTTP backend. Persisted obsolete provider config stays in old user settings but is no longer an active selectable provider or sent to these removed SDKs; backend reports unsupported engine in English rather than silently swapping providers. No stored character or voice-file data was changed.
- Files: static/index.html, static/js/vue_data.js, config/settings_template.json, server.py, static/js/vue_methods.js, tests/test_region_tts_isolation.py, CI and ledger. Further frontend bot/provider references and Chinese logs/comments remain; CI compile and tests are required.

## 2026-11-26 — Remove regional web-search API integration

- Parent: `2f72354d4703e05ac6a271711733acf4b4a103c5`. Removed the Bocha proprietary search API implementation and model tool schema from `py/web_search.py`, its tool registry and pre/post search routing in both `server.py` response paths, option/config UI in `static/index.html`, frontend form state and validation, and first-run template credentials. Existing saved keys are not deleted from user profiles; they become inactive and are never sent to the removed endpoint.
- Preserved DuckDuckGo, SearXNG, Tavily, Google, Brave, Exa, Serper and You.com, plus general crawling options. `tests/test_search_provider_isolation.py` is wired into CI. First-party Chinese search-tool descriptions still require translation separately.

## 2026-11-26 — Translate crawler and search tool instructions/results

- Parent: `ff019576e2768f8205bfbc4b4cc41304409f80fb`. Translate 82 occurrences in `py/web_search.py` affecting model-facing tool descriptions, argument guidance and search/crawler feedback. Preserve crawler access controls, robot restrictions and the open/general search backends. The Chinese comment and docstring audit still requires work; the new AST-based `test_english_search_tools.py` protects the tool-schema boundary.

## 2026-11-26 — Refresh current status and rebuild the current source

- Parent `83cc189d48c2b4ea42cadda6350579ee7a2d8215`. Replace stale `docs/agent-creation/CURRENT_STATUS.md` assertions that old Chinese bot adapters are still active or no build exists. Include real CI audit data (12,532 Han lines, 106 regional references at source commit 83cc189d48c2b4ea42cadda6350579ee7a2d8215) and successful earlier Windows x64 development artifact, with explicit outstanding work.
- `.github/workflows/build.yml` adds a pre-PyInstaller Python compile, Electron syntax and model-facing search-tool schema check. Workflow-file change triggers a fresh Windows build at this new commit. It does not publish an installer, release tag or source outside the fork.

## 2026-11-26 — Translate Electron startup, account chooser, desktop errors

- Parent `0b48abde2f3dcf0e42d9b13f85c256ffbc466002`. Translated 105 occurrences across startup/health diagnostics, account storage/selection/creation/deletion dialogs, browser process control, download and screenshot/file-copy errors in `main.js`. Preserved existing account IDs/paths, argument names, HTTP ports and session semantics. Embedded account chooser now says Agent Creation rather than upstream brand, without changing Electron's disk identity.
- `tests/test_electron_english_dialogs.py` validates core user-visible English labels; source CI checks JS syntax. Remaining code comments and other UI modules still contain Chinese.


## 2026-11-26 — Localize embedding, ASR and diary query modules

- Parent `0d9379e29a0d961cb7e23e0b947f9ed97848f942`. Translated all remaining Han text in `py/ebd_api.py`, `py/sherpa_asr.py` and `py/diary_query_tool.py`, including comments, docstrings, tool descriptions and error messages. Preserved API fields, diary entry types, model identifiers, inference behavior and user-authored diary data. The existing multilingual SenseVoice model identifier remains for compatibility; provider/model replacement is a separate architecture decision.
- Checked exact replacement counts and absence of Han characters in the three modules before commit. Runtime and CI validation pending.


## 2026-11-26 — English delegated-task, relationship and diary runtime

- Parent `931349067104452232b9755002b409dcde0f89b7`. Localize all Han-containing lines in `py/agent.py`, `py/agent_tool.py`, `py/a2a_tool.py`, `py/affection_api.py`, `py/affection_system.py`, `py/diary_api.py`, `py/scheduler.py`, `py/task_center.py`, `py/llm_tool.py` and `py/task_tools.py`. Translate public tool descriptions, completion/progress messages, API responses, diagnostics, comments and examples; preserve identifiers, schemas, storage, scheduler semantics, regex support for user-authored multilingual relationship attributes, and existing URL access controls. Translate the remaining main-task completion reminder in `server.py`.
- Correct the advertised subtask delivery enum: retain chat, Telegram, Discord and Slack only, consistent with the removed regional bot managers. The executor in `py/sub_agent.py` already skips missing handlers; existing persisted task records are not rewritten. No new external dependencies or copied reference code: the existing SAP implementation is the reference. This is a localization/schema correction, not a replacement of delegation or memory architecture.
- Add `tests/test_english_delegation_modules.py` and wire it into `.github/workflows/companion-audit.yml`: parse all ten Python modules, verify no literal Han code points, assert the retained platform enum, and check the main task completion prompt. Pre-commit checks: exact source-line replacement counts and no literal Han characters in those ten modules; CI and Windows runtime validation pending. Revert this commit to roll back the text/schema changes. No build requested in this pass.


## 2026-11-26 — English autonomous diary and behavior runtime

- Parent `8455fa2f0148e05dcdbb8e787035d1303cf1fbb7`. Translate all literal Han-containing lines in `py/sub_agent.py`, `py/diary_system.py`, `py/diary_chat_integration.py`, `py/diary_engine.py`, `py/autoBehavior.py`, `py/behavior_engine.py`, `py/mode_change.py` and `py/mcp_clients.py`. Includes all six built-in autonomous diary action prompts, autonomous session reminder, messaging relay instruction, scheduler/behavior schemas and error notifications, MCP connection diagnostics, and workspace permission/engine documentation. Existing character data, diary migration, trigger configuration, API identifiers, and runtime behavior are preserved; no new dependency or external reference code.
- Remove obsolete Bocha search identifier from the diary tool allowlist and the four removed regional messaging adapters from the automatic-behavior schema. Chat/Discord/Telegram/Slack remain; persisted configuration is not silently rewritten. Existing handler checks remain intact. The diary allowlist contains browser controls that can change browser state and the smart-home path can expose additional tools: correct the misleading read-only comment, but do not claim these inherited paths are permission-safe. Separate permission/privacy review is still required before enabling autonomous behavior against private user data.
- Extend `tests/test_english_delegation_modules.py` to cover all eight modules, the behavior delivery schema and diary search allowlist. Checked exact replacement-line counts and absence of literal Han code points before committing; GitHub CI and Windows runtime verification are pending. Reversible via Git revert. No Windows build requested.


## 2026-11-26 — English memory, media, provider and tool messages

- Parent `ca82b097bc8df8a871f551bdd5b6f0416d24d274`. The restored Agent Core Strategy transcript (pages 159–166) confirms that inherited non-English prompt leakage was the original motivation and that the present work remains source conversion, not a replacement of the agent architecture. The project charter and work protocol remain authoritative. Preserve independent TabbyAPI, native local speech, optional standalone WhisperBox, OpenRouter and ACPX.
- `server.py`: translate group-memory injection and extraction (keep memory_type, content, summary, importance and fallback multilingual keyword logic), image metadata, shell guidance, sticker/image-generation silence-tag instructions, extension and ComfyUI tool descriptions (both generation paths), deep-search decomposition/clarification and follow-up instructions, tool-result and conversation labels and character/lore diagnostics. Correct the stray literal n preceding three image metadata labels. Preserve JSON field names, image hash/cache behavior, speech tags, user-authored prompts, workflow inputs and execution/permission paths.
- Localize all Han-containing lines in `py/ClaudeAsOpenAI.py`, `py/GeminiAsOpenAI.py`, `py/ResponsesAsOpenAI.py`, `py/know_base.py`, `py/comfyui_tool.py`, `py/code_interpreter.py`, `py/custom_http.py`, and `py/ws_manager.py`. Provider routing, LiteLLM bridge, embedding and retrieval algorithms, ComfyUI queue, code tool permissions, HTTP request and WebSocket behavior remain unchanged. The original SAP code at the pinned upstream commit is the appropriate implementation reference; no external code imported or new subsystem introduced. Existing caller paths in server.py and vue_methods.js were searched for old status-string comparisons; none matched the translated knowledge-base and ComfyUI results.
- Extend `tests/test_english_delegation_modules.py` to parse and scan the eight additional modules and check matching model-facing text in both server.py generation paths. Exact occurrence checks and zero literal Han scan on the eight modules before commit; automated CI/runtime results not yet known. Feature matrix and status updated; reversible by Git revert. No Windows build requested.


## 2026-11-26 — English utility and browser tools; remove regional fallback defaults

- Parent `019ebdefacec87503e5e984967d2f165d9505436`. Translate all literal Han lines in `py/utility_tools.py`, `py/cdp_tool.py`, `py/overlay_router.py`, `py/node_runner.py` and `py/docker_api.py`: time, weather, location, Wikipedia, arXiv, browser tool error/example text, overlay/WebSocket comments, node sidecar startup and Docker discovery. Preserve tool identifiers, arguments, endpoints, subprocess and browser execution paths. No new dependency.
- Utility-specific functional changes: Open-Meteo geocoding always requests English result labels while accepting the user's city string unchanged; missing timezone uses the forecast API's automatic location timezone rather than Shanghai. 7Timer chart default is English (en), Wikipedia function and schema defaults are English (en), explicit language selection remains supported. The model-facing Wikipedia result keys become English (title/summary/sections and topic/section_title/content); URL is unchanged; no persisted schema changes. Server routes forward tool results generically and the inspected frontend does not parse these keys. Translate the coordinate-report label and its sole internal weather-chart parser together; keep latitude/longitude ordering. Correct inherited inaccurate WMO descriptions using Open-Meteo documentation; do not claim absence of severe weather when alerts are unavailable. References in REFERENCE_RESEARCH.md.
- `server.py`: missing Edge TTS language and voice now fall back to en-US/JennyNeural, matching config/settings_template.json and Vue defaults. Existing explicitly configured voices remain unchanged. `static/js/vue_methods.js`: replace two Chinese locale time labels with English 24-hour format. Preserve voice selection, playback, timestamp fields and saved settings.
- Extend `tests/test_english_delegation_modules.py` with Han scan and syntax check for five more modules, utility schema and function-default checks, WMO assertions, a mocked 7Timer coordinate/URL flow, and TTS/time-format fallback checks. No live API calls in tests. Exact replacement counts checked before commit; CI and Windows validation pending. Revert commit for rollback. No build requested.


## 2026-11-26 — English THA avatar and native speech runtime

- Parent `a9c2ae9c0e02e3310058fe39fcd95dcde6f100c2`; prior source audit passed at https://github.com/Blaco/super-agent-party/actions/runs/45912139752 (192 files; 11,582 Han lines and 103 regional-platform hits). Translate all literal Han lines in `py/tha_engine.py`, `py/moss_tts.py`, `static/js/tha.js` and `static/tha.html`; localize model-facing/API diagnostics in the MOSS and THA/VRM sections of `server.py`. Keep all pose indices, weights, animation, ONNX/CoreML providers, inference parameters, model file layout, storage, speech playback and protocol fields unchanged. No changes to installed voices/models or WhisperBox.
- THA HTML now declares English and has English input placeholder/button titles. THA JavaScript drops the Chinese hard-coded tooltip dictionary and defaults to English on missing language or fetch failure; existing shared translation lookups remain, with English fallback for unknown keys. Replace Chinese-character-based status-tooltip refresh with explicit hovered-tooltip owner tracking. Keep the existing timer, connection state and tooltip positioning. VRM JavaScript likewise falls back to English on missing/unknown locale; full VRM translation remains pending. Existing renderer and model-install behavior retained; original SAP pinned upstream is the relevant implementation reference, no third-party source copied.
- Extend `tests/test_english_delegation_modules.py` with syntax/Han checks for both Python modules and avatar English fallback/tooltip ownership assertions. Exact occurrence counts and Han checks performed before commit; CI and Windows audio/render behavior pending. Revert commit to roll back. No build requested.


## 2026-11-26 — English desktop input tool schemas and results

- Parent `c8c4701fbbc209278f5c9ffc00ad47cdaff4073d`. Translate all 132 Han-containing lines in `py/computer_use_tool.py`: normalized coordinates, mouse movement/click/drag/scroll/hold, clipboard paste, keyboard sequences and shortcuts, accessibility actions, wait/screenshot, GUI failure and tool schemas. Replace gaming examples with ordinary desktop uses and avoid overstating accessibility behavior on locked displays. Preserve GUI failsafe, platform APIs, tool names, coordinate limits, timings, argument types, button enums, and every LAST_ACTION tag used by server.py screenshot annotations. No permissions or tool defaults changed, and no code copied from external projects; existing SAP implementation retained.
- Existing server.py tool registration and action-result parsing inspected. Exact line count, zero Han scan and identical action-tag list checked before commit. Extend regression test inventory with module parse/scan, coordinate limits and action tag checks. Windows physical input and accessibility verification pending; inherited clipboard behavior and permission architecture are not changed by localization. Revert this commit for rollback. No build requested.


## 2026-11-26 — English VRM interface and remove obsolete locale loading

- Parent `34c9d9e85915def38adfbcc476180237d7d7cb45`. Translate remaining hard-coded VRM text-field placeholder, control title fallbacks, XR error and diagnostic strings in `static/js/vrm.js`; leave renderer, animation and audio logic intact. English comments in `static/vrm.html` and `static/js/locales/en-US.js`. The HTML now declares en-US and identifies the 3D companion in its title. Remove the obsolete Chinese locale script reference because static/js/locales.js registers only en-US. No changes to model assets, scene loading, IPC, or API identifiers.
- Regression checks cover translated fallback labels, English HTML and locale source, and removal of the Chinese locale script. Remaining VRM developer comments are deferred rather than claiming the entire renderer is converted. Exact literal replacement counts checked before commit; CI and interactive Windows rendering checks pending. Revert this commit for rollback. Existing SAP renderer retained, no imported source or new dependency. No build requested.


## 2026-11-26 — Frontend defaults and notification localization

- Parent `b2729b80d84e847c36ec5ee71137dfcdc0c5cc8f`. In `static/js/vue_data.js`, synchronize relationship and diary default prompts with config/settings_template.json exactly, preventing the frontend from reintroducing inherited Chinese model instructions. Convert all three API request examples and remove Chinese aliases from the exposed web shortcut registry, retaining canonical commands and English/symbol aliases. Translate nine legacy speech-resource display labels without changing their provider IDs or existing profiles; regional provider removal remains a separate dependency-traced task.
- `static/js/vue_methods.js`: translate 187 lines of notifications, confirmations, thrown errors and Markdown plugin warnings, including bot, workspace, model, voice, avatar, diary, relationship, extension, task and account messages. Existing calls, routes, settings fields and error-handling paths remain intact. Targeted source-line scan and exact replacement checks completed before commit; comments and other runtime strings remain for later conversion. No external code or new dependency; existing SAP implementation is the relevant reference.
- Extend `tests/test_english_delegation_modules.py` to check exact backend/frontend default prompt parity, English shortcut registry and sample requests, and selected notification/error call surfaces. CI and Windows validation pending. Revert this commit for rollback; no build requested.


## 2026-11-26 — English server startup, tool, speech and API diagnostics

- Parent `b1cb5e7d4e56a11b00d0ce93d7d0e86254afa53b`. Translate 162 exact server.py lines containing startup/shutdown, retry, model/skill/memory, screenshot, ASR/TTS, MCP, file and avatar upload/deletion, knowledge-base, Western messaging and WebSocket messages. Retain f-string expressions, error codes, API response fields, checks, endpoints, model IDs and runtime branches. No permission or content-safety policy change. Checked the original message text against main.js and vue_methods.js for direct matches; no matching callers found. No external code copied or new dependency.
- Extend tests/test_english_delegation_modules.py to parse server.py and check representative English runtime/API messages. Other backend text and comments remain. Remote source audit and Windows verification pending. Revert this commit for rollback. No build requested.


## 2026-11-26 — English CLI task and execution feedback

- Parent `211e1e70d62c8724a4fc5ab410ba5e9d327a319e`. Translate 81 lines in py/cli_tool.py covering exit-code diagnostics, Docker/local/WSL command failures, task results and both task schemas; preserve action names, ID creation, persisted task paths/statuses, timeout handling, sandbox behavior and permission checks. Translate the project task reminder in server.py; use the shared todo_write tool concept for Docker and local modes. Existing SAP at pinned upstream 3aac964122415fe289a1b8af1000474b397c916b is the implementation reference. No external code or dependencies introduced. CLI developer comments remain for a later pass.
- Checked server and frontend callers for exact old task/exit messages; callers consume generic text. Add syntax and regression assertions for translated CLI runtime output, task enums and task file paths. CI pending; Windows CLI, Docker and WSL execution not tested. No build requested. Revert commit for rollback.


## 2026-11-26 — Remove regional Docker deployment and inherited publishing targets

- Parent `977f4a6164e9902cc7d6108c40f0e6a87da8d97a`; CLI audit passed at https://github.com/Blaco/super-agent-party/actions/runs/45914102738. Docker regional selector was traced from static/index.html through static/js/vue_data.js and static/js/renderer.js to docker-compose-acr.yml; no references in the inspected server, frontend methods, READMEs or smoke scripts. Remove the selector, regional registry entries, two obsolete locale keys and regional compose file. Docker and Compose instructions now clone the actual agent-creation branch and build the local backend instead of pulling an upstream backend image. The inherited Docker Hub gateway remains for optional Compose use, explicitly labeled; no gateway code or asset migration. Both examples bind host ports to loopback by default. Existing Docker sandbox tools and persistent paths are unchanged. Dockerfile and Compose comments translated. Docker runtime build not tested.
- .github/workflows/docker-publish.yml: replace inherited Docker Hub/ACR login and automatic tag publishing with manual source-build validation (push false). No release target or credentials are assumed; no workflow dispatched, no image published. A future fork-controlled image registry requires an explicit release decision. Upstream Dockerfile, Compose and workflow at 3aac964122415fe289a1b8af1000474b397c916b remain the reference; no external code imported.
- Add regression checks for source-built deployment examples, removal of the regional compose file, English Docker comments, and non-publishing workflow. Source CI pending; Docker and Windows runtime tests unperformed. Revert commit for rollback. No build requested.


## 2026-11-26 — Remove stale regional speech/provider localization and correct native speech defaults

- Parent `b441d82e4a2aab07e56d3a89b788f85434274e55`; preceding CI passed at https://github.com/Blaco/super-agent-party/actions/runs/45914218494. Dedicated regional TTS routes and UI controls were previously removed. Remove the unused volcResourceOptions array from static/js/vue_data.js and 93 retired locale entries from static/js/locales/en-US.js after checking the current HTML, Vue, avatar and provider parameter source references. Retain referenced keys and generic compatible APIs, local models and supported providers. Correct the shortcut notice and SearXNG example. Repair inherited malformed HTTP headers/body example strings by deleting 56 accidental duplicate vendor-parameter entries inside the JSON sample literals; restore one copy of each remaining parameter description as an actual locale dictionary entry. No external source imported.
- Native MOSS TTS: change missing/new default voice from Junhao to Ava across settings_template.json, vue_data.js, vue_methods.js add-voice dialog, server.py request fallback and py/moss_tts.py function default. Ava is already an existing English voice in both HTML selectors. Translate language-group comments without deleting multilingual model assets or changing saved choices, voice IDs, reference-audio cloning, engine selection or inference behavior. MOSS retains multilingual capability; no claim of actual audio validation. WhisperBox remains separate.
- Extend test_region_tts_isolation.py and test_no_region_vendor_presets.py for aligned English defaults, cloning path, retired keys and valid HTTP JSON examples. CI pending; Windows and model inference remain untested. Rollback via revert. No build requested.


## 2026-11-26 — Alternate browser chat regional cleanup and JSON example correction

- Parent `2f6c04f1dc26b5bbe6fa030351e53b612e02662a`. The previous commit's curated vendor test failed because static/chat.html still used four retired messaging labels. Remove those unsupported task-delivery options and their remaining locale keys while retaining Telegram, Discord, Slack and implicit chat delivery. Remove the obsolete Chinese locale script reference and obsolete regional community/documentation links from the browser chat license dialog. Preserve upstream GitHub, AGPL notice/link and upstream licensing email; remove duplicate Chinese translation of the license/contact notice, not attribution. English task dialog fallback. Correct the HTTP headers example to use actual JSON double quotes and strengthen the parsing test. Add alternate chat regression checks. Existing task routing, saved configurations and user data unchanged. CI rerun required; previous failure recorded at https://github.com/Blaco/super-agent-party/actions/runs/45915136800. No build requested. Revert for rollback.


## 2026-11-26 — Correct trailing comma in HTTP body example

- Parent `86c0c2fc6962038125946968a04f115a2d3b9510`. The stricter JSON sample regression test in run 45915240498 caught an inherited trailing comma after the age default. Remove it from the bodyPlaceholder in static/js/locales/en-US.js. Both example objects now parse as strict JSON in the precommit check; no HTTP execution, endpoint or permission change. Rerun source CI. Revert for rollback. No build requested.

## 2026-11-26 — English settings, sleep prevention and VTube Studio diagnostics

- Parent `632a5f43fb530addb6dc53202dba172ab1079b8c`; previous source audit passed at https://github.com/Blaco/super-agent-party/actions/runs/45915297343. Localize all remaining Han-flagged lines in py/get_setting.py (73), py/sleep_guard.py (53) and py/vts_manager.py (9). Settings changes cover path validation, startup, skill installation, migration, model cleanup and audio conversion diagnostics; preserve profile paths, data structures, persistence, permission checks and the generic legacy AMR helper. No removal of the helper without a complete caller audit. Sleep prevention retains platform-specific implementation, polling, subprocess flags and lifecycle; only comments, diagnostics and the descriptive systemd inhibit reason are changed. VTube Studio keeps its existing WebSocket protocol, authentication, expression/hotkey handling, PCM processing and lip-sync algorithm; change only comments and diagnostic text. Server callers of SleepGuard and VTS were inspected, and no exact matches to the replaced settings errors were found in the inspected server and main/renderer/Vue files.
- Existing SAP implementation at the pinned upstream reference `3aac964122415fe289a1b8af1000474b397c916b` is the baseline; no new external code or dependency is necessary for a text-only pass. Existing feature dispositions remain unchanged. Precommit checks confirmed that all 135 flagged source lines were accounted for, indentation and line counts were preserved, and no Han characters remain in the three edited modules. Extend the existing source-audit test with AST parsing, full-file Han checks, and representative sleep/VTS protocol invariants. Python tests and Windows runtime validation remain pending; no build requested. Rollback: revert this commit.

## 2026-11-26 — English document and image ingestion tools

- Parent `40878ea128ed23b1ddf6535da203191c4032ae94`. Translate all 142 Han-flagged lines in py/load_files.py: file-type group names and the matching internal office filter, user/model-facing errors, file content headers, file and image function descriptions, and developer comments. Preserve supported extensions, tool names and argument keys, output JSON keys, user document content, encoding fallbacks (including GBK for imported documents), existing URL checks, request routing, and parsing algorithms. Existing SAP at upstream `3aac964122415fe289a1b8af1000474b397c916b` is the reference; no outside implementation copied. Inspected server.py, static/js/vue_methods.js, static/js/vue_data.js and both main/chat HTML for references to the old filter labels: only comments in the separate frontend/server extension lists; those lists do not depend on the labels.
- Add AST-based regression checks evaluating the actual filter definitions for Windows/macOS/Linux and validating the existing tool names/required parameters without importing runtime dependencies or performing network requests. Precommit text check accounts for all 142 lines, preserves indentation and line count, and finds no Han characters in this module. The old XLS missing-dependency message now refers to a project-compatible xlrd dependency rather than recommending an obsolete pin; no dependency changed. URL validation, redirects and DNS handling are inherited and have not been security-audited in this localization pass; no claim of SSRF protection completeness. CI and interactive file-format testing pending; no build requested. Revert for rollback.

## 2026-11-26 — English shortcuts and optional Western messaging

- Parent `c7f64e8a708eb95fde36d37ddcba14aa83277b59`; preceding source audit passed at https://github.com/Blaco/super-agent-party/actions/runs/45916332308. Translate py/shortcut_commands.py and its control handler in static/js/vue_methods.js. Remove obsolete Chinese command aliases, Chinese help branches, labels, reply constants and retired messaging-platform config entries; all supported English aliases, command IDs, argument handling, enableShortcuts switch, permission-mode values, settings writes and broadcasts remain unchanged. Keep the lang parameter for existing callers, always return English. The only inspected active messaging callers (Discord, Telegram and Slack) pass en and use English constants; server.py imports only is_shortcuts_enabled. The frontend handler mirrors English commands; the existing help catalog and translation keys are unchanged. Deliberate compatibility change: old Chinese control commands and Chinese personality-disable aliases no longer trigger controls; user-authored multilingual chat, skill metadata and character names are not translated.
- Translate all remaining Han-flagged lines in py/discord_bot_manager.py, py/telegram_client.py, py/telegram_bot_manager.py and py/slack_bot_manager.py, including the model-facing voice-transcription marker and image message, startup errors, voice attachment title, logs and comments. Keep messaging clients optional; no transport, permission, network, task interruption or memory changes. Existing SAP at upstream `3aac964122415fe289a1b8af1000474b397c916b` remains the reference; no outside source imported.
- Precommit text checks found 229 fewer Han-flagged source lines; no Han characters remain in the five Python modules or the edited frontend handler. Regression tests cover AST parsing, English aliases/help, platform mapping, global shortcut toggle and frontend permission-mode mapping. CI pending; real bot sessions, model switching consent and Windows UI behavior not tested. Existing cloud/model switching behavior is not modified or certified safe. Revert for rollback. No build requested.

## 2026-11-26 — Correct shortcut permission-map syntax regression

- Parent `28d17755ad2f7d3f79d2822f2500991f49806c16`; source CI failed at https://github.com/Blaco/super-agent-party/actions/runs/45916727019 because the previous alias-removal expression left duplicate value tokens in static/js/vue_methods.js line 2708. Replace the malformed map with the six exact existing English command-to-permission mappings. No permission behavior changes. Strengthen test_english_runtime_contract.py to parse the entire JS map as JSON after quote normalization and compare it against the Python mapping instead of testing substrings.
- Precommit map JSON parsing passed. Full JS smoke/Python tests require CI rerun. No Windows build requested. Revert for rollback.

## 2026-11-26 — English SoulX avatar, preload, livestream and renderer diagnostics

- Parent `3c54189044f76437a62cbd53c6b2af7ad88db8c3`. Fully localize static/js/soulx.js and static/soulx.html (reference-image errors, FlashHead statuses, avatar controls, HTML lang, audio/frame-sync comments), and static/js/preload.js (window configuration diagnostic and IPC comments). Preserve all DOM IDs, IPC channel names, exposed APIs, FlashHead protocol, audio scheduling, frame buffering, PTT and rendering logic. No new model assets or dependencies.
- Translate all remaining Han lines in py/twitch_service.py and py/ytdm.py, including errors, listener status and comments describing retired platform-specific analogies. Keep both optional listeners, event IDs (including legacy shared buy_guard/danmaku keys), callback and WebSocket contracts unchanged; py/live_router.py was inspected to verify these dependencies. Translate active Chinese console strings and A2UI TTS fallback request in static/js/renderer.js; the frontend handleA2UIAction forwards the fallback as user-input text, not a protocol key. Other renderer comments remain for a subsequent pass.
- Existing SAP upstream `3aac964122415fe289a1b8af1000474b397c916b` is the implementation reference; no outside code imported. Precommit inventory found 161 fewer Han-flagged lines; complete text scans pass for the five fully localized files. Add tests for AST parsing, locale, DOM IDs, livestream event contracts and A2UI English fallback. CI pending; live avatar, Electron and livestream sessions not tested. No build requested. Rollback by revert.

## 2026-11-26 — Complete renderer comment localization

- Parent `a1981fb20b4a4b702196b8f9ae89b907b243d06f`; preceding source audit passed at https://github.com/Blaco/super-agent-party/actions/runs/45917021932. Translate all 247 remaining Han-flagged lines in static/js/renderer.js, covering A2UI templates, initialization, IPC, ASR, scheduling, settings, extension and model filters, voice selection, Markdown and notifications. Changes are confined to line comments, inline comments and HTML template comments. Preserve executable code prefixes, line count, DOM IDs, protocol keys, callback behavior and settings. One obsolete commented-out payload example is expressed as an English explanation; the actual payload is unchanged. Existing SAP upstream `3aac964122415fe289a1b8af1000474b397c916b` remains the reference; no external source or dependencies.
- Precommit checks: exact inventory coverage, unchanged executable prefixes for inline comments and zero remaining Han characters in renderer.js. Add a full-file Han regression check to test_english_runtime_contract.py. Source CI pending; no Windows UI/runtime test or build requested. Rollback by revert.

## 2026-11-26 — Complete Vue state definition comment localization

- Parent `4073f37492bce777cb455b14f4cd9f0ee6532ca7`. Translate all 209 remaining Han-flagged comments in static/js/vue_data.js, covering model defaults, ASR, speech, profile state, settings, avatars, browser, tasks, memory, diary, extension and streaming state. All executable prefixes and line counts preserved; no settings defaults, schema fields, provider IDs, URLs or permission values changed. Retain non-Han multilingual punctuation in existing stop-word arrays for input compatibility; the English-only interface does not prohibit user-supplied multilingual content. SAP upstream `3aac964122415fe289a1b8af1000474b397c916b` is the implementation reference; no external code.
- Precommit text check: exact line inventory, unchanged code prefixes, zero remaining Han characters in the file. Extend existing full-file localization regression test. Source CI pending; runtime validation and remaining Vue methods/backends are separate work. Revert for rollback; no build requested.

## 2026-11-26 — Complete main backend and Vue methods localization

- Parent `bf6ab1b8134a77fc03d48e556cdbec892780e8ef`; preceding source audit passed at https://github.com/Blaco/super-agent-party/actions/runs/45917460431. Complete all remaining Han-flagged lines in server.py (1,256) and static/js/vue_methods.js (2,612), covering comments, documentation strings, diagnostic messages, user-facing fallback text, tool and deep-research instructions, generation prompts, memory, workspace, translation, speech, avatar, browser, task, profile and extension operations. Translate filename/link wrappers and research-stage display text while retaining the existing data fields and stage numbers. Preserve user language choice, multilingual input, existing profiles, routes, tool identifiers, API schemas, permissions, and service configurations. Replace the hardcoded Chinese Excel export sheet label and font with English label and Calibri. Keep the existing group-memory keyword matching and legacy narrator-label compatibility in eight Python lines using equivalent Unicode escapes, not English replacements that would change the matching behavior. No external implementation or dependency; pinned upstream reference `3aac964122415fe289a1b8af1000474b397c916b`.
- Precommit scan accounted for all 3,868 changed source lines, with no changes to originally unflagged lines, identical line counts (server.py 12,302; Vue methods 20,621), zero literal Han characters in either file, and JavaScript parsing passed. Correct newline escaping in the generated character-card JSON example so its dialogue and keyword strings are valid JSON, verified by parsing the evaluated example. Add regression coverage for both files, Python AST parsing, legacy keyword/narrator compatibility, English file-link and character-generation prompts, and the card JSON example. No claim of complete repository localization, application runtime validation, or Windows packaging. CI pending at commit time. Rollback: revert this commit.

## 2026-11-26 — Complete main HTML template and Electron main process localization

- Parent `ec4a4a43f87c958d2004466c641d51d8218cfd1d`; preceding source audit passed at https://github.com/Blaco/super-agent-party/actions/runs/45918758039. Translate all 922 remaining Han-flagged lines in static/index.html, including developer comments in chat, memory, character cards, model configuration, speech, browser, task, storage, workspace, diary, and optional messaging/livestream controls. Two existing Japanese translation-target option values retain the identical runtime string through Vue-bound Unicode escapes, keeping their English display label and compatibility with saved preferences. No other executable markup or Vue bindings changed; no feature visibility or layout change.
- Translate all 323 Han-flagged lines in main.js: developer comments, backend readiness and startup errors, local application diagnostics, shortcut registration, workspace monitoring, shutdown and crash diagnostics. Keep IPC channels, port negotiation, update policy, account data paths, native window/clipboard/VMC handling, file operations and lifecycle unchanged. Existing upstream `3aac964122415fe289a1b8af1000474b397c916b` remains the reference; no external code or dependencies.
- Precommit scan accounted for all 1,245 changed source lines and no changes to unflagged source lines, identical line counts (main.js 3,176; static/index.html 17,430), zero literal Han characters in both files. JavaScript parsing of main.js and all three inline scripts passed; comment-stripped HTML is unchanged after restoring the two equivalent language values and ignoring translated inline script comments. Evaluated both Japanese bindings to verify their original value. Added English-source and compatibility regression checks. CI pending; interactive Windows/Electron startup and template rendering not tested. No build requested. Rollback: revert this commit.

## 2026-11-26 — English Dynamic Island interface and agent tools

- Parent `324209a1ae802c4fb179b635db469289b3dadfd7`. Remove the obsolete alternate locale in static/js/island-app.js, use English UI and date formats regardless of host language, translate remaining active tool schema descriptions, results, translation prompts and comments. Keep existing English locale text and tool IDs, Vue state, IPC/WebSocket protocol and user storage keys. Preserve multilingual translation target values through equivalent escaped Vue bindings in static/island.html while displaying English names. Replace hardcoded regional weather city with an empty initial setting, retaining saved city and IP-based lookup and displaying Set city when unavailable. Default geocoding response language to English (server.py). No changes to provider selection, permissions, or clipboard behavior. No new dependency.
- Precommit checks: JavaScript syntax and zero literal Han characters in both Dynamic Island source files, no obsolete locale identifiers. Regression checks added to tests/test_english_runtime_contract.py. Full CI and Windows runtime checks outstanding. Revert for rollback. No build requested.

## 2026-11-26 — Preserve Dynamic Island weather location and show unavailable status

- Parent `7f87b85aff6b75f87e23c97ee45fc42f2d51646c`. Follow-up inspection found inherited behavior that overwrote a saved city with the IP lookup on every launch and used stale IP coordinates after an agent changed the city. Skip IP lookup when a saved/configured city exists, guard against a city change during the lookup, clear cached IP coordinates when the MCP city setter is used, reject empty city names, and display weather errors instead of a persistent loading label. Retain IP lookup only for an unset city; no new network service or data collection. Correct one English tool description. Preserve all weather route names, storage keys and tool IDs.
- Precommit mocked Vue/JavaScript checks verified defaults, stored city priority, first-run IP lookup and the unset-city error. Added static regression assertions. CI/live Windows testing pending. Revert for rollback. No new build requested.

## 2026-11-26 — VRM renderer developer comments (first pass)

- Parent `512e932f3fc51a65f0b23db50ad9635930f232fe`. Translate the first 220 remaining Han-flagged lines in static/js/vrm.js, all comments, covering panorama and scene setup, model transforms and loading, SpringBone, poses, idle animation, lip-sync and subtitle setup. Preserve executable prefixes, line count, model IDs, animation values, event handlers, rendering and audio behavior. No external code or dependencies. 310 Han-flagged lines remain. Precommit JavaScript syntax check excludes identical static import statements from both versions solely for parser compatibility. Full module CI and interactive rendering not tested. Revert for rollback; no build requested.

## 2026-11-26 — Complete VRM renderer developer comment localization

- Parent `5090ae3c0a46a69600c8082bf113d405b9c07a68`. Translate the remaining 310 Han-flagged lines in static/js/vrm.js, covering subtitle layout, VMC protocol, rendering modes, pointer lock, PTT, XR, panel controls, audio queue, typewriter and model switching. Preserve executable prefixes, line count, import statements, motion parameters, event and protocol identifiers and multilingual punctuation support. No dependency or rendering behavior change. Zero literal Han characters remain in this source file. Add full-file regression coverage in tests/test_english_runtime_contract.py. Preliminary syntax check on both versions passed with identical static imports removed only for parsing. Full module CI and interactive Windows runtime unverified. Revert for rollback; no build requested.

## 2026-11-26 — Complete CLI developer comment and docstring localization

- Parent `113935416f050aaf4ff67d40c5f1a0a688bd0078`. Translate all 255 remaining Han-flagged lines in py/cli_tool.py, covering process management, WSL/Docker/local execution, stream decoding, patch application, workspace checks, redaction, file tools, tasks and skill reads. Correct stale comments about ZeroBox to match the existing workspace-scoped read/write and enabled network settings. Preserve executable lines, inline-comment prefixes, triple-quoted docstring delimiters, file length, command schemas, permissions, sandbox and encoding behavior. Retain GBK/UTF-16LE decoding for user and subprocess compatibility. No dependency or behavior changes. Added AST and zero-Han source regression checks. Static edit coverage verified, Python parsing/CI and live shell execution outstanding. Revert for rollback; no build requested.

## 2026-11-26 — English local application control and Dynamic Island backend

- Parent `004401ce215fd721ab9c5f692927d9be5f252505`. Translate 130 lines in py/local_app_control.py, 27 in py/ext_cdp.py, 49 in py/dynamic_island.py and one comment in py/uv_api.py. Rename the private module registry consistently; preserve public connection functions, port/target selection, CDP calls, music/task tool schemas, media controls and system scanning. Preserve preexisting multilingual installer and launcher matching as equivalent Unicode escapes, not as UI text. Remove regional application examples from comments only. No dependency or permission changes. Verify equal source line counts and zero Han literals in all four files; add AST/full-file regression tests. Python execution, CI and interactive Windows testing remain outstanding. Revert for rollback; no build requested.

## 2026-11-26 — English skill and extension managers; fork-owned catalog

- Parent `85da1da69dd6992cf3e7d4fd1c9fe4802b2faeee`. Translate skill and extension defaults, metadata parser diagnostics, installation feedback, API errors, comments and docstrings. Preserve user-authored metadata, installation/update routes, ZIP upload, project/global sync, custom GitHub proxy, storage paths and Node handling. Replace the inherited upstream network catalog and regional fallback with a packaged local JSON catalog. Its initial empty list is intentional: no unreviewed extensions are advertised by default. Existing installed extensions and direct installation paths remain. The main HTML catalog link now references this fork. No dependencies added. Zero literal Han characters in both modules; regression tests cover source, catalog and fork link. Python execution, packaging and full CI unverified. Revert for rollback; no build requested.

## 2026-11-26 — Complete search and image-tool localization

- Parent `777bde3f659ddc0e5ff9d3579d9d7d3602ecbb2d`. Translate 67 flagged lines in py/web_search.py and 31 in py/pollinations.py. Preserve executable search logic, provider URLs, quotas/configuration, request/response schemas, image size/model defaults, modalities fallback and URL processing. English image prompts retain original Markdown formatting requirements; examples changed to neutral English subjects. No new dependencies or permission changes. Both files retain original line counts and contain zero literal Han characters. Added regression tests; Python execution, CI and live services outstanding. Revert for rollback. No build requested.

## 2026-11-26 — English model management and Dify adapter source

- Parent `17dd825844a51286c124e28addd5494ead31a170`. Translate 8 lines in py/dify_openai.py, 40 in py/sherpa_model_manager.py, 5 in py/moss_model_manager.py, 14 in py/ebd_model_manager.py and 22 in py/minilm_router.py. Preserve executable behavior, API endpoints, progress records, dependencies, acceleration provider ordering, paths, and default configuration. Only comments/docstrings and the MiniLM missing-model diagnostic changed. Retain exact line counts; no literal Han characters remain in the five files. Added AST/full-file regression tests. Python CI and live model downloads/inference unverified. Revert for rollback. No build requested.

## 2026-11-26 — English screenshot, startup and accessibility source

- Parent `4428f2aea574757d781b2f143312a0ca6e0829b1`. Translate 32 flagged lines in static/shotOverlay.html, 20 in static/skeleton.html, 25 in py/ui_tree_helper.py and 4 in start.js. Remove the Chinese screenshot hint and replace its fallback with en-US; set startup HTML language to English. Other changes are comments, docstrings, screenshot title and control tooltips. Preserve IPC, screenshot selection behavior, native handles, DPI mapping and startup logic. All four files retain original line counts and contain zero literal Han characters. Inline JavaScript and launcher parsing passed; added regression tests. Python CI and live Electron validation pending. Revert for rollback.

## 2026-11-26 — Complete English alternate chat interface

- Parent `608aa1c37fb0f9aadf83e47ec4a580267b9f9734`. Translate all 255 remaining flagged lines in static/chat.html, including markup and JavaScript comments plus active fallback labels and tooltips. Preserve Vue bindings, DOM IDs, routes, event handlers, styling and line count. Zero literal Han characters remain; 2 inline classic scripts parsed. Added regression coverage. Full CI and live UI testing pending; revert for rollback.

## 2026-11-26 — Complete English webview preload comments

- Parent `65a5bd03f91fe7c65c6cb981bc3b1a03cf2489ee`. Translate 37 comment lines in static/js/webview-preload.js. Preserve every executable prefix and the original line count; no change to browser behavior, injection logic, toolbar controls or permissions. Both original and edited JavaScript parse successfully; zero literal Han characters remain. Add a source regression check. No security audit, full CI or live Electron validation performed. Revert for rollback.

## 2026-11-26 — Remove remaining catalog links and dormant regional defaults; package fork catalog

- Parent `68d8d529360f0a6e358378baf915bd1b44860650`. Remove four dormant Gitee fields from settings_template.json and Vue state, plus obsolete SMMS credential/default from Vue. Align disabled image-host defaults with the existing easyImage2 option. Remove inherited external contribution buttons for skills and MCP (direct install/add controls remain); point both extension catalog links to the fork. Remove the upstream FunASR project link and restrict selection to already-configured legacy local WebSocket ASR users; backend protocol retained pending replacement/migration. Add config/extension_catalog.json to PyInstaller datas and translate nine spec comments. No existing profile migration, network endpoint expansion, or license changes. JSON and JS parsing and targeted string checks passed; AST/regression tests added. Full CI/build unverified. Revert for rollback.

## 2026-11-26 — Expand tracked-path English and regional dependency inventory

- Parent `6c63d9cba1e28dc7ae25657d7e8dfb768e370e26`. Replace previous source-only exclusions with explicit scope classification, ranked per-file findings and a ledger of excluded paths. Include uv.lock/package-lock.json, server.spec, bundled skills and asset text/path signals. Preserve original legal attribution and historical records as distinct scopes; no automatic deletions. CI runs the fixture tests and tracked-only inventory (including on earlier test failure) and attempts report upload. Binary asset content remains outside this text scanner; lockfile resolution and complete current report are pending. No new dependencies or build.

## 2026-11-26 — Retire inherited speech recognition WebSocket adapter

- Parent `843eed5edbadbe50b1834f9b865d18af97284c68`. Remove legacy FunASR-specific connection, PCM conversion and hotword helpers, HTTP dispatch, streaming dispatch, selector/configuration panel and Docker instructions. Retain HTTP /asr and WS /ws/asr, supported Sherpa/OpenAI dispatch, browser speech, audio_complete messages and existing client control-event compatibility. Unsupported stored engines fail explicitly; no automatic migration or cloud selection. Missing engine defaults to local Sherpa. Remove obsolete fresh settings only; do not alter persisted profiles. Validate zero legacy identifiers in six runtime files, JSON and JS syntax. Add regression checks, but full Python and Windows runtime validation outstanding. Revert for rollback.

## 2026-11-26 — Add reproducible Python lock candidate workflow

- Parent `2be4df1982fa685b7e38e81edca0f87cc19af6c7`. Confirm six obsolete direct requirements in inherited uv.lock compared with pyproject.toml. Introduce scripts/check_python_lock.py and read-only .github/workflows/resolve-python-lock.yml to perform actual uv resolution on a runner, verify freshness, reject retired package names, enforce current PyPI source policy and artifact hash metadata, and upload a candidate with diff and provenance. No hand-pruning of lock records or changes to dependencies, no automatic branch updates. Workflow execution and candidate review remain pending; no Windows package triggered by this commit.

## 2026-11-26 — Commit resolver output and correct Dynamic Island source encoding

- Parent 6a84ebf0a9385e279957d5a272e2eb3dcf8507c1. Use the successful resolver artifact from run 45925158544, uv 0.13.10; 421 to 413 package records, six retired direct SDKs absent and no unexpected source findings. Independently verify artifact checksum and exact Git blob identity before advancing branch. Remove one leading BOM from py/dynamic_island.py to fix ast.parse failure in audit 45925158378; no executable change. Updated documentation and recorded remaining CSS/skills inventory. New CI and Windows runtime unverified.

## 2026-11-26 — English minimal mode, overlays and supporting modules

- Parent a7f20890759ac91488fa42cf275d15fd4b7c8282. Translate 150 Han-flagged lines in py/image_host.py, static/minimal.html, static/danmaku_overlay.html, static/subtitle_overlay.html, static/sw.js, entitlements.mac.plist, static/css/transition.css, static/css/vrm.css, static/css/island.css. Preserve selectors, declarations, overlay event handlers, cache logic and entitlements; remove only Chinese shortcut aliases and a regional UI comparison. Preserve image hosting configuration and behavior. JavaScript syntax checked; Python and live GUI validation pending. Revert for rollback.

## 2026-11-26 — English bundled extension creator and starter templates

- Parent eaf00e7f92b4ab99a29c83a830480b3b2e6286d4. Translate all 30 flagged lines in the four bundled extension-creator files; remove Chinese locale table/default and toggle from both templates, replace the obsolete Gitee example values with empty legacy metadata, correct documentation about update behavior, and refer to maintained bundled templates instead of unreviewed upstream extensions. Preserve existing protocol names, theme, user text and static/Node integration. Inline scripts parse; live installation and MCP integration remain unverified. Revert for rollback.

## 2026-11-26 — Localize MOSS speech normalization and runtime internals

- Parent 7e39091160cea13c4eae3299e5ffc628d054ecc6. Address 119 Han-flagged lines in py/moss/tts_robust_normalizer_single_script.py and 73 in py/moss/tts_runtime.py. Preserve multilingual test fixtures via equivalent Python Unicode escapes, retain normalization regexes and punctuation including ideographic output punctuation, audio processing and model execution. Translate comments/docstrings and diagnostics only. Add regression tests for AST, English source and representative normalization. Static coverage checked; CI and actual MOSS inference pending. Revert for rollback.

## 2026-11-26 — Main stylesheet English comment pass 1

- Parent cc1b28c417a895c7f9b2ec0428381d7d67d2b0eb. Translate the first 220 flagged comment entries and matching duplicate comments elsewhere in static/css/styles.css (235 total occurrences, 235 flagged lines). Compare complete non-comment text for exact equality and retain line count. 1544 flagged lines remain. No CSS rule changes. Further audit, CI and live visual validation pending. Revert for rollback.

## 2026-11-26 — Main stylesheet English comment pass 2

- Parent d4a992a0148e69d74967b0392e27e2e68cfa0d11. Translate 259 flagged comment lines in static/css/styles.css, covering navigation, provider dialogs, search controls, responsive layout, cards, inputs, Markdown rendering and A2UI. Preserve all non-comment CSS byte-for-byte and original line count; Han-flagged lines decrease from 1544 to 1285. No selector, declaration, asset, dependency, permission or runtime behavior changes. No new external implementation used for this translation-only pass. Full CI and live visual validation pending; revert for rollback.

## 2026-11-26 — Main stylesheet English comment pass 3

- Parent 372ce771bce50382c10fcdeba3f774e784a505c3. Translate 125 remaining flagged comment lines in static/css/styles.css, covering A2UI form controls, Markdown footnotes, streamed message layout and browser tabs, including one scrollbar comment left over from pass 2. All non-comment CSS is byte-identical; original line count retained. Han-flagged lines decrease from 1285 to 1160. No behavior, selectors, declarations, dependencies or permissions changed. No external implementation required. Full CI and Windows visual validation pending. Revert for rollback.

## 2026-11-26 — Main stylesheet English comment pass 4

- Parent ebfd8e03d7fa6b2092197a06f5a435bea16a0d8a. Translate 260 comment lines in static/css/styles.css covering browser, notifications, IM/group chat, attachments and tool approval cards. Preserve non-comment CSS byte-for-byte and line count; 900 flagged lines remain. No runtime behavior or dependency changes. CI and Windows visual validation pending. Revert for rollback.

## 2026-11-26 — Main stylesheet English comment pass 5

- Parent 01f6b23bb87351f68039653e3983d93587fbff87. Translate 250 comment lines covering MCP lists, loading overlays, task center, input and message controls, side panels, dropdowns and PTT. Non-comment CSS byte-identical; line count unchanged; 650 flagged lines remain. No implementation, dependency or permission change. CI and Windows visual validation pending; revert for rollback.

## 2026-11-26 — Main stylesheet English comment pass 6

- Parent 81256823076caf95801fe30802681ab8d910bf03. Translate 250 comment lines covering PTT, model status, trees, media attachments, dashboard, motion and dialog styling. Non-comment CSS byte-identical; line count unchanged; 400 flagged lines remain. No runtime changes. CI and Windows visual validation pending; revert for rollback.

## 2026-11-26 — Main stylesheet English comment pass 7

- Parent 516a02e9a38ce68b03426f793302aebb8f6a5086. Translate 200 comment lines covering form motion, history, provider search, permission cards, bookmark tabs and mobile layout. Translate obsolete regional messaging comparison to generic instant-message style. Non-comment CSS byte-identical; line count unchanged; 200 flagged lines remain. CI and Windows visual validation pending; revert for rollback.

## 2026-11-26 — Complete main stylesheet English comment translation

- Parent 7cb693338d09df7e5dc9cfe4aac10ec785a2d55e. Translate final 200 Han-flagged comments covering navigation, code zoom, work/entertainment modes, typing indicators, image/code bubbles, glass backgrounds, shortcuts, diary and account management. Replace obsolete regional style comparisons with generic descriptions. All 1,779 initially flagged lines are addressed across eight passes; compare executable CSS and line count to original pre-pass commit cc1b28c417a895c7f9b2ec0428381d7d67d2b0eb. Non-comment CSS byte-identical, 14,497 lines retained, zero literal Han. No UI behavior, permissions, selectors or declarations changed. CI and visual testing pending; revert for rollback.

## 2026-11-26 — Translate inherited calendar design records

- Parent 0138d0774f343de79dc2642f3ab8d2a0a6cf6b94. Translate 118 Han-flagged lines across docs/superpowers/plans/2025-07-09-calendar-panel.md and docs/superpowers/specs/2025-07-09-calendar-panel-design.md. Preserve original historical design and tool schema names; translate sample UI strings/date formats and explicitly label historical weather default as superseded. Mark both records historical rather than current instructions. No runtime source or settings changed. Zero literal Han in both files; no runtime test required for docs-only change. Revert for rollback.
