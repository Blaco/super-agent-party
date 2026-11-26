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
