# py/ytdm.py
from __future__ import annotations
import asyncio, threading, time
import uuid
from googleapiclient.discovery import build
from typing import Optional, Callable

class YouTubeDMClient:
    """
    Minimal polling client
    Usage: client = YouTubeDMClient(api_key, video_id, on_message)
          client.start()   # Non-blocking; starts an internal thread
          ...
          client.stop()    # Thread-safe shutdown
    """
    def __init__(self,
                 api_key: str,
                 video_id: str,
                 on_message: Callable[[dict], None],
                 poll_interval: int = 5):
        self.api_key = api_key
        self.video_id = video_id
        self.on_message = on_message
        self.poll_interval = poll_interval

        self._yt = build("youtube", "v3", developerKey=api_key)
        self._chat_id: Optional[str] = None
        self._page_token: Optional[str] = None
        self._stop_evt = threading.Event()
        self._thread: Optional[threading.Thread] = None

    # --------- Public methods ---------
    def start(self):
        """Start without blocking."""
        if self._thread and self._thread.is_alive():
            return
        self._stop_evt.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        """Stop safely across threads."""
        self._stop_evt.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self.poll_interval + 1)

    # --------- Internal polling ---------
    def _run(self):
        self._chat_id = self._get_live_chat_id()
        print('[YouTube] got chat_id:', self._chat_id)   # Log discovered chat ID
        if not self._chat_id:
            print('[YouTube] Stream is not live; stopping listener')
            return

        while not self._stop_evt.is_set():
            try:
                self._poll_once()
                print('[YouTube] poll_once done')        # Log poll completion
            except Exception as e:
                print('[YouTube] poll error:', e)
            time.sleep(self.poll_interval)

    def _get_live_chat_id(self) -> Optional[str]:
        rsp = self._yt.videos().list(
            id=self.video_id,
            part="liveStreamingDetails"
        ).execute()
        if not rsp["items"]:
            return None
        return rsp["items"][0]["liveStreamingDetails"].get("activeLiveChatId")


    def _poll_once(self):
        """
        YouTube polling logic
        Handles textMessageEvent (chat), superChatEvent (Super Chat), fanFundingEvent (sponsorship).
        """
        rsp = self._yt.liveChatMessages().list(
            liveChatId=self._chat_id,
            part="snippet,authorDetails",
            pageToken=self._page_token,
            maxResults=2000
        ).execute()

        for item in rsp["items"]:
            author = item["authorDetails"]["displayName"]
            msg_type = item["snippet"].get("type")
            
            # 1. Initialize shared event type mapping
            danmu_type = "danmaku"
            content = ""
            
            # 2. Parse content based on the YouTube message type
            if msg_type == "textMessageEvent":
                # Standard chat message
                danmu_type = "danmaku"
                text = item["snippet"]["displayMessage"]
                content = f"{author}: {text}"
                
            elif msg_type == "superChatEvent":
                # Super Chat (SC)
                danmu_type = "super_chat"
                details = item["snippet"].get("superChatDetails", {})
                user_text = details.get("userComment", "")
                amount = details.get("amountDisplayString", "Price Hidden")
                if user_text:
                    content = f"{author} sent a Super Chat ({amount}): {user_text}"
                else:
                    content = f"{author} sent a Super Chat ({amount})"
                    
            elif msg_type == "fanFundingEvent": 
                # Channel membership or sponsorship (YouTube gift event)
                danmu_type = "gift"
                content = f"{author} sponsored the channel!"
                
            else:
                # Fallback: show other events (such as arrival placeholders) as plain chat
                text = item["snippet"].get("displayMessage", "")
                content = f"{author}: {text}"

            # 3. Construct and broadcast the shared message format
            msg = {
                'id': str(uuid.uuid4()),
                "type": "message",
                "content": content,
                "danmu_type": danmu_type,
                "platform": "youtube"
            }
            self.on_message(msg)

        # Update the token for the next polling request
        self._page_token = rsp.get("nextPageToken")
        