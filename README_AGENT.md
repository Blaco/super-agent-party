# Agent Creation — installation guidance

This document describes the fork's supported source and development artifact installation process. Do not substitute installation instructions from the upstream application or regional mirror services.

## Source of truth

- Current fork: https://github.com/Blaco/super-agent-party/tree/agent-creation
- Development workflows: `.github/workflows/build.yml` and `.github/workflows/companion-audit.yml`
- Architecture and constraints: `docs/agent-creation/PROJECT_CHARTER.md`
- Feature/build status: `docs/agent-creation/CURRENT_STATUS.md` and `docs/agent-creation/RELEASE_AND_TEST.md`

Do not invent download URLs or claim a successful build without checking the corresponding GitHub Actions run and artifact. A source ZIP is not a runnable Windows application package.

## Supported environment

The primary development environment is Windows 10/11 x64, PowerShell, Python 3.12, Node.js 22, uv and Git. Optional local Qwen inference requires a separately running TabbyAPI server. WhisperBox is a separately maintained application/service and should only be integrated through its HTTP API when tested.

## Source setup

```powershell
git clone https://github.com/Blaco/super-agent-party.git
Set-Location super-agent-party
git switch agent-creation
uv sync --python 3.12
npm ci
npm test
npm start
```

The inherited root `npm start` script starts the desktop development environment. The app itself does not download local Qwen model weights, select hidden inference endpoints or enable cloud routing automatically.

## Build validation

Use the fork's Windows x64 workflow for PyInstaller + Electron directory packaging, SHA-256 verification and a development artifact. Before calling a build usable, check that the Python server, Electron directory and manifest were produced, that an application process can launch from the unpacked directory, and that at least one chat request succeeds against the expected local API. GUI startup, model inference and voice were not covered by the source-only CI checks.

The workflow never publishes a public release or tags the repository.

## Configuration and safety

Use the application's visible provider settings to enter a local TabbyAPI OpenAI-compatible address. Provider credentials, character information, memory and personal files must not be copied into the source repository or exposed to outside services without explicit approval. Do not silently replace a local provider with OpenRouter or another cloud backend.

User-authored and imported multilingual content is preserved. The user-facing application chrome and packaged system defaults are English.

## Troubleshooting

If Electron fails to download during `npm ci`, verify access to the official GitHub Electron release CDN and retry. If `uv sync` fails, check that Windows Python 3.12 is selected. If packaging succeeds but chat does not, validate the external model API endpoint independently and inspect the local FastAPI and Electron logs. Never publish secrets or full chat histories in issue reports.

## License

The source remains subject to AGPLv3 and applicable original/third-party notices. See `LICENSE`, `LICENSE-third-party`, and the original upstream project attribution in the root README.
