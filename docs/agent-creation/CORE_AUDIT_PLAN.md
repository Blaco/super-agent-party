# Core Audit Before Character Work

Begin this audit after the Step 4 patch passes the exact-commit Windows build and the Electron regression tests. Use a disposable profile and harmless fixtures for tool tests. Record each result as passed, failed, or unverified, with the source commit, build checksum, test environment, evidence, and any known scope limits.

## Audit sequence

1. **Release and source integrity.** Rebuild from the locked dependencies, run the first-party English audit, verify the ZIP checksum, and compare every retained feature against the feature matrix and change ledger. Check clean start, upgrade with an older profile, restart, and graceful shutdown.
2. **Session and permission boundaries.** Inventory HTTP routes, WebSockets, Electron IPC, child processes, extension bridges and provider connections. Check unauthenticated rejection, authenticated access, origin and host validation, isolation between profiles, credential handling, expired and duplicate approvals, cancellation, and file scope. Review every permission mode and internal client. Exercise browser, extension and external API workflows separately.
3. **Core conversation pipeline.** Verify provider setup, streaming and nonstreaming, errors, reconnect, cancellation, saved conversations, context boundaries, complete tool-call groups, and restart. Run the same synthetic transcript through direct TabbyAPI and Electron so model behavior can be distinguished from renderer and backend behavior.
4. **Retained feature coverage.** Smoke-test the desktop and browser surfaces, settings, uploads, knowledge base, scheduling, tools, audio entry points, avatars, and configured integrations. Record the intended local-only policy and any compatible authenticated replacement for an existing workflow. Use fixtures for unconfigured services and record live verification separately.
5. **Accept the baseline.** Resolve core security defects and regressions in retained flows. Track optional or environment-specific checks openly. Pin a build, profile configuration, model ID, chat template and reproducible test transcript before changing persona or memory. Repeat this known baseline when investigating character behavior.

## Step 4 build acceptance

- A valid, denied, expired, or repeated approval has an explicit outcome. Only the exact pending action may dispatch, once.
- Both streaming and nonstreaming return every tool result under its original call ID.
- The packaged renderer connects with its session. Anonymous and cross-origin access to private routes is rejected.
- Electron resumes the original conversation after approval and denial with no duplicate tool execution. The successful build and test evidence refer to the same source commit.

