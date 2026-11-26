"""Critical model-instruction translations are present in first-party source."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ModelInstructionEnglishTests(unittest.TestCase):
    def test_core_agent_prompts(self):
        files = ("server.py", "py/sub_agent.py", "py/autoBehavior.py", "py/diary_chat_integration.py")
        for filename in files:
            text = (ROOT / filename).read_text(encoding="utf-8")
            for marker in ("请执行任务", "系统提示：用户", "请继续完成初始任务", "当前时间：{now_str}", "请仔细描述这段视频"):
                with self.subTest(filename=filename, marker=marker):
                    self.assertNotIn(marker, text)
        backend = (ROOT / "server.py").read_text(encoding="utf-8")
        self.assertIn("Describe the image accurately", backend)
        self.assertIn("Knowledge-base content:", backend)
        agent = (ROOT / "py/sub_agent.py").read_text(encoding="utf-8")
        self.assertIn("call finish_task with task_id=", agent)


if __name__ == "__main__":
    unittest.main()
