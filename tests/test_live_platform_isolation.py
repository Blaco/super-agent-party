"""Check dedicated regional livestream removal without removing Western listeners."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class LivestreamContract(unittest.TestCase):
    def test_live_router_has_no_regional_client(self):
        source = (ROOT / "py/live_router.py").read_text(encoding="utf-8")
        self.assertNotIn("blivedm", source)
        self.assertNotIn("bilibili", source.lower())
        self.assertIn('prefix="/api/live"', source)
        self.assertIn('prefix="/ws/live"', source)
        self.assertIn("YouTubeDMClient", source)
        self.assertIn("start_twitch_task", source)

    def test_no_regional_client_modules(self):
        self.assertFalse((ROOT / "py/blivedm").exists())

    def test_frontend_stream_tab_and_default(self):
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        self.assertNotIn('name="bilibili"', html)
        self.assertIn('name="youtube"', html)
        self.assertIn('name="twitch"', html)
        settings = json.loads((ROOT / "config/settings_template.json").read_text(encoding="utf-8"))
        self.assertNotIn("bilibili_enabled", settings["liveConfig"])
        self.assertIn("youtube_video_id", settings["liveConfig"])


if __name__ == "__main__":
    unittest.main()
