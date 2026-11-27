"""Unified shortcut commands module.

This is the single source of truth for backend shortcut commands.

- The backend injection pipeline (server.py: tools_change_messages) uses is_shortcuts_enabled().
- Telegram, Discord and Slack use parse_im_action() and build_help_text()
  for shared control commands.
- The web shortcut catalog is mirrored in static/js/vue_data.js under shortcutCommands,
  with descriptions in the English locale. Keep it aligned with COMMAND_SPECS.

Messaging clients intercept control commands; skill and memory injection
(/<skill>, #memory) and frontend file references (@path) use the normal message
pipeline and require a workspace path.
The lang argument is retained for caller compatibility; replies are always English.
"""

# ==================== Command catalog (single source of truth) ====================
# scope: web | im | both | workspace
# kind:  control | inject | info
COMMAND_SPECS = [
    {
        "id": "help",
        "syntax": "/help",
        "aliases": ["/help", "/?"],
        "scope": "both",
        "kind": "control",
        "label_en": "Help",
        "desc_en": "List all available shortcut commands.",
    },
    {
        "id": "new",
        "syntax": "/new",
        "aliases": ["/new", "/reset", "/restart"],
        "scope": "both",
        "kind": "control",
        "label_en": "New conversation",
        "desc_en": "Clear the current conversation and start fresh.",
    },
    {
        "id": "stop",
        "syntax": "/stop",
        "aliases": ["/stop"],
        "scope": "both",
        "kind": "control",
        "label_en": "Stop",
        "desc_en": "Stop the response that is currently being generated.",
    },
    {
        "id": "retry",
        "syntax": "/retry",
        "aliases": ["/retry"],
        "scope": "web",
        "kind": "control",
        "label_en": "Retry",
        "desc_en": "Regenerate the last reply (chat UI only).",
    },
    {
        "id": "model",
        "syntax": "/model [provider:model]",
        "aliases": ["/model"],
        "scope": "both",
        "kind": "control",
        "label_en": "Model",
        "desc_en": "Show the current model and available list; IM shows only, switch in the chat UI.",
    },
    {
        "id": "personality",
        "syntax": "/personality [name]",
        "aliases": ["/personality", "/persona"],
        "scope": "both",
        "kind": "control",
        "label_en": "Personality",
        "desc_en": "Show the current personality and character cards; IM shows only, switch in the chat UI.",
    },
    {
        "id": "skills",
        "syntax": "/skills",
        "aliases": ["/skills"],
        "scope": "both",
        "kind": "control",
        "label_en": "Skills",
        "desc_en": "Browse the list of available skills.",
    },
    {
        "id": "id",
        "syntax": "/id",
        "aliases": ["/id"],
        "scope": "im",
        "kind": "info",
        "label_en": "Session ID",
        "desc_en": "Show the current session/channel ChatID (for proactive push config).",
    },
    {
        "id": "sub",
        "syntax": "/sub",
        "aliases": ["/sub"],
        "scope": "im",
        "kind": "control",
        "label_en": "Subscribe",
        "desc_en": "Add the current session to the proactive message list.",
    },
    {
        "id": "unsub",
        "syntax": "/unsub",
        "aliases": ["/unsub"],
        "scope": "im",
        "kind": "control",
        "label_en": "Unsubscribe",
        "desc_en": "Remove the current session from the proactive message list.",
    },
    {
        "id": "mode_plan",
        "syntax": "/plan",
        "aliases": ["/plan"],
        "scope": "both",
        "kind": "mode",
        "requiresCli": True,
        "label_en": "Plan mode",
        "desc_en": "Switch to plan mode (read-only, plan before acting).",
    },
    {
        "id": "mode_read",
        "syntax": "/read",
        "aliases": ["/read"],
        "scope": "both",
        "kind": "mode",
        "requiresCli": True,
        "label_en": "Read mode",
        "desc_en": "Switch to default read-only mode (confirm each action).",
    },
    {
        "id": "mode_edit",
        "syntax": "/edit",
        "aliases": ["/edit"],
        "scope": "both",
        "kind": "mode",
        "requiresCli": True,
        "label_en": "Edit mode",
        "desc_en": "Switch to accept-edits mode (allow writes, deny destructive ops).",
    },
    {
        "id": "mode_yolo",
        "syntax": "/yolo",
        "aliases": ["/yolo"],
        "scope": "both",
        "kind": "mode",
        "requiresCli": True,
        "label_en": "Yolo mode",
        "desc_en": "Switch to Yolo mode (full autonomy, no confirmation).",
    },
    {
        "id": "mode_cowork",
        "syntax": "/cowork",
        "aliases": ["/cowork"],
        "scope": "both",
        "kind": "mode",
        "requiresCli": True,
        "label_en": "Cowork mode",
        "desc_en": "Switch to cowork mode (sub-agent collaboration).",
    },
    {
        "id": "mode_goal",
        "syntax": "/goal",
        "aliases": ["/goal"],
        "scope": "both",
        "kind": "mode",
        "requiresCli": True,
        "label_en": "Goal mode",
        "desc_en": "Switch to goal mode (autonomous loop until done).",
    },
    {
        "id": "skill",
        "syntax": "/<skill-name>",
        "aliases": [],
        "scope": "both",
        "kind": "inject",
        "requiresCli": True,
        "label_en": "Inject skill",
        "desc_en": "Type / + a skill name to inject that skill (requires CLI control + workspace).",
    },
    {
        "id": "memory",
        "syntax": "#<text>",
        "aliases": [],
        "scope": "both",
        "kind": "inject",
        "requiresCli": True,
        "label_en": "Save memory",
        "desc_en": "Start with # to save workspace memory (requires CLI control + workspace).",
    },
    {
        "id": "file",
        "syntax": "@<path>",
        "aliases": [],
        "scope": "web",
        "kind": "inject",
        "requiresCli": True,
        "label_en": "File reference",
        "desc_en": "Start with @ to reference a workspace file (requires CLI control + workspace).",
    },
]

# ==================== IM control command aliases ====================
_STOP_ALIASES = {"/stop"}
_RESET_ALIASES = {"/new", "/reset", "/restart"}
_HELP_ALIASES = {"/help", "/?"}
_SKILLS_ALIASES = {"/skills"}
_MODEL_ALIASES = {"/model"}
_PERSONALITY_ALIASES = {"/personality", "/persona"}
_RETRY_ALIASES = {"/retry"}
_SUB_ALIASES = {"/sub"}
_UNSUB_ALIASES = {"/unsub"}

# Platform -> bot configuration key for reading and writing behaviorTargetChatIds.
# Only retained platforms supporting proactive messages are included.
PLATFORM_CONFIG_KEY = {
    "telegram": "telegramBotConfig",
    "discord": "discordBotConfig",
    "slack": "slackBotConfig",
}

# Mode commands -> permissionMode values (requires computer CLI control)
MODE_COMMAND_MAP = {
    "/plan": "plan",
    "/read": "default",
    "/edit": "auto-approve",
    "/yolo": "yolo",
    "/cowork": "cowork",
    "/goal": "goal",
}
_MODE_ALIASES = set(MODE_COMMAND_MAP)

# Shared reply text
STOP_MSG_EN = "Stopped current output."
RESET_MSG_EN = "Conversation history has been reset."


def is_shortcuts_enabled(settings) -> bool:
    """Read the global shortcut switch, enabled by default."""
    try:
        return bool((settings or {}).get("systemSettings", {}).get("enableShortcuts", True))
    except Exception:
        return True


async def im_shortcuts_enabled() -> bool:
    """Read the global shortcut switch asynchronously for messaging clients."""
    try:
        from py.get_setting import load_settings
        settings = await load_settings()
        return is_shortcuts_enabled(settings)
    except Exception:
        return True


def parse_im_action(text):
    """Parse messaging control commands.

    Return stop, reset, help, skills, model, personality, retry, mode or None.
    Match the first token, so "/model gpt-4o" is recognized as model.
    """
    if not text:
        return None
    cmd = text.strip().lower()
    if not cmd.startswith("/"):
        return None
    first = cmd.split()[0]
    if first in _STOP_ALIASES:
        return "stop"
    if first in _RESET_ALIASES:
        return "reset"
    if first in _HELP_ALIASES:
        return "help"
    if first in _SKILLS_ALIASES:
        return "skills"
    if first in _MODEL_ALIASES:
        return "model"
    if first in _PERSONALITY_ALIASES:
        return "personality"
    if first in _RETRY_ALIASES:
        return "retry"
    if first in _MODE_ALIASES:
        return "mode"
    return None


def parse_subscribe_action(text):
    """Parse proactive-message subscription commands.

    Match the first token and return sub, unsub or None.
    """
    if not text:
        return None
    cmd = text.strip().lower()
    if not cmd.startswith("/"):
        return None
    first = cmd.split()[0]
    if first in _SUB_ALIASES:
        return "sub"
    if first in _UNSUB_ALIASES:
        return "unsub"
    return None


def build_help_text(lang="en") -> str:
    """Build the messaging /help reply."""
    title = "Available shortcut commands:"
    lines = [title]
    for spec in COMMAND_SPECS:
        if spec["scope"] not in ("im", "both"):
            continue
        if spec["kind"] == "inject":
            continue
        syntax = spec["syntax"]
        desc = spec["desc_en"]
        aliases = [a for a in spec["aliases"] if a != syntax.split()[0]]
        alias_str = (" (" + " ".join(aliases) + ")") if aliases else ""
        lines.append(f"{syntax}{alias_str} - {desc}")
    return "\n".join(lines)


# ==================== IM information commands (read-only) ====================
async def _load_settings_safe():
    try:
        from py.get_setting import load_settings
        return (await load_settings()) or {}
    except Exception:
        return {}


def _extract_md_field(text, field):
    import re
    m = re.search(r'^\s*' + field + r'\s*:\s*(.+?)\s*$', text, re.M | re.I)
    if m:
        return m.group(1).strip().strip('"\'')
    return None


def _scan_skills_dir(base):
    from pathlib import Path
    out = []
    try:
        base = Path(base)
        if not base.exists():
            return out
        for item in sorted(base.iterdir()):
            if not item.is_dir() or item.name.startswith('.'):
                continue
            name = item.name
            desc = ""
            for fn in ["SKILL.md", "skill.md", "SKILLS.md", "skills.md"]:
                p = item / fn
                if p.exists():
                    try:
                        content = p.read_text(encoding="utf-8", errors="ignore")
                        nm = _extract_md_field(content, "name")
                        ds = _extract_md_field(content, "description")
                        if nm:
                            name = nm
                        if ds:
                            desc = ds
                    except Exception:
                        pass
                    break
            out.append((name, desc))
    except Exception:
        pass
    return out


async def build_skills_text(lang="en"):
    """Build the /skills reply from global and workspace project skills."""
    from pathlib import Path
    skills = {}
    try:
        from py.get_setting import SKILLS_DIR
        for name, desc in _scan_skills_dir(SKILLS_DIR):
            skills[name] = desc
    except Exception:
        pass
    try:
        settings = await _load_settings_safe()
        cwd = (settings.get("CLISettings", {}) or {}).get("cc_path")
        if cwd:
            for name, desc in _scan_skills_dir(Path(cwd) / ".agents" / "skills"):
                skills.setdefault(name, desc)
    except Exception:
        pass
    if not skills:
        return "No skills available."
    lines = ["Available skills:"]
    for name, desc in skills.items():
        lines.append(f"/{name}" + (f" - {desc}" if desc else ""))
    lines.append("(Send /skill-name + your request to use it; requires CLI control + a workspace.)")
    return "\n".join(lines)


def _provider_label(p):
    """Return a copyable vendor/modelId label without surrounding whitespace."""
    vendor = (p.get("vendor") or "").strip()
    mid = (p.get("modelId") or "").strip()
    return (vendor + "/" + mid) if vendor else mid


async def build_model_info_text(lang="en"):
    """Show the current model and available models without changing settings."""
    settings = await _load_settings_safe()
    providers = settings.get("modelProviders", []) or []
    cur_model = settings.get("model") or ""
    sel = settings.get("selectedProvider")
    cur_label = cur_model
    for p in providers:
        if p.get("id") == sel:
            cur_label = _provider_label(p) or cur_model
            break
    lines = ["Current model: " + (cur_label or "not set")]
    listed = []
    for p in providers:
        label = _provider_label(p)
        if not (p.get("modelId") or ""):
            continue
        listed.append("- " + label)
    if listed:
        lines.append("Available models:")
        lines.extend(listed)
    lines.append("(Send /model <name> to switch.)")
    return "\n".join(lines)


async def build_personality_info_text(lang="en"):
    """Show the current personality and available character cards without changing settings."""
    settings = await _load_settings_safe()
    ms = settings.get("memorySettings", {}) or {}
    memories = settings.get("memories", []) or []
    cur = None
    if ms.get("is_memory") and ms.get("selectedMemory"):
        for m in memories:
            if m.get("id") == ms.get("selectedMemory"):
                cur = m.get("name")
                break
    lines = ["Current personality: " + (cur or "none")]
    names = [m.get("name") for m in memories if m.get("name")]
    if names:
        lines.append("Available personalities:")
        lines.extend("- " + n for n in names)
    lines.append("(Send /personality <name> to switch; /personality none to disable.)")
    return "\n".join(lines)


def retry_hint(lang="en"):
    return "Retry is only available in the chat UI."


async def build_mode_info_text(lang="en"):
    """Report the current CLI permission mode and available modes without changing settings."""
    settings = await _load_settings_safe()
    cli = settings.get("CLISettings", {}) or {}
    engine = cli.get("engine", "local")
    key = {"local": "localEnvSettings", "ds": "dsSettings", "acp": "acpSettings"}.get(engine, "localEnvSettings")
    cur = (settings.get(key, {}) or {}).get("permissionMode", "default")
    lines = []
    if not cli.get("enabled"):
        lines.append("⚠ Computer CLI control is not enabled.")
    lines.append("Current mode: " + cur)
    lines.append("Available modes:")
    lines.append("/plan /read /edit /yolo /cowork /goal")
    lines.append("(Requires CLI control; switch in the chat UI.)")
    return "\n".join(lines)


# ==================== IM model/personality commands (change global settings) ====================
_PERSONALITY_OFF = {"none", "off", "disable", "disabled"}


def _command_arg(text):
    parts = (text or "").strip().split(None, 1)
    return parts[1].strip() if len(parts) > 1 else ""


async def _save_and_broadcast(settings):
    from py.get_setting import save_settings
    await save_settings(settings)
    try:
        from py.ws_manager import ws_manager
        await ws_manager.broadcast_settings_update(settings)
    except Exception:
        pass


async def handle_model_command(text, lang="en"):
    """Show model information or switch the global model (ignore spaces; accept vendor/modelId)."""
    arg = _command_arg(text)
    if not arg:
        return await build_model_info_text(lang)
    settings = await _load_settings_safe()
    providers = settings.get("modelProviders", []) or []
    q = arg.lower().replace(" ", "")
    target = None
    for p in providers:
        vendor = (p.get("vendor") or "").lower().replace(" ", "")
        mid = (p.get("modelId") or "").lower().replace(" ", "")
        if q and q in {mid, vendor, vendor + "/" + mid, vendor + ":" + mid}:
            target = p
            break
    if not target:
        for p in providers:
            mid = (p.get("modelId") or "").lower().replace(" ", "")
            if q and mid and q in mid:
                target = p
                break
    if not target:
        return "No matching model: " + arg
    settings["model"] = target.get("modelId", "")
    settings["base_url"] = target.get("url", "")
    settings["api_key"] = target.get("apiKey", "")
    settings["selectedProvider"] = target.get("id")
    await _save_and_broadcast(settings)
    return "Model switched: " + _provider_label(target)


async def handle_personality_command(text, lang="en"):
    """Show personality information or switch/disable the global personality."""
    arg = _command_arg(text)
    if not arg:
        return await build_personality_info_text(lang)
    settings = await _load_settings_safe()
    ms = settings.get("memorySettings", {}) or {}
    if arg.strip().lower() in _PERSONALITY_OFF or arg.strip() in _PERSONALITY_OFF:
        ms["is_memory"] = False
        settings["memorySettings"] = ms
        await _save_and_broadcast(settings)
        return "Personality disabled (none)."
    memories = settings.get("memories", []) or []
    q = arg.lower()
    target = None
    for m in memories:
        if (m.get("name") or "").lower() == q:
            target = m
            break
    if not target:
        for m in memories:
            if q and q in (m.get("name") or "").lower():
                target = m
                break
    if not target:
        return "No matching personality: " + arg
    ms["is_memory"] = True
    ms["selectedMemory"] = target.get("id")
    settings["memorySettings"] = ms
    await _save_and_broadcast(settings)
    return "Personality switched: " + (target.get("name") or "")


# ==================== IM proactive-message subscriptions (/sub, /unsub) ====================
async def handle_subscribe_command(platform, chat_id, subscribe: bool, lang="en"):
    """Add or remove the current chat_id from the platform proactive-message list.

    - Save settings[platform_config_key]["behaviorTargetChatIds"] and broadcast.
    - Update behavior-engine platform_targets without a restart.
    Only platforms in PLATFORM_CONFIG_KEY are supported; otherwise return None.
    """
    chat_id = str(chat_id) if chat_id is not None else ""
    if not chat_id:
        return None
    config_key = PLATFORM_CONFIG_KEY.get(platform)
    if not config_key:
        return None

    settings = await _load_settings_safe()
    bot_cfg = settings.get(config_key, {}) or {}
    targets = list(bot_cfg.get("behaviorTargetChatIds", []) or [])

    if subscribe:
        if chat_id in targets:
            return "ℹ️ This session is already in the proactive message list."
        targets.append(chat_id)
        reply = f"✅ Added this session to the proactive message list:\n`{chat_id}`"
    else:
        if chat_id not in targets:
            return "ℹ️ This session is not in the proactive message list."
        targets = [t for t in targets if t != chat_id]
        reply = f"✅ Removed this session from the proactive message list:\n`{chat_id}`"

    bot_cfg["behaviorTargetChatIds"] = targets
    settings[config_key] = bot_cfg
    await _save_and_broadcast(settings)

    try:
        from py.behavior_engine import global_behavior_engine
        global_behavior_engine.platform_targets[platform] = targets
    except Exception:
        pass

    return reply
