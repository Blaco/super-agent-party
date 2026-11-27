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
    def exchange(self, kind, path="/ws", token=None, origin=None, host=b"127.0.0.1:3456"):
        messages = []
        headers = [(b"host", host)]
        if token:
            headers.append((b"x-sap-session", token))
        if origin:
            headers.append((b"origin", origin))

        async def downstream(scope, receive, send):
            self.assertFalse(any(name == b"x-sap-session" for name, _ in scope["headers"]))
            await send({"type": "accepted"})

        async def emit(message):
            messages.append(message)

        app = permissions["SessionPermissions"](downstream, "fixture-token")
        scope = {"type": kind, "method": "GET", "path": path, "scheme": "http",
                 "server": ("127.0.0.1", 3456), "headers": headers}
        asyncio.run(app(scope, None, emit))
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

