"""
GRID LOCK — Tests for FastAPI Endpoints & Decision Service Invariants
"""

import json
from pathlib import Path
from fastapi.testclient import TestClient
import pytest
import respx

from backend.config import settings
from backend.main import app
from backend.services.call_ledger import ledger
from backend.services.decision_service import decision_service

CONTRACTS_DIR = Path(__file__).resolve().parent.parent.parent / "contracts"


@pytest.fixture(autouse=True)
def reset_service_state():
    decision_service.reset_state()
    ledger.clear()
    yield
    decision_service.reset_state()
    ledger.clear()


@pytest.fixture
def sample_telemetry():
    sample_path = CONTRACTS_DIR / "fixtures" / "valid" / "full_active.json"
    with open(sample_path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_health_endpoint():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_preview_makes_zero_provider_calls(sample_telemetry):
    client = TestClient(app)
    req_body = {
        "tickId": 100,
        "telemetry": sample_telemetry,
    }

    initial_attempts = ledger.provider_requests_attempted
    resp = client.post("/api/decide/preview", json=req_body)

    assert resp.status_code == 200
    data = resp.json()
    assert data["tickId"] == 100
    assert "systemPrompt" in data
    assert "userPrompt" in data
    assert data["vehicleCount"] == len(sample_telemetry)

    # STRICT INVARIANT: Preview MUST NOT call provider
    assert ledger.provider_requests_attempted == initial_attempts == 0


def test_config_masks_key():
    client = TestClient(app)
    resp = client.get("/api/llm/config")
    assert resp.status_code == 200
    data = resp.json()

    assert "provider" in data
    assert "model" in data
    assert "maskedKey" in data
    assert "GEMINI_API_KEY" not in data
    assert "OPENAI_API_KEY" not in data
    assert settings.GEMINI_API_KEY not in data.values()


def test_unconfigured_provider_returns_503(sample_telemetry, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", None)
    monkeypatch.setattr(settings, "OPENAI_API_KEY", None)

    client = TestClient(app)
    resp = client.post(
        "/api/decide",
        json={"tickId": 1, "telemetry": sample_telemetry},
    )

    assert resp.status_code == 503
    assert ledger.provider_requests_attempted == 0
    assert ledger.rejected_before_provider == 1


@pytest.mark.asyncio
async def test_duplicate_tick_returns_409(sample_telemetry, monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "dummy-key")

    mock_decisions = [
        {"id": v["id"], "action": "MAINTAIN"} for v in sample_telemetry
    ]
    gemini_resp = {
        "candidates": [
            {
                "content": {
                    "parts": [{"text": json.dumps({"decisions": mock_decisions})}]
                }
            }
        ]
    }

    async with respx.mock(assert_all_called=True) as respx_mock:
        respx_mock.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{settings.LLM_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
        ).respond(status_code=200, json=gemini_resp)

        # First request succeeds
        res1 = await decision_service.decide_batch(
            tick_id=42,
            telemetry_raw=sample_telemetry,
        )
        assert res1["tickId"] == 42
        assert ledger.provider_requests_attempted == 1

        # Second request with SAME tickId must fail with 409 and NOT call provider
        with pytest.raises(Exception) as exc_info:
            await decision_service.decide_batch(
                tick_id=42,
                telemetry_raw=sample_telemetry,
            )

        assert exc_info.value.status_code == 409
        # STRICT INVARIANT: Provider call count stays 1!
        assert ledger.provider_requests_attempted == 1

        summary = ledger.get_summary()
        assert summary["invariant_singleCallPerTickSatisfied"] is True
