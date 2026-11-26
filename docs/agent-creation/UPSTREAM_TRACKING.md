# Provenance, branches and upstream sync

- Source: https://github.com/heshengtao/super-agent-party
- User fork: https://github.com/Blaco/super-agent-party
- License: AGPL-3.0. Keep upstream copyright and third-party notices.
- Exact starting upstream and fork main SHA: `3aac964122415fe289a1b8af1000474b397c916b`.
- Starting Git tree SHA: `83f706935e3b7ee98aef6fdd3f1091b43068a2ee`.
- Baseline capture date: 2026-11-26.
- Development branch: `agent-creation` — all fork-specific changes.
- Comparison branch: `main` — preserve as clean upstream reference until an explicit sync.
- Remote aliases on local checkouts: `origin` = Blaco; `upstream` = heshengtao.

Recommended local setup (PowerShell):

```powershell
git clone https://github.com/Blaco/super-agent-party.git D:\AI\AgentCreation\SAP-Companion
Set-Location D:\AI\AgentCreation\SAP-Companion
git remote add upstream https://github.com/heshengtao/super-agent-party.git
git fetch origin
git fetch upstream
git switch agent-creation
```

Suggested comparisons:

```powershell
git diff 3aac964122415fe289a1b8af1000474b397c916b..agent-creation --stat
git diff 3aac964122415fe289a1b8af1000474b397c916b..agent-creation -- path/to/file
git log --oneline --decorate 3aac964122415fe289a1b8af1000474b397c916b..agent-creation
git diff upstream/main...agent-creation --stat
```

Before syncing upstream: record the old and new upstream SHAs, perform an impact assessment (prompt paths, deleted platforms, languages, settings defaults, permissions, packaging), merge or cherry-pick intentionally, run regression tests, and append a CHANGE_LEDGER entry. Do not auto-merge upstream into custom code or force-update a branch to a divergent history.

Source file snapshots need not be duplicated because Git already retains exact historical bytes. The change ledger maps each altered function/setting back to upstream paths and tests.

**First baseline check:** fork main and upstream main had the same SHA; no SAP application code changes are included in the documentation-bootstrap revision.
