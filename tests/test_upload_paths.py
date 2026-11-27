"""Regression checks for the flat upload storage boundary."""

from pathlib import Path
import tempfile
import unittest

from py.upload_paths import InvalidUploadPath, resolve_upload_path


class UploadPathsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "uploads"
        self.root.mkdir()

    def test_regular_and_missing_files(self):
        for name in ("normal.txt", "old document.txt", "caf\u00e9.txt", "missing.txt"):
            with self.subTest(name=name):
                path = self.root / name
                if name != "missing.txt":
                    path.write_text("fixture", encoding="utf-8")
                self.assertEqual(Path(resolve_upload_path(self.root, name)), path.resolve())

    def test_reject_invalid_identifiers(self):
        for name in (None, "", ".", "..", "../outside.txt", r"..\outside.txt",
                     str(self.root / "normal.txt"), r"C:relative.txt",
                     r"C:\outside.txt", "nested/file.txt", "file.txt:stream",
                     "NUL.txt", "COM1.log", "LPT\u00b9.txt", "trailing. ",
                     "trailing.", "a\x00b", "bad?name"):
            with self.subTest(name=name):
                with self.assertRaises(InvalidUploadPath):
                    resolve_upload_path(self.root, name)

    def test_reject_directory(self):
        (self.root / "directory").mkdir()
        with self.assertRaises(InvalidUploadPath):
            resolve_upload_path(self.root, "directory")

    def test_reject_links(self):
        target = self.root.parent / "outside.txt"
        target.write_text("synthetic", encoding="utf-8")
        link = self.root / "link.txt"
        try:
            link.symlink_to(target)
        except (OSError, NotImplementedError):
            self.skipTest("Symlink creation unavailable")
        with self.assertRaises(InvalidUploadPath):
            resolve_upload_path(self.root, link.name)
        self.assertEqual(target.read_text(encoding="utf-8"), "synthetic")


if __name__ == "__main__":
    unittest.main()
