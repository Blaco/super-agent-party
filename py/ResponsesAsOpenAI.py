import httpx
from typing import Optional, List, Dict, Any

class AsyncResponsesAsOpenAI:
    """
    Emulate AsyncOpenAI using the openai/responses/ bridge in litellm.acompletion.
    (litellm handles bidirectional conversion between Chat Completions and the Responses API.)
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
        """Load litellm on the first call."""
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
            # Construct an object compatible with the OpenAI response format
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
                # Prefer the shared http_client to respect system proxy configuration
                client = self._parent.http_client
                need_close = False
                if not client:
                    client = httpx.AsyncClient()
                    need_close = True

                get_kwargs = {"headers": headers}
                if self._parent.timeout is not None:
                    get_kwargs["timeout"] = self._parent.timeout

                try:
                    response = await client.get(url, **get_kwargs)
                finally:
                    # Always close a locally created client to avoid leaking connections
                    if need_close:
                        await client.aclose()

                if response.status_code == 200:
                    data = response.json()
                    models = [ModelItem(m["id"]) for m in data.get("data", [])]
                    if models:
                        return ModelList(models)
                else:
                    print(f"Failed to fetch the OpenAI Responses model list: HTTP {response.status_code}")
            except Exception as e:
                print(f"Failed to fetch the OpenAI Responses model list (the proxy or provider may not support it): {e}")

            # Static fallback: return an empty list on failure so the frontend can accept a model name manually
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

                # The openai/responses/ prefix selects litellm's responses_api_bridge
                # (In litellm 1.83.x, get_llm_provider cannot resolve a bare "responses/" prefix;
                #  the "openai/" routing prefix is required. The bridge strips the prefix before calling /responses.)
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

                # Pass tools in OpenAI function format; the bridge converts them to Responses API format
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
                # are mapped by the bridge to Responses API parameters and passed through unchanged
                safe_kwargs = {k: v for k, v in kwargs.items()
                              if k not in ['logprobs', 'top_logprobs', 'n']}

                return await litellm.acompletion(**completion_kwargs, **safe_kwargs)
