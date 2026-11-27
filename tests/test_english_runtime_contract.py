"""Regression checks for the English-only runtime and first-run defaults."""
import ast
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class EnglishRuntimeContractTests(unittest.TestCase):
    def test_backend_locale(self):
        data = json.loads((ROOT / "config/locales.json").read_text(encoding="utf-8"))
        self.assertEqual(set(data), {"en-US"})

    def test_english_first_run_prompts(self):
        data = json.loads((ROOT / "config/settings_template.json").read_text(encoding="utf-8"))
        self.assertEqual(data["currentLanguage"], "en-US")
        self.assertNotIn("isChinaProxy", data["systemSettings"])
        for value in (data["loveSettings"]["prompt"], data["diarySettings"]["prompt"]):
            self.assertTrue(value)
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in value))

    def test_chinese_ui_bundle_not_loaded(self):
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        locale_script = (ROOT / "static/js/locales.js").read_text(encoding="utf-8")
        self.assertNotIn('js/locales/zh-CN.js', html)
        self.assertNotIn("lang_zhCN", locale_script)

    def test_settings_sleep_and_vts_modules_are_english(self):
        for relative in ("py/get_setting.py", "py/sleep_guard.py", "py/vts_manager.py"):
            with self.subTest(module=relative):
                source = (ROOT / relative).read_text(encoding="utf-8")
                ast.parse(source, filename=relative)
                self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source))

    def test_sleep_and_vts_integration_contracts(self):
        sleep_source = (ROOT / "py/sleep_guard.py").read_text(encoding="utf-8")
        vts_source = (ROOT / "py/vts_manager.py").read_text(encoding="utf-8")
        self.assertIn("SetThreadExecutionState(flags)", sleep_source)
        self.assertIn("'--why=Application is running'", sleep_source)
        self.assertIn('"apiName": "VTubeStudioPublicAPI"', vts_source)
        self.assertIn('"messageType": "InjectParameterDataRequest"', vts_source)
        self.assertIn("pcm_data = pcm_data[:-1]", vts_source)

    def test_updater_disabled_pending_fork_feed(self):
        source = (ROOT / "main.js").read_text(encoding="utf-8")
        self.assertIn("const ENABLE_AUTO_UPDATES = false", source)
        self.assertIn("if (ENABLE_AUTO_UPDATES) setupAutoUpdater()", source)


if __name__ == "__main__":
    unittest.main()
