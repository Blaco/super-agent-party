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
