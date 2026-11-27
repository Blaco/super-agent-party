# OpenAI Responses API Provider Integration — Implementation Plan

> Historical upstream design record, translated for the fork. Code excerpts, paths, dependency versions and implementation steps are not current instructions; use the Agent Creation work protocol and live source instead.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `OpenAIResponses` vendor type and connect to OpenAI Responses API endpoints through the litellm `openai/responses/` prefix bridge.

**Architecture:** Create `py/ResponsesAsOpenAI.py`, an adapter that emulates the `AsyncOpenAI` interface (`chat.completions.create` / `models.list`). Internally, call `litellm.acompletion()` with `model="openai/responses/<model>"`. The built-in `responses_api_bridge` in litellm 1.83.13 handles bidirectional Chat Completions ↔ Responses API conversion (messages to input, tools, streaming events, usage, reasoning_content). Note: the `openai/` routing prefix is required. A bare `responses/<model>` cannot resolve its provider in `get_llm_provider` (BadRequestError); `openai/responses/<model>` resolves the provider and leaves `responses/<model>` to trigger the bridge. `server.py` dispatches by vendor to the new adapter, and the frontend adds a vendor option.

**Tech Stack:** Python 3.12, litellm>=1.83.7 (historically 1.83.13, which includes the bridge), FastAPI, Vue 3 (inline JS), Electron.

## Global Constraints

- The project historically had **no pytest** framework: tests use standalone Python scripts (`.venv/bin/python tests/xxx.py`), not pytest.
- **Do not upgrade** litellm for this historical change (1.83.13 already contains `responses_api_bridge`).
- Use the exact vendor string `'OpenAIResponses'` consistently throughout the repository.
- Do not change existing OpenAI/other vendor behavior or add Responses API-specific UI.
- Code style: follow `py/ClaudeAsOpenAI.py` (upstream originally specified Chinese comments; superseded by English comments in this fork, lazy litellm imports, emulated AsyncOpenAI interface).
- Upstream originally specified Chinese commit messages with conventional prefixes (e.g. `feat:`, `docs:`); superseded by the fork's English commit convention.

---

### Task 1: Backend adapter `py/ResponsesAsOpenAI.py` and smoke test

**Files:**
- Create: `py/ResponsesAsOpenAI.py`
- Create: `tests/test_responses_adapter.py` (standalone script, no pytest)

**Interfaces:**
- Produces: `AsyncResponsesAsOpenAI(api_key, base_url=None, default_model=None, http_client=None, timeout=None, max_retries=None, **kwargs)`
  - `await adapter.chat.completions.create(model, messages, temperature, max_tokens, stream, top_p, stop, tools, tool_choice, **kwargs)` → litellm `ModelResponse` (non-streaming) or `CustomStreamWrapper` (streaming, iterable with `async for`, chunks contain `.choices[0].delta.content`)
  - `await adapter.models.list()` → `{data: [ModelItem]}` (ModelItem has `.id`)

- [ ] **Step 1: Write adapter `py/ResponsesAsOpenAI.py`**

```python
import httpx
from typing import Optional, List, Dict, Any

class AsyncResponsesAsOpenAI:
    """
    Emulate the AsyncOpenAI client using the openai/responses/ prefix bridge in litellm.acompletion
    (litellm automatically converts between Chat Completions and Responses API formats)
    """

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        default_model: Optional[str] = "gpt-4o",
        http_client: Optional[httpx.AsyncClient] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
        **kwargs
    ):
        self.api_key = api_key
        self.base_url = base_url
        self.default_model = default_model
        self.http_client = http_client
        self.timeout = timeout
        self.max_retries = max_retries
        self._extra_kwargs = kwargs
        self._litellm_module = None  # Cache the litellm module

    @property
    def _litellm(self):
        """Lazy-load litellm; import only on first use."""
        if self._litellm_module is None:
            import litellm
            self._litellm_module = litellm
        return self._litellm_module

    @property
    def models(self):
        return self._ModelsResource(self)

    class _ModelsResource:
        def __init__(self, parent: "AsyncResponsesAsOpenAI"):
            self._parent = parent

        async def list(self):
            # Construct an object compatible with OpenAI's response format
            class ModelItem:
                def __init__(self, model_id: str):
                    self.id = model_id

            class ModelList:
                def __init__(self, data: list):
                    self.data = data

            # Responses API providers still use the OpenAI-compatible /models endpoint
            base_url = self._parent.base_url or "https://api.openai.com/v1"
            if base_url.endswith("/v1") or base_url.endswith("/v1/"):
                url = f"{base_url.rstrip('/')}/models"
            else:
                url = f"{base_url.rstrip('/')}/v1/models"

            headers = {"Authorization": f"Bearer {self._parent.api_key}"}

            try:
                # Prefer the shared http_client to use system proxy settings
                client = self._parent.http_client
                need_close = False
                if not client:
                    client = httpx.AsyncClient()
                    need_close = True

                response = await client.get(url, headers=headers)

                if need_close:
                    await client.aclose()

                if response.status_code == 200:
                    data = response.json()
                    models = [ModelItem(m["id"]) for m in data.get("data", [])]
                    if models:
                        return ModelList(models)
            except Exception as e:
                print(f"Failed to retrieve OpenAI Responses model list (proxy/provider may not support it): {e}")

            # Static fallback: return an empty list on failure so the frontend can accept a manual model name
            return ModelList([])

    @property
    def chat(self):
        return self._ChatResource(self)

    class _ChatResource:
        def __init__(self, parent: "AsyncResponsesAsOpenAI"):
            self.completions = self._CompletionsResource(parent)

        class _CompletionsResource:
            def __init__(self, parent: "AsyncResponsesAsOpenAI"):
                self._parent = parent

            async def create(
                self,
                model: Optional[str] = None,
                messages: Optional[List[Dict[str, Any]]] = None,
                temperature: Optional[float] = None,
                max_tokens: Optional[int] = None,
                stream: bool = False,
                top_p: Optional[float] = None,
                stop: Optional[Any] = None,
                tools: Optional[List[Dict]] = None,
                tool_choice: Optional[Any] = None,
                **kwargs
            ):
                model = model or self._parent.default_model
                if not model:
                    raise ValueError("model is required")

                # The openai/responses/ prefix triggers litellm's responses_api_bridge
                # Note: in litellm 1.83.x, the bare "responses/" prefix cannot resolve a provider in get_llm_provider;
                # the "openai/" routing prefix is required. The bridge strips the model prefix before calling /responses.
                if model.startswith("responses/"):
                    # responses/gpt-4o -> openai/responses/gpt-4o
                    model = f"openai/{model}"
                elif not model.startswith("openai/responses/"):
                    model = f"openai/responses/{model}"

                # ===== Lazy-load litellm =====
                litellm = self._parent._litellm

                completion_kwargs = {
                    "model": model,
                    "messages": messages,
                    "api_key": self._parent.api_key,
                    "stream": stream,
                }

                # Pass tools in OpenAI function format; the bridge converts to Responses API format
                if tools:
                    completion_kwargs["tools"] = tools
                if tool_choice:
                    completion_kwargs["tool_choice"] = tool_choice

                if self._parent.base_url:
                    completion_kwargs["api_base"] = self._parent.base_url
                if temperature is not None:
                    completion_kwargs["temperature"] = temperature
                if max_tokens is not None:
                    completion_kwargs["max_tokens"] = max_tokens
                if top_p is not None:
                    completion_kwargs["top_p"] = top_p
                if stop is not None:
                    completion_kwargs["stop"] = stop
                if self._parent.timeout is not None:
                    completion_kwargs["timeout"] = self._parent.timeout
                if self._parent.http_client is not None:
                    completion_kwargs["client"] = self._parent.http_client

                # Filter OpenAI-specific parameters unsupported by the bridge; response_format, reasoning_effort, etc.
                # are mapped to Responses API parameters by the bridge and passed through unchanged
                safe_kwargs = {k: v for k, v in kwargs.items()
                              if k not in ['logprobs', 'top_logprobs', 'n']}

                return await litellm.acompletion(**completion_kwargs, **safe_kwargs)
```

- [ ] **Step 2: Write smoke test `tests/test_responses_adapter.py`**

Start a local mock Responses API HTTP server (non-streaming JSON, SSE streaming and `/models` list) to verify the complete adapter → litellm bridge → local endpoint path:

```python
"""AsyncResponsesAsOpenAI smoke test: local mock Responses API server, no actual network service required."""
import asyncio
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

os.environ.setdefault("LITELLM_LOG", "ERROR")

import httpx
from py.ResponsesAsOpenAI import AsyncResponsesAsOpenAI

NON_STREAM_RESPONSE = {
    "id": "resp_test",
    "object": "response",
    "created_at": 1700000000,
    "status": "completed",
    "model": "gpt-4o",
    "output": [
        {
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "status": "completed",
            "content": [{"type": "output_text", "text": "Hello World", "annotations": []}],
        }
    ],
    "usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
}

STREAM_EVENTS = [
    {"type": "response.created", "response": {"id": "resp_test", "object": "response", "status": "in_progress", "output": []}},
    {"type": "response.output_item.added", "output_index": 0, "item": {"id": "msg_1", "type": "message", "role": "assistant", "status": "in_progress", "content": []}},
    {"type": "response.content_part.added", "item_id": "msg_1", "output_index": 0, "content_index": 0, "part": {"type": "output_text", "text": "", "annotations": []}},
    {"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 0, "content_index": 0, "delta": "Hello"},
    {"type": "response.output_text.delta", "item_id": "msg_1", "output_index": 0, "content_index": 0, "delta": " World"},
    {"type": "response.output_text.done", "item_id": "msg_1", "output_index": 0, "content_index": 0, "text": "Hello World"},
    {"type": "response.output_item.done", "output_index": 0, "item": {"id": "msg_1", "type": "message", "role": "assistant", "status": "completed", "content": [{"type": "output_text", "text": "Hello World", "annotations": []}]}},
    {"type": "response.completed", "response": NON_STREAM_RESPONSE},
]

MODELS_RESPONSE = {"object": "list", "data": [{"id": "gpt-4o"}, {"id": "gpt-5"}]}


class MockHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length) or b"{}")
        if self.path.endswith("/responses"):
            if body.get("stream"):
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                for ev in STREAM_EVENTS:
                    self.wfile.write(
                        f"event: {ev['type']}\ndata: {json.dumps(ev)}\n\n".encode()
                    )
            else:
                payload = json.dumps(NON_STREAM_RESPONSE).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path.endswith("/models"):
            payload = json.dumps(MODELS_RESPONSE).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


def start_server():
    server = HTTPServer(("127.0.0.1", 0), MockHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


async def main():
    server = start_server()
    port = server.server_address[1]
    http_client = httpx.AsyncClient()
    adapter = AsyncResponsesAsOpenAI(
        api_key="test-key",
        base_url=f"http://127.0.0.1:{port}/v1",
        http_client=http_client,
    )

    # 1. Non-streaming call
    resp = await adapter.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "hi"}],
    )
    assert resp.choices[0].message.content == "Hello World", resp
    assert resp.usage.total_tokens == 15, resp.usage

    # 2. Streaming call
    chunks = []
    stream = await adapter.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "hi"}],
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            chunks.append(delta.content)
    assert "".join(chunks) == "Hello World", chunks

    # 3. Model list
    models = await adapter.models.list()
    assert [m.id for m in models.data] == ["gpt-4o", "gpt-5"], models.data

    # 4. Passing tools through does not raise an error
    resp2 = await adapter.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": "hi"}],
        tools=[{
            "type": "function",
            "function": {
                "name": "get_weather",
                "description": "Get weather",
                "parameters": {"type": "object", "properties": {}},
            },
        }],
    )
    assert resp2.choices[0].message.content == "Hello World", resp2

    await http_client.aclose()
    server.shutdown()
    print("ALL PASS")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 3: Run smoke test; success completes the core validation for this task**

Run: `.venv/bin/python tests/test_responses_adapter.py`
Expected: prints `ALL PASS`

If it fails, investigate each error. Two common causes: mock event format does not match bridge expectations → consult `translate_responses_chunk_to_openai_stream` in `.venv/lib/python3.12/site-packages/litellm/completion_extras/litellm_responses_transformation/transformation.py` and adjust event fields; or network/proxy issues → if `no_proxy` is set, rule that out and inspect the actual error with `LITELLM_LOG=ERROR`.

- [ ] **Step 4: Syntax check**

Run: `.venv/bin/python -m py_compile py/ResponsesAsOpenAI.py tests/test_responses_adapter.py`
Expected: no output, exit code 0

- [ ] **Step 5: Commit**

```bash
git add py/ResponsesAsOpenAI.py tests/test_responses_adapter.py
git commit -m "feat: add OpenAI Responses API provider adapter (litellm openai/responses/ bridge)"
```

---

### Task 2: Backend dispatch in `server.py`

**Files:**
- Modify: `server.py:471-473` (imports)
- Modify: `server.py:739-747`(`get_client_class`)
- Modify: `server.py:7045-7072`(`/v1/providers/models`)

**Interfaces:**
- Consumes: Task 1's `AsyncResponsesAsOpenAI` (import path `py.ResponsesAsOpenAI`)
- Produces: dispatch vendor `'OpenAIResponses'` to the new adapter in `get_client_class()`; `/v1/providers/models` uses the adapter to retrieve models

- [ ] **Step 1: Add import**

After line 473 of `server.py`, `from py.GeminiAsOpenAI import AsyncGeminiAsOpenAI`, add:

```python
from py.ResponsesAsOpenAI import AsyncResponsesAsOpenAI
```

- [ ] **Step 2: Add branch in `get_client_class()`**

Replace `server.py:740-747`:

```python
    if vendor == 'Dify':
        return DifyOpenAIAsync 
    elif vendor == 'customAnthropic':
        return AsyncClaudeAsOpenAI
    elif vendor == 'Gemini':
        return AsyncGeminiAsOpenAI
    else: 
        return AsyncOpenAI
```

With:

```python
    if vendor == 'Dify':
        return DifyOpenAIAsync 
    elif vendor == 'customAnthropic':
        return AsyncClaudeAsOpenAI
    elif vendor == 'Gemini':
        return AsyncGeminiAsOpenAI
    elif vendor == 'OpenAIResponses':
        return AsyncResponsesAsOpenAI
    else: 
        return AsyncOpenAI
```

- [ ] **Step 3: Add branch in `/v1/providers/models`**

Insert after the Gemini branch in `server.py:7045-7058` (comment formerly labeled `# 2. Intercept Gemini`) and before the Dify branch:

```python
        # 2.5 Intercept OpenAI Responses API
        elif vendor == 'OpenAIResponses':
            client = AsyncResponsesAsOpenAI(
                api_key=request.api_key,
                base_url=request.url,
                http_client=global_http_client
            )
```

- [ ] **Step 4: Verify syntax and presence of branches**

Run:
```bash
.venv/bin/python -m py_compile server.py
grep -c "AsyncResponsesAsOpenAI" server.py
grep -n "OpenAIResponses" server.py
```
Expected: `py_compile` exits 0 with no output; grep count is 3 (one import, one `get_client_class` branch, one `/v1/providers/models` branch); `grep -n` shows three lines.

- [ ] **Step 5: Commit**

```bash
git add server.py
git commit -m "feat: dispatch OpenAIResponses vendor to new adapter in server.py"
```

---

### Task 3: Frontend vendor option and validation

**Files:**
- Modify: `static/js/vue_data.js:1943`(`vendorValues`)
- Modify: `static/js/vue_methods.js:5596` (`handleVendorChange` default URL logic)
- Modify: `static/js/vue_methods.js:8596-8598`(`goToURL`)
- Modify: `static/js/renderer.js:2011`(`validProvider`)
- Modify: `static/js/locales/zh-CN.js:127`, `static/js/locales/en-US.js:127` (historical vendor translations; the former locale has since been retired from this fork)

**Interfaces:**
- Produces: vendor `OpenAIResponses` appears in the provider selection list, treated as a custom provider requiring a URL, with display name "OpenAI Responses".

- [ ] **Step 1: Add option to vendorValues in `vue_data.js`**

Replace `static/js/vue_data.js:1943`:

```js
      'custom','customAnthropic', 'OpenAI','Anthropic', 'Gemini','Grok',
```

With:

```js
      'custom','customAnthropic','OpenAIResponses', 'OpenAI','Anthropic', 'Gemini','Grok',
```

- [ ] **Step 2: Do not prefill default URL in `vue_methods.js` handleVendorChange**

Replace `static/js/vue_methods.js:5596`:

```js
      if (value !== 'custom' && value !== 'customAnthropic' ) {
        this.newProviderTemp.url = defaultUrls[value] || ''
      }
```

With:

```js
      if (value !== 'custom' && value !== 'customAnthropic' && value !== 'OpenAIResponses') {
        this.newProviderTemp.url = defaultUrls[value] || ''
      }
```

- [ ] **Step 3: Open user-entered URL in `vue_methods.js` goToURL**

Replace `static/js/vue_methods.js:8596-8598`:

```js
        else if (provider.vendor === 'customAnthropic'){
          url = provider.url;
        }
```

With:

```js
        else if (provider.vendor === 'customAnthropic' || provider.vendor === 'OpenAIResponses'){
          url = provider.url;
        }
```

- [ ] **Step 4: Validate URL in `renderer.js` validProvider**

Replace `static/js/renderer.js:2011`:

```js
      if (this.newProviderTemp.vendor === 'custom' || this.newProviderTemp.vendor === 'customAnthropic') {
```

With:

```js
      if (this.newProviderTemp.vendor === 'custom' || this.newProviderTemp.vendor === 'customAnthropic' || this.newProviderTemp.vendor === 'OpenAIResponses') {
```

- [ ] **Step 5: Add vendor translation**

In the historical `static/js/locales/zh-CN.js:127`, add after the `vendor.customAnthropic` translation (meaning Custom Anthropic):

```js
        'vendor.OpenAIResponses': 'OpenAI Responses',
```

In `static/js/locales/en-US.js:127`, add after `'vendor.customAnthropic': 'Custom Anthropic',`:

```js
        'vendor.OpenAIResponses': 'OpenAI Responses',
```

- [ ] **Step 6: Syntax check**

Run:
```bash
node --check static/js/vue_data.js && node --check static/js/vue_methods.js && node --check static/js/renderer.js && node --check static/js/locales/zh-CN.js && node --check static/js/locales/en-US.js
```
Expected: no output, exit code 0

- [ ] **Step 7: Commit**

```bash
git add static/js/vue_data.js static/js/vue_methods.js static/js/renderer.js static/js/locales/zh-CN.js static/js/locales/en-US.js
git commit -m "feat: add OpenAIResponses provider option and validation to frontend"
```

---

### Task 4: Manual end-to-end validation

**Files:** No code changes

- [ ] **Step 1: Start application**

Run: `npm start`
Expected: Electron window opens and backend starts successfully (log contains `REAL_PORT_FOUND:<port>`).

- [ ] **Step 2: Add provider**

Settings → Model configuration → Providers, click "+". **OpenAI Responses** appears in the provider list on the left. When selected, URL is blank and must be entered manually. Enter `http://127.0.0.1:3456/v1` (local backend for OpenAPI-compatible testing, or an actual Responses API endpoint) and API Key, then click "Test connection".
Expected: "Confirm" is disabled without a URL and enabled when a URL beginning with http is entered.

- [ ] **Step 3: Retrieve model list**

The model list should appear after connection test (if endpoint lacks `/models`, allow manual model name entry).

- [ ] **Step 4: Main chat streaming conversation**

Select this provider as primary model and send a message.
Expected: streaming output works; token usage appears at completion if bridge reports usage; reasoning content appears for reasoning models if endpoint supports it.

- [ ] **Step 5: Verify tool calls**

Send a message requiring a tool (e.g. "What time is it?" to invoke the time tool).
Expected: tool call → tool result → final reply, with full path working.

- [ ] **Step 6: Spot-check non-streaming path**

Send a message using deep search or a non-streaming path (or call `/v1/chat/completions` directly with model super-model, with this provider selected as primary).
Expected: complete JSON response.

---

## Self-Review Conclusions

- **Spec coverage:** adapter (Task 1), two dispatch points in server.py (Task 2), frontend vendor list/URL handling/validation/translations (Task 3), error handling (adapter exceptions via existing `_wrap_client_chat_with_retry`, Task 4 Step 5 tool path check), validation (Task 1 smoke + Task 4 manual) — all covered with no gaps.
- **Placeholders:** no TBD/TODO; code complete.
- **Type consistency:** `AsyncResponsesAsOpenAI` constructor signature, `chat.completions.create` and `models.list()` returns defined in Task 1; Task 2 usage (passing `api_key/base_url/http_client`) matches Task 1; vendor string `'OpenAIResponses'` is consistent throughout.
