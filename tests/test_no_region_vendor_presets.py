"""No regional commercial API preset appears in fresh provider choices."""
import re
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class VendorPresetTests(unittest.TestCase):
    def test_curated_provider_catalog(self):
        source = (ROOT / "static/js/vue_data.js").read_text(encoding="utf-8")
        match = re.search(r'vendorValues:\s*\[([\s\S]*?)\]', source)
        self.assertIsNotNone(match)
        for name in ("modelscope", "gitee", "siliconflow", "aliyun", "qianfan", "hunyuan", "tencent", "baichuan", "ZhipuAI"):
            self.assertNotIn("'" + name + "'", match.group(1))
        for name in ("openrouter", "Ollama", "OpenAI", "Anthropic", "Gemini"):
            self.assertIn("'" + name + "'", match.group(1))

    def test_no_region_vendor_default_endpoints(self):
        source = (ROOT / "static/js/vue_methods.js").read_text(encoding="utf-8")
        for hostname in ("api-inference.modelscope.cn", "api.siliconflow.cn", "dashscope.aliyuncs.com", "ai.gitee.com", "api.hunyuan.cloud.tencent.com"):
            self.assertNotIn(hostname, source)


if __name__ == "__main__":
    unittest.main()
