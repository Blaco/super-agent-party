"""Check English virtual avatar prompt assignments without matching unrelated comments."""
import ast
import re
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AvatarPromptTests(unittest.TestCase):
    def test_avatar_instruction_sections(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        module = ast.parse(source, filename="server.py")
        expected = {"tha_prompt_base", "tha_prompt_weights", "tha_prompt_fine_control", "tha_prompt_rules", "Expression_messages", "Motion_messages"}
        found = {}
        for node in ast.walk(module):
            if not isinstance(node, (ast.Assign, ast.AnnAssign)):
                continue
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name) and target.id in expected:
                    found[target.id] = ast.get_source_segment(source, node.value) or ""
        self.assertEqual(set(found), expected)
        for name, expression in found.items():
            with self.subTest(name=name):
                self.assertFalse(re.search(r'[\u3400-\u9fff]', expression))
        self.assertIn("<happy:0.5><surprised:0.4>", source)


if __name__ == "__main__":
    unittest.main()
