"""Check search providers preserve open/general engines without regional API presets."""
from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SearchProviderIsolation(unittest.TestCase):
    def test_no_region_search_route(self):
        for path in ("py/web_search.py", "server.py", "static/index.html", "static/js/vue_data.js", "static/js/vue_methods.js"):
            src = (ROOT / path).read_text(encoding="utf-8")
            self.assertNotIn("bochaai", src.lower(), path)

    def test_preserve_general_search(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        for name in ("duckduckgo", "searxng", "tavily", "google", "brave", "exa", "serper", "youcom"):
            self.assertIn(name, source)

    def test_default_config(self):
        obj = json.loads((ROOT / "config/settings_template.json").read_text(encoding="utf-8"))
        self.assertNotIn("bochaai_api_key", obj["webSearch"])


if __name__ == "__main__":
    unittest.main()
