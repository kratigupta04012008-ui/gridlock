"""
GRID LOCK — LLM Provider Client

Performs exactly ONE HTTP request per batch decision tick.
Configures transport with retries=0 (strictly NO retries on error or timeout).
Implements thread-safe key pool rotation across ticks to prevent 429 quota exhaustion.
Extracts native provider token usage metadata (promptTokenCount, candidatesTokenCount).
"""

from abc import ABC, abstractmethod
import json
import re
import threading
import time
from typing import Any, Dict, List, Optional, Tuple
import httpx
from backend.config import Settings, settings


class LLMProviderError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int = 502,
        raw_response: Optional[str] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.raw_response = raw_response


class ProviderResult(tuple):
    """
    A 2-tuple (result, latency_ms) with input_tokens and output_tokens attributes.
    Maintains 100% backward compatibility with 'result, latency = await provider.generate_decision(...)'.
    """
    def __new__(cls, result: Dict[str, Any], latency_ms: float, input_tokens: int = 0, output_tokens: int = 0):
        obj = super().__new__(cls, (result, latency_ms))
        obj.result = result
        obj.latency_ms = latency_ms
        obj.input_tokens = input_tokens
        obj.output_tokens = output_tokens
        return obj


class GeminiKeyPool:
    """Thread-safe key pool distributing requests round-robin across decision ticks."""

    def __init__(self, keys: List[str]):
        self._keys = [k.strip() for k in keys if k.strip()]
        self._lock = threading.Lock()
        self._index = 0
        self._cooldowns: Dict[str, float] = {}

    @property
    def total_keys(self) -> int:
        return len(self._keys)

    def mark_rate_limited(self, key: str, cooldown_seconds: float = 60.0) -> None:
        """Puts a key that hit 429 into temporary cooldown so subsequent ticks avoid it."""
        with self._lock:
            self._cooldowns[key] = time.time() + cooldown_seconds

    def get_next_key(self, current_keys: Optional[List[str]] = None) -> str:
        """Selects the next healthy key in round-robin sequence."""
        with self._lock:
            if current_keys is not None:
                cleaned = [k.strip() for k in current_keys if k.strip()]
                if cleaned != self._keys:
                    self._keys = cleaned

            if not self._keys:
                raise LLMProviderError(
                    "No Gemini API keys configured in pool", status_code=503
                )

            now = time.time()
            expired = [k for k, exp in self._cooldowns.items() if exp <= now]
            for k in expired:
                del self._cooldowns[k]

            # Try finding the next non-cooldown key
            for _ in range(len(self._keys)):
                key = self._keys[self._index % len(self._keys)]
                self._index += 1
                if key not in self._cooldowns:
                    return key

            # If all keys are in cooldown, select the one closest to expiry
            return min(self._keys, key=lambda k: self._cooldowns.get(k, 0))


class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate_decision(
        self,
        system_prompt: str,
        user_prompt: str,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Tuple[Dict[str, Any], float, int, int]:
        """
        Executes single LLM request.
        Returns (parsed_json_dict, provider_latency_ms, input_tokens, output_tokens).
        Raises LLMProviderError on failure.
        """
        pass


class GeminiProvider(BaseLLMProvider):
    def __init__(self, cfg: Settings = settings):
        self.cfg = cfg
        self.key_pool = GeminiKeyPool(cfg.gemini_keys)

    async def generate_decision(
        self,
        system_prompt: str,
        user_prompt: str,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Tuple[Dict[str, Any], float, int, int]:
        active_key = self.key_pool.get_next_key(current_keys=self.cfg.gemini_keys)

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.cfg.LLM_MODEL}:generateContent?key={active_key}"
        )

        body = {
            "system_instruction": {
                "parts": [{"text": system_prompt}],
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_prompt}],
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": self.cfg.LLM_TEMPERATURE,
                "maxOutputTokens": self.cfg.LLM_MAX_TOKENS,
            },
        }

        transport = httpx.AsyncHTTPTransport(retries=0)
        timeout = httpx.Timeout(self.cfg.LLM_TIMEOUT_S)

        close_client = False
        if client is None:
            http_client = httpx.AsyncClient(transport=transport, timeout=timeout)
            close_client = True
        else:
            http_client = client

        try:
            t0 = time.perf_counter()
            try:
                response = await http_client.post(
                    url,
                    json=body,
                    headers={"Content-Type": "application/json"},
                )
            except httpx.TimeoutException as exc:
                latency_ms = (time.perf_counter() - t0) * 1000.0
                raise LLMProviderError(
                    f"Gemini API timed out after {self.cfg.LLM_TIMEOUT_S}s: {exc}",
                    status_code=504,
                ) from exc
            except httpx.RequestError as exc:
                latency_ms = (time.perf_counter() - t0) * 1000.0
                raise LLMProviderError(
                    f"Gemini API network error: {exc}",
                    status_code=502,
                ) from exc

            latency_ms = (time.perf_counter() - t0) * 1000.0

            if response.status_code == 429:
                self.key_pool.mark_rate_limited(active_key, cooldown_seconds=60.0)
                raise LLMProviderError(
                    f"Gemini API returned status 429: {response.text}",
                    status_code=429,
                    raw_response=response.text,
                )

            if response.status_code != 200:
                raise LLMProviderError(
                    f"Gemini API returned status {response.status_code}: {response.text}",
                    status_code=502,
                    raw_response=response.text,
                )

            try:
                resp_json = response.json()
                candidate_text = resp_json["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError, json.JSONDecodeError) as exc:
                raise LLMProviderError(
                    f"Gemini response structure unexpected: {response.text}",
                    status_code=502,
                    raw_response=response.text,
                ) from exc

            # Extract native provider token usage
            usage = resp_json.get("usageMetadata", {})
            input_tokens = int(usage.get("promptTokenCount", 0))
            output_tokens = int(usage.get("candidatesTokenCount", 0))

            cleaned_text = candidate_text.strip()
            if cleaned_text.startswith("```"):
                cleaned_text = re.sub(r"^```(?:json)?\s*", "", cleaned_text)
                cleaned_text = re.sub(r"\s*```$", "", cleaned_text)
                cleaned_text = cleaned_text.strip()

            try:
                parsed = json.loads(cleaned_text)
            except json.JSONDecodeError as exc:
                raise LLMProviderError(
                    f"Gemini generated invalid JSON: {candidate_text}",
                    status_code=502,
                    raw_response=candidate_text,
                ) from exc

            return ProviderResult(parsed, latency_ms, input_tokens, output_tokens)
        finally:
            if close_client:
                await http_client.aclose()


class OpenAIProvider(BaseLLMProvider):
    def __init__(self, cfg: Settings = settings):
        self.cfg = cfg

    async def generate_decision(
        self,
        system_prompt: str,
        user_prompt: str,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Tuple[Dict[str, Any], float, int, int]:
        if not self.cfg.OPENAI_API_KEY:
            raise LLMProviderError(
                "OpenAI API key is not configured in backend environment",
                status_code=503,
            )

        url = "https://api.openai.com/v1/chat/completions"

        body = {
            "model": self.cfg.LLM_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "response_format": {"type": "json_object"},
            "temperature": self.cfg.LLM_TEMPERATURE,
            "max_tokens": self.cfg.LLM_MAX_TOKENS,
        }

        transport = httpx.AsyncHTTPTransport(retries=0)
        timeout = httpx.Timeout(self.cfg.LLM_TIMEOUT_S)

        close_client = False
        if client is None:
            http_client = httpx.AsyncClient(transport=transport, timeout=timeout)
            close_client = True
        else:
            http_client = client

        try:
            t0 = time.perf_counter()
            try:
                response = await http_client.post(
                    url,
                    json=body,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.cfg.OPENAI_API_KEY}",
                    },
                )
            except httpx.TimeoutException as exc:
                latency_ms = (time.perf_counter() - t0) * 1000.0
                raise LLMProviderError(
                    f"OpenAI API timed out after {self.cfg.LLM_TIMEOUT_S}s: {exc}",
                    status_code=504,
                ) from exc
            except httpx.RequestError as exc:
                latency_ms = (time.perf_counter() - t0) * 1000.0
                raise LLMProviderError(
                    f"OpenAI API network error: {exc}",
                    status_code=502,
                ) from exc

            latency_ms = (time.perf_counter() - t0) * 1000.0

            if response.status_code == 429:
                raise LLMProviderError(
                    f"OpenAI API rate limited (429): {response.text}",
                    status_code=429,
                    raw_response=response.text,
                )

            if response.status_code != 200:
                raise LLMProviderError(
                    f"OpenAI API returned status {response.status_code}: {response.text}",
                    status_code=502,
                    raw_response=response.text,
                )

            try:
                resp_json = response.json()
                content = resp_json["choices"][0]["message"]["content"]
            except (KeyError, IndexError, json.JSONDecodeError) as exc:
                raise LLMProviderError(
                    f"OpenAI response structure unexpected: {response.text}",
                    status_code=502,
                    raw_response=response.text,
                ) from exc

            usage = resp_json.get("usage", {})
            input_tokens = int(usage.get("prompt_tokens", 0))
            output_tokens = int(usage.get("completion_tokens", 0))

            cleaned_text = content.strip()
            if cleaned_text.startswith("```"):
                cleaned_text = re.sub(r"^```(?:json)?\s*", "", cleaned_text)
                cleaned_text = re.sub(r"\s*```$", "", cleaned_text)
                cleaned_text = cleaned_text.strip()

            try:
                parsed = json.loads(cleaned_text)
            except json.JSONDecodeError as exc:
                raise LLMProviderError(
                    f"OpenAI generated invalid JSON: {content}",
                    status_code=502,
                    raw_response=content,
                ) from exc

            return ProviderResult(parsed, latency_ms, input_tokens, output_tokens)
        finally:
            if close_client:
                await http_client.aclose()


def get_llm_provider(cfg: Settings = settings) -> BaseLLMProvider:
    if cfg.LLM_PROVIDER == "gemini":
        return GeminiProvider(cfg)
    elif cfg.LLM_PROVIDER == "openai":
        return OpenAIProvider(cfg)
    else:
        raise ValueError(f"Unknown LLM provider: {cfg.LLM_PROVIDER}")
