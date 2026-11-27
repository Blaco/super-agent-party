"""Authenticate the private desktop backend and issue one-shot tool approvals."""

import hmac
import os
import secrets
import time
from contextvars import ContextVar
from copy import deepcopy
from http.cookies import SimpleCookie, CookieError
from ipaddress import ip_address
from urllib.parse import parse_qs, urlsplit

SESSION_HEADER = "x-sap-session"
DESKTOP_SESSION_TOKEN = os.environ.pop("SAP_DESKTOP_SESSION_TOKEN", None) or secrets.token_urlsafe(32)
BROWSER_KEY = os.environ.pop("SAP_BROWSER_ACCESS_KEY", "")
API_KEY = os.environ.pop("SAP_API_ACCESS_KEY", "")
PUBLIC_ORIGIN = os.environ.pop("SAP_LAN_HTTPS_ORIGIN", "")
COOKIE = "sap_browser_session"
API_ROUTES = {("GET", "/v1/models"), ("POST", "/v1/chat/completions")}
machine_session = ContextVar("machine_session", default=False)
LOGIN_FORM = b"""<!doctype html><meta charset=utf-8><title>Sign in to SAP</title>
<h1>Sign in to SAP</h1><form method=post action=/session/login>
<label>Browser access key <input name=key type=password required autocomplete=current-password></label>
<button>Sign in</button></form>"""


def internal_session_headers():
    return {SESSION_HEADER: DESKTOP_SESSION_TOKEN}


class SessionPermissions:
    def __init__(self, app, token, browser_key="", api_key="", public_origin=""):
        self.app = app
        self.token = token.encode("ascii")
        self.browser_key = browser_key.encode() if len(browser_key) >= 32 else b""
        self.api_key = api_key.encode() if len(api_key) >= 32 else b""
        parsed = urlsplit(public_origin)
        self.public_origin = public_origin if (
            parsed.scheme == "https" and parsed.hostname and not parsed.username
            and not parsed.password and not parsed.path and not parsed.query and not parsed.fragment
        ) else ""
        self.sessions = {}

    async def login(self, scope, receive, send, host_origin, origin):
        method = scope["method"]
        if method == "GET":
            return await respond(send, 200, LOGIN_FORM, b"text/html; charset=utf-8")
        if method != "POST" or origin != host_origin.encode():
            return await respond(send, 403, b"Browser access denied")
        body = bytearray()
        while True:
            event = await receive()
            if event["type"] != "http.request":
                return
            body.extend(event.get("body", b""))
            if len(body) > 4096:
                return await respond(send, 413, b"Request too large")
            if not event.get("more_body"):
                break
        try:
            key = parse_qs(body.decode("utf-8"), max_num_fields=2).get("key", [""])[0].encode()
        except (UnicodeError, ValueError):
            return await respond(send, 400, b"Invalid request")
        if not hmac.compare_digest(key, self.browser_key):
            return await respond(send, 403, b"Browser access denied")
        now = time.monotonic()
        self.sessions = {token: data for token, data in self.sessions.items() if data[0] > now}
        if len(self.sessions) >= 128:
            return await respond(send, 503, b"Browser session limit reached")
        session = secrets.token_urlsafe(32)
        self.sessions[session] = (now + 3600, host_origin)
        cookie = f"{COOKIE}={session}; Path=/; Max-Age=3600; HttpOnly; SameSite=Strict"
        if host_origin.startswith("https://"):
            cookie += "; Secure"
        await respond(send, 303, b"", extra=[(b"location", b"/"), (b"set-cookie", cookie.encode())])

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
        host_origin = f"{scheme}://{host}"
        same_origin = origin is None or origin == host_origin.encode("latin-1")
        try:
            loopback_client = ip_address((scope.get("client") or ("",))[0]).is_loopback
        except ValueError:
            loopback_client = False
        trusted_host = loopback_client and host in {
            f"127.0.0.1:{scope['server'][1]}",
            f"localhost:{scope['server'][1]}",
        } if scope.get("server") else False
        trusted_public = bool(self.public_origin and host_origin == self.public_origin)
        trusted_browser = trusted_public or (trusted_host and host.startswith("localhost:"))
        if kind == "http" and trusted_browser and self.browser_key and scope["path"] == "/session/login":
            return await self.login(scope, receive, send, host_origin, origin)

        desktop = trusted_host and hmac.compare_digest(credential, self.token)
        authorization = headers.get(b"authorization", b"")
        machine = (kind == "http" and (trusted_host or trusted_public) and bool(self.api_key)
                   and (scope["method"], scope["path"]) in API_ROUTES
                   and hmac.compare_digest(authorization, b"Bearer " + self.api_key))
        browser = False
        if trusted_browser and self.browser_key:
            cookie = SimpleCookie()
            try:
                cookie.load(headers.get(b"cookie", b"").decode("latin-1"))
            except CookieError:
                pass
            session = cookie.get(COOKIE)
            entry = self.sessions.get(session.value) if session else None
            browser = bool(entry and entry[0] > time.monotonic() and entry[1] == host_origin)
        if same_origin and (desktop or machine or browser):
            authorized_scope = dict(scope, headers=[
                (name, value) for name, value in scope["headers"]
                if name not in (SESSION_HEADER.encode("ascii"), b"cookie")
                and not (machine and name == b"authorization")
            ])
            marker = machine_session.set(machine)
            try:
                return await self.app(authorized_scope, receive, send)
            finally:
                machine_session.reset(marker)
        if kind == "websocket":
            return await send({"type": "websocket.close", "code": 1008})
        if trusted_browser and self.browser_key and scope["method"] == "GET" and scope["path"] in ("/", "/chat.html"):
            return await respond(send, 303, b"", extra=[(b"location", b"/session/login")])
        await respond(send, 403, b'{"detail":"SAP session authorization required"}', b"application/json")


async def respond(send, status, body, content_type=b"text/plain; charset=utf-8", extra=()):
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", content_type), (b"cache-control", b"no-store"),
                            (b"x-frame-options", b"DENY"), *extra]})
    await send({"type": "http.response.body", "body": body})


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
