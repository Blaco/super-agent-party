# Project charter

## Mission

Produce a privacy-respecting, low-latency, Windows-first animated AI character companion by adapting existing SAP rather than writing an agent/companion stack from scratch. The primary product is character continuity and natural interaction, not a generic task console.

## Priority order

P0. Local Qwen (Qwen3.8-27B Uncensored EXL3 ~4 BPW) via independently running TabbyAPI. SAP manages chat, sampler/UI, character definitions and conversation. No visible reasoning in natural roleplay; measure time-to-first-token, tokens/second and characterization quality.

P1. Accurate SillyTavern-style cards, worldbook activation and long-term episodic/relationship memory. One authoritative persona stored outside model provider selection; roleplay and dialogue examples are stable across models.

P2. Optional OpenRouter and equivalent cloud models, including Kimi/DeepSeek; preserve character instructions and visible conversation where expressly authorized. Never silently upload private local history, memory, files, screenshots or sensitive tool results.

P3. Two-way speech. ASR using SAP-native SenseVoice/sherpa-onnx initially or optional local Silero + Whisper alternative after benchmarking. TTS with a chosen cloned voice via standalone WhisperBox/Chatterbox HTTP backend or evaluated SAP-native TTS. Low latency, streaming/sentence chunking, barge-in and interruption.

P4. Desktop companion with VRM/THA/Live2D, consistent expressions/lip-sync, correct async speech-state events, desktop presence and window management. Preserve original renderers until measured alternatives justify replacing them.

P5. OpenClaw through SAP's existing ACPX/ACP integration for explicitly authorized tools, desktop operations, automation, and delegated cloud task models. The integration is not considered tested until proven on Windows. Preserve agent permissions and task history isolation.

## Intended environment and separations

- Windows 10/11; NVIDIA RTX 3090 24 GB VRAM and ample RAM; PowerShell; local projects under D:\AI.
- TabbyAPI remains an external inference server launched silently (TabbyTray managed separately), with GPU/model-loading settings configured once. SAP owns conversational settings where possible.
- WhisperBox remains a separately released, independently maintained standalone GUI/API project, consumed via HTTP if used.
- SAP is the character/chat front-end and orchestration surface. OpenClaw remains an external agent worker; cloud provider is optional and opt-in.
- Future character data, lorebooks and relationship memory must have explicit schema, backups, migration, export and independent lifecycle from model selections.

## Privacy and trust boundaries

- Local-only is default. No implicit cloud fallback or provider switching.
- Cloud requests must declare destination, conversation span, memory entries, attachments, screenshots, and whether data can be retained by provider; allow explicit user scope selection.
- Maintain separate private companion history and agent/task history. Subagents receive only the minimum authorized task context.
- Never transmit credentials/secrets or full personal memories as generic tool context.
- Prevent Chinese/inherited system prompts from appearing in requests; no silent replacement with similarly biased English prompts.

## Criteria for a successful companion

- Natural, stable, in-character replies after thousands of turns with predictable context compression.
- Measured latency that supports back-and-forth speech.
- Model switching without character redefinition and without surprise data egress.
- Recoverable memory, transparent permissions, and deterministic behavior when features are disabled.
- A simplified interface exposing all character, model, privacy, speech, avatar and future agent settings without unrelated UI clutter.

## Non-goals (at this stage)

Livestreaming, gaming integrations, public media channels, social chatbots and multi-agent parties are not priorities. Preserve reversible code paths where low-cost and safe; remove China-only external platform integrations once dependency audit proves it is safe.
