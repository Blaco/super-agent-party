"""Exercise inventory classification without external dependencies."""
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("surface_audit", ROOT / "scripts/audit_english_surface.py")
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class InventoryTests(unittest.TestCase):
    def test_scope_and_priority(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            files = {
                "server.spec": "# \u4e2d\u6587",
                "skills/example/SKILL.md": "\u4e2d\u6587",
                "uv.lock": 'name = "wechatbot-sdk"',
                "docs/agent-creation/CHANGE_LEDGER.md": "Removed gitee.",
                "static/source/sample.svg": "<text>\u4e2d\u6587</text>",
                "static/libs/sample.js": "// \u4e2d\u6587",
                "LICENSE": "Original attribution: \u4e2d\u6587",
                "static/source/\u4e2d\u6587.png": b"\x89PNG",
            }
            for rel, content in files.items():
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                if isinstance(content, bytes):
                    path.write_bytes(content)
                else:
                    path.write_text(content, encoding="utf-8")
            examined, unreadable, findings, excluded, scopes = AUDIT.inspect(root)
            self.assertEqual(examined, 7)
            self.assertEqual(unreadable, [])
            self.assertEqual(len(excluded), 1)
            self.assertEqual(scopes["dependency-lock"], 1)
            ranked, counts = AUDIT.summarize(findings)
            self.assertEqual(ranked[0]["file"], "server.spec")
            self.assertEqual(counts["dependency-lock"]["region-platform"], 1)
            self.assertEqual(counts["packaged-asset"]["han-path"], 1)
            self.assertEqual(counts["bundled-skill"]["han"], 1)
            self.assertEqual(counts["legal-attribution"]["han"], 1)

    def test_tracked_only_ignores_untracked_text(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            (root / "tracked.py").write_text("# gitee", encoding="utf-8")
            (root / "untracked.py").write_text("# gitee", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "tracked.py"], check=True)
            examined, _, findings, _, _ = AUDIT.inspect(root, tracked_only=True)
            self.assertEqual(examined, 1)
            self.assertEqual([item["file"] for item in findings], ["tracked.py"])


if __name__ == "__main__":
    unittest.main()
