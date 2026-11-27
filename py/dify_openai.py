import re
import json
import asyncio
from typing import AsyncGenerator, List, Dict, Any
import httpx

from openai.types.chat import (
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionMessage,
    ChatCompletionMessageParam,
)
from openai.types.chat.chat_completion import Choice
from openai.types.chat.chat_completion_chunk import Choice as ChunkChoice, ChoiceDelta


class DifyOpenAIAsync:
    """
    Dify-to-OpenAI adapter implemented using httpx.
    The external interface follows the asynchronous OpenAI SDK calling convention.
    """

    def __init__(self, *, api_key: str, base_url: str = "https://api.dify.ai/v1"):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=60)

    async def close(self):
        await self._client.aclose()

    # --------------------------------------------------
    # Internal helpers
    # --------------------------------------------------
    @staticmethod
    def _extract_conv_id_from_messages(messages: List[ChatCompletionMessageParam]) -> str | None:
        for m in messages:
            if m["role"] == "assistant":
                m_content = m.get("content") or ""
                if match := re.search(r"<conversion id:(.*?)>", m_content):
                    return match.group(1).strip()
        return None

    # --------------------------------------------------
    # Public chat.completions.create interface
    # --------------------------------------------------
    class Completions:
        def __init__(self, outer: "DifyOpenAIAsync"):
            self._outer = outer

        async def create(
            self,
            *,
            messages: List[ChatCompletionMessageParam],
            model: str = "dify",
            stream: bool = False,
            **_,
        ):
            # ---------- Construct Dify request parameters ----------
            query = messages[-1]["content"] or ""
            inputs: Dict[str, Any] = {}
            for m in messages[:-1]:
                role = m["role"]
                if role != "user":
                    inputs[role] = m["content"]

            conversation_id = self._outer._extract_conv_id_from_messages(messages)

            payload = {
                "inputs": inputs,
                "query": query,
                "response_mode": "streaming" if stream else "blocking",
                "conversation_id": conversation_id or "",
                "user": "super-agent-party",
            }

            # ---------- Send HTTP request ----------
            headers = {
                "Authorization": f"Bearer {self._outer._api_key}",
                "Content-Type": "application/json",
            }
            url = f"{self._outer._base_url}/chat-messages"

            if not stream:
                # ========== BLOCKING ==========
                resp = await self._outer._client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()

                cid = data.get("conversation_id") or ""
                answer = data.get("answer") or ""
                if not conversation_id and cid:
                    answer = f"<conversion id:{cid}>\n\n{answer}"

                return ChatCompletion(
                    id="super-agent-party",
                    object="chat.completion",
                    created=int(asyncio.get_event_loop().time()),
                    model=model,
                    choices=[
                        Choice(
                            index=0,
                            message=ChatCompletionMessage(role="assistant", content=answer),
                            finish_reason="stop",
                        )
                    ],
                )

            # ========== STREAMING ==========
            async def _stream() -> AsyncGenerator[ChatCompletionChunk, None]:
                async with self._outer._client.stream("POST", url, json=payload, headers=headers) as resp:
                    resp.raise_for_status()
                    cid: str | None = None
                    first = True

                    async for line in resp.aiter_lines():
                        line = line.strip()
                        if not line.startswith("data: "):
                            continue
                        line = line[6:].strip()
                        if not line:
                            continue
                        try:
                            event = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        # Only handle event == "message"
                        if event.get("event") not in ["message", "agent_message"]:
                            continue

                        delta = event.get("answer") or ""
                        if first and delta:
                            cid = event.get("conversation_id")
                            if cid and not conversation_id:
                                delta = f"<conversion id:{cid}>\n\n{delta}"
                            first = False

                        yield ChatCompletionChunk(
                            id="super-agent-party",
                            object="chat.completion.chunk",
                            created=int(asyncio.get_event_loop().time()),
                            model=model,
                            choices=[
                                ChunkChoice(
                                    index=0,
                                    delta=ChoiceDelta(role="assistant", content=delta),
                                    finish_reason=None,
                                )
                            ],
                        )

                    # Final frame
                    yield ChatCompletionChunk(
                        id="super-agent-party",
                        object="chat.completion.chunk",
                        created=int(asyncio.get_event_loop().time()),
                        model=model,
                        choices=[ChunkChoice(index=0, delta=ChoiceDelta(), finish_reason="stop")],
                    )

            return _stream()

    @property
    def chat(self):
        return type("Chat", (), {"completions": self.Completions(self)})()
