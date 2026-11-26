# Build, test, release and artifact protocol

## Command meanings

- **push / commit:** make and verify a source commit on `agent-creation` in the user's fork. No ZIP is expected.
- **build:** create a Windows x64 distributable ZIP from *the requested branch commit*, not a source archive renamed as an application. Include hashes, manifest, and actual validation results.

## Build prerequisites and upstream cautions

- Upstream `package.json` version was v0.4.3 and `npm run build:win` invokes electron-builder.
- Python backend is packed with PyInstaller using `server.spec` and Python 3.12/uv; Electron bundling expects `dist/server`.
- Upstream `.github/workflows/build.yml` builds on Windows runners, but also contains tag/release publishing paths and non-English labels. Its workflow must be audited and adapted to the fork **before** release automation.
- Upstream `package.json` build.publish points to `heshengtao/super-agent-party`; rewrite/disable publishing before enabling a fork build pipeline. Never publish to upstream.
- A Windows installer is not the same thing as a portable ZIP. Agree on portable unpacked output vs installer-inside-ZIP; default goal is a working Windows x64 package that the user can extract/run without manual compilation, if dependencies allow.
- Windows build should be run on Windows environment or a verified Windows GitHub Actions runner. A Linux shell ZIP of the source is **not** an acceptable build.

## Checks before each source commit

- Review complete diff, character prompt assembly, privacy route, tool permissions and old configuration compatibility.
- Run existing `npm test` (currently `node scripts/smoke-check.js`) if dependencies and files permit.
- Python: syntax checking of changed modules and targeted tests; do not assume smoke-check exercises the full backend.
- JavaScript/UI: check syntax in changed files, verify frontend can load, exercise navigation and chat, test disabled feature state.
- Language: inspect model-facing prompt trace, UI/defaults and the localization audit for each changed area.
- Verify no credentials, personal logs, chat transcripts, voice samples or proprietary model files are committed.
- Record failures, skipped checks and environment limitations in CHANGE_LEDGER.md.

## Checks for requested Windows build

1. Resolve exact commit SHA and record it in artifact manifest.
2. Build Python server and Electron application using a pinned dependency state; record Windows runner or machine configuration.
3. Exercise first launch with a clean profile and an existing profile; validate TabbyAPI provider connectivity, character import, chat streaming, settings persistence and quit/restart.
4. Test UI language, model-switch consent, secrets handling, network behavior and runtime error dialogs.
5. Produce ZIP, compute SHA-256, include `BUILD-MANIFEST.txt` with commit/time/toolchain/dependencies/known limitations.
6. Provide real downloadable artifact or verified GitHub Actions artifact link. If the build cannot be completed or verified, state precisely why; do not invent results.
7. Only create a release/tag or overwrite a user-facing artifact when separately authorized by the user.

No release pipeline has been enabled by the documentation bootstrap.
