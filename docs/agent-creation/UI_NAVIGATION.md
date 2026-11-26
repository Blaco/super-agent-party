# Companion navigation — first pass

The fork retains all original SAP pages and backend routes in this iteration.

## Main sidebar (default)

Always visible:
- Chat
- Model Configuration
- Toolkit (agent tools, web search, knowledge, CLI, computer and browser control, MCP, A2A)
- Role (character cards, affection, diary, vision, autonomous behaviors, voice, appearance)
- AI Browser on Electron desktop
- Storage
- System Settings
- About

Initially hidden behind **Additional features**:
- Dashboard
- Bot Deployment (social/streaming)
- API Publishing and other development interfaces
- Role > Stickers
- Model > Text-to-Image
- Toolkit > Home Assistant, SQL, ComfyUI, Custom HTTP

Select the **Additional features** button beneath the main sidebar menu to show hidden entries. When the sidebar is collapsed, the button shows an ellipsis icon and an English tooltip. Select **Hide additional features** to return to the focused navigation.

The toggle controls only visibility during the current session; it neither disables back-end services nor modifies user settings. If hiding while an optional page is selected, the app returns to the nearest visible page.

## Not yet implemented

- No redesigned layout or visual quality testing on Windows.
- No deletion or disabling of China-specific integrations or background services.
- No comprehensive English text conversion beyond the separately tracked startup/chat changes.
- No persistence of the optional-navigation display preference.
- No model privacy gate or TabbyAPI autostart integration.

These are tracked separately to avoid presenting a hidden control as a disabled or removed capability.
