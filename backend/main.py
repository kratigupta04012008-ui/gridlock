"""
GRID LOCK — FastAPI Decision Server

Hosts REST endpoints for Phase 4 LLM-driven traffic control:
- POST /api/decide: Single batch LLM decision request per tick
- POST /api/decide/preview: Compiles prompts without calling provider (0 provider calls)
- GET /api/llm/config: LLM configuration status and masked keys
- GET /api/llm/ledger: Invariant verification and latency statistics
- GET /health: Healthcheck endpoint
"""

from typing import Any, Dict, List
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.config import settings
from backend.services.call_ledger import ledger
from backend.services.decision_service import (
    DecisionServiceError,
    decision_service,
)
from backend.services.prompt_builder import prompt_builder
from backend.telemetry_schema import validate_telemetry_batch

app = FastAPI(
    title="Grid Lock Decision Server",
    description="LLM-driven batch traffic decision service with strict local telemetry.",
    version="1.0.0",
)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class DecideRequest(BaseModel):
    tickId: int = Field(ge=0, description="Strictly unique simulation tick counter")
    telemetry: List[Dict[str, Any]] = Field(
        description="Array of validated Phase 3 vehicle telemetry reports"
    )


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "service": "grid-lock-backend"}


@app.post("/api/sim/reset")
def reset_simulation() -> Dict[str, str]:
    """Resets server-side consumed tick IDs and ledger for a fresh run."""
    decision_service.reset_state()
    return {"status": "reset", "message": "Simulation state reset successfully"}


@app.get("/api/llm/config")
def get_config() -> Dict[str, Any]:
    """Returns safe provider config (never leaking unmasked API keys)."""
    return {
        "provider": settings.LLM_PROVIDER,
        "model": settings.LLM_MODEL,
        "isConfigured": settings.is_configured,
        "maskedKey": settings.masked_key,
        "timeoutSeconds": settings.LLM_TIMEOUT_S,
        "maxTokens": settings.LLM_MAX_TOKENS,
        "temperature": settings.LLM_TEMPERATURE,
        "maxVehiclesPerBatch": settings.MAX_VEHICLES_PER_BATCH,
    }


@app.get("/api/llm/ledger")
def get_ledger() -> Dict[str, Any]:
    """Returns provider call ledger metrics and invariant audits."""
    return ledger.get_summary()


@app.post("/api/decide/preview")
def preview_decision_prompt(req: DecideRequest) -> Dict[str, Any]:
    """
    Validates telemetry and returns the compiled prompt without invoking any LLM provider.
    Verifiably makes 0 provider requests.
    """
    try:
        reports = validate_telemetry_batch(req.telemetry)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Telemetry validation failed: {exc}",
        ) from exc

    compiled = prompt_builder.compile(reports)
    return {
        "tickId": req.tickId,
        "systemPrompt": compiled["system_prompt"],
        "userPrompt": compiled["user_prompt"],
        "vehicleCount": compiled["vehicle_count"],
    }


@app.post("/api/decide")
async def decide(req: DecideRequest) -> Dict[str, Any]:
    """
    Executes a single batch decision for all active vehicles.
    Enforces concurrency limit = 1 and strict 1-provider-call-per-tick invariant.
    """
    try:
        result = await decision_service.decide_batch(
            tick_id=req.tickId,
            telemetry_raw=req.telemetry,
        )
        return result
    except DecisionServiceError as err:
        raise HTTPException(
            status_code=err.status_code,
            detail=err.message,
        ) from err
