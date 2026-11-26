"""Model-facing environment and relationship instructions are English-only."""
from pathlib import Path
import re
import unittest
ROOT = Path(__file__).resolve().parents[1]

class PromptSurfaceTests(unittest.TestCase):
    def test_runtime_injected_blocks(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        for name in ("affection_message", "system_context"):
            match = re.search(r"\b" + name + r'\s*=\s*f?"""([\s\S]*?)"""', source)
            self.assertIsNotNone(match, name)
            self.assertFalse(re.search(r"[\u3400-\u9fff]", match.group(1)), name)
        self.assertIn("Host environment", source)
        self.assertIn("call finish_main_task", source)

if __name__ == "__main__":
    unittest.main()
