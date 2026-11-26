# Agent Creation

**Windows-first, local-first AI character companion and agent orchestration fork.**

This project adapts [Super Agent Party](https://github.com/heshengtao/super-agent-party) for an English-only interface, predictable local inference, persistent character continuity, voice interaction, and explicitly authorized tools. It is developed on the [`agent-creation` branch](https://github.com/Blaco/super-agent-party/tree/agent-creation).

**Development status:** This is an active fork, not a finished release. The interface and several core prompts have been localized; parts of the inherited backend still require translation and integration testing. A successful source audit does not establish that every feature works in a packaged application.

## Project priorities

1. **Local inference:** connect an independently running TabbyAPI server to a local Qwen model using its OpenAI-compatible endpoint. Keep the model runtime separate from the desktop application.
2. **Character continuity:** retain character cards, dialogue examples, worldbooks, episodic/relationship memory and chat history across model changes.
3. **Voice:** keep SAP-native ASR/TTS options available for evaluation. Integrate the independently maintained [WhisperBox](https://github.com/Blaco/whisperbox) HTTP backend when validated, without incorporating its standalone GUI into this repository.
4. **Avatar and desktop presence:** preserve VRM, THA/2D character support, lip sync, expression tags, desktop overlays and window modes.
5. **Optional agent delegation:** maintain explicit tool permissions and OpenClaw's ACPX/ACP integration. Task history and private character context must remain separate.
6. **Optional providers:** OpenRouter and other cloud inference services remain user-configurable. There must be no silent cloud fallback, hidden upload or unexpected provider switch.

Discord, Telegram and Slack messaging, and YouTube/Twitch streaming, remain optional adjacent features. They are not the product's primary interface. Chinese-only messaging/livestream adapters have been removed from the active runtime; legacy source references may remain while the audit continues.

## Platform and prerequisites

The supported development target is **Windows 10/11 x64**, with **Python 3.12**, **Node.js 22**, **uv**, and Git. Local GPU inference is a separate service, not bundled into the installer. Windows voice/VRM/desktop tests must be performed with appropriate audio/GPU drivers.

Run these commands in PowerShell from the checkout:

```powershell
git clone https://github.com/Blaco/super-agent-party.git
Set-Location super-agent-party
git switch agent-creation
uv sync --python 3.12
npm ci
npm test
npm start
```

`npm test` is a static smoke check; it does not validate chat, sound, GPU inference, agents, or first launch. If `npm ci` fails while downloading Electron, retry after confirming connectivity to the official Electron GitHub release distribution. Do not redirect dependency installs to unverified mirrors.

### Development packaging

The branch's [Windows x64 development workflow](.github/workflows/build.yml) attempts to package a PyInstaller Python backend and an unpacked Electron desktop app into a ZIP. It uploads the ZIP, SHA-256 checksum and embedded build manifest as a short-lived GitHub Actions artifact when successful. This is **not** a signed installer or a published release.

The workflow is deliberately read-only and has no release/tag publishing privileges. Its output is a testing snapshot. Treat it as experimental until clean-profile and existing-profile launch, settings persistence, TabbyAPI chat, card import, TTS, and permitted agent actions are exercised on Windows.

## Repository areas

| Path | Purpose |
| --- | --- |
| `server.py`, `py/` | FastAPI orchestration, companion/chat/agent backends, tools, memory and optional services |
| `main.js`, `static/` | Electron shell, Vue UI, avatars and desktop windows |
| `config/settings_template.json` | Packaged default settings and model/voice configuration |
| `docs/agent-creation/` | Architecture charter, feature matrix, localization policy, change ledger and test protocol |
| `tests/`, `scripts/` | Source tests, invariants, smoke and localization inventories |
| `.github/workflows/` | English source audit and contained Windows build |

Read [the project charter](docs/agent-creation/PROJECT_CHARTER.md) and [current status](docs/agent-creation/CURRENT_STATUS.md) before changing character semantics or agent permissions. See [the change ledger](docs/agent-creation/CHANGE_LEDGER.md) for the exact source edits, risks and rollback points.

## Localization and compatibility

The shipped UI language is English. Speech recognition, foreign-language character content and imported cards are separate from UI localization; **user-authored data is never automatically translated**. Old settings may contain obsolete platform keys, which are ignored rather than destructively migrated. Keep backups before switching from an existing upstream installation.

Region-specific social services and model mirrors are not supported in this fork. Automatic application updates are disabled until a trustworthy fork-owned update channel has been verified.

## License and attribution

Copyright and upstream authorship are retained in Git history and legal notices. This fork is distributed under the **[GNU Affero General Public License v3](LICENSE)**, subject to all applicable upstream and [third-party licenses](LICENSE-third-party). It is based on [Super Agent Party by Heshengtao and contributors](https://github.com/heshengtao/super-agent-party).

The new project name and English-only interface do not remove the legal obligations or historical origin of the source.
