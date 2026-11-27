import asyncio
import runpy
import unittest
from pathlib import Path

source = Path(__file__).resolve().parents[1] / "py/session_permissions.py"
permissions = runpy.run_path(str(source))


class ApprovalTests(unittest.TestCase):
    def test_exact_call_and_workspace_and_single_use(self):
        approvals = permissions["PendingToolApprovals"]()
        arguments = {"value": [1]}
        token = approvals.issue("call-a", "fixture", arguments, "/workspace")
        arguments["value"].append(2)
        self.assertIsNone(approvals.consume(token, "call-b", "/workspace"))
        self.assertIsNone(approvals.consume(token, "call-a", "/other"))
        self.assertEqual(approvals.consume(token, "call-a", "/workspace"), ("fixture", {"value": [1]}))
        self.assertIsNone(approvals.consume(token, "call-a", "/workspace"))
        self.assertIsNone(approvals.consume(None, "call-a", "/workspace"))


class SessionTests(unittest.TestCase):
    def exchange(self, kind, path="/ws", token=None, origin=None, host=b"127.0.0.1:3456",
                 scheme="http", method="GET", body=b"", client="127.0.0.1", extra=(), app=None):
        messages = []
        headers = [(b"host", host)]
        if token:
            headers.append((b"x-sap-session", token))
        if origin:
            headers.append((b"origin", origin))
        headers.extend(extra)

        async def downstream(scope, receive, send):
            self.assertFalse(any(name == b"x-sap-session" for name, _ in scope["headers"]))
            await send({"type": "accepted", "machine": permissions["machine_session"].get()})

        async def emit(message):
            messages.append(message)

        async def receive():
            return {"type": "http.request", "body": body}

        app = app or permissions["SessionPermissions"](downstream, "fixture-token")
        scope = {"type": kind, "method": method, "path": path, "scheme": scheme,
                 "server": ("127.0.0.1", 3456), "client": (client, 5555), "headers": headers}
        asyncio.run(app(scope, receive, emit))
        return messages[0]

    def test_private_http_and_websocket(self):
        self.assertEqual(self.exchange("http", "/health")["type"], "accepted")
        self.assertEqual(self.exchange("http", "/api/system/data-path")["status"], 403)
        self.assertEqual(self.exchange("websocket")["code"], 1008)
        self.assertEqual(self.exchange("websocket", token=b"fixture-token",
                                       origin=b"http://127.0.0.1:3456")["type"], "accepted")

    def test_origin_and_host_must_match(self):
        self.assertEqual(self.exchange("http", token=b"fixture-token",
                                       origin=b"http://external.invalid")["status"], 403)
        self.assertEqual(self.exchange("http", token=b"fixture-token",
                                       host=b"external.invalid:3456")["status"], 403)

    def test_browser_login_and_tls_lan(self):
        async def downstream(scope, receive, send):
            self.assertNotIn(b"cookie", dict(scope["headers"]))
            await send({"type": "accepted"})

        key = "a" * 32
        app = permissions["SessionPermissions"](downstream, "fixture-token",
                                                 browser_key=key, public_origin="https://sap.test:8443")
        for host, scheme, client in [(b"localhost:3456", "http", "127.0.0.1"),
                                      (b"sap.test:8443", "https", "192.0.2.10")]:
            origin = scheme.encode() + b"://" + host
            args = dict(host=host, scheme=scheme, client=client, app=app)
            self.assertEqual(self.exchange("http", "/", **args)["status"], 303)
            self.assertEqual(self.exchange("http", "/session/login", method="POST",
                                           body=("key=" + key).encode(), **args)["status"], 403)
            result = self.exchange("http", "/session/login", method="POST", origin=origin,
                                   body=("key=" + key).encode(), **args)
            self.assertEqual(result["status"], 303)
            header = dict(result["headers"])[b"set-cookie"]
            self.assertIn(b"HttpOnly", header)
            self.assertEqual(b"; Secure" in header, scheme == "https")
            cookie = [(b"cookie", header.split(b";")[0])]
            self.assertEqual(self.exchange("websocket", origin=origin, extra=cookie, **args)["type"], "accepted")
            self.assertEqual(self.exchange("websocket", origin=b"https://external.invalid", extra=cookie, **args)["code"], 1008)

    def test_external_key_scope(self):
        async def downstream(scope, receive, send):
            self.assertNotIn(b"authorization", dict(scope["headers"]))
            self.assertTrue(permissions["machine_session"].get())
            await send({"type": "accepted"})

        key = "b" * 32
        app = permissions["SessionPermissions"](downstream, "fixture-token", api_key=key)
        headers = [(b"authorization", b"Bearer " + key.encode())]
        self.assertEqual(self.exchange("http", "/v1/models", app=app, extra=headers)["type"], "accepted")
        self.assertEqual(self.exchange("http", "/execute_tool_manually", method="POST", app=app,
                                       extra=headers)["status"], 403)
        self.assertEqual(self.exchange("http", "/v1/models", client="192.0.2.10", app=app, extra=headers)["status"], 403)

