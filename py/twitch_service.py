import asyncio
import socket
import ssl
import time
from typing import Any, Callable, Optional

class SimpleTwitchChat:
    """
    Handles receiving, parsing and callbacks; does not own the event loop.
    The lifecycle is controlled by start_twitch_task / stop_twitch_task.
    """
    def __init__(self, access_token: str, channel: str):
        self.access_token = access_token.replace("oauth:", "")
        self.channel = channel.lower().lstrip("#")
        self._sock: Optional[socket.socket] = None
        self._callback: Optional[Callable[[str, str, str, str], Any]] = None
        self._task: Optional[asyncio.Task] = None
        self._running = False

    # ---------- Public methods ----------
    def set_callback(self, cb: Callable[[str, str, str, str], Any]):
        self._callback = cb

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._listen_loop())

    async def stop(self):
        if not self._running:
            return
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._close_socket()

    # ---------- Internal methods ----------
    async def _listen_loop(self):
        reconnect_delay = 5
        while self._running:
            try:
                await self._connect_and_read()
                reconnect_delay = 5
            except Exception as exc:
                if not self._running:
                    break
                print(f"[Twitch] Connection error: {exc}; reconnecting in {reconnect_delay}s")
                await asyncio.sleep(reconnect_delay)
                reconnect_delay = min(reconnect_delay * 2, 60)

    async def _connect_and_read(self):
        ctx = ssl.create_default_context()
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(10)
        self._sock = ctx.wrap_socket(sock, server_hostname="irc.chat.twitch.tv")
        self._sock.connect(("irc.chat.twitch.tv", 6697))
        self._sock.settimeout(None)

        # Authenticate
        self._send(f"CAP REQ :twitch.tv/tags twitch.tv/commands")
        self._send(f"PASS oauth:{self.access_token}")
        self._send(f"NICK justinfan12345")
        self._send(f"JOIN #{self.channel}")

        buffer = ""
        while self._running:
            data = await asyncio.get_event_loop().sock_recv(self._sock, 4096)
            if not data:
                raise ConnectionAbortedError("Server closed the connection")
            buffer += data.decode("utf-8", errors="ignore")
            while "\r\n" in buffer:
                line, buffer = buffer.split("\r\n", 1)
                if line:
                    self._handle_line(line)

    def _handle_line(self, line: str):
        """
        Parse Twitch IRC messages.
        Supports PRIVMSG (chat) and USERNOTICE (subscriptions, gifts, raids, announcements).
        """
        if line.startswith("PING"):
            self._send("PONG " + line[4:])
            return

        # 1. Parse Twitch tags
        tags = {}
        if line.startswith("@"):
            tag_str, _, line = line[1:].partition(" ")
            for kv in tag_str.split(";"):
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    # Decode Twitch IRC escape sequences
                    v = v.replace("\\s", " ").replace("\\:", ";").replace("\\r", "\r").replace("\\n", "\n")
                    tags[k] = v

        # 2. Identify the IRC command (PRIVMSG or USERNOTICE)
        parts = line.split(" ")
        command = ""
        for p in parts:
            if p in ["PRIVMSG", "USERNOTICE", "CLEARCHAT"]:
                command = p
                break

        if not command:
            return

        # 3. Extract user information
        user = tags.get("display-name") or tags.get("login") or "System"
        msg_content = ""
        danmu_type = "danmaku"

        # 4. Handle each command type
        if command == "PRIVMSG":
            # --- Standard chat message ---
            danmu_type = "danmaku"
            try:
                # Use everything after ':' as the message body
                msg_content = line.split(" :", maxsplit=1)[1]
            except: 
                msg_content = ""

        elif command == "USERNOTICE":
            # --- System events (subscriptions, gifts, raids, etc.) ---
            msg_id = tags.get("msg-id", "")
            system_msg = tags.get("system-msg", "") # Twitch-generated English description
            
            # Extract any custom text attached to a subscription or announcement
            user_text = ""
            try:
                user_text = line.split(" :", maxsplit=1)[1]
            except: 
                pass

            if msg_id in ["sub", "resub"]:
                # Subscription or resubscription -> shared subscription event
                danmu_type = "buy_guard"
                msg_content = f"{system_msg} | Message: {user_text}" if user_text else system_msg
                
            elif msg_id in ["subgift", "anonsubgift", "submysterygift"]:
                # Gifted subscription -> shared gift event
                danmu_type = "gift"
                msg_content = system_msg
                
            elif msg_id == "raid":
                # Raid (another streamer brings viewers) -> shared arrival event
                danmu_type = "enter_room"
                msg_content = system_msg
                
            elif msg_id == "announcement":
                # Channel announcement -> chat message with a prefix
                danmu_type = "danmaku"
                msg_content = f"[Announcement] {user_text}"
                
            else:
                # Other system events
                danmu_type = "danmaku"
                msg_content = system_msg if system_msg else user_text

        # 5. Call the service layer
        if self._callback:
            # The callback may be async or sync; the live router uses async broadcast.
            result = self._callback(self.channel, user, msg_content, danmu_type)
            if asyncio.iscoroutine(result):
                asyncio.create_task(result)

    def _send(self, msg: str):
        if self._sock:
            self._sock.send(f"{msg}\r\n".encode())

    def _close_socket(self):
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None


# --------------------------------------------------
# Public service interface
# --------------------------------------------------
_twitch_chat: Optional[SimpleTwitchChat] = None


async def start_twitch_task(config: dict, on_msg_cb: Callable[[str, str, str], None]):
    global _twitch_chat
    if _twitch_chat:
        return
    token = config.get("twitch_access_token", "")
    channel = config.get("twitch_channel", "")
    if not (token and channel):
        raise ValueError("Twitch token or channel is missing")

    _twitch_chat = SimpleTwitchChat(token, channel)
    _twitch_chat.set_callback(on_msg_cb)
    await _twitch_chat.start()
    print("[Twitch] Listener started")


async def stop_twitch_task():
    global _twitch_chat
    if _twitch_chat:
        await _twitch_chat.stop()
        _twitch_chat = None
        print("[Twitch] Listener stopped")
