# Architecture decisions (append-only)

## AD-001 — Use SAP as initial base (2026-11-26)
**Decision:** Retain SAP as companion frontend/chat/character core and OpenClaw integration point, rather than immediately substituting AIRI or Hermes Agent. **Why:** existing working SAP install, broad roleplay/voice/avatar/tool infrastructure. **Reconsider if:** character reliability, memory, UI maintainability or ACPX compatibility fails. **Status:** accepted approach, ACPX integration not yet Windows-verified.

## AD-002 — Maintain upstream-reference main (2026-11-26)
**Decision:** Use fork `main` as clean original/upstream comparison and `agent-creation` as active development. Preserve exact SHA and append-only change ledger. **Why:** reversibility and future upstream patches. **Status:** branch created; no implementation changes yet.

## AD-003 — English-first without mass deletion (2026-11-26)
**Decision:** Replace English user-facing/model-facing default text; identify China-only app/media integrations for dependency-audited removal. Hide potentially useful out-of-scope features in the meantime. **Why:** avoid prompt contamination and GUI clutter without losing working capabilities. **Status:** requirements documented; implementation pending.

## AD-004 — One persona, multiple models with privacy gate (2026-11-26)
**Decision:** Store character rules/history in SAP separate from Qwen and OpenRouter. Cloud provider switches require explicit consent for history/memory being sent, not merely a model dropdown change. **Why:** consistent identity and local-private data security. **Status:** design requirement; implementation pending.

## AD-005 — Keep external components separate (2026-11-26)
**Decision:** TabbyAPI and independently maintained WhisperBox remain separate processes/APIs. Reuse SAP speech/vision/avatar code where adequate. **Why:** maintenance isolation, resource control and established workflows. **Status:** architectural decision.

## AD-006 — Only produce binaries on "build" (2026-11-26)
**Decision:** Source commits and builds are separate events. A build must be a verifiable Windows x64 application ZIP, not source-only. **Status:** release policy documented; pipeline changes pending.
