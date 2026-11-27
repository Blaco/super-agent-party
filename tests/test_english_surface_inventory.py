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

    def test_first_party_gate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            for rel in ("static/libs/fixture.cjs", "LICENSE-third-party/notice.csv"):
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("\u4e2d\u6587", encoding="utf-8")
            command = ["python", str(ROOT / "scripts/audit_english_surface.py"),
                       "--root", str(root), "--fail-on-first-party-han"]
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            (root / "sample.scss").write_text("// \u4e2d\u6587", encoding="utf-8")
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 1)
            (root / "sample.scss").unlink()
            (root / "broken.py").write_bytes(b"\xff")
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 1)

    def test_retired_promotion_assets_not_referenced(self):
        # Old upstream documentation galleries were not shipped product features.
        self.assertFalse((ROOT / "doc/image").exists())
        for name in ("coverzh.png", "coveren.png"):
            self.assertFalse((ROOT / "static/source" / name).exists())
        for file, rel in AUDIT.sources(ROOT, tracked_only=True):
            if AUDIT.scope(rel) not in AUDIT.FIRST_PARTY_SCOPES:
                continue
            if file.suffix.lower() not in AUDIT.TEXT_SUFFIXES and file.name.lower() not in AUDIT.TEXT_NAMES:
                continue
            if not file.is_file() or file.stat().st_size > AUDIT.MAX_TEXT_BYTES:
                continue
            content = file.read_text(encoding="utf-8")
            for old in ("doc/image/", "coverzh.png", "coveren.png"):
                self.assertNotIn(old, content, rel)


if __name__ == "__main__":
    unittest.main()
