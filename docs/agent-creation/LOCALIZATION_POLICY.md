# English-first localization and region-platform audit policy

## Required outcome

No native Chinese language text in the end-user product's default interface, prompts, sample content, menus, errors, tool descriptions, status messages, documentation or onboarding. English should be natural and technically accurate, not literal awkward machine translation. The application should not send hidden Chinese instructions to a model.

This is a **target, not an assertion that the current fork satisfies it**. At bootstrap most upstream files remain untouched and Chinese content still exists.

## Workstreams

1. Default interface and saved settings: set en-US as first-run language; inspect migration of existing settings, browser language detection, profile overrides and Electron state.
2. User interface: scan static/index.html, static/chat.html, other HTML, static/js/*.js, CSS-visible pseudo-content, templates, aria labels, tooltip strings, dialogs and fallback literals.
3. Localization: examine static/js/locales/en-US.js and all fallback paths. Avoid deleting other languages' support before confirming dependencies; prevent zh-CN fallback for missing English strings.
4. Model-facing text: audit server.py, py/*.py, config/settings_template.json, prompts embedded in skills/extensions, character cards, default memories, worldbook, TTS/ASR instructions, tool calls and system reminders. Replace with good English while preserving meaning and control semantics.
5. Documentation/build/support: README files, AGENTS.md, .github workflows, batch scripts, troubleshooting text, defaults, package metadata, error and release descriptions.
6. Regions/providers: inventory API domains, preconfigured endpoints, account bindings, media/social bots, embedded links, artwork and locale-specific content; classify retain/hide/remove rather than blanket deleting.
7. Persisted data: existing user's manually authored Chinese/other-language character text must NEVER be silently rewritten; migration affects packaged defaults only. Allow user-authored multilingual chat and imported cards.

## Guardrails

- Chinese-language source code comments should be translated into meaningful English with preserved technical intent; no changes to algorithms just to change comments.
- CJK Unicode detection is a coarse inventory tool, **not** a trustworthy Chinese-language detector: Japanese may use Han characters, and copied user data may contain Chinese text intentionally.
- Never translate JSON keys, database columns, API field names, module import paths, executable filenames, protocol constants, model IDs, environment variable names, Unicode examples used by tests, copyright notices or third-party license wording without a migration/dependency strategy.
- Replace localized platform-specific defaults (e.g. Chinese wake words) with neutral English examples and verify the recognition models support them.
- Remove third-party platform adapters only after checking initialization, imported symbols, UI routes, settings and tests. Hide safely when uncertain.
- Keep all localization work documented per file, exact prior text/category, replacement category, affected flow and test method. Raw old strings can be inspected in immutable upstream Git diff.
- Explicitly distinguish **upstream legacy unchanged**, **translated**, **hidden**, **removed**, **verified clean** for each area.

## Acceptance checks

- Fresh profile: no Chinese on start, chat, character editor, model settings, vision, microphone/TTS controls, error dialogs, advanced settings, help/tooltips and build logs directed at end users.
- Prompt trace: the request sent to TabbyAPI/OpenRouter contains only deliberately selected English character/system instructions and English tool descriptions; no Chinese internal reminders.
- Model-output test: simple roleplay does not reference Chinese defaults or leak reasoning.
- Missing-string test: absent English keys do not fall back to Chinese.
- Windows build test: onboarding, desktop shortcuts, dialogs, setup and updater messages are English.
- Remaining CJK inventory is reviewed and annotated, not automatically discarded.
