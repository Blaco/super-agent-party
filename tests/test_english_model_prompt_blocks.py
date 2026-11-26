"""Regression tests for the English-only model-facing widget and speech guides."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class EnglishPromptBlocksTests(unittest.TestCase):
    def test_widget_and_speech_blocks(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        for name in ("A2UI_messages", "newtts_messages", "tts_messages"):
            pattern = re.compile(r'\b' + name + r'\s*=\s*f?"""([\s\S]*?)"""')
            match = pattern.search(source)
            self.assertIsNotNone(match, name)
            self.assertFalse(re.search(r'[\u3400-\u9fff]', match.group(1)), name)
        self.assertIn("Button actions:", source)
        self.assertIn("Available voice tags:", source)
        self.assertIn("<silence>![Example]", source)


if __name__ == "__main__":
    unittest.main()
