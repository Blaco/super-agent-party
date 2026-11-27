import time
import logging
import datetime
import httpx

from py.session_permissions import internal_session_headers
from py.get_setting import get_port, load_settings
from py.diary_system import append_diary_entry, DEFAULT_BOOK_ID

_chat_buffers = {}


def get_chat_buffer(key: str):
    if key not in _chat_buffers:
        _chat_buffers[key] = {
            "messages": [],
            "last_user_msg_time": time.time(),
            "book_id": DEFAULT_BOOK_ID,
            "character_name": "",
        }
    return _chat_buffers[key]


def append_to_chat_buffer(key: str, role: str, content: str):
    buf = get_chat_buffer(key)
    buf["messages"].append({"role": role, "content": str(content)[:2000]})
    if len(buf["messages"]) > 200:
        buf["messages"] = buf["messages"][-200:]
    if role == "user":
        buf["last_user_msg_time"] = time.time()


def update_buffer_identity(key: str, book_id: str = None, character_name: str = ""):
    buf = get_chat_buffer(key)
    if book_id:
        buf["book_id"] = book_id
    if character_name:
        buf["character_name"] = character_name


def get_idle_buffers(idle_minutes: int = 15):
    now = time.time()
    idle_threshold = now - idle_minutes * 60
    result = []
    for key, buf in list(_chat_buffers.items()):
        if not buf["messages"]:
            continue
        if buf["last_user_msg_time"] < idle_threshold:
            result.append((key, buf))
    return result


def clear_chat_buffer(key: str):
    buf = _chat_buffers.get(key)
    if buf:
        buf["messages"] = []
        buf["last_user_msg_time"] = time.time()


async def summarize_and_save_buffers(idle_minutes: int = 15):
    idle_list = get_idle_buffers(idle_minutes)
    if not idle_list:
        return
    for key, buf in idle_list:
        try:
            messages_text = ""
            for m in buf["messages"][-50:]:
                role_label = "User" if m["role"] == "user" else "Assistant"
                messages_text += f"[{role_label}]: {m['content']}\n"
            if not messages_text.strip():
                clear_chat_buffer(key)
                continue

            now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
            sys_prompt = (
                f"Current time: {now_str}. The user has not spoken with you for {idle_minutes} minutes."
                "Summarize the recent conversation below as a short diary entry in the first person, in a natural, sincere voice."
                "Include key points, the user's needs or emotions, and your reflections. Do not recount each message."
            )
            messages = [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": f"[Recent conversation]:\n{messages_text}"},
            ]

            port = get_port()
            url = f"http://127.0.0.1:{port}/v1/chat/completions"
            payload = {
                "model": "super-model",
                "messages": messages,
                "stream": False,
                "is_app_bot": True,
                "platform": "diary",
                "enable_tools": [],
            }
            async with httpx.AsyncClient(timeout=120.0, headers=internal_session_headers(), trust_env=False) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                summary = (data.get("choices", [{}])[0]
                           .get("message", {})
                           .get("content", "") or "").strip()
            if summary:
                title = summary.strip().splitlines()[0][:24] if summary.strip() else ""
                await append_diary_entry("chatSummary", summary, title=title,
                                         book_id=buf["book_id"],
                                         character_id=buf["book_id"] if buf["book_id"] != DEFAULT_BOOK_ID else None,
                                         character_name=buf.get("character_name", ""))
                logging.info("[DiaryChat] Automatically summarized conversation into diary")
            clear_chat_buffer(key)
        except Exception as e:
            logging.error("[DiaryChat] Failed to summarize conversation (%s)", type(e).__name__)
