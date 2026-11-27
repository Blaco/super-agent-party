"""Check that deleted regional messaging adapters have no active frontend hooks."""
from pathlib import Path
import json
import unittest

ROOT = Path(__file__).resolve().parents[1]
REMOVED = ("qqBotConfig", "feishuBotConfig", "wechatBotConfig", "weComBotConfig", "dingtalkBotConfig", "WXBotConfig")


class FrontendContract(unittest.TestCase):
    def test_frontend_state_and_methods(self):
        for path in ("static/js/vue_data.js", "static/js/vue_methods.js", "static/js/renderer.js"):
            content = (ROOT / path).read_text(encoding="utf-8")
            for key in REMOVED:
                with self.subTest(path=path, key=key):
                    self.assertNotIn(key, content)

    def test_no_regional_shutdown_hook(self):
        for path in ("main.js", "static/js/preload.js"):
            source = (ROOT / path).read_text(encoding="utf-8")
            for key in ("request-stop-qqbot", "request-stop-feishubot", "request-stop-wechatbot", "request-stop-wecombot", "request-stop-dingtalk"):
                self.assertNotIn(key, source)
        preload = (ROOT / "static/js/preload.js").read_text(encoding="utf-8")
        for key in ("request-stop-discordbot", "request-stop-telegrambot", "request-stop-slackbot"):
            self.assertIn(key, preload)

    def test_residual_styles_and_about(self):
        css = (ROOT / "static/css/styles.css").read_text(encoding="utf-8")
        for key in (".qq-group", ".wechat-guide", "qq-typing-dots"):
            self.assertNotIn(key, css)
        self.assertIn("animation: entertainment-typing-dots", css)
        self.assertIn("@keyframes entertainment-typing-dots", css)
        html = (ROOT / "static/chat.html").read_text(encoding="utf-8")
        self.assertIn("Agent Creation source repository", html)
        self.assertNotIn("mailto:hst97@qq.com", html)

    def test_saved_template_excludes_old_adapters(self):
        config = json.loads((ROOT / "config/settings_template.json").read_text(encoding="utf-8"))
        for key in REMOVED:
            self.assertNotIn(key, config)

    def test_browser_chat_excludes_retired_adapters(self):
        html = (ROOT / "static/chat.html").read_text(encoding="utf-8")
        for name in ("wechat", "feishu", "dingtalk", "wecom"):
            self.assertNotIn('value="' + name + '"', html)
        for name in ("telegram", "discord", "slack"):
            self.assertIn('value="' + name + '"', html)
        self.assertNotIn("js/locales/zh-CN.js", html)
        for host in ("gitee.com", "space.bilibili.com", "feishu.cn"):
            self.assertNotIn(host, html)
        self.assertIn("GNU Affero General Public License v3.0", html)
        self.assertIn("heshengtao/super-agent-party", html)

    def test_tts_controls_use_tts_settings(self):
        source = (ROOT / "static/js/vue_methods.js").read_text(encoding="utf-8")
        self.assertIn("this.ttsSettings.separators = val.map", source)
        self.assertIn("this.ttsSettings.separators.push(processed)", source)
        source = (ROOT / "static/js/renderer.js").read_text(encoding="utf-8")
        self.assertIn("const current = this.ttsSettings.separators || []", source)


if __name__ == "__main__":
    unittest.main()
