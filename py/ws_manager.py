# py/ws_manager.py
import json
import logging
from typing import List, Optional
from fastapi import WebSocket

logger = logging.getLogger("app")

MAX_WS_MESSAGE_SIZE = 5 * 1024 * 1024  # 5MB limit to prevent renderer crash

class ConnectionManager:
    def __init__(self):
        # Maintain all active WebSocket connections
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_json(self, message: dict, websocket: WebSocket):
        """Send a message to a specific connection."""
        try:
            json_str = json.dumps(message, ensure_ascii=False)
            if len(json_str) > MAX_WS_MESSAGE_SIZE:
                logger.warning(f"WebSocket message too large ({len(json_str)} bytes), skipping send")
                return
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Failed to send message: {e}")
            self.disconnect(websocket)

    async def broadcast(self, message: dict, exclude: Optional[WebSocket] = None):
        """Broadcast a message to all connections, optionally excluding one."""
        try:
            json_str = json.dumps(message, ensure_ascii=False)
            if len(json_str) > MAX_WS_MESSAGE_SIZE:
                logger.warning(f"Broadcast message too large ({len(json_str)} bytes), skipping")
                return
        except Exception:
            return
        # Iterate over a slice copy so connections can be removed safely
        for connection in self.active_connections[:]:
            if connection == exclude:
                continue
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Broadcast failed; removing invalid connection: {e}")
                self.disconnect(connection)

    async def broadcast_settings_update(self, settings: dict, exclude: Optional[WebSocket] = None):
        """Convenience method: broadcast a configuration update."""
        await self.broadcast({
            "type": "settings_update",
            "data": settings
        }, exclude=exclude)

# Create the singleton
ws_manager = ConnectionManager()