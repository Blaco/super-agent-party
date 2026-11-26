"""Ensure public web-search tool descriptions are English."""
import ast
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class EnglishSearchToolSchemas(unittest.TestCase):
    def test_tool_schema_text(self):
        source = (ROOT / "py/web_search.py").read_text(encoding="utf-8")
        module = ast.parse(source)
        found = 0
        for node in ast.walk(module):
            if not isinstance(node, (ast.Assign, ast.AnnAssign)):
                continue
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name) and target.id.endswith("_tool"):
                    segment = ast.get_source_segment(source, node.value) or ""
                    self.assertFalse(any(0x3400 <= ord(char) <= 0x9fff for char in segment), target.id)
                    found += 1
        self.assertGreater(found, 5)


if __name__ == "__main__":
    unittest.main()
