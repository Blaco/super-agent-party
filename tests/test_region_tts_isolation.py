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

    def test_native_moss_english_defaults(self):
        import json
        data = (ROOT / "static/js/vue_data.js").read_text(encoding="utf-8")
        methods = (ROOT / "static/js/vue_methods.js").read_text(encoding="utf-8")
        server = (ROOT / "server.py").read_text(encoding="utf-8")
        moss = (ROOT / "py/moss_tts.py").read_text(encoding="utf-8")
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        settings = json.loads((ROOT / "config/settings_template.json").read_text(encoding="utf-8"))
        self.assertNotIn("volcResourceOptions", data)
        self.assertEqual(data.count("mossVoice: 'Ava'"), 2)
        self.assertIn("mossVoice: 'Ava'", methods)
        self.assertIn("tts_settings.get('mossVoice', 'Ava')", server)
        self.assertIn('voice: str = "Ava"', moss)
        self.assertEqual(settings["ttsSettings"]["mossVoice"], "Ava")
        self.assertEqual(html.count('value="Ava"'), 2)
        self.assertIn("prompt_audio_path=abs_clone_path", server)

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
