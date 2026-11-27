"""Opt-in, bounded restoration of plain dialogue for direct local inference.

Never use this module to change persisted history or auxiliary requests.
The budget is deliberately conservative, not an exact model tokenizer.
"""
from urllib.parse import urlsplit


def local_context_window(value):
    """Disabled unless the operator explicitly supplies a supported window."""
    try:
        window = int(value)
    except (TypeError, ValueError):
        return 0
    return window if 4096 <= window <= 262144 else 0


def capture_text_history(messages, window):
    """Capture only plain alternating dialogue; exclude tools and media."""
    if not window:
        return None
    dialogue = []
    for message in messages:
        role = message.get("role")
        content = message.get("content")
        if not isinstance(content, str):
            return None
        if any(message.get(key) for key in ("tool_calls", "tool_call_id", "function_call", "name")):
            return None
        if role == "system":
            continue
        if role not in ("user", "assistant") or (dialogue and dialogue[-1]["role"] == role):
            return None
        dialogue.append({"role": role, "content": content})
    if len(dialogue) <= 12 or dialogue[-1]["role"] != "user":
        return None
    return window, dialogue[:-12], dialogue[-12:]


def direct_local_endpoint(value):
    """Accept only an explicit IPv4 loopback OpenAI-compatible HTTP endpoint."""
    try:
        url = urlsplit(str(value))
        if (url.scheme == "http" and url.hostname == "127.0.0.1"
                and url.port and url.username is None and url.password is None
                and url.path.rstrip("/") == "/v1" and not url.query and not url.fragment):
            return f"http://127.0.0.1:{url.port}/v1"
    except (ValueError, TypeError):
        pass
    return None


def estimate_text_cost(messages):
    # UTF-8 byte count plus message framing is intentionally pessimistic.
    # Include existing reasoning fields because the prepared request may send them.
    return sum(16 + len(m["content"].encode("utf-8", errors="replace"))
               + len((m.get("reasoning_content") or "").encode("utf-8", errors="replace"))
               for m in messages)


def expand_local_text_history(prepared, snapshot, output_tokens):
    """Restore a contiguous suffix of older dialogue without modifying the baseline."""
    if not snapshot or type(output_tokens) is not int or output_tokens <= 0:
        return prepared
    window, older, tail = snapshot
    split = 0
    while split < len(prepared) and prepared[split].get("role") == "system":
        split += 1
    current = prepared[split:]
    if len(current) != len(tail):
        return prepared
    for message in prepared:
        if not isinstance(message.get("content"), str):
            return prepared
        if not isinstance(message.get("reasoning_content") or "", str):
            return prepared
        if any(message.get(key) for key in ("tool_calls", "tool_call_id", "function_call", "name")):
            return prepared
    for index, (message, original) in enumerate(zip(current, tail)):
        if message.get("role") != original["role"]:
            return prepared
        if index == len(tail) - 1:
            if not message["content"].startswith(original["content"]):
                return prepared
        elif message["content"] != original["content"]:
            return prepared
    budget = window - output_tokens - max(2048, window // 8)
    remaining = budget - estimate_text_cost(prepared)
    start = len(older)
    for index in range(len(older) - 1, -1, -1):
        remaining -= estimate_text_cost([older[index]])
        if remaining < 0:
            break
        if older[index]["role"] == "user":
            start = index
    if start == len(older):
        return prepared
    return prepared[:split] + older[start:] + current
