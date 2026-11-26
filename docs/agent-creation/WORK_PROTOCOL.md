# Development protocol — must be read before every change

This is the standing instruction set for human maintainers and coding agents. It survives chat history loss.

## Workflow for every change

1. Establish a narrow objective and acceptance criteria. Identify the SAP feature owner, UI labels, data schema, prompt assembly path, persistent settings and relevant source lines.
2. Read existing implementation *first*; preserve functionality, comments, formatting and file boundaries. Trace callers, cross-module dependencies, user data migrations and configuration defaults.
3. Search relevant current community projects and official documentation (at least the pinned list in REFERENCE_RESEARCH.md). Choose existing upstream implementation unless a concrete improvement is justified. Record exact reference repository, commit, path, license and reason for using or not using it.
4. Classify the feature in FEATURE_MATRIX.md: **KEEP** (exposed), **HIDE** (reversible advanced/legacy settings), **REMOVE-CANDIDATE** (approved after trace), or **REPLACE** (only with evidence). Do not mark a feature removed before deletion actually happens.
5. Favor incremental patches with one coherent purpose. Avoid large cross-cutting renames unless necessary; do not silently change unrelated code. Maintain existing UI affordances for planned companion features, even if not active yet.
6. After editing, review the *complete diff* against the exact upstream and previous fork commit. Read the modified code again as an independent reviewer; check error handling, concurrency, resource use, unintended I/O, backwards compatibility, user-data migration, UI discoverability and privacy.
7. Run tests possible in the available environment. For Python, verify syntax and applicable tests; for JS, lint/syntax checks and SAP smoke check; for UI, capture manual steps/screenshots if Windows runtime is available. Label unrun tests accurately.
8. Perform language audit across the affected user-facing and model-facing files. Identify inherited CJK literals, translations, sample text, prompts, error messages, tooltips, provider names, comments and documentation. Do not translate protocol keys or model IDs. Log any deferred results.
9. Append detailed entry to CHANGE_LEDGER.md **in same commit**; update FEATURE_MATRIX.md and DECISIONS.md where appropriate. Include exact files, old/new behavior, impact, tests, source references, feature status and rollback.
10. Commit to Blaco/super-agent-party branch agent-creation, not upstream. Verify remote head. Report commit link, modifications, self-audit and remaining limitations. Never claim a Windows package exists without evidence.

## Scope and design rules

- **User-facing English by default:** all UI, menus, dialogs, tooltips, errors, settings, samples, docs, helper text, log labels and model-facing prompts in English. Keep third-party legal notices and code/protocol identifiers intact.
- **China-platform removal:** remove only dedicated external integrations such as QQ/WeChat/Feishu/DingTalk/Bilibili after dependency audit, documentation and rollback plan. A dependency's Chinese author is not sufficient reason to remove it. No destructive mass search-and-replace.
- **Keep exposed:** chat; character card importer/editor; worldbook; memory; local/cloud models and per-model parameters; privacy routing; ASR/TTS; voice cloning; vision; avatar selection/animation/lip sync; tools/permissions; OpenClaw/ACPX; diagnostics.
- **Hide initially:** livestream/gaming, social bots, multi-character group chat and unrelated dashboards, while preserving dormant code if feasible.
- **Model switches:** never let provider-specific template flags leak to another provider; character and history ownership is in SAP, not in the model. Never auto-forward private local turns to cloud.
- **Local resources:** retain standalone TabbyAPI and WhisperBox. Do not embed their code into this fork.
- **Licenses:** AGPL-3.0 and all upstream attribution retained; evaluate third-party Live2D/model/data rights separately; no unlicensed copied content.
- **High risk:** preserve export/backups and require explicit user choice before changing user data formats, cloud-sharing behavior, permissions or production auto-update channels.

## Meaning of user commands

- `commit` or `push`: source-only commit to the fork, no generated distributable.
- `build`: verify the requested commit, build a Windows x64 distributable from source, package a downloadable ZIP and report SHA-256, smoke-check result and packaging method; if build tools/runtime are unavailable, say so and use a verified Windows GitHub Actions artifact if possible. Never provide a fake ZIP or label source code as a built app.
- A request for a plan/review does not imply a build.
- User's existing completed WhisperBox repository is out of scope unless integration needs require its documented API.

## Documentation discipline

- CHANGE_LEDGER.md is append-only; errors get explicit correction entries rather than history rewriting.
- GitHub diff, commit SHA and upstream SHA are canonical for byte-level auditing.
- Retired code or hidden controls should be described precisely; no "cleanup" claims without tested removal.
- Tests and changes have separate statuses: *planned*, *implemented*, *code-reviewed*, *automated-tested*, *Windows-tested*, *packaged*.

## Code preservation

Honor the user's prior code preferences: retain comments/headers and familiar formatting, show complete relevant revised sections in discussion, explain every meaningful code change, don't insert unmentioned unrelated changes. Do not use diff +/- markers as a substitute for complete code when user requests code. This project targets current SAP stack; legacy Blender 2.79/Python 3.5 restrictions apply only when editing the user's separate Blender scripts.
