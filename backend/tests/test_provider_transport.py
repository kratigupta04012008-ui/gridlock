"""
GRID LOCK — Tests for LLM Provider Transport & Invariants

Using respx to mock provider HTTP calls:
1. Verify strictly ONE provider request per batch.
2. Verify zero retries on timeout, 500, or 429.
3. Verify transport layer behavior.
"""

import json
import httpx
import pytest
import respx

from backend.config import Settings
from backend.services.llm.provider import (
    GeminiProvider,
    LLMProviderError,
    OpenAIProvider,
)


@pytest.mark.asyncio
async def test_gemini_single_request_success():
    cfg = Settings(
        LLM_PROVIDER="gemini",
        GEMINI_API_KEY="test-gemini-key",
        LLM_MODEL="gemini-2.5-flash",
    )
    provider = GeminiProvider(cfg)

    gemini_resp_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "decisions": [
                                        {"id": 1, "action": "ACCELERATE", "throttle": 0.5},
                                        {"id": 2, "action": "MAINTAIN"},
                                    ]
                                }
                            )
                        }
                    ]
                }
            }
        ]
    }

    async with respx.mock(assert_all_called=True) as respx_mock:
        route = respx_mock.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{cfg.LLM_MODEL}:generateContent?key={cfg.GEMINI_API_KEY}"
        ).respond(status_code=200, json=gemini_resp_payload)

        async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(retries=0)) as client:
            result, latency = await provider.generate_decision(
                system_prompt="sys",
                user_prompt="usr",
                client=client,
            )

        assert route.call_count == 1  # EXACTLY ONE CALL
        assert "decisions" in result
        assert len(result["decisions"]) == 2
        assert latency > 0


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code", [500, 429, 503])
async def test_gemini_zero_retries_on_http_error(status_code):
    cfg = Settings(
        LLM_PROVIDER="gemini",
        GEMINI_API_KEY="test-gemini-key",
        LLM_MODEL="gemini-2.5-flash",
    )
    provider = GeminiProvider(cfg)

    async with respx.mock(assert_all_called=True) as respx_mock:
        route = respx_mock.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{cfg.LLM_MODEL}:generateContent?key={cfg.GEMINI_API_KEY}"
        ).respond(status_code=status_code, text=f"Error {status_code}")

        async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(retries=0)) as client:
            with pytest.raises(LLMProviderError) as exc_info:
                await provider.generate_decision(
                    system_prompt="sys",
                    user_prompt="usr",
                    client=client,
                )

        assert route.call_count == 1  # STRICTLY 1 CALL, NO RETRIES!
        assert f"returned status {status_code}" in exc_info.value.message


@pytest.mark.asyncio
async def test_gemini_zero_retries_on_timeout():
    cfg = Settings(
        LLM_PROVIDER="gemini",
        GEMINI_API_KEY="test-gemini-key",
        LLM_MODEL="gemini-2.5-flash",
        LLM_TIMEOUT_S=0.1,
    )
    provider = GeminiProvider(cfg)

    async with respx.mock(assert_all_called=True) as respx_mock:
        route = respx_mock.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{cfg.LLM_MODEL}:generateContent?key={cfg.GEMINI_API_KEY}"
        ).mock(side_effect=httpx.TimeoutException("Read timed out"))

        async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(retries=0)) as client:
            with pytest.raises(LLMProviderError) as exc_info:
                await provider.generate_decision(
                    system_prompt="sys",
                    user_prompt="usr",
                    client=client,
                )

        assert route.call_count == 1  # STRICTLY 1 CALL, NO RETRIES!
        assert exc_info.value.status_code == 504


@pytest.mark.asyncio
async def test_openai_single_request_success():
    cfg = Settings(
        LLM_PROVIDER="openai",
        OPENAI_API_KEY="test-openai-key",
        LLM_MODEL="gpt-4o-mini",
    )
    provider = OpenAIProvider(cfg)

    openai_resp_payload = {
        "choices": [
            {
                "message": {
                    "content": json.dumps(
                        {
                            "decisions": [
                                {"id": 10, "action": "BRAKE", "intensity": 0.75}
                            ]
                        }
                    )
                }
            }
        ]
    }

    async with respx.mock(assert_all_called=True) as respx_mock:
        route = respx_mock.post("https://api.openai.com/v1/chat/completions").respond(
            status_code=200, json=openai_resp_payload
        )

        async with httpx.AsyncClient(transport=httpx.AsyncHTTPTransport(retries=0)) as client:
            result, latency = await provider.generate_decision(
                system_prompt="sys",
                user_prompt="usr",
                client=client,
            )

        assert route.call_count == 1  # EXACTLY ONE CALL
        assert result["decisions"][0]["id"] == 10
        assert latency > 0
