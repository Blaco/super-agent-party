"""Do not offer or invoke removed regional proprietary TTS services."""
import re
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
REMOVED = ("volcengine", "baidu", "minimax", "xunfei")


class TTSServiceIsolationTests(unittest.TestCase):
    def test_ui_and_default_state(self):
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        data = (ROOT / "static/js/vue_data.js").read_text(encoding="utf-8")
        for name in REMOVED:
            with self.subTest(name=name):
                self.assertNotIn('value="' + name + '"', html)
                self.assertNotIn("engine === '" + name + "'", html)
        self.assertNotIn("volcAppId:", data)
        self.assertNotIn("baiduApiKey:", data)

    def test_backend_routes_and_selected_voices(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        for name in REMOVED:
            with self.subTest(name=name):
                self.assertNotIn("tts_engine == '" + name + "'", source)
                self.assertNotIn("provider == '" + name + "'", source)
        for name in ("azure", "fish", "google", "openai", "moss", "systemtts"):
            self.assertIn(name, source)


if __name__ == "__main__":
    unittest.main()
