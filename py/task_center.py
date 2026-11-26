import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from enum import Enum
import aiofiles
import aiofiles.os
from pydantic import BaseModel, Field

class TaskCreateRequest(BaseModel):
    title: str
    description: str
    agent_type: str = "default"
    task_type: str = "once"           # once, scheduled, recurring
    run_at_time: Optional[str] = None  # Scheduled execution time (ISO format)
    interval_minutes: int = 60         # Recurring task interval
    platforms: List[str] = []    # Multi-channel support
    trigger_config: Optional[dict] = {}

# 1. Task type enumeration
class TaskType(str, Enum):
    ONCE = "once"           # One-time task (execute immediately)
    SCHEDULED = "scheduled" # Scheduled task (execute once at a future time)
    RECURRING = "recurring" # Recurring task (execute at regular intervals)

class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class SubTask(BaseModel):
    task_id: str
    parent_task_id: Optional[str] = None
    title: str
    description: str
    status: TaskStatus = TaskStatus.PENDING
    progress: int = 0  # 0-100
    result: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    updated_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    agent_type: str = "default"
    # Use Field(default_factory=dict) to give each instance its own dictionary
    context: Dict[str, Any] = Field(default_factory=dict)
    
    task_type: TaskType = TaskType.ONCE
    platforms: List[str] = Field(default_factory=list) 
    
    # Time configuration
    schedule_config: Optional[Dict[str, Any]] = None 
    
    # Status tracking
    next_run_at: Optional[str] = None
    last_run_at: Optional[str] = None
    occurrence_count: int = 0  # Number of executions so far

class TaskCenter:
    """Task center - manage all main tasks and subtasks."""
    
    def __init__(self, workspace_dir: str):
        self.workspace_dir = Path(workspace_dir)
        self.task_dir = self.workspace_dir / ".agents" / "tasks"
        self._lock = asyncio.Lock()
        self._ensure_task_dir()
    
    def _ensure_task_dir(self):
        """Ensure the task directory exists."""
        self.task_dir.mkdir(parents=True, exist_ok=True)
    
    def _get_task_file(self, task_id: str) -> Path:
        """Get the task file path."""
        return self.task_dir / f"{task_id}.json"
    
    async def create_task(
        self,
        title: str,
        description: str,
        parent_task_id: Optional[str] = None,
        agent_type: str = "default",
        context: Optional[Dict[str, Any]] = None,
        platforms: List[str] = None # Delivery channels
    ) -> SubTask:
        """Create a new task."""
        async with self._lock:
            task_id = str(uuid.uuid4())[:8]
            now = datetime.now().isoformat()
            
            task = SubTask(
                task_id=task_id,
                parent_task_id=parent_task_id,
                title=title,
                description=description,
                created_at=now,
                updated_at=now,
                agent_type=agent_type,
                context=context or {},
                platforms=platforms or [] # Assign delivery channels
            )
            
            await self._save_task(task)
            return task
    
    async def _save_task(self, task: SubTask):
        """Save the task to a file."""
        task_file = self._get_task_file(task.task_id)
        async with aiofiles.open(task_file, 'w', encoding='utf-8') as f:
            await f.write(task.model_dump_json(indent=2))
    
    async def get_task(self, task_id: str) -> Optional[SubTask]:
        """Get task details."""
        task_file = self._get_task_file(task_id)
        if not task_file.exists():
            return None
        
        try:
            async with aiofiles.open(task_file, 'r', encoding='utf-8') as f:
                data = await f.read()
                return SubTask.model_validate_json(data)
        except Exception as e:
            print(f"Error loading task {task_id}: {e}")
            return None
    
    async def update_task_progress(
        self,
        task_id: str,
        progress: int,
        status: Optional[TaskStatus] = None,
        result: Optional[str] = None,
        error: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Update task progress and context."""
        async with self._lock:
            task = await self.get_task(task_id)
            if not task:
                return False
            
            if task.status == TaskStatus.CANCELLED and status is not None and status != TaskStatus.CANCELLED:
                print(f"[TaskCenter] Task {task_id} was cancelled; refusing status update to {status}")
                return False
            
            safe_progress = max(0, min(100, progress))
            target_status = status if status else task.status
            
            if target_status == TaskStatus.COMPLETED:
                final_progress = 100
            elif target_status == TaskStatus.FAILED:
                final_progress = max(task.progress, safe_progress)
            elif target_status == TaskStatus.CANCELLED:
                final_progress = task.progress 
            else:
                final_progress = max(task.progress, safe_progress)
                final_progress = min(99, final_progress)
            
            task.progress = final_progress
            task.updated_at = datetime.now().isoformat()
            
            if status:
                task.status = status
                if status == TaskStatus.RUNNING and not task.started_at:
                    task.started_at = datetime.now().isoformat()
                elif status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED]:
                    task.completed_at = datetime.now().isoformat()
            
            if result is not None:
                task.result = result
            
            if error is not None:
                task.error = error
                task.status = TaskStatus.FAILED

            if context is not None:
                task.context.update(context)
            
            await self._save_task(task)
            return True

    async def list_tasks(
        self,
        parent_task_id: Optional[str] = None,
        status: Optional[TaskStatus] = None
    ) -> List[SubTask]:
        """List tasks."""
        tasks = []
        if not self.task_dir.exists():
            return tasks
        files = list(self.task_dir.glob("*.json"))
        for task_file in files:
            try:
                async with aiofiles.open(task_file, 'r', encoding='utf-8') as f:
                    data = await f.read()
                    task = SubTask.model_validate_json(data)
                    if parent_task_id is not None and task.parent_task_id != parent_task_id:
                        continue
                    if status is not None and task.status != status:
                        continue
                    tasks.append(task)
            except Exception as e:
                print(f"Error loading task file {task_file}: {e}")
                continue
        tasks.sort(key=lambda x: x.created_at, reverse=True)
        return tasks
    
    async def cancel_task(self, task_id: str) -> bool:
        return await self.update_task_progress(
            task_id=task_id,
            progress=0,
            status=TaskStatus.CANCELLED
        )

    async def delete_task(self, task_id: str) -> bool:
        async with self._lock:
            task_file = self._get_task_file(task_id)
            if task_file.exists():
                try:
                    await aiofiles.os.remove(task_file)
                    return True
                except Exception as e:
                    print(f"Error deleting task {task_id}: {e}")
                    return False
            return False

_task_centers: Dict[str, TaskCenter] = {}

async def get_task_center(workspace_dir: str) -> TaskCenter:
    if workspace_dir not in _task_centers:
        _task_centers[workspace_dir] = TaskCenter(workspace_dir)
    return _task_centers[workspace_dir]