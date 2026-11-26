# Initial source audit baseline — 2026-11-26

Source repository: `Blaco/super-agent-party` branch `agent-creation` at commit `290eeca71f23b06c3673624c3d94b05a8c5bd8a9`.

GitHub Actions run: https://github.com/Blaco/super-agent-party/actions/runs/45897427966

## Automated checks observed

- Workflow: `Agent Creation — source audit`.
- Result: **success**.
- Existing SAP `npm test`: **passed** (JSON parsed, designated JavaScript files syntax-checked).
- Read-only `scripts/audit_english_surface.py`: **passed**.
- Files inspected as text: **194**.
- Lines flagged for Han-codepoint occurrence: **16,793**.
- Lines flagged for region-platform names: **378**.
- Unreadable files: **0**.
- Categories of all findings: interface **8,026**, backend **5,511**, locale **2,041**, documentation **931**, other **499**, model-facing candidates **85**.
- A machine-readable JSON inventory is attached to the workflow run for a limited retention period (14 days).

## Interpretation and limits

These numbers represent matching source *lines*, not unique translated words, actionable defects or affected runtime paths. A source line may be counted in more than one signal group. Han code points also occur in Japanese and multilingual tests; this script intentionally does not classify Chinese linguistically. The rough categorization is not a complete inventory of every model-facing prompt.

The script excludes compiled binaries and selected vendored/resource directories including `static/libs`, `static/source`, `static/fontawesome`, `node_modules`, `vrm`, `tha_models`, `doc`, `dist` and `release`. Its baseline is not a claim that excluded files are clean.

**Interpretation for work planning:** a full English-only conversion will require systematic source review rather than just changing `currentLanguage` or the default character system prompt.

## Immediate prioritization

1. Confirm defaults and English locale fallback; audit what a new profile and existing profile actually see.
2. Trace model-facing prompt assembly paths (system prompts, lore, tools, ASR, TTS, memory, reasoning) and remove inherited Chinese default instructions.
3. Simplify menus with reversibly hidden optional modules.
4. Trace and remove dedicated China-specific service/platform adapters, checking import, route, UI and saved-settings compatibility.
5. Translate support text, tooltips, documentation, workflow labels and packaging; remove leftover unused language-specific assets after a dependency audit.
6. Re-run the same inventory plus actual Windows UI and model-prompt tests, and compare changes against this starting count.

**Runtime application behavior is still upstream-equivalent at this point.**
