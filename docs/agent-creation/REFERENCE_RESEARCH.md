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
