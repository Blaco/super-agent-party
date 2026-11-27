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
