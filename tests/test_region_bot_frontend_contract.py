"""Check that deleted regional messaging adapters have no active frontend hooks."""
from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
REMOVED = ("qqBotConfig", "feishuBotConfig", "wechatBotConfig", "weComBotConfig", "dingtalkBotConfig", "WXBotConfig")


class FrontendContract(unittest.TestCase):
    def test_frontend_state_and_methods(self):
        for path in ("static/js/vue_data.js", "static/js/vue_methods.js", "static/js/renderer.js"):
            content = (ROOT / path).read_text(encoding="utf-8")
            for key in REMOVED:
                with self.subTest(path=path, key=key):
                    self.assertNotIn(key, content)

    def test_no_regional_shutdown_hook(self):
        source = (ROOT / "main.js").read_text(encoding="utf-8")
        for key in ("request-stop-qqbot", "request-stop-feishubot", "request-stop-wechatbot", "request-stop-wecombot", "request-stop-dingtalk"):
            self.assertNotIn(key, source)

    def test_saved_template_excludes_old_adapters(self):
        config = json.loads((ROOT / "config/settings_template.json").read_text(encoding="utf-8"))
        for key in REMOVED:
            self.assertNotIn(key, config)

    def test_tts_controls_use_tts_settings(self):
        source = (ROOT / "static/js/vue_methods.js").read_text(encoding="utf-8")
        self.assertIn("this.ttsSettings.separators = val.map", source)
        self.assertIn("this.ttsSettings.separators.push(processed)", source)
        source = (ROOT / "static/js/renderer.js").read_text(encoding="utf-8")
        self.assertIn("const current = this.ttsSettings.separators || []", source)


if __name__ == "__main__":
    unittest.main()
