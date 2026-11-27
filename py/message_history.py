"""Request-only history validation for OpenAI-shaped message dictionaries."""
import logging


class ContextHistoryError(ValueError):
    """The active turn cannot be safely reconstructed for inference."""


def latest_user_index(messages):
    return next((i for i in range(len(messages) - 1, -1, -1)
                 if messages[i].get("role") == "user"), None)


def normalize_tool_history(messages, *, protect_latest=False):
    """Keep contiguous, complete call/result batches; never fabricate a result.

    Historical malformed batches lose their tool metadata/results, but keep
    assistant text. In the active turn, reject malformed batches instead of
    silently discarding evidence of actions that may already have executed.
    No message or nested object is modified in place.
    """
    active = latest_user_index(messages) if protect_latest else None
    result = []
    dropped_tools = 0
    invalid_calls = 0
    i = 0
    while i < len(messages):
        message = messages[i]
        role = message.get("role")
        if role == "tool":
            if active is not None and i > active:
                raise ContextHistoryError("The active turn contains an unmatched tool result. Start a new turn before retrying.")
            dropped_tools += 1
            i += 1
            continue
        calls = message.get("tool_calls") if role == "assistant" else None
        if not calls:
            result.append(message)
            i += 1
            continue

        end = i + 1
        while end < len(messages) and messages[end].get("role") == "tool":
            end += 1
        ids = [call.get("id") if isinstance(call, dict) else None
               for call in calls] if isinstance(calls, list) else []
        valid_ids = bool(ids) and all(isinstance(tid, str) and tid for tid in ids)
        expected = set(ids) if valid_ids else set()
        valid_ids = valid_ids and len(expected) == len(ids)
        found = set()
        matched = []
        for reply in messages[i + 1:end]:
            tid = reply.get("tool_call_id")
            if isinstance(tid, str) and tid in expected and tid not in found:
                found.add(tid)
                matched.append(reply)
        complete = valid_ids and found == expected
        unexpected = end - i - 1 - len(matched)
        if active is not None and i > active and (not complete or unexpected):
            raise ContextHistoryError("The active turn has an incomplete or inconsistent tool-call batch. Start a new turn before retrying.")
        if complete:
            result.append(message)
            result.extend(matched)
            dropped_tools += unexpected
        else:
            invalid_calls += 1
            dropped_tools += end - i - 1
            content = message.get("content")
            if content and (not isinstance(content, str) or content.strip()):
                text_only = dict(message)
                text_only.pop("tool_calls", None)
                result.append(text_only)
        i = end

    if dropped_tools or invalid_calls:
        logging.getLogger("app").info(
            "[ToolHistory] discarded_results=%d invalid_batches=%d",
            dropped_tools, invalid_calls,
        )
    return result


def bounded_dialogue(dialogue, recent_count):
    """Never retrieve older entries beyond the inherited disclosure window."""
    if type(recent_count) is not int or recent_count <= 0:
        raise ContextHistoryError("The conversation history limit must be positive.")
    cut = max(0, len(dialogue) - recent_count)
    active = latest_user_index(dialogue)
    if active is not None and active < cut:
        raise ContextHistoryError("The active turn exceeds the conversation history limit. Start a new turn before retrying.")
    return normalize_tool_history(dialogue[cut:], protect_latest=True)


def select_compressed_dialogue(dialogue, keep_indices):
    """Respect the existing historical selection without splitting tool batches."""
    keep = set(keep_indices)
    active = latest_user_index(dialogue)
    if active is not None:
        keep.update(range(active, len(dialogue)))
    i = 0
    while i < len(dialogue):
        if dialogue[i].get("role") == "assistant" and dialogue[i].get("tool_calls"):
            end = i + 1
            while end < len(dialogue) and dialogue[end].get("role") == "tool":
                end += 1
            if not all(index in keep for index in range(i, end)):
                keep.difference_update(range(i + 1, end))
            i = end
        else:
            i += 1
    return [message for i, message in enumerate(dialogue) if i in keep]
