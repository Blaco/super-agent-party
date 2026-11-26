import asyncio
import os
from datetime import datetime, timedelta
from py.task_center import get_task_center, TaskStatus
from py.sub_agent import run_subtask_in_background

class AgentScheduler:
    def __init__(self, settings_ref: dict):
        # Reference global settings so changes to cc_path are visible immediately
        self.settings = settings_ref

    async def start_loop(self):
        print("⏰ [Scheduler] Started successfully; monitoring is ready...")
        while True:
            try:
                workspace_dir = self.settings.get("CLISettings", {}).get("cc_path")
                if workspace_dir and os.path.exists(workspace_dir):
                    await self._scan_and_trigger(workspace_dir)
            except Exception as e:
                print(f"❌ [Scheduler] Polling error: {e}")
            
            await asyncio.sleep(30) # Check every 30 seconds

    async def _scan_and_trigger(self, workspace_dir):
        task_center = await get_task_center(workspace_dir)
        tasks = await task_center.list_tasks()
        now = datetime.now()
        current_time_hm = now.strftime("%H:%M") 
        current_weekday = now.isoweekday() 
        # The frontend uses 0 for Sunday, 1 for Monday...
        ui_weekday = 0 if current_weekday == 7 else current_weekday

        for task in tasks:
            # Only PENDING tasks are eligible for scheduled execution
            if task.status != TaskStatus.PENDING:
                continue

            t_type = task.context.get("task_type")
            config = task.context.get("trigger_config", {})

            # --- 1. Scheduled mode (time) ---
            if t_type == "time":
                time_val = config.get("timeValue", "")[:5] # HH:mm
                days = config.get("days", []) # Selected weekdays [1, 2, 3...]
                
                # Matching logic:
                # Case A: Weekdays selected -> both weekday and time must match
                # Case B: No weekdays selected -> only time must match (one-time schedule)
                should_trigger = False
                if days:
                    if ui_weekday in days and current_time_hm == time_val:
                        should_trigger = True
                else:
                    if current_time_hm == time_val:
                        should_trigger = True

                if should_trigger:
                    # Prevent duplicate triggers within the same minute
                    if task.context.get("last_trigger_minute") != current_time_hm:
                        await self._execute(task, workspace_dir, {"last_trigger_minute": current_time_hm})

            # --- 2. Recurring mode (cycle) ---
            elif t_type == "cycle":
                next_run_str = task.context.get("next_run_at")
                
                # Initialize the next run time if it has not been set
                if not next_run_str:
                    await self._update_next_cycle_time(task, workspace_dir)
                    continue

                try:
                    next_run_at = datetime.fromisoformat(next_run_str)
                    if now >= next_run_at:
                        # Check the execution count limit
                        is_infinite = config.get("isInfiniteLoop", True)
                        repeat_num = config.get("repeatNumber", 1)
                        ran_count = task.context.get("ran_count", 0)

                        if is_infinite or ran_count < repeat_num:
                            # Trigger execution
                            await self._execute(task, workspace_dir, {"ran_count": ran_count + 1})
                        else:
                            # Execution limit reached; archive safely
                            await task_center.update_task_progress(task.task_id, 100, status=TaskStatus.COMPLETED)
                except:
                    continue

    async def _execute(self, task, workspace_dir, extra_context):
        """Execute the task and update its status."""
        print(f"🚀 [Scheduler] Triggering task: {task.title} (ID: {task.task_id})")
        task_center = await get_task_center(workspace_dir)
        
        # Prepare a new round of logs
        history = task.context.get("history", [])
        run_count = extra_context.get("ran_count", task.context.get("ran_count", 0))
        
        separator = f"🚀 **Round {run_count if run_count > 0 else 1} Start!** ({datetime.now().strftime('%H:%M:%S')})\n"
        history.append(separator)

        # Mark as running immediately; progress must be the second positional argument
        await task_center.update_task_progress(
            task.task_id, 
            0, 
            status=TaskStatus.RUNNING, 
            context={**extra_context, "history": history}
        )

        # Execute asynchronously
        asyncio.create_task(
            run_subtask_in_background(
                task_id=task.task_id,
                workspace_dir=workspace_dir,
                settings=self.settings
            )
        )

    async def _update_next_cycle_time(self, task, workspace_dir):
        """Initialize the next execution time for a recurring task."""
        config = task.context.get("trigger_config", {})
        cycle_str = config.get("cycleValue", "01:00:00")
        
        try:
            h, m, s = map(int, cycle_str.split(':'))
            delta = timedelta(hours=h, minutes=m, seconds=s)
            next_run = datetime.now() + delta
            
            task_center = await get_task_center(workspace_dir)
            await task_center.update_task_progress(
                task.task_id,
                0,
                status=TaskStatus.PENDING,
                context={"next_run_at": next_run.isoformat()}
            )
        except:
            pass