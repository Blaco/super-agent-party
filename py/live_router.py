"""Optional YouTube and Twitch listeners. Livestreaming is disabled by default.

Maintain the existing REST and WebSocket paths for optional clients.
"""
from __future__ import annotations

import asyncio
import uuid
from typing import List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from py.ytdm import YouTubeDMClient
from py.twitch_service import start_twitch_task, stop_twitch_task

router = APIRouter(prefix="/api/live", tags=["live"])
ws_router = APIRouter(prefix="/ws/live", tags=["live"])


class LiveConfig(BaseModel):
    youtube_enabled: bool = False
    youtube_video_id: str = ""
    youtube_api_key: str = ""
    twitch_enabled: bool = False
    twitch_channel: str = ""
    twitch_access_token: str = ""


class LiveConfigRequest(BaseModel):
    config: LiveConfig


class ApiResponse(BaseModel):
    success: bool
    message: str


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(data)
            except Exception:
                self.disconnect(connection)


manager = ConnectionManager()
yt_client: Optional[YouTubeDMClient] = None
twitch_task: Optional[asyncio.Task] = None
current_loop: Optional[asyncio.AbstractEventLoop] = None


@router.post("/start", response_model=ApiResponse)
async def start_live(request: LiveConfigRequest):
    global yt_client, twitch_task, current_loop
    config = request.config

    if not config.youtube_enabled and not config.twitch_enabled:
        return ApiResponse(success=False, message="Enable YouTube or Twitch before starting.")
    if config.youtube_enabled and yt_client is not None:
        return ApiResponse(success=False, message="YouTube listener is already running.")
    if config.twitch_enabled and twitch_task is not None:
        return ApiResponse(success=False, message="Twitch listener is already running.")
    if config.youtube_enabled and (not config.youtube_video_id or not config.youtube_api_key):
        return ApiResponse(success=False, message="YouTube needs a video ID and an API key.")
    if config.twitch_enabled and (not config.twitch_channel or not config.twitch_access_token):
        return ApiResponse(success=False, message="Twitch needs a channel and access token.")

    current_loop = asyncio.get_running_loop()
    started_youtube = False
    started_twitch = False
    try:
        if config.youtube_enabled:
            loop = current_loop

            def on_youtube_message(message: dict):
                if loop is not None and not loop.is_closed():
                    asyncio.run_coroutine_threadsafe(manager.broadcast(message), loop)

            yt_client = YouTubeDMClient(
                api_key=config.youtube_api_key,
                video_id=config.youtube_video_id,
                on_message=on_youtube_message,
            )
            yt_client.start()
            started_youtube = True

        if config.twitch_enabled:
            async def on_twitch_message(channel, user, message, message_type="danmaku"):
                await manager.broadcast({
                    "id": str(uuid.uuid4()),
                    "type": "message",
                    "content": f"{user}: {message}" if message_type == "danmaku" else message,
                    "danmu_type": message_type,
                    "platform": "twitch",
                })

            twitch_task = asyncio.create_task(
                start_twitch_task(config.model_dump(), on_twitch_message)
            )
            started_twitch = True

        await asyncio.sleep(0.5)
        return ApiResponse(success=True, message="Livestream listeners started.")
    except Exception as exc:
        if started_youtube and yt_client is not None:
            yt_client.stop()
            yt_client = None
        if started_twitch and twitch_task is not None:
            await stop_twitch_task()
            twitch_task.cancel()
            twitch_task = None
        return ApiResponse(success=False, message="Failed to start livestream: " + str(exc))


@router.post("/stop", response_model=ApiResponse)
async def stop_live():
    global yt_client, twitch_task, current_loop
    try:
        if yt_client is not None:
            yt_client.stop()
            yt_client = None

        if twitch_task is not None:
            await stop_twitch_task()
            twitch_task.cancel()
            try:
                await twitch_task
            except asyncio.CancelledError:
                pass
            twitch_task = None

        current_loop = None
        return ApiResponse(success=True, message="Livestream listeners stopped.")
    except Exception as exc:
        return ApiResponse(success=False, message="Failed to stop livestream: " + str(exc))


@router.post("/reload", response_model=ApiResponse)
async def reload_live(request: LiveConfigRequest):
    result = await stop_live()
    if not result.success:
        return result
    return await start_live(request)


@router.get("/status")
async def get_live_status():
    return {
        "is_running": yt_client is not None or twitch_task is not None,
        "details": {
            "youtube": yt_client is not None,
            "twitch": twitch_task is not None,
        },
    }


@ws_router.websocket("/danmu")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            if await websocket.receive_text() == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)
