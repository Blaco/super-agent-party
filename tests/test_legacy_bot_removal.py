"""Regional messaging adapters are absent from the active backend routes."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
REMOVED = ("qq", "feishu", "dingtalk", "wechat", "wecom")


class MessagingIsolationTests(unittest.TestCase):
    def test_removed_manager_files(self):
        for name in REMOVED:
            with self.subTest(name=name):
                self.assertFalse((ROOT / "py" / (name + "_bot_manager.py")).exists())

    def test_active_backend_routes(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        for name in REMOVED:
            with self.subTest(name=name):
                self.assertNotIn("py." + name + "_bot_manager", source)
                self.assertNotIn('"/start_' + name + '_bot"', source)
        for name in ("discord", "slack", "telegram"):
            self.assertIn('"/start_' + name + '_bot"', source)

    def test_frontend_tabs_removed(self):
        source = (ROOT / "static/index.html").read_text(encoding="utf-8")
        for name in REMOVED:
            with self.subTest(name=name):
                self.assertNotIn('name="' + name + '"', source)
        for name in ("discord", "slack", "telegram"):
            self.assertIn('name="' + name + '"', source)


if __name__ == "__main__":
    unittest.main()
