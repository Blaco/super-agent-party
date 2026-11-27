# Agent Creation — current implementation status

**Updated:** November 26, 2026
**Repository:** https://github.com/Blaco/super-agent-party
**Development branch:** `agent-creation`
**Reference commit before this status update:** `83cc189d48c2b4ea42cadda6350579ee7a2d8215`
**Upstream reference:** fork `main`, retained without the current rewrite.

## Implemented in source

- English-only runtime UI locale, English menu defaults, packaged character relationship/diary/wake-word prompts and many agent-facing tool, vision, memory, avatar, TTS and delegation instructions.
- Default navigation centers on chat, models, characters, tools, browser, storage and system. Additional features remain accessible to users who need adjacent functionality.
- Dedicated QQ, WeChat, WeCom, Feishu, DingTalk and Bilibili managers/clients, routes and primary UI controls removed; dormant Western Discord/Telegram/Slack and YouTube/Twitch are preserved.
- Removed region-specific model-download mirrors, proprietary TTS providers (Volcengine, Baidu, MiniMax, Xunfei), Bocha search, and regional cloud inference API presets. Public model downloads use Hugging Face; self-hosted OpenAI-compatible inference and selected Western services remain configurable.
- Inherited app update feed disabled. Fork release destinations configured and original legal attribution, contributor history, AGPLv3 and third-party license notices maintained.
- English README/install guide and test coverage for the above contracts, with detailed per-commit record in `CHANGE_LEDGER.md`.

## Verified

- [Current source audit](https://github.com/Blaco/super-agent-party/actions/runs/45904011969) at `83cc189d48c2b4ea42cadda6350579ee7a2d8215`: successful JS smoke, Python compile and all companion/English/provider isolation tests. Inventory found **12,532 Han-flagged lines** and **106 region-platform references** after the major removal commits; these counts include Chinese comments, third-party references and original legal identifiers. They are **not** proof that remaining text is harmless.
- [Successful Windows x64 development package](https://github.com/Blaco/super-agent-party/actions/runs/45902506130) for historical SHA `8080027404a4d579070acbd55afabfac3b552d71`: PyInstaller server, Electron directory, ZIP, SHA-256 and GitHub artifact upload all completed.
- The current source has changed since that earlier package; the Windows development workflow is re-triggered with additional syntax and search-schema checks in the next commit. Inspect its run before assuming a new ZIP exists.

## Still incomplete

1. **Absolute English source conversion:** thousands of Han-character lines remain across inherited UI/backend modules, predominantly comments, some UI literals and model tools. The English-only product requirement is **not yet satisfied in full**; do not market this as China-free.
2. **Windows interactive validation:** clean and existing profile launch, UI layout, TabbyAPI/Qwen chat, avatar movement, TTS/audio and permissions require interactive testing. Passing a package build cannot establish them.
3. **Privacy and consent:** cloud-provider history-sharing consent and per-provider memory scoping must be implemented/tested before treating cloud switching as safe for private local conversations.
4. **Lockfile:** `uv.lock` still reflects upstream lock resolution. Windows `uv sync` resolves project dependencies during the build, but the repository's lock has not been regenerated and reviewed.
5. **Branding:** the inherited Electron product identity and data storage paths remain to avoid breaking existing user profiles; a separate carefully tested migration/rebranding is required.
6. **Voice pipeline:** WhisperBox stays in its own repository and its HTTP service must be integrated/tested without importing GUI-only code into SAP. Optional native/third-party speech engines have not been exhaustively live-tested.

## Next work

Translate the remaining **active UI labels/model-facing diagnostic strings**, then developer comments and documentation while preserving code behavior. Review residual region-platform references and package provenance. Validate Windows clean/existing profile data paths and local TabbyAPI. Add cloud consent gate and optional WhisperBox adapter. Regenerate Python lockfile on a trusted Windows checkout. Only distribute a user-facing release after those checks; current ZIP artifacts are development snapshots.

Legal source attribution and unmodified user-authored multilingual content are deliberately preserved and are not targets for localization.


## Follow-up source checkpoint — November 26, 2026

- Source CI for `ca82b097bc8df8a871f551bdd5b6f0416d24d274` passed: https://github.com/Blaco/super-agent-party/actions/runs/45911282256. The task, diary, relationship, behavior, scheduler and MCP modules were localized after the earlier status snapshot above.
- This follow-up localizes additional provider, knowledge and media tools and residual group-memory, image/speech and deep-search prompts in server.py. See the append-only change ledger. The remaining inventory and Windows runtime validation must still be completed. No fresh package is asserted.

## Follow-up source checkpoint — settings and companion diagnostics

- Source audit for `632a5f43fb530addb6dc53202dba172ab1079b8c` passed: https://github.com/Blaco/super-agent-party/actions/runs/45915297343. That checkpoint includes the regional Docker cleanup, English native MOSS default, alternate browser chat cleanup and corrected HTTP JSON samples.
- This pass translates settings/data-path diagnostics, sleep prevention and VTube Studio integration comments and logs. These three modules have no remaining Han characters in a precommit text scan. Automated source checks for this pass are pending; Windows runtime and the full repository language inventory remain outstanding. No new package was requested or produced.

## Follow-up source checkpoint — file and image tools

- The document and image ingestion schemas, parser errors, file headers, category labels and comments in py/load_files.py are now English. File extensions, parser logic, user content, and existing tool contracts remain intact. Full language inventory and runtime file-format tests remain outstanding. No new package was requested.

## Follow-up source checkpoint — shortcuts and optional messaging

- Source audit for `c7f64e8a708eb95fde36d37ddcba14aa83277b59` passed: https://github.com/Blaco/super-agent-party/actions/runs/45916332308.
- Shortcut help, command aliases and retained Western messaging adapters now use English system text; removed stale platform mappings. User-authored text and English command behavior remain intact. New CI and live service checks pending. No new Windows package requested.

## Follow-up source checkpoint — shortcut correction

- Source audit for `28d17755ad2f7d3f79d2822f2500991f49806c16` failed on JS syntax in the shortcut permission-mode map (run 45916727019). Corrected the map and strengthened its regression test. No permission semantics changed. New CI pending.

## Follow-up source checkpoint — avatar and optional livestream text

- SoulX avatar status/controls, Electron preload diagnostics and the YouTube/Twitch listener modules are now English; renderer A2UI fallback and additional diagnostics were localized. Shared message IDs, external protocol fields and audio/video processing are unchanged. Source CI and runtime validation remain pending. No new package requested.

## Follow-up source checkpoint — renderer comments

- Source CI for `a1981fb20b4a4b702196b8f9ae89b907b243d06f` passed at https://github.com/Blaco/super-agent-party/actions/runs/45917021932.
- The main renderer now has no detected Han characters, including A2UI template and developer comments. The broader Vue methods, backend and other source inventories remain incomplete. New CI pending; no package produced.

## Follow-up source checkpoint — Vue state definitions

- static/js/vue_data.js now contains zero detected Han characters, including developer comments. Executable state and settings defaults remain unchanged. The broader Vue methods and backend inventory still requires work; CI pending and no new package requested.

## Follow-up source checkpoint — complete server and Vue methods

- Source audit for `bf6ab1b8134a77fc03d48e556cdbec892780e8ef` passed at https://github.com/Blaco/super-agent-party/actions/runs/45917460431.
- All 3,868 remaining Han-flagged lines in server.py and static/js/vue_methods.js have been addressed; both contain zero literal Han characters. Existing multilingual group-memory matching and narrator compatibility are retained using Unicode escapes. JavaScript syntax and the character-card JSON example passed precommit checks. Regression coverage added; source CI for this commit and Windows interactive validation remain outstanding. Other inherited modules still need an inventory; no new package requested.

## Follow-up source checkpoint — main interface and Electron

- Source CI for `ec4a4a43f87c958d2004466c641d51d8218cfd1d` passed: https://github.com/Blaco/super-agent-party/actions/runs/45918758039.
- static/index.html and main.js now contain zero literal Han characters (1,245 flagged lines addressed); two Japanese translation-target values are preserved via equivalent Vue-bound escapes. Main process and inline JavaScript syntax and markup equivalence checks passed. New source CI and interactive Windows validation remain outstanding. Next localization targets: static/js/vrm.js and static/js/island-app.js, followed by CLI, local application, skills and extension modules and a repository-wide audit. No package requested.

## Follow-up source checkpoint — Dynamic Island

- Dynamic Island JavaScript and HTML are English-only, including model-facing tool descriptions, translation prompts and date/weather output. Removed the unused alternate UI locale and hardcoded regional weather fallback; retain configured cities and existing IP lookup, with an explicit set-city prompt when no city is available. Geocoding defaults to English. Translation targets and user content remain supported. No tool identifiers, route paths or stored-data keys changed. Static checks passed before commit; source CI and Windows interactive verification remain outstanding. Next target: VRM renderer comments, then CLI/local application/skills/extensions and repository-wide inventory. No new package requested.

- Follow-up correction: a saved weather city now takes precedence over IP-based lookup; explicit agent city changes invalidate cached coordinates, and unavailable weather is shown as an error rather than perpetual loading. Mocked JavaScript checks passed for English defaults, persisted city priority, IP fallback and unset-city error. Remote source CI and Windows testing remain outstanding.

## Follow-up source checkpoint — VRM renderer, first comment pass

- Translated 220 of 530 remaining Han-flagged lines in static/js/vrm.js, covering environment detection, scene loading, transforms, model setup, idle animations, speech/lip-sync and subtitle setup. No executable code changed; 310 flagged comment lines remain. Syntax checked with identical static imports excluded only from the precommit parser. Full module CI and renderer runtime remain pending. No new package requested.

## Follow-up source checkpoint — VRM renderer localization complete

- Translated all 310 remaining Han-flagged lines in static/js/vrm.js. Together with the preceding 220-line pass, the renderer now has zero detected literal Han characters. Changes are comment-only, including shader/CSS comments, subtitles, VMC, XR, PTT, audio synchronization and model switching. Multilingual punctuation handling remains intact. The full-file English regression check was added. Preliminary syntax check passed with unchanged static imports excluded solely for parser compatibility; full module CI and Windows rendering remain outstanding. Next: CLI and local application modules, skills/extensions, then repository-wide inventory. No package requested.

## Follow-up source checkpoint — CLI tool localization complete

- Translated all 255 remaining Han-flagged lines in py/cli_tool.py (comments and docstrings only). Corrected stale explanatory comments to reflect actual ZeroBox workspace read/write and network configuration. No command execution logic, sandbox settings, permission checks, schemas, process management, redaction behavior or task data changed. Zero literal Han characters remain. Added AST and full-file English regression coverage; Python execution and CI are not verified in this editing environment. Next: local application modules, skills/extensions and full inventory. No package requested.

## Follow-up source checkpoint — local application and Dynamic Island backend

- Local application scanning/CDP tools, Dynamic Island backend and uv API source now contain zero detected literal Han characters (207 flagged lines addressed). Rename the private connection registry consistently to _external_connections and translate model-facing descriptions, diagnostics and developer comments. Preserve localized installer/launcher detection via equivalent Unicode escapes for installed applications; no removal of multilingual user content. Tool names, protocol fields and platform behavior retained. Added AST and English regression coverage; static inventory passed, Python tests/CI and live application control are pending. Next: skills and extensions. No package requested.

## Follow-up source checkpoint — skills and extension managers

- Localized all remaining flagged lines in py/skills.py and py/extensions.py. Retain GitHub and ZIP installation, skill sync, extension update and Node extension APIs. Replace automatic upstream GitHub/Gitee catalog retrieval with the fork-controlled packaged config/extension_catalog.json (initially empty, pending review of candidate extensions); keep the existing /remote-list response contract and point the catalog button to the fork. User-specified GitHub proxy support remains. Static Han scan and route/link checks passed; Python parsing, CI, packaged configuration and interactive installation still require verification. Next: remaining backend modules, assets, skills contents and repository-wide regional inventory. No package requested.

## Follow-up source checkpoint — web search and image tools

- Completed the remaining English source conversion of py/web_search.py (67 flagged lines) and py/pollinations.py (31 flagged lines). Search changes are comments/docstrings; image changes include agent-facing schema descriptions, examples and developer comments. Preserve provider configuration, robots checks, network behavior, tool names, Markdown rendering and image processing. Static line coverage and zero literal Han checks passed. Added AST and source regression coverage; Python CI and live providers remain unverified. No package requested.

## Follow-up source checkpoint — model management and Dify adapter

- Completed the remaining English conversion of py/dify_openai.py, py/sherpa_model_manager.py, py/moss_model_manager.py, py/ebd_model_manager.py and py/minilm_router.py (89 flagged lines). Only documentation, comments and a missing-model error message changed; original download sources, progress contracts, paths, acceleration provider order and fallback behavior remain intact. Added AST and zero-Han regression coverage. Static line coverage verified; full Python CI, model downloads and inference still require validation. No package requested.

## Follow-up source checkpoint — startup, screenshot and accessibility

- Completed English source conversion of static/shotOverlay.html, static/skeleton.html, py/ui_tree_helper.py and start.js (81 Han-flagged lines). Screenshot hints now default to English even when a legacy locale is supplied; the startup document declares English. Retain screenshot geometry, IPC, startup sequencing and accessibility logic. Inline JavaScript and launcher syntax checks passed; added AST/source regression coverage. Full CI and live desktop validation remain outstanding. No package requested.

## Follow-up source checkpoint — alternate chat interface

- Completed the remaining 255 Han-flagged lines in static/chat.html, including template comments and fallback labels. Preserved Vue directives, handlers, layout, display blocks, chat modes, extension controls and task functionality. Inline classic JavaScript parsing passed (2 scripts). Added source regression coverage. Browser/Electron runtime and full CI remain outstanding. No new build requested.

## Follow-up source checkpoint — webview preload

- Translated all 37 remaining flagged comments in static/js/webview-preload.js. No executable code, browser compatibility behavior or toolbar handlers changed. JavaScript parsing passed before and after; zero literal Han characters remain. Added a source regression check. This is localization only, not a browser security or compatibility audit. Full CI and live runtime testing remain outstanding. Next: repository-wide inventory, bundled skills, assets and residual regional references. No package requested.

## Follow-up source checkpoint — regional defaults and packaging audit

- Removed dormant Gitee and SMMS fields from first-run configuration/state, aligned the disabled image-host default with the existing easyImage2 selector, removed upstream skill/MCP contribution links and corrected the second extension catalog button. Hid the inherited FunASR choice for new selections and removed its upstream link; existing configurations retain the local WebSocket protocol as a compatibility option until a separate ASR migration. Local extension catalog is now explicitly included in server.spec; all nine flagged packaging comments translated. No saved user profile is modified by this commit. Static JSON, JavaScript and residue checks passed; full CI and packaged application testing pending. The stale uv.lock still contains removed SDKs and requires a real resolver run. Full directory inventory and bundled asset review remain incomplete: connector cannot enumerate directories and direct Git access is unavailable here. No build requested.

## Follow-up source checkpoint — full tracked-path inventory preparation

- Expanded scripts/audit_english_surface.py to include dependency lockfiles, packaging specs, bundled skill text, text-based assets and filenames; distinguish project source, bundled skills, dependencies, vendored files, legal attribution and historical tests/docs. Record non-text, oversized and unreadable paths explicitly. CI invokes the tracked-only inventory even if earlier tests fail and uploads its report. Added fixture tests for ranking, scope counts and tracked-only filtering. The full current checkout report has not yet been retrieved; this is an inventory mechanism, not proof of English-only completion. Binary contents need separate manual review. No new build requested.

## Follow-up source checkpoint — retire legacy speech recognition adapter

- Removed the inherited FunASR backend functions, streamed-audio adapter, obsolete configuration defaults and UI installation instructions. Existing saved unsupported engines receive an explicit error, not a network or cloud fallback; users must select Sherpa, browser speech, or a configured OpenAI-compatible ASR service. Missing backend engine defaults now select local Sherpa. Existing settings and recordings are not modified. Preserve HTTP and WebSocket routes and completed-audio recognition. Added static regression coverage; JavaScript/JSON checks passed, Python CI and live speech tests remain pending. The current audit report is still unavailable through the connector's PR-only workflow lookup.

## Follow-up source checkpoint — dependency lock resolution

- A comparison of the current pyproject.toml and uv.lock root dependencies confirms six removed direct SDKs remain in the stale lock: qq-botpy, lark-oapi, dingtalk-stream, wechatbot-sdk, wecom-aibot-python-sdk and modelscope. Added a read-only dependency lock candidate workflow that uses uv to resolve the existing lock, checks freshness and retired SDK exclusion, checks official PyPI registry/artifact hosts and SHA-256 metadata, and uploads the resulting lock, patch, checksum and source commit for review. No manual edits to uv.lock, no automatic commits and no package release. Resolver results and the tracked-path inventory remain unverified until a workflow artifact can be retrieved. Direct network access is unavailable here.

## Follow-up checkpoint — verified lockfile and CI repair

- GitHub Actions resolver run 45925158544 completed successfully at 6a84ebf0a9385e279957d5a272e2eb3dcf8507c1. Downloaded artifact, verified SHA-256 355ee7240ad0ca9e3a34a9f6fb3216275a11d707773bacc90cfa993d2b398466; 413 package records, no retired packages or unexpected sources. The committed lock blob is byte-identical to the candidate (Git blob 304b6fafc5ab4f1f5faba05b46ef70ff2e47af89). Removed the leading UTF-8 BOM in py/dynamic_island.py that caused the otherwise passing English runtime contract suite to error. Source audit run 45925158378 examined 2,773 text files; 2,409 project-source Han-flagged lines, 30 bundled-skill lines, with 1,779 in styles.css. Binary review remains pending. No package built in this commit.

## Follow-up source checkpoint — remaining small UI and image-host modules

- Localized 150 flagged lines in the minimal chat, live chat and subtitle overlays, service worker, macOS entitlements comments, image-host helper and three CSS files. Removed Chinese shortcut aliases from the minimal interface, preserving English commands; no network, layout, permission or image-host behavior changes intended. JSON/JavaScript-related checks passed where applicable. Main stylesheet and remaining MOSS/skill/documentation findings still need work. No new build.

## Follow-up source checkpoint — bundled extension creator

- Localized all 30 Han-flagged lines across the bundled extension-creator skill, package spec and static/Node starter templates. New templates ship English only, with no bilingual toggle or regional repository fallback example. Retain MCP registration, theme, extension lifecycle, API and user content support. Both template scripts parsed; actual generated extension runtime is unverified. Main stylesheet, MOSS text normalization, inherited planning documentation and binary asset review remain open.

## Follow-up source checkpoint — MOSS speech internals

- Localized all 192 remaining Han-flagged lines in the MOSS robustness normalizer and runtime. Translate developer documentation and runtime diagnostics; encode the existing multilingual test fixtures using equivalent Unicode escapes rather than changing their inputs/expected results. Preserve all punctuation rules, regexes, audio preprocessing, caching, resampling and ONNX execution. Added AST and representative normalization regression checks. No change to speech model, English default, voice selection or permissions. CI and live speech remain to be verified. No package built.

## Follow-up source checkpoint — main stylesheet, first pass

- Translated 235 distinct comment occurrences (235 flagged lines) in static/css/styles.css, covering themes, components, chat, navigation, file tables, model and knowledge cards. All CSS outside comments is byte-identical to the previous version; line count unchanged. 1544 Han-flagged stylesheet lines remain. No selectors, declarations or behavior changed. Further comment localization and residual regional selector review pending. No build.

## Follow-up source checkpoint — main stylesheet, second pass

- Translated 259 additional Han-flagged stylesheet comment lines; 1285 remain. All non-comment CSS is byte-identical and the line count is unchanged. Further localization, residual regional references, CI and Windows validation remain outstanding. No build.

## Follow-up source checkpoint — main stylesheet, third pass

- Translated 125 more Han-flagged stylesheet comments; 1160 remain. All non-comment CSS remains byte-identical and line count unchanged. Further localization, CI and Windows visual testing remain outstanding. No build.

## Follow-up source checkpoint — main stylesheet, fourth pass

- Translated 260 more stylesheet comment lines; 900 remain. Non-comment CSS byte-identical and line count unchanged. CI and Windows visual validation pending. No build.

## Follow-up source checkpoint — main stylesheet, fifth pass

- Translated 250 further stylesheet comment lines; 650 remain. Non-comment CSS byte-identical, line count unchanged. CI and Windows visual validation pending. No build.

## Follow-up source checkpoint — main stylesheet, sixth pass

- Translated 250 further stylesheet comment lines; 400 remain. Non-comment CSS byte-identical, line count unchanged. CI and Windows visual validation pending. No build.

## Follow-up source checkpoint — main stylesheet, seventh pass

- Translated 200 further stylesheet comment lines; 200 remain. Non-comment CSS byte-identical, line count unchanged. CI and Windows visual validation pending. No build.
