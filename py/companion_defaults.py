"""English-first companion defaults and legacy SAP prompt compatibility.

Do not rewrite user-authored character prompts or saved profile settings.
The hash identifies only the exact unmodified default from upstream
SAP config/settings_template.json at revision 3aac964122415fe289a1b8af1000474b397c916b.
"""
from hashlib import sha256


_LEGACY_GENERIC_PROMPT_SHA256 = "b49d7a54a0a2cd1786c9c160daace5459176ff07c0c3aab80eaf76af3e318c73"


def resolve_generic_system_prompt(value, user_name, character_name):
    """Ignore upstream's exact old default and expand only custom instructions."""
    if not isinstance(value, str) or not value.strip():
        return ""

    if sha256(value.strip().encode("utf-8")).hexdigest() == _LEGACY_GENERIC_PROMPT_SHA256:
        return ""

    return value.replace("{{user}}", user_name or "").replace("{{char}}", character_name or "")
