import httpx
import os
from typing import Optional, List, Dict, Any, Union

class AsyncGeminiAsOpenAI:
    """
    Emulate the AsyncOpenAI client using litellm.acompletion.
    Adapt to direct Google AI Studio access, OpenAI-compatible proxies and native Gemini gateways.
    """
    
    def __init__(
        self, 
        api_key: str, 
        base_url: Optional[str] = None,
        default_model: Optional[str] = "gemini-1.5-flash",
        http_client: Optional[httpx.AsyncClient] = None,
        **kwargs
    ):
        self.api_key = api_key
        if base_url == "https://generativelanguage.googleapis.com/v1beta/openai":
            # Correct an accidentally supplied Google OpenAI-compatible endpoint to the official AI Studio endpoint
            base_url = "https://generativelanguage.googleapis.com"
        # Default to the official Google AI Studio endpoint if none is supplied
        self.base_url = base_url or "https://generativelanguage.googleapis.com"
        self.default_model = default_model
        self.http_client = http_client
        self._litellm_module = None

    @property
    def _litellm(self):
        if self._litellm_module is None:
            import litellm
            self._litellm_module = litellm
        return self._litellm_module

    # ================== 1. Chat support ==================
    @property
    def chat(self):
        return self._ChatResource(self)

    class _ChatResource:
        def __init__(self, parent: "AsyncGeminiAsOpenAI"):
            self.completions = self._CompletionsResource(parent)

        class _CompletionsResource:
            def __init__(self, parent: "AsyncGeminiAsOpenAI"):
                self._parent = parent

            async def create(
                self,
                model: Optional[str] = None,
                messages: Optional[List[Dict[str, Any]]] = None,
                temperature: Optional[float] = None,
                max_tokens: Optional[int] = None,
                stream: bool = False,
                stop: Optional[Union[str, List[str]]] = None,
                tools: Optional[List[Dict]] = None,
                tool_choice: Optional[Any] = None,
                **kwargs
            ):
                litellm = self._parent._litellm
                raw_model = model or self._parent.default_model
                if not raw_model:
                    raise ValueError("model is required")

                # Set the environment variable to prevent LiteLLM from selecting Vertex AI authentication
                if self._parent.api_key:
                    os.environ["GEMINI_API_KEY"] = self._parent.api_key
                    os.environ["GOOGLE_API_KEY"] = self._parent.api_key

                base_url_str = self._parent.base_url or ""
                # Check for direct access to the official service
                is_official = not base_url_str or "generativelanguage.googleapis.com" in base_url_str

                # Check for a standard OpenAI-compatible proxy (such as OneAPI or NewAPI)
                is_openai_proxy = False
                if base_url_str:
                    cleaned_url = base_url_str.rstrip('/')
                    if cleaned_url.endswith('/v1') or "api." in cleaned_url or "proxy" in cleaned_url:
                        if "generativelanguage.googleapis.com" not in cleaned_url:
                            is_openai_proxy = True

                completion_kwargs = {
                    "messages": messages,
                    "stream": stream,
                }

                # Adaptive routing strategy
                if is_official:
                    # Scenario A: direct access to official AI Studio
                    # Use the gemini/ prefix and omit api_base to avoid a duplicate /v1beta/v1beta path
                    clean_model = raw_model.split('/')[-1]
                    completion_kwargs["model"] = f"gemini/{clean_model}"
                    completion_kwargs["api_key"] = self._parent.api_key
                elif is_openai_proxy:
                    # Scenario B: OpenAI-compatible proxy
                    # Route through the OpenAI-compatible adapter; the proxy handles the format
                    clean_model = raw_model.split('/')[-1]
                    completion_kwargs["model"] = f"openai/{clean_model}"
                    completion_kwargs["api_key"] = self._parent.api_key
                    completion_kwargs["api_base"] = base_url_str
                else:
                    # Scenario C: native Gemini gateway (such as Cloudflare AI Gateway)
                    clean_model = raw_model.split('/')[-1]
                    completion_kwargs["model"] = f"gemini/{clean_model}"
                    completion_kwargs["api_key"] = self._parent.api_key
                    completion_kwargs["api_base"] = base_url_str
                    completion_kwargs["custom_llm_provider"] = "gemini"

                # Include standard OpenAI parameters
                if temperature is not None:
                    completion_kwargs["temperature"] = temperature
                if max_tokens is not None:
                    completion_kwargs["max_tokens"] = max_tokens
                if stop is not None:
                    completion_kwargs["stop"] = stop
                if tools:
                    completion_kwargs["tools"] = tools
                if tool_choice:
                    completion_kwargs["tool_choice"] = tool_choice
                if self._parent.http_client is not None:
                    completion_kwargs["client"] = self._parent.http_client

                # Filter OpenAI-specific parameters not supported by Gemini
                safe_kwargs = {k: v for k, v in kwargs.items() 
                              if k not in ['logprobs', 'top_logprobs', 'response_format', 'n']}

                return await litellm.acompletion(**completion_kwargs, **safe_kwargs)

    # ================== 2. Models support ==================
    @property
    def models(self):
        return self._ModelsResource(self)

    class _ModelsResource:
        def __init__(self, parent: "AsyncGeminiAsOpenAI"):
            self._parent = parent

        async def list(self):
            class ModelItem:
                def __init__(self, model_id: str):
                    self.id = model_id

            class ModelList:
                def __init__(self, data: list):
                    self.data = data

            base_url_str = self._parent.base_url or ""
            is_official = not base_url_str or "generativelanguage.googleapis.com" in base_url_str

            is_openai_proxy = False
            if base_url_str:
                cleaned_url = base_url_str.rstrip('/')
                if cleaned_url.endswith('/v1') or "api." in cleaned_url or "proxy" in cleaned_url:
                    if "generativelanguage.googleapis.com" not in cleaned_url:
                        is_openai_proxy = True

            # Select the model-list URL and headers for the endpoint type
            if is_official:
                url = f"https://generativelanguage.googleapis.com/v1beta/models?key={self._parent.api_key}"
                headers = {}
            elif is_openai_proxy:
                url = f"{base_url_str.rstrip('/')}/models"
                if not url.endswith("/v1/models") and "/v1" not in url:
                    url = f"{base_url_str.rstrip('/')}/v1/models"
                headers = {"Authorization": f"Bearer {self._parent.api_key}"}
            else:
                url = f"{base_url_str.rstrip('/')}/v1beta/models?key={self._parent.api_key}"
                headers = {}

            try:
                client = self._parent.http_client
                need_close = False
                if not client:
                    client = httpx.AsyncClient()
                    need_close = True

                response = await client.get(url, headers=headers, timeout=10.0)
                
                if need_close:
                    await client.aclose()

                if response.status_code == 200:
                    res_data = response.json()
                    models = []
                    # Parse Google's official format: {"models":[{"name": "models/gemini-1.5-flash", ...}]}
                    if "models" in res_data:
                        for m in res_data["models"]:
                            name = m.get("name", "").split("/")[-1]
                            if name:
                                models.append(ModelItem(name))
                    # Parse the OpenAI format: {"data":[{"id": "gemini-1.5-flash", ...}]}
                    elif "data" in res_data:
                        models = [ModelItem(m["id"]) for m in res_data["data"]]
                    
                    if models:
                        return ModelList(models)
            except Exception as e:
                print(f"Failed to fetch the Gemini model list; using fallback: {e}")

            # Static fallback
            fallback_models = []
            return ModelList([ModelItem(m) for m in fallback_models])