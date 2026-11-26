"""Core Electron startup and account dialogs must be English."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ElectronEnglishDialogs(unittest.TestCase):
    def test_core_dialog_labels(self):
        src = (ROOT / "main.js").read_text(encoding="utf-8")
        for text in ("Select account", "Choose an account to start Agent Creation", "Remember my selection", "Primary account", "Destination directory must be empty", "Failed to load accounts"):
            self.assertIn(text, src)
        for old in ("选择账户", "无法获取屏幕源", "账户不存在", "无法找到可用端口", "无法保存该图片"):
            self.assertNotIn(old, src)


if __name__ == "__main__":
    unittest.main()
