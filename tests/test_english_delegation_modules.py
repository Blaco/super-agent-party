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

    def test_main_task_completion_reminder(self):
        source = (ROOT / "server.py").read_text(encoding="utf-8")
        self.assertIn(
            "Assess whether the task is complete. If it is, call finish_main_task "
            "with the final output to mark it complete; otherwise continue working.",
            source,
        )


if __name__ == "__main__":
    unittest.main()
