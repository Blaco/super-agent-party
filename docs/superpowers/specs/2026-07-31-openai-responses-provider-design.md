# OpenAI Responses API Provider Integration Design

> Historical upstream design record, translated for the fork. Code excerpts, paths, dependency versions and implementation steps are not current instructions; use the Agent Creation work protocol and live source instead.

Date: 2026-07-31
Status: Confirmed (historical upstream record)

## Background and goals

Add a separate model-provider vendor type for services that provide only an **OpenAI Responses API** endpoint (`POST /responses`), including:

1. Relays or gateways that implement `/responses` but not Chat Completions.
2. New capabilities of official OpenAI models such as gpt-5/o3 (e.g. reasoning summaries and built-in web_search) that rely on Responses API.

Implementation requirement: use the existing **litellm** dependency (litellm>=1.83.7, historically locked to 1.83.13).

## Technical background

litellm 1.83.13 includes `responses_api_bridge` (`litellm/completion_extras/litellm_responses_transformation/`), which automatically performs the following when calling `litellm.acompletion(model="openai/responses/<model>", ...)`:

> **Note: the `openai/` routing prefix is required.** In litellm 1.83.13, `get_llm_provider` cannot resolve a provider from bare `responses/<model>` (BadRequestError). `openai/responses/<model>` resolves the provider via `openai/`, then the remaining `responses/<model>` triggers `responses_api_bridge`.

- Convert Chat Completions requests to Responses API requests (`messages` → `input` items, tool result messages → `function_call_output`).
- Convert `tools` automatically to Responses format (`{type: "function", name, description, parameters}`).
- `max_tokens`/`max_completion_tokens` → `max_output_tokens`
- `response_format` → `text.format`;`reasoning_effort` → `reasoning`
- `web_search_options` → built-in web_search tool.
- Convert Responses API output back to Chat Completions: non-streaming `ModelResponse` (including `choices[0].message.tool_calls`, `usage`); streaming `CustomStreamWrapper` yields standard chat.completions chunks (including `delta.reasoning_content`, tool_calls, final usage chunk).

Historically verified in local `.venv` with litellm 1.83.13: `litellm.responses`/`aresponses`, bridge handler and conversion logic exist.

## Architecture decision

### Options

Select **Option A: new adapter and vendor via the litellm `openai/responses/` prefix bridge**.

- Option A: create `py/ResponsesAsOpenAI.py` emulating AsyncOpenAI, internally using `litellm.acompletion(model="openai/responses/<model>", ...)`. Small implementation (~150 lines); litellm maintains format conversion; main chat, reasoning, deep search and `/v1/chat/completions` paths work automatically.
- Option B (rejected): use `litellm.aresponses()` directly and convert messages/tools/streams inside adapter; three to four times more code and higher compatibility risk.
- Option C (rejected): add a switch to existing `custom` vendor, inconsistent with existing customAnthropic pattern.

### Architecture diagram

```
Frontend selects vendor "OpenAIResponses" → settings saved (modelProviders[])
    ↓
server.py get_client_class() dispatch → AsyncResponsesAsOpenAI (py/ResponsesAsOpenAI.py)
    ↓ Emulate AsyncOpenAI interface (chat.completions.create / models.list)
    ↓
litellm.acompletion(model="openai/responses/<model>", api_base=url, ...)
    ↓ responses_api_bridge
    ↓
litellm.aresponses() → POST {base}/responses
    ↓ Bridge converts back to chat.completions format (streaming/non-streaming)
    ↓
Existing generate_stream_response / generate_complete_response unchanged
```

## Implementation details

### 1. Backend: new file `py/ResponsesAsOpenAI.py`

Class `AsyncResponsesAsOpenAI`, following `py/ClaudeAsOpenAI.py` pattern:

- `__init__(api_key, base_url=None, default_model=None, http_client=None, timeout=None, max_retries=None, **kwargs)` — signature matches `AsyncClaudeAsOpenAI`.
- `_litellm` property: lazily `import litellm` and cache it.
- `chat.completions.create(model, messages, temperature, max_tokens, stream, top_p, stop, tools, tool_choice, **kwargs)`:
  - Model prefix `openai/responses/` (add if missing; rewrite `responses/x` to `openai/responses/x`; litellm strips `openai/` and triggers bridge via `responses/`).
  - Assemble kwargs: `model`, `messages`, `api_key`, `api_base=base_url`, `stream`, `temperature`, `max_tokens`, `top_p`, `stop`, `timeout`, `client=http_client` (reuse shared proxy client).
  - Pass through `tools` and `tool_choice` unchanged (bridge converts automatically).
  - Filter three bridge-unsupported kwargs: `logprobs`, `top_logprobs`, `n`; pass through others (including `response_format`, `reasoning_effort`).
  - `return await litellm.acompletion(**completion_kwargs, **safe_kwargs)`
- `models.list()`: `GET {base}/models` (append `/models` when base_url ends with `/v1`, otherwise `/v1/models`), Bearer authentication, reuse shared http_client; on failure print warning and return empty list.

### 2. Backend dispatch points in `server.py`

| Location | Change |
|---|---|
| `get_client_class()` lines 731-748 | Add `if vendor == 'OpenAIResponses': return AsyncResponsesAsOpenAI`; import `py/ResponsesAsOpenAI.py` (near lines 471-473) |
| `/v1/providers/models` lines 7043-7072 | Dispatch `OpenAIResponses` to new adapter instance and retrieve models |

### 3. Frontend changes

| File | Change |
|---|---|
| `static/js/vue_data.js` line 1943 `vendorValues` | Add `'OpenAIResponses'` after `'customAnthropic'` |
| `static/js/vue_methods.js` `handleVendorChange` line 5596 | Extend `value !== 'custom' && value !== 'customAnthropic'` to exclude `'OpenAIResponses'` too (no default URL; user supplies endpoint) |
| `static/js/vue_methods.js` `goToURL` line 8596 | Handle `OpenAIResponses` like `customAnthropic` (open user-supplied URL as API page) |
| `static/js/renderer.js` `validProvider` line 2011 | Add `'OpenAIResponses'` to `custom`/`customAnthropic` branch (valid only with URL starting with http) |

### 4. Error handling

- If gateway lacks Responses endpoint, litellm bridge raises an exception → `_wrap_client_chat_with_retry` (lines 751-784) retries 429/5xx under existing policy → existing error reporting displays error in frontend.
- Model list retrieval failure → empty list; frontend allows manual model name entry.

### 5. Validation

Historical project had no automated tests; manual validation:

1. Add provider on settings page, select `OpenAIResponses` vendor, enter relay URL and API Key.
2. Click "Test connection"; verify model list is retrieved or manual entry is available.
3. Send main-chat message; verify streaming output (including reasoning content when supported).
4. Enable tool calls in conversation; verify tool calls and returned results.
5. Spot-check non-streaming path (e.g. deep search).

## Scope

Out of scope:

- Changing existing OpenAI/other vendor behavior.
- Adding Responses API-specific UI (e.g. reasoning display switch).
- Upgrading litellm (1.83.13 already contains bridge).

Dependency: litellm>=1.83.7 (already satisfied, historically 1.83.13; no pyproject.toml change required).
