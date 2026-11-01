"""
GRID LOCK — LLM Provider Client

Performs exactly ONE HTTP request per batch decision tick.
Configures transport with retries=0 (strictly NO retries on error or timeout).
Requests native JSON output from Gemini or OpenAI APIs.
"""

from abc import ABC, abstractmethod
import json
import time
from typing import Any, Dict, Optional, Tuple
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


class BaseLLMProvider(ABC):
    @abstractmethod
    async def generate_decision(
        self,
        system_prompt: str,
        user_prompt: str,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Tuple[Dict[str, Any], float]:
        """
        Executes single LLM request.
        Returns (parsed_json_dict, provider_latency_ms).
        Raises LLMProviderError on failure.
        """
        pass


class GeminiProvider(BaseLLMProvider):
    def __init__(self, cfg: Settings = settings):
        self.cfg = cfg

    async def generate_decision(
        self,
        system_prompt: str,
        user_prompt: str,
        client: Optional[httpx.AsyncClient] = None,
    ) -> Tuple[Dict[str, Any], float]:
        if not self.cfg.GEMINI_API_KEY:
            raise LLMProviderError(
                "Gemini API key is not configured in backend environment",
                status_code=503,
            )

        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.cfg.LLM_MODEL}:generateContent?key={self.cfg.GEMINI_API_KEY}"
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

            if response.status_code != 200:
                error_msg = response.text
                status_code = 429 if response.status_code == 429 else 502
                try:
                    err_json = response.json()
                    raw_msg = err_json.get("error", {}).get("message", "")
                    if response.status_code == 429:
                        error_msg = f"Gemini Free Tier quota exceeded (15 RPM limit): {raw_msg}"
                    elif raw_msg:
                        error_msg = f"Gemini API error ({response.status_code}): {raw_msg}"
                except Exception:
                    pass

                raise LLMProviderError(
                    f"Gemini API returned status {response.status_code}: {error_msg}",
                    status_code=status_code,
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

            try:
                parsed = json.loads(candidate_text)
            except json.JSONDecodeError as exc:
                raise LLMProviderError(
                    f"Gemini generated invalid JSON: {candidate_text}",
                    status_code=502,
                    raw_response=candidate_text,
                ) from exc

            return parsed, latency_ms
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
    ) -> Tuple[Dict[str, Any], float]:
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
                        "Authorization": f"Bearer {self.cfg.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
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

            try:
                parsed = json.loads(content)
            except json.JSONDecodeError as exc:
                raise LLMProviderError(
                    f"OpenAI generated invalid JSON: {content}",
                    status_code=502,
                    raw_response=content,
                ) from exc

            return parsed, latency_ms
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
