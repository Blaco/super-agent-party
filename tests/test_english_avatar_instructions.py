"""Keep first-party virtual-avatar instructions in English."""
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AvatarPromptTests(unittest.TestCase):
    def test_avatar_instruction_sections(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        for name in ("tha_prompt_base", "tha_prompt_weights", "tha_prompt_fine_control", "tha_prompt_rules", "Expression_messages", "Motion_messages"):
            pattern = r'\b' + name + r'\s*=\s*\(([\s\S]*?)\n\s*\)'
            match = re.search(pattern, source)
            self.assertIsNotNone(match, name)
            self.assertFalse(re.search(r'[\u3400-\u9fff]', match.group(1)), name)
        self.assertIn("<happy:0.5><surprised:0.4>", source)


if __name__ == "__main__":
    unittest.main()
