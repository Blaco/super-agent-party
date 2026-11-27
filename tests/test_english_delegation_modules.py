"""Protect English task, delegation and relationship module surfaces."""
import ast
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
MODULES = (
    "agent", "agent_tool", "a2a_tool", "affection_api", "affection_system",
    "diary_api", "scheduler", "task_center", "llm_tool", "task_tools",
    "sub_agent", "diary_system", "diary_chat_integration", "diary_engine",
    "autoBehavior", "behavior_engine", "mode_change", "mcp_clients",
    "ClaudeAsOpenAI", "GeminiAsOpenAI", "ResponsesAsOpenAI", "know_base",
    "comfyui_tool", "code_interpreter", "custom_http", "ws_manager",
    "utility_tools", "cdp_tool", "overlay_router", "node_runner", "docker_api",
    "tha_engine", "moss_tts",
    "computer_use_tool",
)
HAN = re.compile(r"[\u3400-\u9fff\U00020000-\U0002A6DF]")


class EnglishDelegationModules(unittest.TestCase):
    def test_localized_modules_parse_and_contain_no_literal_han(self):
        for name in MODULES:
            with self.subTest(module=name):
                source = (ROOT / "py" / (name + ".py")).read_text(encoding="utf-8")
                ast.parse(source)
                self.assertIsNone(HAN.search(source))

    def test_advertised_task_delivery_channels(self):
        source = (ROOT / "py/task_tools.py").read_text(encoding="utf-8")
        for node in ast.parse(source).body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "create_subtask_tool"
                for target in node.targets
            ):
                schema = ast.literal_eval(node.value)
                platforms = schema["function"]["parameters"]["properties"]["platforms"]
                self.assertEqual(
                    platforms["items"]["enum"], ["chat", "telegram", "discord", "slack"]
                )
                return
        self.fail("create_subtask_tool schema not found")

    def test_automatic_behavior_delivery_channels(self):
        source = (ROOT / "py/autoBehavior.py").read_text(encoding="utf-8")
        for node in ast.parse(source).body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "auto_behavior_tool"
                for target in node.targets
            ):
                schema = ast.literal_eval(node.value)
                platforms = schema["function"]["parameters"]["properties"]["platforms"]
                self.assertEqual(
                    platforms["items"]["enum"], ["chat", "telegram", "discord", "slack"]
                )
                return
        self.fail("auto_behavior_tool schema not found")

    def test_diary_does_not_advertise_removed_search_tool(self):
        source = (ROOT / "py/diary_engine.py").read_text(encoding="utf-8")
        for node in ast.parse(source).body:
            if isinstance(node, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "DIARY_ALLOWED_TOOLS"
                for target in node.targets
            ):
                tools = ast.literal_eval(node.value)
                self.assertNotIn("bochaai_search", tools)
                self.assertIn("DDGsearch", tools)
                self.assertIn("query_diary", tools)
                return
        self.fail("DIARY_ALLOWED_TOOLS not found")

    def test_core_memory_and_media_instructions(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        ast.parse(source)
        expected = {
            "Current conversation group:": 1,
            "You extract structured memories.": 1,
            "Image information (URL:": 4,
            "<silence>![image name](image_url)</silence>": 2,
            "First text input: prompt for image or video generation.": 2,
            "Second text input: prompt for image or video generation.": 2,
            "First image input: an image URL": 2,
            "Second image input: an image URL": 2,
            "Break the user's question or current task into steps": 2,
            "If the user has not asked a question or assigned a task": 2,
        }
        for fragment, count in expected.items():
            with self.subTest(fragment=fragment):
                self.assertEqual(source.count(fragment), count)

    def test_utility_defaults_and_weather_code_mapping(self):
        source = (ROOT / "py/utility_tools.py").read_text(encoding="utf-8")
        module = ast.parse(source)
        definitions = {node.name: node for node in module.body
                       if isinstance(node, ast.AsyncFunctionDef)}
        for name in ("get_wikipedia_summary_and_sections", "get_wikipedia_section_content"):
            self.assertEqual(ast.literal_eval(definitions[name].args.defaults[-1]), "en")
        self.assertEqual(ast.literal_eval(definitions["get_weather_by_city"].args.defaults[0]), "en")
        assignments = {target.id: node.value for node in module.body
                       if isinstance(node, ast.Assign) for target in node.targets
                       if isinstance(target, ast.Name)}
        for name in ("wikipedia_summary_tool", "wikipedia_section_tool"):
            schema = ast.literal_eval(assignments[name])
            self.assertEqual(schema["function"]["parameters"]["properties"]["language"]["default"], "en")
        weather = ast.literal_eval(assignments["_WCODE_MAP"])
        self.assertEqual([weather[i] for i in range(4)],
                         ["Clear sky", "Mainly clear", "Partly cloudy", "Overcast"])
        self.assertEqual(weather[55], "Dense drizzle")
        self.assertEqual(weather[99], "Thunderstorm with heavy hail")

    def test_weather_chart_uses_english_coordinate_report(self):
        import asyncio
        import json
        from unittest.mock import Mock, AsyncMock

        source = (ROOT / "py/utility_tools.py").read_text(encoding="utf-8")
        module = ast.parse(source)
        function = next(node for node in module.body
                        if isinstance(node, ast.AsyncFunctionDef)
                        and node.name == "get_weather_by_city")
        response = Mock()
        response.json.return_value = {"dataseries": []}
        requests = Mock()
        requests.get.return_value = response
        namespace = {
            "get_location_coordinates": AsyncMock(return_value="Coordinates: 40.0, -80.0"),
            "requests": requests,
            "json": json,
        }
        exec(compile(ast.Module(body=[function], type_ignores=[]), "<weather>", "exec"), namespace)
        output = asyncio.run(namespace["get_weather_by_city"]("Test City"))
        self.assertIn("lang=en", output)
        self.assertIn("lat=40.0", output)
        self.assertIn("lon=-80.0", output)
        self.assertEqual(requests.get.call_args.kwargs["params"]["lang"], "en")
        response.raise_for_status.assert_called_once()

    def test_english_runtime_fallbacks(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        self.assertIn("tts_settings.get('edgettsLanguage', 'en-US')", source)
        self.assertIn("tts_settings.get('edgettsVoice', 'JennyNeural')", source)
        frontend = (ROOT / "static/js/vue_methods.js").read_text(encoding="utf-8")
        self.assertNotIn("toLocaleTimeString('zh-CN'", frontend)

    def test_avatar_language_fallbacks(self):
        tha = (ROOT / "static/js/tha.js").read_text(encoding="utf-8")
        html = (ROOT / "static/tha.html").read_text(encoding="utf-8")
        vrm = (ROOT / "static/js/vrm.js").read_text(encoding="utf-8")
        self.assertIsNone(HAN.search(tha))
        self.assertIsNone(HAN.search(html))
        self.assertIn('<html lang="en-US">', html)
        self.assertIn("return fb[lang]?.[key] || fb['en-US'][key] || key;", tha)
        self.assertIn("activeTooltipButton === wsStatusBtn", tha)
        self.assertIn("activeTooltipButton = button;", tha)
        self.assertIn("activeTooltipButton = null;", tha)
        self.assertIn("translations['en-US']?.[key]", vrm)
        self.assertNotIn("return 'zh-CN';", vrm)

    def test_desktop_coordinate_protocol(self):
        source = (ROOT / "py/computer_use_tool.py").read_text(encoding="utf-8")
        module = ast.parse(source)
        schemas = {}
        for node in module.body:
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Dict):
                try:
                    schema = ast.literal_eval(node.value)
                except (ValueError, TypeError):
                    continue
                if isinstance(schema.get("function"), dict):
                    function = schema["function"]
                    schemas[function["name"]] = function
        for name in ("mouse_move", "mouse_click", "mouse_double_click", "mouse_drag"):
            self.assertIn(name, schemas)
        for axis in ("x", "y"):
            coordinate = schemas["mouse_move"]["parameters"]["properties"][axis]
            self.assertEqual((coordinate["minimum"], coordinate["maximum"]), (0, 1000))
        for tag in ("MOVE", "DOUBLE_CLICK", "DRAG", "SCROLL", "HOLD", "LOGICAL_CLICK"):
            self.assertIn("[LAST_ACTION: " + tag, source)

    def test_vrm_interface_english_fallbacks(self):
        source = (ROOT / "static/js/vrm.js").read_text(encoding="utf-8")
        html = (ROOT / "static/vrm.html").read_text(encoding="utf-8")
        locale = (ROOT / "static/js/locales/en-US.js").read_text(encoding="utf-8")
        self.assertIn("Enter a message to chat...", source)
        for label in ("Enable voice input", "Disable voice input", "Enable text input",
                      "Disable text input", "Auto-hide on hover", "Collapse panel", "More options"):
            self.assertIn(label, source)
        self.assertNotIn("js/locales/zh-CN.js", html)
        self.assertIn('<html lang="en-US">', html)
        self.assertIsNone(HAN.search(html))
        self.assertIsNone(HAN.search(locale))

    def test_frontend_prompt_defaults_match_backend(self):
        import json
        source = (ROOT / "static/js/vue_data.js").read_text(encoding="utf-8")
        config = json.loads((ROOT / "config/settings_template.json").read_text(encoding="utf-8"))
        for key in ("loveSettings", "diarySettings"):
            with self.subTest(key=key):
                prompt = config[key]["prompt"]
                self.assertIn("prompt: " + json.dumps(prompt, ensure_ascii=False), source)
                self.assertIsNone(HAN.search(prompt))
        commands = source.split("shortcutCommands: [", 1)[1].split("defaultSeparators:", 1)[0]
        self.assertIsNone(HAN.search(commands))
        self.assertIn("aliases: ['/reset']", commands)
        self.assertEqual(source.count("What can you help me with?"), 3)

    def test_frontend_notifications_english(self):
        source = (ROOT / "static/js/vue_methods.js").read_text(encoding="utf-8")
        for line in source.splitlines():
            if line.lstrip().startswith("//") or "//" in line:
                continue
            if re.search(r"showNotification|showToast|showErrorToast|this\.\$(?:alert|confirm|message)|throw new Error", line):
                self.assertIsNone(HAN.search(line), line)

    def test_server_english_runtime_messages(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        ast.parse(source)
        for message in (
            "Logging initialized", "OpenAI ASR API key is not configured",
            "ElevenLabs voice ID is not configured", "MCP server initialization started",
            "Reference audio uploaded successfully", "Workspace path is not configured",
            "Knowledge base processing started", "Discord bot started",
            "Slack bot started", "Telegram bot started successfully",
        ):
            self.assertIn(message, source)
        self.assertEqual(source.count("Your input was blocked by the content safety policy."), 2)

    def test_cli_task_instructions_english(self):
        source = (ROOT / "py/cli_tool.py").read_text(encoding="utf-8")
        ast.parse(source)
        for line in source.splitlines():
            if line.lstrip().startswith("#") or "#" in line.split('"', 1)[0]:
                continue
            if re.search(r'"description":|yield f?"|return f?"|msg = f?"', line):
                if '"""' not in line and " # " not in line:
                    self.assertIsNone(HAN.search(line), line)
        self.assertEqual(source.count('["create", "list", "complete", "toggle", "update", "delete"]'), 2)
        self.assertIn("/workspace/.agents/ai_todos.json", source)
        self.assertIn("Task #{id} is already complete", source)
        server = (ROOT / "server.py").read_text(encoding="utf-8")
        self.assertIn("When you finish a task, update the project task list", server)
        self.assertIn("Current project tasks", server)

    def test_docker_deployment_uses_fork_source_without_regional_registry(self):
        data = (ROOT / "static/js/vue_data.js").read_text(encoding="utf-8")
        renderer = (ROOT / "static/js/renderer.js").read_text(encoding="utf-8")
        html = (ROOT / "static/index.html").read_text(encoding="utf-8")
        locale = (ROOT / "static/js/locales/en-US.js").read_text(encoding="utf-8")
        compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
        workflow = (ROOT / ".github/workflows/docker-publish.yml").read_text(encoding="utf-8")
        self.assertIn("git clone --branch agent-creation https://github.com/Blaco/super-agent-party.git", data)
        self.assertIn("docker build -t agent-creation:local .", data)
        self.assertIn("return this.dockerExamples;", renderer)
        self.assertIn("return this.dockerExamples2;", renderer)
        self.assertNotIn("dockerRegistry", data + renderer + html)
        self.assertNotIn("dockerChina", locale + html)
        self.assertFalse((ROOT / "docker-compose-acr.yml").exists())
        self.assertIn("build: .", compose)
        self.assertIn("127.0.0.1:3456:3456", compose)
        self.assertIn("push: false", workflow)
        self.assertNotIn("docker/login-action", workflow)
        self.assertNotIn("aliyuncs.com", data + workflow + compose)
        self.assertIsNone(HAN.search(dockerfile + compose))

    def test_main_task_completion_reminder(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        self.assertIn(
            "Assess whether the task is complete. If it is, call finish_main_task "
            "with the final output to mark it complete; otherwise continue working.",
            source,
        )


if __name__ == "__main__":
    unittest.main()
