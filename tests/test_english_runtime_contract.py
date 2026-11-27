"""Regression checks for the English-only runtime and first-run defaults."""
import ast
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class EnglishRuntimeContractTests(unittest.TestCase):
    def test_backend_locale(self):
        data = json.loads((ROOT / "config/locales.json").read_text(encoding="utf-8"))
        self.assertEqual(set(data), {"en-US"})

    def test_english_first_run_prompts(self):
        data = json.loads((ROOT / "config/settings_template.json").read_text(encoding="utf-8"))
        self.assertEqual(data["currentLanguage"], "en-US")
        self.assertNotIn("isChinaProxy", data["systemSettings"])
        for value in (data["loveSettings"]["prompt"], data["diarySettings"]["prompt"]):
            self.assertTrue(value)
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in value))

    def test_chinese_ui_bundle_not_loaded(self):
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        locale_script = (ROOT / "static/js/locales.js").read_text(encoding="utf-8")
        self.assertNotIn('js/locales/zh-CN.js', html)
        self.assertNotIn("lang_zhCN", locale_script)

    def test_settings_sleep_and_vts_modules_are_english(self):
        for relative in ("py/get_setting.py", "py/sleep_guard.py", "py/vts_manager.py"):
            with self.subTest(module=relative):
                source = (ROOT / relative).read_text(encoding="utf-8")
                ast.parse(source, filename=relative)
                self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source))

    def test_file_loader_english_and_schema_contract(self):
        relative = "py/load_files.py"
        source = (ROOT / relative).read_text(encoding="utf-8")
        tree = ast.parse(source, filename=relative)
        self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source))
        assignments = {
            node.targets[0].id: node.value
            for node in tree.body
            if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)
        }
        context = {
            name: ast.literal_eval(assignments[name])
            for name in ("BASE_OFFICE_EXTS", "PLATFORM_SPECIFIC_EXTS",
                         "ALLOWED_EXTENSIONS", "ALLOWED_IMAGE_EXTENSIONS")
        }
        from types import SimpleNamespace
        for platform in ("win32", "darwin", "linux"):
            with self.subTest(platform=platform):
                scope = dict(context, sys=SimpleNamespace(platform=platform))
                for name in ("FILE_FILTERS", "office_extensions"):
                    scope[name] = eval(compile(ast.Expression(assignments[name]), relative, "eval"), scope)
                expected = set(context["BASE_OFFICE_EXTS"] +
                               context["PLATFORM_SPECIFIC_EXTS"].get(platform, []))
                self.assertEqual(scope["office_extensions"], expected)
        for var, function, parameter in (
            ("file_tool", "get_file_content", "file_url"),
            ("image_tool", "get_image_content", "image_url"),
        ):
            schema = eval(compile(ast.Expression(assignments[var]), relative, "eval"), context)
            self.assertEqual(schema["function"]["name"], function)
            self.assertEqual(schema["function"]["parameters"]["required"], [parameter])
            self.assertTrue(schema["function"]["description"])

    def test_sleep_and_vts_integration_contracts(self):
        sleep_source = (ROOT / "py/sleep_guard.py").read_text(encoding="utf-8")
        vts_source = (ROOT / "py/vts_manager.py").read_text(encoding="utf-8")
        self.assertIn("SetThreadExecutionState(flags)", sleep_source)
        self.assertIn("'--why=Application is running'", sleep_source)
        self.assertIn('"apiName": "VTubeStudioPublicAPI"', vts_source)
        self.assertIn('"messageType": "InjectParameterDataRequest"', vts_source)
        self.assertIn("pcm_data = pcm_data[:-1]", vts_source)

    def test_english_shortcuts_and_optional_messaging(self):
        import runpy
        for relative in ("py/shortcut_commands.py", "py/discord_bot_manager.py",
                         "py/telegram_client.py", "py/telegram_bot_manager.py",
                         "py/slack_bot_manager.py"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            ast.parse(source, filename=relative)
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source), relative)
        commands = runpy.run_path(str(ROOT / "py/shortcut_commands.py"))
        self.assertEqual(set(commands["PLATFORM_CONFIG_KEY"]), {"discord", "telegram", "slack"})
        self.assertEqual(commands["build_help_text"](), commands["build_help_text"]("zh"))
        self.assertIn("Available shortcut commands:", commands["build_help_text"]())
        for command, action in (("/?", "help"), ("/restart", "reset"), ("/stop", "stop"),
                                ("/retry", "retry"), ("/model test", "model"),
                                ("/persona test", "personality"), ("/skills", "skills"),
                                ("/plan", "mode"), ("/read", "mode"), ("/edit", "mode"),
                                ("/yolo", "mode"), ("/cowork", "mode"), ("/goal", "mode")):
            self.assertEqual(commands["parse_im_action"](command), action)
        for command in ("/sub", "/unsub"):
            self.assertEqual(commands["parse_subscribe_action"](command), command[1:])
        self.assertFalse(commands["is_shortcuts_enabled"]({"systemSettings": {"enableShortcuts": False}}))
        source = (ROOT / "static/js/vue_methods.js").read_text(encoding="utf-8")
        handler = source.split("    handleShortcutCommand(raw) {", 1)[1].split("    async sendMessage(", 1)[0]
        self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in handler))
        import re
        mode_map = re.search(r"const modeMap = (\{[^\n]+\});", handler)
        self.assertIsNotNone(mode_map)
        self.assertEqual(json.loads(mode_map.group(1).replace("'", '"')), commands["MODE_COMMAND_MAP"])

    def test_english_soulx_preload_and_livestream(self):
        for relative in ("static/js/soulx.js", "static/soulx.html",
                         "static/js/preload.js", "py/twitch_service.py", "py/ytdm.py"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source), relative)
            if relative.endswith(".py"):
                ast.parse(source, filename=relative)
        html = (ROOT / "static/soulx.html").read_text(encoding="utf-8")
        self.assertIn('lang="en-US"', html)
        for control in ("drag-btn", "lock-btn", "hide-btn", "voice-btn", "text-btn",
                        "subtitle-btn", "refresh-btn", "close-btn"):
            self.assertIn(f'id="{control}"', html)
        twitch = (ROOT / "py/twitch_service.py").read_text(encoding="utf-8")
        youtube = (ROOT / "py/ytdm.py").read_text(encoding="utf-8")
        for event in ("danmaku", "buy_guard", "gift", "enter_room"):
            self.assertIn(f'"{event}"', twitch)
        for event in ("danmaku", "super_chat", "gift"):
            self.assertIn(f'"{event}"', youtube)
        renderer = (ROOT / "static/js/renderer.js").read_text(encoding="utf-8")
        self.assertIn('TTS playback request:', renderer)

    def test_renderer_source_is_english(self):
        source = (ROOT / "static/js/renderer.js").read_text(encoding="utf-8")
        self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source))

    def test_updater_disabled_pending_fork_feed(self):
        source = (ROOT / "main.js").read_text(encoding="utf-8")
        self.assertIn("const ENABLE_AUTO_UPDATES = false", source)
        self.assertIn("if (ENABLE_AUTO_UPDATES) setupAutoUpdater()", source)


if __name__ == "__main__":
    unittest.main()
