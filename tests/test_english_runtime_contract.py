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

    def test_renderer_and_vue_state_source_are_english(self):
        for relative in ("static/js/renderer.js", "static/js/vue_data.js"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source), relative)

    def test_server_and_vue_methods_source_are_english(self):
        server = (ROOT / "server.py").read_text(encoding="utf-8")
        vue = (ROOT / "static/js/vue_methods.js").read_text(encoding="utf-8")
        for name, source in (("server.py", server), ("vue_methods.js", vue)):
            with self.subTest(module=name):
                self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source))
        tree = ast.parse(server, filename="server.py")
        hints = next(
            ast.literal_eval(node.value)
            for node in tree.body
            if isinstance(node, ast.Assign)
            and any(isinstance(target, ast.Name)
                    and target.id == "GROUP_MEMORY_DONE_HINTS" for target in node.targets)
        )
        self.assertIn("\u5b8c\u6210", hints)
        self.assertIn("done", hints)
        self.assertIn(r'\u65c1\u767d', server)
        self.assertIn("ext_select_app(port=0)", server)
        self.assertIn("Generate the card in the same language as the user's input.", vue)
        self.assertIn("Filename: ", vue)
        self.assertIn("File link: ", vue)
        card_prompt = vue.split("const systemPrompt = "+chr(96)+"You are a professional character designer.", 1)[1]
        card_prompt = card_prompt.split(chr(96)+";", 1)[0]
        example = card_prompt[card_prompt.index("{"):card_prompt.rindex("}") + 1]
        example = json.loads(example.replace(r"\\n", r"\n"))
        self.assertIn("\n", example["mesExample"])
        self.assertEqual(example["characterBook"][0]["keysRaw"], "keyword1\nkeyword2")
        self.assertNotIn("avatar", example)

    def test_main_process_and_main_template_are_english(self):
        main = (ROOT / "main.js").read_text(encoding="utf-8")
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        for name, source in (("main.js", main), ("static/index.html", html)):
            with self.subTest(module=name):
                self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source))
        self.assertEqual(html.count(r"""<el-option label="Japanese" :value="'\u65e5\u672c\u8a9e'">"""), 2)
        self.assertIn("REAL_PORT_FOUND", main)
        self.assertIn("shell.trashItem(filePath)", main)
        self.assertIn("Backend started but health check response timed out", main)

    def test_dynamic_island_english_and_tool_contract(self):
        source = (ROOT / "static/js/island-app.js").read_text(encoding="utf-8")
        html = (ROOT / "static/island.html").read_text(encoding="utf-8")
        server = (ROOT / "server.py").read_text(encoding="utf-8")
        for content in (source, html):
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in content))
            self.assertNotIn("zh-CN", content)
        self.assertIn("islandLang: 'en-US'", source)
        self.assertIn("weatherCity: ''", source)
        self.assertIn("localStorage.getItem('island_weather_city')", source)
        self.assertIn("if (this.weatherCity) return;", source)
        self.assertIn("if (data.city && !this.weatherCity)", source)
        self.assertIn("if (this.weatherError) return this.weatherError;", source)
        setter = source.split("case 'island_weather_set_city':", 1)[1].split("case 'island_get_time':", 1)[0]
        self.assertIn("this.ipLat = null;", setter)
        self.assertIn("this.ipLon = null;", setter)
        self.assertIn('lang="en-US"', html)
        self.assertIn('async def proxy_geocode(city: str, lang: str = "en"):', server)
        for name in ("island_music_play", "island_weather_get_current",
                     "island_task_create", "island_calendar_list",
                     "island_pomodoro_start", "island_clipboard_write",
                     "island_translate"):
            self.assertIn("name: '" + name + "'", source)

    def test_vrm_renderer_source_is_english(self):
        source = (ROOT / "static/js/vrm.js").read_text(encoding="utf-8")
        self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source))
        for contract in ("VRMLoaderPlugin", "VRMUtils.rotateVRM0(vrm)",
                         "startLipSyncForChunk(task)", "/VMC/Ext/Bone/Pos",
                         "ttsWebSocket.binaryType = 'arraybuffer'"):
            self.assertIn(contract, source)

    def test_cli_tool_source_is_english(self):
        path = ROOT / "py/cli_tool.py"
        source = path.read_text(encoding="utf-8")
        ast.parse(source, filename=str(path))
        self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source))
        for contract in ("COMMAND_TIMEOUT = 300", "resolve_strict_path",
                         "get_or_create_docker_sandbox", "bubblewrap",
                         '"allow_write": [cwd]', '"allow_read": [cwd]',
                         '"allow_net": True'):
            self.assertIn(contract, source)

    def test_local_application_and_island_backend_are_english(self):
        for relative in ("py/local_app_control.py", "py/ext_cdp.py",
                         "py/dynamic_island.py", "py/uv_api.py"):
            path = ROOT / relative
            source = path.read_text(encoding="utf-8")
            ast.parse(source, filename=str(path))
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source), relative)
        local = (ROOT / "py/local_app_control.py").read_text(encoding="utf-8")
        self.assertIn("_external_connections", local)
        self.assertIn("webSocketDebuggerUrl", local)
        self.assertIn(r"\u542f\u52a8\u5668", local)
        external = (ROOT / "py/ext_cdp.py").read_text(encoding="utf-8")
        for name in ("ext_list_apps", "ext_select_app", "ext_snapshot",
                     "ext_evaluate_script", "ext_click_by_text"):
            self.assertIn('"name": "' + name + '"', external)

    def test_skill_and_extension_managers_are_english(self):
        for relative in ("py/skills.py", "py/extensions.py"):
            path = ROOT / relative
            source = path.read_text(encoding="utf-8")
            ast.parse(source, filename=str(path))
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source), relative)
        ext = (ROOT / "py/extensions.py").read_text(encoding="utf-8")
        self.assertNotIn("gitee.com", ext)
        self.assertNotIn("super-agent-party.github.io", ext)
        self.assertIn('@router.get("/remote-list"', ext)
        self.assertIn("parse_repo_urls", ext)
        self.assertIn("extension_catalog.json", ext)
        catalog = json.loads((ROOT / "config/extension_catalog.json").read_text(encoding="utf-8"))
        self.assertIsInstance(catalog, list)
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        self.assertIn("Blaco/super-agent-party/blob/agent-creation/config/extension_catalog.json", html)

    def test_search_and_image_tools_are_english(self):
        for relative in ("py/web_search.py", "py/pollinations.py"):
            path = ROOT / relative
            source = path.read_text(encoding="utf-8")
            ast.parse(source, filename=str(path))
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source), relative)
        image = (ROOT / "py/pollinations.py").read_text(encoding="utf-8")
        self.assertIn("process_image_content", image)
        self.assertIn("modalities", image)
        self.assertIn("![Image name](image URL)", image)

    def test_model_managers_and_dify_adapter_are_english(self):
        for relative in ("py/dify_openai.py", "py/sherpa_model_manager.py",
                         "py/moss_model_manager.py", "py/ebd_model_manager.py",
                         "py/minilm_router.py"):
            path = ROOT / relative
            source = path.read_text(encoding="utf-8")
            ast.parse(source, filename=str(path))
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source), relative)

    def test_startup_capture_and_accessibility_are_english(self):
        for relative in ("static/shotOverlay.html", "static/skeleton.html",
                         "py/ui_tree_helper.py", "start.js"):
            path = ROOT / relative
            source = path.read_text(encoding="utf-8")
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source), relative)
            if path.suffix == ".py":
                ast.parse(source, filename=str(path))
        for relative in ("static/shotOverlay.html", "static/skeleton.html"):
            self.assertNotIn("zh-CN", (ROOT / relative).read_text(encoding="utf-8"))

    def test_alternate_chat_is_english(self):
        source = (ROOT / "static/chat.html").read_text(encoding="utf-8")
        self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source))
        self.assertIn("groupedFilteredConversations", source)
        self.assertIn("handleInputPaste", source)
        self.assertIn("viewingTaskDetail.progress", source)
        self.assertIn("systemSettings.chatMode", source)

    def test_webview_preload_source_is_english(self):
        source = (ROOT / "static/js/webview-preload.js").read_text(encoding="utf-8")
        self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source))

    def test_fork_catalog_packaging_and_legacy_defaults(self):
        config = json.loads((ROOT / "config/settings_template.json").read_text(encoding="utf-8"))
        self.assertEqual(config["BotConfig"]["imgHost"], "easyImage2")
        self.assertFalse(config["BotConfig"]["imgHost_enabled"])
        self.assertFalse(any(key.startswith("gitee_") for key in config["BotConfig"]))
        vue = (ROOT / "static/js/vue_data.js").read_text(encoding="utf-8")
        self.assertNotIn("gitee_", vue)
        self.assertNotIn("SMMS_api_key", vue)
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        self.assertNotIn("super-agent-party.github.io", html)
        self.assertNotIn("github.com/modelscope/FunASR", html)
        self.assertIn("The saved speech recognition engine is no longer supported.", html)
        self.assertEqual(html.count("Blaco/super-agent-party/blob/agent-creation/config/extension_catalog.json"), 2)
        spec_path = ROOT / "server.spec"
        spec = spec_path.read_text(encoding="utf-8")
        ast.parse(spec, filename=str(spec_path))
        self.assertIn("('config/extension_catalog.json', 'config')", spec)
        self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in spec))

    def test_retired_asr_is_not_selectable_or_dispatched(self):
        for relative in ("server.py", "static/index.html", "static/js/vue_data.js",
                         "static/js/vue_methods.js", "static/js/locales/en-US.js",
                         "config/settings_template.json"):
            source = (ROOT / relative).read_text(encoding="utf-8")
            self.assertNotIn("funasr", source.lower(), relative)
        config = json.loads((ROOT / "config/settings_template.json").read_text(encoding="utf-8"))
        self.assertEqual(config["asrSettings"]["engine"], "sherpa")
        self.assertFalse(config["asrSettings"]["enabled"])
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        ast.parse(source)
        socket = source.split('@app.websocket("/ws/asr")', 1)[1].split('@app.post("/asr")', 1)[0]
        http = source.split('@app.post("/asr")', 1)[1].split("class TTSConnectionManager:", 1)[0]
        self.assertEqual(socket.count('if asr_engine not in ("sherpa", "openai"):'), 2)
        for engine in ("sherpa", "openai"):
            self.assertIn(f'asr_engine == "{engine}"', socket)
            self.assertIn(f'asr_engine == "{engine}"', http)
        self.assertIn("Unsupported ASR engine:", http)
        self.assertNotIn("websockets.connect", socket + http)

    def test_moss_source_localization_and_normalizer_contract(self):
        import runpy
        for relative in ("py/moss/tts_robust_normalizer_single_script.py",
                         "py/moss/tts_runtime.py"):
            path = ROOT / relative
            source = path.read_text(encoding="utf-8")
            ast.parse(source, filename=str(path))
            self.assertFalse(any(0x3400 <= ord(c) <= 0x9FFF for c in source), relative)
        module = runpy.run_path(str(ROOT / "py/moss/tts_robust_normalizer_single_script.py"))
        self.assertTrue(any(any(0x3400 <= ord(c) <= 0x9FFF for c in sample)
                            for _, sample, _ in module["TEST_CASES"]))
        normalize = module["normalize_tts_text"]
        self.assertEqual(normalize("This   is   a   test."), "This is a test.")
        self.assertEqual(normalize("A->B"), "A\uFF0CB\u3002")

    def test_updater_disabled_pending_fork_feed(self):
        source = (ROOT / "main.js").read_text(encoding="utf-8")
        self.assertIn("const ENABLE_AUTO_UPDATES = false", source)
        self.assertIn("if (ENABLE_AUTO_UPDATES) setupAutoUpdater()", source)


if __name__ == "__main__":
    unittest.main()
