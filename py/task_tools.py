import asyncio
from typing import Optional, List
from py.task_center import get_task_center, TaskStatus
from py.sub_agent import run_subtask_in_background

# --- Tool Definitions ---

create_subtask_tool = {
    "type": "function",
    "function": {
        "name": "create_subtask",
        "description": "Create a subtask and execute it asynchronously in the background. Results can be delivered through multiple channels.",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Subtask title. Do not include the delivery platform in the title; specify it in platforms instead."},
                "description": {"type": "string", "description": "Detailed task objective. Do not include the delivery platform in the objective; specify it in platforms instead, since the subagent cannot complete platform-delivery instructions itself."},
                "task_type": {
                    "type": "string",
                    "enum": ["once", "time", "cycle"],
                    "default": "once"
                },
                "platforms": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["chat", "telegram", "discord", "slack"]
                    },
                    "description": "Specify delivery channels here if results should be sent to a chat application when the task completes.",
                    "default": []
                },
                "trigger_config": {
                    "type": "object",
                    "properties": {
                        "timeValue": {"type": "string"},
                        "days": {"type": "array", "items": {"type": "integer"}},
                        "cycleValue": {"type": "string"},
                        "repeatNumber": {"type": "integer", "default": 1},
                        "isInfiniteLoop": {"type": "boolean", "default": True}
                    }
                },
                "agent_type": {"type": "string", "default": "default"}
            },
            "required": ["title", "description", "task_type"]
        }
    }
}

# (query_tasks_tool, cancel_subtask_tool, finish_task_tool remain unchanged...)
query_tasks_tool = {
    "type": "function",
    "function": {
        "name": "query_task_progress",
        "description": "Query task progress and results.",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "parent_task_id": {"type": "string"},
                "status": {"type": "string", "enum": ["pending", "running", "completed", "failed", "cancelled"]},
                "verbose": {"type": "boolean", "default": False},
                "history_index": {"type": "integer", "default": -1}
            }
        }
    }
}

cancel_subtask_tool = {
    "type": "function",
    "function": {
        "name": "cancel_subtask",
        "description": "Cancel a task.",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"}
            },
            "required": ["task_id"]
        }
    }
}

finish_task_tool = {
    "type": "function",
    "function": {
        "name": "finish_task",
        "description": "Mark a task as complete.",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "result": {"type": "string"}
            },
            "required": ["task_id", "result"]
        }
    }
}

finish_main_task_tool = {
    "type": "function",
    "function": {
        "name": "finish_main_task",
        "description": "Mark the main agent's task as complete. Once you confirm all of the user's objectives have been met, call this tool to mark the task complete and stop further operations.",
        "parameters": {
            "type": "object",
            "properties": {
                "result": {"type": "string", "description": "Your final output, including a detailed summary of the work completed."}
            },
            "required": ["result"]
        }
    }
}

# --- Tool Implementations ---

async def create_subtask(
    title: str,
    description: str,
    task_type: str = "once",
    trigger_config: dict = None,
    agent_type: str = "default",
    workspace_dir: str = None,
    settings: dict = None,
    parent_task_id: Optional[str] = None,
    consensus_content: Optional[str] = None,
    platforms: List[str] = []
) -> str:
    try:
        task_center = await get_task_center(workspace_dir)
        actual_parent_id = parent_task_id or "MAIN_AGENT"
        context = {
            "task_type": task_type,
            "trigger_config": trigger_config or {},
            "platforms": platforms,
            "history": [],
            "results_history": [],
            "ran_count": 0
        }
        
        task = await task_center.create_task(
            title=title,
            description=description,
            parent_task_id=actual_parent_id,
            agent_type=agent_type,
            context=context,
            platforms=platforms # Pass delivery channels
        )
        
        if task_type == "once":
            asyncio.create_task(
                run_subtask_in_background(
                    task_id=task.task_id,
                    workspace_dir=workspace_dir,
                    settings=settings, 
                    consensus_content=consensus_content
                )
            )
            mode_msg = "Execution started immediately."
        else:
            mode_msg = f"Added to the schedule; waiting for the scheduler (mode: {task_type})."
            
    except Exception as e:
        return f"❌ Failed to create subtask: {str(e)}"
    
    return (f"✅ Subtask created successfully!\n\n"
            f"Task ID: {task.task_id}\n"
            f"Title: {task.title}\n"
            f"Type: {task_type}\n"
            f"Channels: {', '.join(platforms)}\n"
            f"Status: {mode_msg}")

async def query_task_progress(
    workspace_dir: str,
    task_id: Optional[str] = None,
    parent_task_id: Optional[str] = None,
    status: Optional[str] = None,
    verbose: bool = False,
    history_index: int = -1
) -> str:
    """Query task progress, including execution history for recurring and scheduled tasks."""
    try:
        from py.task_center import get_task_center, TaskStatus
        task_center = await get_task_center(workspace_dir)
        
        tasks = []
        if task_id:
            single_task = await task_center.get_task(task_id)
            if single_task: tasks = [single_task]
            else: return f"❌ No task found with ID {task_id}."
        else:
            status_enum = TaskStatus(status) if status else None
            tasks = await task_center.list_tasks(parent_task_id=parent_task_id, status=status_enum)

        if not tasks:
            return "📋 No matching tasks in the task center."

        result_lines = [f"📋 Task center status report ({len(tasks)} tasks)"]
        result_lines.append("-" * 40)

        for task in tasks:
            ctx = task.context or {}
            t_type = ctx.get("task_type", "once").upper()
            ran_count = ctx.get("ran_count", 0)
            
            # 1. Title and basic status
            icon = "🔁" if t_type == "CYCLE" else "⏰" if t_type == "TIME" else "📄"
            status_icon = "✅" if task.status == TaskStatus.COMPLETED else "🔄" if task.status == TaskStatus.RUNNING else "⏳"
            result_lines.append(f"{status_icon} [{task.task_id}] {icon} {task.title}")
            
            display_platforms = task.platforms or ctx.get("platforms", [])
            platform_str = ", ".join(display_platforms) if display_platforms else "None"
            result_lines.append(f"   Delivery channels: {platform_str}")

            # 2. Type and frequency information
            type_info = f"   Type: {t_type}"
            if t_type == "CYCLE":
                type_info += f" (Interval: {ctx.get('trigger_config', {}).get('cycleValue', 'N/A')})"
            elif t_type == "TIME":
                days = ctx.get('trigger_config', {}).get('days', [])
                type_info += f" (Time: {ctx.get('trigger_config', {}).get('timeValue', 'N/A')} Weekdays: {days if days else 'One-time'})"
            result_lines.append(type_info)

            # 3. Scheduling statistics
            schedule_info = f"   Run statistics: triggered {ran_count} times"
            if ctx.get("next_run_at"):
                next_run = ctx.get("next_run_at").replace("T", " ")[:16]
                schedule_info += f" | Next run: {next_run}"
            result_lines.append(schedule_info)
            result_lines.append(f"   Current status: {task.status.value.upper()} | Overall progress: {task.progress}%")

            # 4. Process result content
            results_history = ctx.get("results_history", [])
            
            if task.status == TaskStatus.RUNNING:
                history = ctx.get("history", [])
                if history:
                    result_lines.append(f"   ⚡ Live update: {history[-1][:120]}...")

            elif task.status in [TaskStatus.COMPLETED, TaskStatus.PENDING] and ran_count > 0:
                if verbose:
                    # Try to retrieve a specific result from history
                    try:
                        target_record = results_history[history_index]
                        record_time = target_record.get("time", "").replace("T", " ")[:16]
                        result_lines.append(f"\n   🎯 Run {results_history.index(target_record)+1} output ({record_time}):")
                        result_lines.append(f"--- CONTENT START ---\n{target_record.get('result', 'No result content')}\n--- CONTENT END ---")
                    except (IndexError, TypeError):
                        result_lines.append(f"   ⚠️ No history record found at index {history_index}.")
                    
                    # Show a compact index if multiple historical results exist
                    if len(results_history) > 1:
                        history_list = ", ".join([f"#{i}" for i in range(len(results_history))])
                        result_lines.append(f"   📜 Available history indices: {history_list} ({len(results_history)} records)")
                else:
                    # In non-verbose mode, show the latest summary
                    last_res = results_history[-1].get("result", "") if results_history else task.result
                    summary = (last_res[:150] + "...") if last_res else "No content"
                    result_lines.append(f"   📝 Latest result summary: {summary}")
                    if len(results_history) > 1:
                        result_lines.append(f"   💡 (This task has {len(results_history)} history records; use verbose=true and history_index for details)")

            elif task.status == TaskStatus.FAILED:
                result_lines.append(f"   ❌ Error: {task.error}")

            result_lines.append("") # Separate tasks with a blank line

    except Exception as e:
        return f"❌ Failed to query task progress: {str(e)}"

    return "\n".join(result_lines)

async def cancel_subtask(workspace_dir: str, task_id: str) -> str:
    """Cancel a subtask."""
    try:
        task_center = await get_task_center(workspace_dir)
        success = await task_center.cancel_task(task_id)
    except Exception as e:
        return f"❌ Failed to cancel task: {str(e)}"
    return f"✅ Task {task_id} cancelled" if success else f"❌ Failed to cancel task {task_id}"

# ⭐ Implementation: finish_task
async def finish_task(
    workspace_dir: str,
    task_id: str,
    result: str
) -> str:
    try:
        """The subagent calls this function to mark its task complete."""
        task_center = await get_task_center(workspace_dir)
        
        # Force status to COMPLETED, progress to 100, and save the final result
        success = await task_center.update_task_progress(
            task_id=task_id,
            progress=100,
            status=TaskStatus.COMPLETED,
            result=result
        )
    except Exception as e:
        return f"❌ Failed to mark task complete: {str(e)}"
    
    if success:
        return f"🎉 Task {task_id} marked complete successfully! The result is saved. Stop further operations."
    else:
        return f"❌ Failed to update status for task {task_id} (the task ID may be incorrect)."

async def finish_main_task(
    result: str
) -> str:
    """The main agent calls this function to mark completion (no task_center required)."""
    return f"🎉 Main task complete. Final result:\n\n{result}"