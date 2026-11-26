"""No hardcoded Chinese fallback strings in the main HTML UI."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class EnglishUIFallbacks(unittest.TestCase):
    def test_no_chinese_translation_fallback(self):
        content = (ROOT / "static/index.html").read_text(encoding="utf-8")
        pattern = r"""t\(['"]\w+['"]\)\s*\|\|\s*['"][^'"\n]*[\u3400-\u9fff]"""
        self.assertIsNone(re.search(pattern, content))

    def test_missing_keys_promoted_to_english_bundle(self):
        source = (ROOT / "static/js/locales/en-US.js").read_text(encoding="utf-8")
        for key in ("upload", "backToDefaultView", "slack_bot_config", "gotoSlackBot"):
            self.assertIn("'" + key + "':", source)


if __name__ == "__main__":
    unittest.main()
