import asyncio
import json
import httpx
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from py.task_center import get_task_center, TaskStatus
from py.get_setting import load_settings, get_port
# Required imports: include all relevant Pydantic models
from py.behavior_engine import (
    global_behavior_engine, 
    BehaviorItem, 
    BehaviorAction, 
    BehaviorTrigger, 
    BehaviorTriggerTime,
    BehaviorTriggerNoInput,
    BehaviorTriggerCycle
)
from py.ws_manager import ws_manager

class SubAgentExecutor:
    """Subagent executor: handle completion of recurring and scheduled tasks."""
    
    def __init__(self, workspace_dir: str, settings: Dict):
        self.workspace_dir = workspace_dir
        self.settings = settings
        self.port = get_port()
        self.base_url = f"http://127.0.0.1:{self.port}"
        self.chat_endpoint = f"{self.base_url}/v1/chat/completions"
        self.simple_chat_endpoint = f"{self.base_url}/simple_chat"
    
    async def execute_subtask(
        self,
        task_id: str,
        consensus_content: Optional[str] = None,
    ) -> Dict[str, Any]:
        task_center = await get_task_center(self.workspace_dir)
        task = await task_center.get_task(task_id)
        max_iterations = self.settings.get("CLISettings", {}).get("max_iterations", 100)
        
        if not task:
            return {"success": False, "error": f"Task {task_id} not found"}
        
        # Mark execution as started
        await task_center.update_task_progress(task.task_id, 0, status=TaskStatus.RUNNING)
        await ws_manager.broadcast({
            "type": "island_task_progress",
            "data": {"task_id": task.task_id, "title": task.title, "status": "running", "progress": 0, "agent_type": task.agent_type}
        })
        
        iteration = 0
        conversation_history =[]
        assistant_only_history = task.context.get("history",[])
        
        system_prompt = self._build_system_prompt(task, consensus_content)
        conversation_history.append({"role": "system", "content": system_prompt})
        conversation_history.append({"role": "user", "content": f"Execute this task:\n\n{task.description}\n\nWhen finished, call finish_task with the final output to mark the task complete."})
        
        try:
            async with httpx.AsyncClient(timeout=600.0) as http_client:
                while iteration < max_iterations:

                    latest_task = await task_center.get_task(task_id)
                    if latest_task and latest_task.status == TaskStatus.CANCELLED:
                        print(f"[SubAgent] Task {task_id} was cancelled, stopping.")
                        return {"success": False, "error": "Task cancelled by user"}

                    iteration += 1
                    current_progress = 10 + int((iteration / max_iterations) * 80)
                    
                    assistant_response = await self._call_llm_stream_only(
                        http_client, conversation_history, 'super-model',
                        task.task_id, task_center, current_progress, assistant_only_history
                    )
                    
                    # Avoid a high-frequency request loop after a network disconnection
                    if not assistant_response.strip():
                        print(f"[SubAgent] Warning: empty response on iteration {iteration} (possible API connection failure); sleeping for 3 seconds...")
                        await asyncio.sleep(3)

                    conversation_history.append({"role": "assistant", "content": assistant_response})
                    
                    latest_task = await task_center.get_task(task_id)
                    # Check whether the completion tool was called; do not overwrite that state
                    if latest_task.status == TaskStatus.COMPLETED:
                        return await self._finalize_task_record(task_id, task_center, latest_task.result, assistant_only_history, iteration)

                    # Update progress
                    await task_center.update_task_progress(
                        task.task_id, current_progress, 
                        status=TaskStatus.RUNNING,
                        context={"history": assistant_only_history, "current_iteration": iteration}
                    )

                    conversation_history.append({"role": "user", "content": "Assess whether the task is complete. If finished, call finish_task with the final result; otherwise continue working."})
                
                return {"success": False, "error": "Max iterations reached"}

        except Exception as e:
            await task_center.update_task_progress(task.task_id, 0, status=TaskStatus.FAILED, error=str(e))
            await ws_manager.broadcast({
                "type": "island_task_progress",
                "data": {"task_id": task.task_id, "title": task.title, "status": "failed", "progress": 0, "agent_type": task.agent_type}
            })
            return {"success": False, "error": str(e)}

    async def _finalize_task_record(self, task_id, task_center, result, history, iteration):
        """Choose COMPLETED or PENDING as the next task state and deliver the result."""
        task = await task_center.get_task(task_id)
        t_type = task.context.get("task_type", "once")
        config = task.context.get("trigger_config", {})
        
        # 1. Archive the result
        results_history = task.context.get("results_history",[])
        results_history.append({
            "time": datetime.now().isoformat(),
            "result": result,
            "iteration": iteration
        })
        results_history = results_history[-20:] # Keep the 20 most recent runs

        # 2. Truncate logs
        trimmed_history = history[-30:] if len(history) > 30 else history
        
        # 3. Determine status
        final_status = TaskStatus.COMPLETED
        final_progress = 100
        next_run_at = None
        ran_count = task.context.get("ran_count", 0)

        if t_type == "cycle":
            is_infinite = config.get("isInfiniteLoop", True)
            repeat_num = config.get("repeatNumber", 1)
            if is_infinite or ran_count < repeat_num:
                try:
                    h, m, s = map(int, config.get("cycleValue", "01:00:00").split(':'))
                    next_run = datetime.now() + timedelta(hours=h, minutes=m, seconds=s)
                    final_status = TaskStatus.PENDING
                    final_progress = 0
                    next_run_at = next_run.isoformat()
                except: pass
        elif t_type == "time":
            days = config.get("days",[])
            if days and len(days) > 0:
                final_status = TaskStatus.PENDING
                final_progress = 0

        # 4. Update stored task data
        new_ctx = {
            "history": trimmed_history,
            "results_history": results_history,
            "last_run_at": datetime.now().isoformat(),
            "summary": (result[:200] + "...") if result else ""
        }
        if next_run_at:
            new_ctx["next_run_at"] = next_run_at

        await task_center.update_task_progress(
            task_id, 
            final_progress, 
            status=final_status, 
            result=result, 
            context=new_ctx
        )

        # Broadcast task update to island
        await ws_manager.broadcast({
            "type": "island_task_progress",
            "data": {
                "task_id": task_id,
                "title": task.title,
                "status": final_status.value if hasattr(final_status, 'value') else str(final_status),
                "progress": final_progress,
                "agent_type": task.agent_type
            }
        })

        # 5. Multi-channel delivery
        target_platforms = task.platforms if task.platforms else []

        # B. Deliver to configured external platforms
        for platform in target_platforms:
            if platform == "chat":
                print(f"[TaskExecutor] Broadcasting task completion to the web client and triggering an automatic conversation: {task.title}")
                
                # Use the same prompt content as for other platforms
                chat_prompt = f"[Autonomous task report]\nTask name:{task.title}\nTask ID:{task_id}\n\nResult:\n{result}\n\nAs the assistant, briefly summarize this result for the user."
                
                await ws_manager.broadcast({
                    "type": "task_notification",
                    "data": {
                        "title": f"Task completed: {task.title}",
                        "message": result[:150] + ("..." if len(result) > 150 else ""),
                        "task_id": task_id,
                        # Build the structure expected by the frontend runBehavior function
                        "behavior": {
                            "enabled": True,
                            "action": {
                                "type": "prompt",
                                "prompt": chat_prompt
                            }
                        }
                    }
                })
                await self._increment_heatmap()
                continue


            handler = global_behavior_engine.handlers.get(platform)
            if not handler:
                print(f"[TaskExecutor] No handler registered for platform {platform}; skipping delivery")
                continue

            trigger_obj = BehaviorTrigger(
                type="time",
                time=BehaviorTriggerTime(timeValue="00:00:00", days=[]),
                noInput=BehaviorTriggerNoInput(latency=30),
                cycle=BehaviorTriggerCycle(cycleValue="00:00:30", repeatNumber=1, isInfiniteLoop=False)
            )
            action_obj = BehaviorAction(
                type="prompt",
                prompt=f"[Autonomous task report]\nTask name:{task.title}\nTask ID:{task.task_id}\n\nResult:\n{result}\n\nAs the assistant, briefly summarize this result for the user.",
            )
            fake_behavior = BehaviorItem(
                enabled=True,
                trigger=trigger_obj,
                action=action_obj,
                platform=platform,
                platforms=[platform]
            )

            targets = global_behavior_engine.platform_targets.get(platform, [])
            if not targets:
                print(f"[TaskExecutor] No target ChatID configured for {platform}; trying the empty-ID fallback")
                asyncio.create_task(handler("", fake_behavior))
                continue

            for chat_id in set(targets):
                if chat_id:
                    print(f"[TaskExecutor] Triggering platform action -> {platform}:{chat_id}")
                    asyncio.create_task(handler(chat_id, fake_behavior))

        return {"success": True, "task_id": task_id, "result": result}

    async def _increment_heatmap(self):
        try:
            from server import increment_heatmap
            increment_heatmap()
        except Exception:
            pass


    async def _call_llm_stream_only(
        self, http_client, messages, model, task_id, task_center, 
        base_progress, display_history
    ) -> str:
        payload = {
            "messages": messages, "model": model, "stream": True, "is_sub_agent": True,
            "disable_tools":["create_subtask", "query_tasks_tool", "cancel_subtask"]
        }
        
        full_content = ""
        current_text_buffer = ""
        stream_buffer = ""
        stream_title = ""
        last_update_time = asyncio.get_event_loop().time()
        UPDATE_INTERVAL = 2.0
        
        def _push_line(line: str):
            stripped = line.strip()
            if not stripped:
                return
            display_history.append(stripped)
        
        def _flush_buffer():
            nonlocal stream_buffer, stream_title
            if not stream_buffer:
                return
            
            if stream_title:
                display_history.append(f"📡 [{stream_title}]")
                stream_title = ""
            
            for part in stream_buffer.split("\n"):
                _push_line(part)
            
            stream_buffer = ""
        
        try:
            async with http_client.stream("POST", self.chat_endpoint, json=payload) as response:
                async for line in response.aiter_lines():
                    if not line.startswith("data: "): continue
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]": break
                    try:
                        chunk = json.loads(data_str)
                        delta = chunk["choices"][0].get("delta", {})
                        
                        if delta.get("content"):
                            _flush_buffer()
                            full_content += delta["content"]
                            current_text_buffer += delta["content"]
                        
                        if delta.get("tool_calls"):
                            _flush_buffer()
                            if current_text_buffer.strip():
                                display_history.append(current_text_buffer.strip())
                                current_text_buffer = ""
                            for tc in delta["tool_calls"]:
                                display_history.append(f"🔧 Calling: {tc.get('function',{}).get('name','?')}")
                        
                        tool = delta.get("tool_content")
                        if tool:
                            ttype = tool.get("type", "")
                            title = tool.get("title", "tool")
                            content = str(tool.get("content", ""))
                            
                            if "finish_task" in str(title):
                                continue
                            
                            if ttype == "tool_result_stream":
                                if not stream_title:
                                    stream_title = title
                                stream_buffer += content
                                while "\n" in stream_buffer:
                                    line, stream_buffer = stream_buffer.split("\n", 1)
                                    if not stream_title:
                                        _push_line(line)
                                    else:
                                        display_history.append(f"📡 [{stream_title}]")
                                        stream_title = ""
                                        _push_line(line)
                            
                            elif ttype == "tool_result":
                                _flush_buffer()
                                display_history.append(f"✅ [{title}]\n{content[:500]}")
                            
                            elif ttype == "error":
                                _flush_buffer()
                                display_history.append(f"❌ [{title}]\n{content[:300]}")
                            
                            else:
                                _flush_buffer()
                                display_history.append(f"📋 [{title}]\n{content[:300]}")
                        
                        now = asyncio.get_event_loop().time()
                        if now - last_update_time >= UPDATE_INTERVAL:
                            current_task = await task_center.get_task(task_id)
                            if current_task and current_task.status == TaskStatus.CANCELLED:
                                print(f"[SubAgent] Stream aborted due to cancellation of {task_id}")
                                return ""

                            # Fix 1: omit status=TaskStatus.RUNNING (or use status=None) to avoid overwriting completion
                            await task_center.update_task_progress(
                                task_id, base_progress, status=None,
                                context={"history": display_history, "live_content": full_content[-800:] if full_content else ""}
                            )
                            try:
                                current = await task_center.get_task(task_id)
                                await ws_manager.broadcast({
                                    "type": "island_task_progress",
                                    "data": {"task_id": task_id, "title": current.title if current else "", "status": "running", "progress": base_progress, "agent_type": current.agent_type if current else ""}
                                })
                            except: pass
                            last_update_time = now
                            
                    except: continue
        except Exception as e:
            print(f"[SubAgent] Stream error: {e}")
        
        _flush_buffer()
        if current_text_buffer.strip():
            display_history.append(current_text_buffer.strip())
        
        # Fix 2: remove the forced status override at the end as well
        await task_center.update_task_progress(
            task_id, base_progress + 10, status=None,
            context={"history": display_history, "live_content": full_content[-1000:] if full_content else ""}
        )
        
        return full_content

    def _build_system_prompt(self, task, consensus_content):
        p = f"You are a task execution assistant.\n[Task] ID: {task.task_id} | Title: {task.title}"
        p += f"\n\nWhen the task is complete, call finish_task with task_id={task.task_id} and the final result. Do not stop before calling finish_task."
        if consensus_content: p += f"\n\n[Shared instructions]\n{consensus_content}"
        return p


async def run_subtask_in_background(task_id: str, workspace_dir: str, settings: Dict, consensus_content: Optional[str] = None):
    executor = SubAgentExecutor(workspace_dir, settings)
    await executor.execute_subtask(task_id, consensus_content)