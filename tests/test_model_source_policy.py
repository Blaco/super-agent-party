"""Regression checks for model downloads and removed region-specific SDKs."""
from pathlib import Path
import tomllib
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SourceIsolationTests(unittest.TestCase):
    def test_download_managers(self):
        for name in ("sherpa_model_manager", "ebd_model_manager", "moss_model_manager"):
            data = (ROOT / "py" / (name + ".py")).read_text(encoding="utf-8")
            self.assertNotIn("modelscope", data.lower())
            self.assertIn("huggingface", data.lower())

    def test_download_buttons(self):
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        for name in ("sherpaDownload", "mossDownload", "minilmDownload"):
            self.assertNotIn(name + "('modelscope')", html)
            self.assertIn(name + "('huggingface')", html)

    def test_sdk_packages_removed(self):
        with (ROOT / "pyproject.toml").open("rb") as f:
            requirements = tomllib.load(f)["project"]["dependencies"]
        for name in ("qq-botpy", "lark-oapi", "dingtalk-stream", "wechatbot-sdk", "wecom-aibot-python-sdk", "modelscope"):
            self.assertFalse(any(p.lower().startswith(name) for p in requirements))


if __name__ == "__main__":
    unittest.main()
