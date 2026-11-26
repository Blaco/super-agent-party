# Feature disposition inventory (first-pass classification)

Statuses: **KEEP** = retain and expose; **HIDE** = keep code but remove from normal navigation with discoverable advanced/legacy access if safe; **REMOVE-CANDIDATE** = dependency audit required before removal; **REPLACE-LATER** = preserve current implementation until benchmark proves improvement. These are plans, not completed code changes.

| Feature | First-pass status | User-facing priority | Likely owner or source | Next action |
|---|---|---|---|---|
| Chat streaming and conversation persistence | KEEP | P0 | server.py, static/js/vue_methods.js | Measure latency, verify no reasoning leakage |
| SillyTavern character PNG/JSON import, descriptions, example dialogue | KEEP | P0 | static/js/vue_methods.js, memorySettings | Verify exact V2/V3 import/export semantics |
| Character worldbook / keyword lore | KEEP | P1 | server.py characterBook matching | Compare with full ST behavior; preserve existing behavior until tested |
| Long-term memory, diary, relation state | KEEP | P1 | py/diary_*.py, memorySettings | Audit schema, privacy, retrieval and cross-model behavior |
| TabbyAPI and EXL3 local model endpoint | KEEP | P0 | modelProviders, selectedProvider | SAP controls request parameters, Tabby controls loaded weights/cache |
| OpenRouter / cloud provider switch | KEEP | P2 | modelProviders, chat routing | Add explicit privacy gate; model-specific settings per-provider |
| Multimodal image/desktop vision | KEEP | P2/P4 | server.py images_add_in_messages, vision settings | Preserve main-model direct image pass and optional separate vision |
| Sherpa/SenseVoice and optional remote STT | KEEP | P3 | py/sherpa_asr.py, ASR settings | Benchmark CPU local speech accuracy |
| Local TTS and voice cloning | KEEP / REPLACE-LATER | P3 | py/moss_tts.py, TTS settings | Evaluate WhisperBox HTTP backend without merging code |
| VRM/Three.js, THA, VTube Studio/Live2D, lip-sync | KEEP | P4 | static/vrm.html, static/tha.html, static/js | Keep animation hooks and event buses intact |
| MCP, extensions, skills, desktop tools | KEEP, advanced sections | P5 | py/mcp_clients.py, py/skills.py, py/cli_tool.py | Expose permissions; no unattended tool calls |
| OpenClaw via ACPX/ACP | KEEP | P5 | py/acpx_tools.py, agent settings | Windows integration test needed |
| Multi-account isolation and data export | KEEP | P0/P1 | main.js, persistence | Verify profiles and backups |
| Group chat / multi-role party | HIDE | Future/optional | group mode UI, group memory | Keep source; remove from simplified default navigation |
| Livestreaming integrations (including YouTube/Twitch) | HIDE (bot deployment entry now under Additional features; streaming internals unchanged) | Outside scope | streamer modules and controls | Preserve source; audit stream-specific alternate navigation |
| Gaming integrations (Minecraft/Factorio etc.) | HIDE if present | Outside scope | extensions/tool modules | Verify actual presence before inventory |
| Standard Western social/chat bots (Discord, Telegram, Slack) | HIDE | Outside scope | py/*_bot_manager.py | Keep code for optional later integrations |
| China-focused social/enterprise bots (QQ, WeChat, Feishu, DingTalk) | REMOVE-CANDIDATE | Outside scope | py/*_bot_manager.py, frontend | Trace imports/routes/configuration first |
| China-focused media platforms (Bilibili, Douyin, etc.) | REMOVE-CANDIDATE if present | Outside scope | README, livestream extensions | Verify existence and dependencies first |
| Chinese cloud providers and country-specific download mirrors | REMOVE-CANDIDATE | Outside scope | vendor lists, defaults, docs | Do not break generic OpenAI-compatible providers |
| Unrelated dashboards, decorative widgets and novelty modules | HIDE (first-pass reversible sidebar filtering implemented) | Optional | navigation tile lists | Check all alternate entry points and Windows layout before further hiding |
| Native Chinese language default prompts, examples, errors and docs | REPLACE (partial: English initial defaults and core character prompt paths) | All | frontend, backend, configs, docs | Continue optional agent/TTS/tool prompt and UI translation; no claim of full completion |
| Updater, packaging, telemetry/network behaviors | KEEP / AUDIT | Delivery | main.js, build.yml, package.json | Prevent upstream publish or unexpected remote communication |

Audit each individual UI setting and backend route before declaring its final disposition. Update this matrix as precise component-level inventories become available; retain upstream source in Git rather than duplicating code in documentation.

## Regional messaging adapter removal — 2026-11-26

The five legacy China-specific bot managers (QQ, WeChat, WeCom, Feishu, DingTalk) and corresponding backend start/stop/status/reload routes are removed from the source branch. Their user-facing bot tabs and routing choices are also removed. Discord, Telegram and Slack remain in the optional deployment panel. Unused frontend methods, saved-setting compatibility keys, and locked SDK dependencies still need a follow-up cleanup; no claim of complete removal from all source paths.


## English runtime conversion — 2026-11-26

The provider adapters for Anthropic, Gemini and OpenAI Responses, knowledge retrieval, ComfyUI, custom HTTP, WebSocket and code interpreter remain KEEP; only human/model-facing text and documentation are changed. Both main chat paths retain ComfyUI schemas and their workflow parameters. Group-memory schema and existing profile data are unchanged. Full English conversion is still in progress.


## Avatar and speech localization — 2026-11-26

THA rendering, VRM, native MOSS voice cloning and model selection remain KEEP. THA HTML/JS and backend engine localized; VRM locale fallback fixed without changing its renderer. No permission, model asset or speech provider migration. Windows avatar and speech testing remains pending.
