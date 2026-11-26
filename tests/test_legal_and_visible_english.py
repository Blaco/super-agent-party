"""Verify revised fork credits and obvious visible UI fallbacks."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class VisibleUIContract(unittest.TestCase):
    def test_license_and_source_attribution(self):
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        self.assertIn("GNU Affero General Public License", html)
        self.assertIn("github.com/heshengtao/super-agent-party", html)
        self.assertIn("github.com/Blaco/super-agent-party", html)
        self.assertNotIn("afdian.com", html)

    def test_english_visible_labels(self):
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        for text in ("Select folder", "Upload THA model", "Open-source license"):
            self.assertIn(text, html)
        self.assertNotIn('label="简体中文"', html)


if __name__ == "__main__":
    unittest.main()
