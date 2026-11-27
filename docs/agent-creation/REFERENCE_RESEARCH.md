# Research log — pinned reference implementations

Read these codebases before developing corresponding functionality. The linked source commits make findings reproducible. Initial observations below are from repository metadata and README/documentation inspection, **not completed functional integration tests**.

| Repo | Pin on 2026-11-26 | License | Candidate lessons | Constraints |
|---|---|---|---|---|
| [waifuai/hermes-waifu](https://github.com/waifuai/hermes-waifu) | `173bd90f15f0de9ddf5cb172f6df5939b34b5ad5` | MIT-0 (code) | Isolated Live2D renderer, explicit live-session binding, lifecycle hooks, read-only state, controlled asset fetching | Separate Live2D/core/model licensing; many imported models lack clear rights |
| [waifuai/waifu-companion](https://github.com/waifuai/waifu-companion) | `85923c00433d24ffe673cae35cb9c50f55dc105b` | MIT-0 (code) | OpenRouter switching/fallback UI, streaming text, character settings, short-term memory summarization, TTS preloading, Web Speech API | Browser-first architecture; feature claims require runtime validation; third-party voices/Live2D have separate rights |
| [moeru-ai/airi](https://github.com/moeru-ai/airi) | `894f7913a6d2a68c0ab4285fc2a97f119f8a6546` | MIT | VRM/Live2D desktop/avatar composition, streamed speech, event/state propagation, desktop presentation, modular providers | Large evolving project; choose patterns not framework transplant |
| [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) | `c925e8bbc4db34232dd8ecbe2dd31b70af6b33c0` | MIT | Task permissions, tool isolation, durable memory, delegated sessions, provider routing, native Windows experience | Reference only; OpenClaw remains selected agent backend unless reevaluation is requested |

## Cross-reference checklist

For each implementation task:
1. Search existing SAP source for working behavior and confirm its current limitations.
2. Inspect relevant reference code at a pinned commit and summarize exact callable interfaces/data format.
3. Check licenses, attribution, assets and network/data flows; no blind copying.
4. Assess whether adapting SAP, a small isolated component or a well-defined external API is preferable.
5. Record accepted/rejected alternatives, benchmark data and regression risks in the ledger.
6. Recheck upstream releases and relevant community discussions before large designs. Distinguish date/revision of research.
7. Prefer a minimal safe patch when measured benefit does not justify replacement.

## Initial conclusions

- `hermes-waifu` explicitly isolates third-party Live2D renderers and exposes only permitted visual state instead of full chat transcripts. That is a useful *privacy architecture reference*, not proof it integrates with SAP.
- `waifu-companion` documents provider switching and TTS preloading. SAP already has modelProviders and TTS logic; evaluate differences before copying.
- AIRI is an alternative architecture/reference for avatar and streaming speech, not a planned replacement for SAP.
- Hermes is a comparison point for agent operations; do not introduce a second task orchestrator without scope review.
- **No source files, character models, thumbnails or binaries have been copied from these projects** in the bootstrap commit.


## 2026-11-26 — Utility localization reference

- Open-Meteo forecast API documentation, https://open-meteo.com/en/docs (reviewed November 26, 2026): WMO weather-code descriptions and automatic timezone handling. Correct inherited mismatched descriptions while keeping the same code values and provider. No reference source code copied.
- 7Timer API documentation, https://7timer.info/doc.php (reviewed November 26, 2026): graphical API uses `lang=en`; retain the existing global weather service, change its default language and keep the existing API call shape. No provider migration or third-party code import.
- Existing SAP at pinned upstream `3aac964122415fe289a1b8af1000474b397c916b` remains the implementation reference for CDP, Node runner, overlay and Docker discovery; this pass translates their text, not their architecture. Provider adapters and character pipeline are not reimplemented from other projects.

## SAP-NG evaluation — 2026-11-26

Reference: [Noromon/super-agent-party-ng](https://github.com/Noromon/super-agent-party-ng), branch main-ng, pinned commit `cfcd88aaeea41b65c3bb42cfa5ee0b453e5364a2`, AGPL-3.0. README claims 807 tests, upstream v0.4.1 basis; test count and suite execution not independently verified. Our base remains the localized v0.4.3 line. Do not merge the fork wholesale: it retains removed regional bots, regional download mirrors, multilingual UI and Chinese model-facing prompt literals.

| Candidate | Inspected reference path | Assessment |
|---|---|---|
| Mermaid security | static/index.html, static/js/renderer.js, static/chat.html | Adopt strict configuration in all three paths; NG leaves chat.html permissive at this pin. Add regression gate. This is not general Markdown/HTML sanitization. |
| Session authentication | py/auth.py, SECURITY.md | High priority. Origin/Host validation, browser session token, machine token and WebSocket authentication are relevant. NG defaults external API to unauthenticated for compatibility; do not copy this default blindly. Audit Electron, local extensions and API clients before changing access behavior. |
| File permission boundaries | py/path_scope.py, tests/test_paths.py | High priority. Inspect canonical path checks, symlinks/junctions, grant scope and approval lifetimes. Do not transplant regional tool mappings or implicit bypass rules. |
| Message-chain normalization | py/context_builder.py | High priority. Central sanitizer is relevant for TabbyAPI/cloud interoperability and interrupted tool calls. Review live v0.4.3 streaming and nonstreaming paths before adapting. |
| Turn persistence | py/turn_log.py | Candidate; inspected shadow append/read implementation, not proof of authoritative ownership across all paths. Requires explicit schema/migration and privacy review; do not write extra private conversation copies silently. |
| Layered prompts | py/prompt_assembly.py | Adopt separation concept, not inherited prompt text. Module contains Chinese instructions and forced reasoning tags incompatible with our natural roleplay requirement. Preserve our English persona and prompt policies. |
| Stream cancellation | py/stream_stop.py | Useful ledger/correlation pattern, but module is IM-specific and defaults to a non-English locale. Adapt only generic cancellation semantics as needed. |
| Windows/bootstrap | README.md | Evaluate encoding and runtime detection fixes individually. Reject regional mirror fallback and unlocked dependency fallback; retain our locked build. |

Review scope: README, SECURITY.md, the named Python modules and test file, and three Mermaid initialization sites. This is an initial source review, not an exhaustive security audit or proof of NG feature functionality. No NG source module or dependency imported. The Mermaid setting is a standard library configuration applied independently across our three existing sites; reference credit retained. Future adaptations must pass the first-party English gate, preserve upstream attribution and be separately tested.

### First targeted storage adaptation

At the same SAP-NG pin, reviewed py/routers/files.py (read/delete containment) and py/auth.py (path_under). Our existing UI lists only top-level uploaded files, so use a separately implemented flat filename validator with canonical containment, link rejection and Windows special-name handling. No NG module copied. Preserve valid ordinary file operations and add unit plus packaged HTTP regression checks.
