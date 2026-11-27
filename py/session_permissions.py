"""Authenticate the private desktop backend and issue one-shot tool approvals."""

import hmac
import os
import secrets
import time
from copy import deepcopy

SESSION_HEADER = "x-sap-session"
DESKTOP_SESSION_TOKEN = os.environ.pop("SAP_DESKTOP_SESSION_TOKEN", None) or secrets.token_urlsafe(32)


def internal_session_headers():
    return {SESSION_HEADER: DESKTOP_SESSION_TOKEN}


class SessionPermissions:
    def __init__(self, app, token):
        self.app = app
        self.token = token.encode("ascii")

    async def __call__(self, scope, receive, send):
        kind = scope["type"]
        if kind not in ("http", "websocket") or (
            kind == "http" and scope["method"] == "GET" and scope["path"] == "/health"
        ):
            return await self.app(scope, receive, send)

        headers = dict(scope["headers"])
        host = headers.get(b"host", b"").decode("latin-1")
        origin = headers.get(b"origin")
        credential = headers.get(SESSION_HEADER.encode("ascii"), b"")
        scheme = "https" if scope["scheme"] in ("https", "wss") else "http"
        same_origin = origin is None or origin == f"{scheme}://{host}".encode("latin-1")
        trusted_host = host in {
            f"127.0.0.1:{scope['server'][1]}",
            f"localhost:{scope['server'][1]}",
        } if scope.get("server") else False
        if same_origin and trusted_host and hmac.compare_digest(credential, self.token):
            authorized_scope = dict(scope, headers=[
                (name, value) for name, value in scope["headers"]
                if name != SESSION_HEADER.encode("ascii")
            ])
            return await self.app(authorized_scope, receive, send)
        if kind == "websocket":
            return await send({"type": "websocket.close", "code": 1008})
        await send({"type": "http.response.start", "status": 403,
                    "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body",
                    "body": b'{"detail":"SAP session authorization required"}'})


class PendingToolApprovals:
    def __init__(self):
        self.pending = {}

    def issue(self, call_id, name, arguments, cwd):
        now = time.monotonic()
        self.pending = {token: entry for token, entry in self.pending.items() if entry[0] > now}
        if len(self.pending) >= 256:
            return None
        token = secrets.token_urlsafe(32)
        self.pending[token] = (now + 600, call_id, name, deepcopy(arguments), cwd)
        return token

    def consume(self, token, call_id, cwd):
        if not isinstance(token, str) or not isinstance(call_id, str):
            return None
        entry = self.pending.get(token)
        if entry is None or entry[0] <= time.monotonic() or (entry[1], entry[4]) != (call_id, cwd):
            return None
        del self.pending[token]
        return entry[2:4]
