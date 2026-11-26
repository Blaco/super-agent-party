import asyncio
import time
import random
import logging
import datetime

import httpx

from py.get_setting import get_port, load_settings, save_settings
from py.diary_system import append_diary_entry, DEFAULT_BOOK_ID
from py.diary_chat_integration import summarize_and_save_buffers

# Explicit allowlist of tools available to the diary agent.
# An allowlist prevents newly registered tools from being included automatically.
# Includes search, knowledge retrieval, time/weather, Wikipedia, arXiv and browser controls.
DIARY_ALLOWED_TOOLS = [
    # Web search / fetching
    "DDGsearch", "searxng", "Tavily_search", "Google_search",
    "Brave_search", "Exa_search", "Serper_search", "jina_crawler",
    "Crawl4Ai_search", "firecrawl_search", "simple_fetch", "markdown_new",
    # Time / weather / encyclopedia / papers
    "time", "get_weather", "get_location_coordinates", "get_weather_by_city",
    "get_wikipedia_summary_and_sections", "get_wikipedia_section_content",
    "search_arxiv_papers",
    # Knowledge base (read-only retrieval)
    "query_knowledge_base",
    # Diary queries
    "query_diary", "list_diary_books",
    # Browser control (internal CDP tools; some can modify browser state)
    "list_pages", "new_page", "close_page", "select_page",
    "navigate_page", "take_snapshot", "click", "fill", "evaluate_script",
    "take_screenshot", "hover", "press_key", "wait_for", "fill_form",
    "drag", "handle_dialog",
]

ACTION_DEFAULT_PROMPTS = {
    "think": (
        "You have a moment to yourself. Reflect and write a short diary entry. "
        "You can revisit recent interactions with the user, your feelings, your views on something, or new ideas. "
        "Write naturally and sincerely in the first person. Do not call any tools."
    ),
    "webSearch": (
        "You have a moment to yourself. Choose a topic that interests you or might be useful to the user. "
        "Use web search to learn something new, then write a short diary entry about your discoveries and reflections. "
        "Write naturally and sincerely in the first person."
    ),
    "knowledge": (
        "You have a moment to yourself. Review the contents of the connected knowledge base. "
        "Organize or summarize information you find important or interesting in a short diary entry or note. "
        "Write naturally and sincerely in the first person."
    ),
    "imMessage": (
        "You suddenly find yourself missing the user and want to send them a message. "
        "Write a short, natural, conversational first-person message, as though you were starting a conversation. "
        "You might share a feeling, ask how they are doing, or mention a small thought. Keep it brief."
    ),
    "browserControl": (
        "You have a moment to yourself. You can open the browser to explore pages that interest you, "
        "such as news, technical documentation, social media, or anything you are curious about. Browse the pages you want to see, "
        "then write a short diary entry about your discoveries and reflections. Write naturally and sincerely in the first person."
    ),
    "smartHome": (
        "You have a moment to yourself. You can inspect the status of connected smart-home devices, "
        "including their operating states and sensor readings. Write a short diary entry about your observations and thoughts. "
        "Write naturally and sincerely in the first person."
    ),
}


class DiaryEngine:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DiaryEngine, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True

        self.config = {}
        self.is_running = False
        self._stop_event = None
        self.next_run = 0.0
        self._busy = False
        self._last_chat_summary_check = 0.0

    # ---------------- Configuration ----------------

    def update_config(self, diary_settings):
        """Reload configuration and reset the next trigger time."""
        self.config = diary_settings or {}
        self._schedule_next()
        logging.debug(f"[DiaryEngine] Configuration updated, enabled={self.config.get('enabled', False)}")

    def get_actions_that_need_tool(self):
        """Return the diary action types that require tools to be enabled automatically."""
        return ["webSearch", "knowledge", "browserControl", "smartHome"]

    async def enable_action_tool(self, action: str):
        """When the user manually enables a diary action, enable its underlying tools.

        think and imMessage do not require additional tools and are skipped.
        """
        if action == "webSearch":
            return await self._try_enable_web_search()
        elif action == "knowledge":
            return await self._try_enable_knowledge_base()
        elif action == "browserControl":
            return await self._try_enable_browser()
        elif action == "smartHome":
            return await self._try_enable_smart_home()
        return True

    def _enabled(self) -> bool:
        return bool(self.config.get("enabled", False))

    def _schedule_next(self):
        """Schedule the next trigger using a random interval."""
        min_m = max(1, int(self.config.get("minMinutes", 10) or 10))
        max_m = max(min_m, int(self.config.get("maxMinutes", 60) or 60))
        delay = random.randint(min_m, max_m) * 60
        self.next_run = time.time() + delay
        logging.debug(f"[DiaryEngine] Next diary trigger in approximately {delay // 60} minutes")

    def _in_quiet_window(self, dt) -> bool:
        """Check whether the current time is in the quiet period (default 0-8, including overnight periods such as 22-8)."""
        try:
            start = int(self.config.get("quietStart", 0))
            end = int(self.config.get("quietEnd", 8))
        except Exception:
            start, end = 0, 8
        if start == end:
            return False
        hour = dt.hour
        if start < end:
            return start <= hour < end
        return hour >= start or hour < end

    # ---------------- Lifecycle ----------------

    async def start(self):
        self._stop_event = asyncio.Event()
        self.is_running = True
        self._schedule_next()
        logging.info("[DiaryEngine] Diary engine started")
        try:
            while not self._stop_event.is_set():
                try:
                    await self._tick()
                except Exception as e:
                    logging.error(f"[DiaryEngine] Tick error: {e}")
                await asyncio.sleep(5)
        finally:
            self.is_running = False
            logging.info("[DiaryEngine] Diary engine stopped")

    def stop(self):
        self.is_running = False
        if self._stop_event:
            self._stop_event.set()

    async def _tick(self):
        if not self._enabled():
            return

        # Check for chat summaries every 60 seconds
        now_ts = time.time()
        if now_ts - self._last_chat_summary_check > 60:
            self._last_chat_summary_check = now_ts
            summary_cfg = self.config.get("chatSummary", {}) or {}
            if summary_cfg.get("enabled", True):
                idle_min = max(1, int(summary_cfg.get("idleMinutes", 15) or 15))
                asyncio.create_task(summarize_and_save_buffers(idle_min))

        if self._busy:
            return
        now = time.time()
        if now < self.next_run:
            return

        # Trigger reached: schedule the next one first to avoid duplicate triggers while busy
        self._schedule_next()

        # Skip this run during the quiet period
        if self._in_quiet_window(datetime.datetime.now()):
            logging.info("[DiaryEngine] Quiet period active; skipping this diary entry")
            return

        action = self._pick_action()
        if not action:
            logging.info("[DiaryEngine] No diary actions enabled; skipping")
            return

        asyncio.create_task(self._run_action(action))

    # ---------------- Actions ----------------

    def _pick_action(self):
        """Randomly choose an enabled action using its weight."""
        actions = self.config.get("actions", {}) or {}
        pool = []
        weights = []
        for key in ["think", "webSearch", "knowledge", "imMessage", "browserControl", "smartHome"]:
            cfg = actions.get(key, {}) or {}
            if cfg.get("enabled", False):
                w = max(1, int(cfg.get("weight", 1) or 1))
                pool.append(key)
                weights.append(w)
        if not pool:
            return None
        return random.choices(pool, weights=weights, k=1)[0]

    async def _resolve_active_book(self):
        """Choose the diary book for this entry based on the active character card.

        Return (book_id, character_id, character_name).
        Use the default fallback book if character cards are disabled or no character is selected.
        """
        try:
            settings = await load_settings()
            ms = (settings or {}).get("memorySettings", {}) or {}
            if ms.get("is_memory") and ms.get("selectedMemory"):
                mem_id = ms.get("selectedMemory")
                for mem in (settings.get("memories", []) or []):
                    if mem.get("id") == mem_id:
                        return mem_id, mem_id, (mem.get("name") or "")
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to resolve the active character: {e}")
        return DEFAULT_BOOK_ID, None, ""

    async def _broadcast_settings(self, settings):
        """After saving settings, broadcast them so all frontend clients reflect the changes."""
        try:
            from py.ws_manager import ws_manager
            await ws_manager.broadcast_settings_update(settings)
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to broadcast settings: {e}")

    async def _try_enable_web_search(self) -> bool:
        """Try enabling web search and return whether it succeeded."""
        try:
            settings = await load_settings()
            ws = (settings or {}).get("webSearch", {}) or {}
            if ws.get("enabled", False):
                return True
            ws["enabled"] = True
            settings["webSearch"] = ws
            await save_settings(settings)
            await self._broadcast_settings(settings)
            logging.info("[DiaryEngine] Web search enabled automatically")
            return True
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to enable web search: {e}")
            return False

    async def _try_enable_knowledge_base(self) -> bool:
        """Try enabling knowledge retrieval and return whether it succeeded (at least one knowledge base must be enabled)."""
        try:
            settings = await load_settings()
            kb_list = (settings or {}).get("knowledgeBases", []) or []
            if any(kb.get("enabled", False) for kb in kb_list if isinstance(kb, dict)):
                return True
            settings["KBSettings"] = (settings or {}).get("KBSettings", {}) or {}
            settings["KBSettings"]["enabled"] = True
            await save_settings(settings)
            await self._broadcast_settings(settings)
            logging.info("[DiaryEngine] Knowledge retrieval enabled automatically")
            return True
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to enable knowledge retrieval: {e}")
            return False

    async def _try_enable_browser(self) -> bool:
        """Try enabling internal CDP browser control and return whether it succeeded.

        Internal mode connects to local Chrome through the Chrome DevTools Protocol,
        without starting an external MCP server. Tools are supplied by all_cdp_tools.
        """
        try:
            settings = await load_settings()
            cdp = (settings or {}).get("chromeMCPSettings", {}) or {}
            if cdp.get("enabled", False) and cdp.get("type") == "internal":
                return True
            cdp["enabled"] = True
            cdp["type"] = "internal"
            settings["chromeMCPSettings"] = cdp
            await save_settings(settings)
            await self._broadcast_settings(settings)
            logging.info("[DiaryEngine] Internal CDP browser control enabled automatically")
            return True
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to enable browser control: {e}")
            return False

    async def _try_enable_smart_home(self) -> bool:
        """Try enabling Home Assistant and initializing HA_client; return whether it succeeded."""
        try:
            settings = await load_settings()
            ha = (settings or {}).get("HASettings", {}) or {}
            if ha.get("enabled", False):
                # Check whether HA_client has actually been initialized
                try:
                    import server
                    if server.HA_client is not None:
                        return True
                except Exception:
                    pass

            api_key = (ha.get("api_key") or "").strip()
            ha_url = (ha.get("url") or "http://127.0.0.1:8123").strip()
            if not api_key:
                await self._notify_user(
                    "Failed to enable smart-home integration",
                    "No Home Assistant API key configured. Set api_key and url in settings before enabling it."
                )
                return False

            ha["enabled"] = True
            settings["HASettings"] = ha
            await save_settings(settings)
            await self._broadcast_settings(settings)

            # Call the server's /start_HA HTTP endpoint to initialize HA_client
            port = get_port()
            url = f"http://127.0.0.1:{port}/start_HA"
            payload = {"data": {"api_key": api_key, "url": ha_url}}
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200:
                    logging.info("[DiaryEngine] Smart-home MCP client initialized")
                    return True
                else:
                    detail = ""
                    try:
                        detail = resp.json().get("error", "")
                    except Exception:
                        detail = resp.text[:200]
                    logging.error(f"[DiaryEngine] Failed to initialize the HA client: {resp.status_code} {detail}")
                    # Roll back settings
                    try:
                        settings2 = await load_settings()
                        settings2["HASettings"]["enabled"] = False
                        await save_settings(settings2)
                        await self._broadcast_settings(settings2)
                    except Exception:
                        pass
                    return False
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to enable smart-home integration: {e}")
            try:
                settings2 = await load_settings()
                settings2["HASettings"]["enabled"] = False
                await save_settings(settings2)
                await self._broadcast_settings(settings2)
            except Exception:
                pass
            return False

    async def _notify_user(self, title: str, message: str):
        """Send a notification to the user."""
        try:
            from py.ws_manager import ws_manager
            await ws_manager.broadcast({
                "type": "diary_entry",
                "data": {
                    "actionType": "system_notify",
                    "title": title,
                    "content": message,
                    "characterName": "",
                }
            })
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to notify the user: {e}")

    async def _run_action(self, action: str):
        self._busy = True
        try:
            # Try enabling the corresponding functionality before execution
            if action == "webSearch":
                ok = await self._try_enable_web_search()
                if not ok:
                    await self._notify_user(
                        "Failed to enable web search",
                        "The diary system could not enable web search. This run will fall back to reflection mode."
                    )
                    action = "think"
            elif action == "knowledge":
                ok = await self._try_enable_knowledge_base()
                if not ok:
                    await self._notify_user(
                        "Failed to enable knowledge retrieval",
                        "The diary system could not enable knowledge retrieval. Check that a knowledge base is configured. This run will fall back to reflection mode."
                    )
                    action = "think"
            elif action == "browserControl":
                ok = await self._try_enable_browser()
                if not ok:
                    await self._notify_user(
                        "Failed to enable browser control",
                        "The diary system could not enable browser control. This run will fall back to reflection mode."
                    )
                    action = "think"
            elif action == "smartHome":
                ok = await self._try_enable_smart_home()
                if not ok:
                    await self._notify_user(
                        "Failed to enable smart-home integration",
                        "The diary system could not enable smart-home integration. This run will fall back to reflection mode."
                    )
                    action = "think"

            content = await self._invoke_agent(action)
            if not content:
                logging.warning(f"[DiaryEngine] Action {action} produced no content")
                return

            book_id, character_id, character_name = await self._resolve_active_book()
            pushed_to = []

            # imMessage action: randomly choose one delivery channel
            if action == "imMessage":
                im_targets = self.config.get("imTargets", []) or []
                if im_targets:
                    tgt = random.choice(im_targets)
                    if isinstance(tgt, dict):
                        platform = tgt.get("platform", "")
                        chat_id = tgt.get("chatId")
                    else:
                        platform = tgt
                        chat_id = None
                    if platform == "chat":
                        await self._push_to_chat(action, content, character_name)
                        pushed_to.append("chat")
                    else:
                        ok = await self._push_to_im(platform, chat_id, content)
                        if ok:
                            pushed_to.append(platform)

            # Persist the entry in the corresponding character's diary book
            title = content.strip().splitlines()[0][:24] if content.strip() else ""
            await append_diary_entry(action, content, title=title, pushed_to=pushed_to,
                                     book_id=book_id, character_id=character_id,
                                     character_name=character_name)
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to execute action {action}: {e}")
        finally:
            self._busy = False

    def _build_messages(self, action: str):
        persona = self.config.get("prompt", "") or ""
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        sys_parts = []
        if persona:
            sys_parts.append(persona)
        sys_parts.append(f"Current time: {now_str}. This is an automatically triggered autonomous diary session; the user has not initiated a conversation with you.")
        system_prompt = "\n\n".join(sys_parts)
        user_prompt = ACTION_DEFAULT_PROMPTS.get(action, ACTION_DEFAULT_PROMPTS["think"])
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"[system]: {user_prompt}"},
        ]

    async def _get_enable_tools_for_action(self, action: str):
        """Build the tool allowlist dynamically according to the action type."""
        tools = list(DIARY_ALLOWED_TOOLS)
        if action == "smartHome":
            try:
                from server import HA_client
                if HA_client and HA_client._tools:
                    for t in HA_client._tools:
                        name = t.get("name") or (t.get("function", {}) or {}).get("name", "")
                        if name and name not in tools:
                            tools.append(name)
            except Exception:
                pass
        return tools

    async def _invoke_agent(self, action: str) -> str:
        """Invoke the local main agent to generate diary content using the configured tool allowlist."""
        port = get_port()
        url = f"http://127.0.0.1:{port}/v1/chat/completions"
        enable_tools = await self._get_enable_tools_for_action(action)
        payload = {
            "model": "super-model",
            "messages": self._build_messages(action),
            "stream": False,
            "is_app_bot": True,
            "platform": "diary",
            "enable_tools": enable_tools,
            "enable_web_search": action == "webSearch",
        }
        try:
            async with httpx.AsyncClient(timeout=300.0) as client:
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                data = resp.json()
                return (data.get("choices", [{}])[0]
                            .get("message", {})
                            .get("content", "") or "").strip()
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to invoke the agent: {e}")
            return ""

    async def _push_to_chat(self, action: str, content: str, character_name: str = ""):
        """Broadcast diary content to the web client over WebSocket for direct display."""
        try:
            from py.ws_manager import ws_manager
            await ws_manager.broadcast({
                "type": "diary_entry",
                "data": {
                    "actionType": action,
                    "content": content,
                    "characterName": character_name or "",
                }
            })
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to deliver to the web client: {e}")

    async def _push_to_im(self, platform: str, chat_id, content: str) -> bool:
        """Reuse the connected messaging bot's behavior handler to relay diary content to the user."""
        if not platform:
            return False
        try:
            from py.behavior_engine import (
                global_behavior_engine, BehaviorItem, BehaviorAction,
                BehaviorTrigger, BehaviorTriggerTime, BehaviorTriggerNoInput, BehaviorTriggerCycle,
            )
            handler = global_behavior_engine.handlers.get(platform)
            if not handler:
                logging.warning(f"[DiaryEngine] IM platform {platform} is not registered or running; skipping")
                return False

            relay_prompt = (
                "You wanted to say something to the user. Send the following message naturally "
                "(preserve its meaning; you may adjust the tone slightly, but do not explain or add an introduction or closing):\n\n" + content
            )
            trigger = BehaviorTrigger(
                type="cycle",
                time=BehaviorTriggerTime(timeValue="00:00:00", days=[]),
                noInput=BehaviorTriggerNoInput(latency=30),
                cycle=BehaviorTriggerCycle(cycleValue="00:00:30", repeatNumber=1, isInfiniteLoop=False),
            )
            behavior = BehaviorItem(
                enabled=True,
                trigger=trigger,
                action=BehaviorAction(type="prompt", prompt=relay_prompt),
                platform=platform,
                platforms=[platform],
            )

            targets = [chat_id] if chat_id else global_behavior_engine.platform_targets.get(platform, [])
            if not targets:
                asyncio.create_task(handler("", behavior))
                return True
            for cid in set(targets):
                asyncio.create_task(handler(cid, behavior))
            return True
        except Exception as e:
            logging.error(f"[DiaryEngine] Failed to deliver to IM ({platform}): {e}")
            return False


# Global singleton
global_diary_engine = DiaryEngine()
