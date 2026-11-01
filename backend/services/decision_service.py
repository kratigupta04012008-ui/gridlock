"""
GRID LOCK — Batch Decision Service Orchestrator

Coordinates batch decisions for all active vehicles per simulation tick.
Guarantees:
- Concurrency limit = 1 (single in-flight decision tick at any time).
- Exactly ONE provider call per tick (maxProviderRequestsPerTick <= 1).
- Non-reusable tick IDs.
- Validates input telemetry and output decisions strictly against schemas.
- Reconciles decision IDs with active vehicles.
- Tracks input/output token usage and provider latency in CallLedger.
"""

import asyncio
import time
from typing import Any, Dict, List, Optional, Set
import httpx
from pydantic import ValidationError

from backend.config import Settings, settings
from backend.decision_schema import (
    BatchDecisionResponse,
    validate_decision_id_set,
    validate_decision_response,
)
from backend.services.call_ledger import CallLedger, ledger
from backend.services.llm.provider import (
    BaseLLMProvider,
    LLMProviderError,
    get_llm_provider,
)
from backend.services.prompt_builder import PromptBuilder, prompt_builder
from backend.telemetry_schema import VehicleTelemetryReport, validate_telemetry_batch


class DecisionServiceError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int = 500,
        details: Optional[Any] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details


class DecisionService:
    def __init__(
        self,
        cfg: Settings = settings,
        provider: Optional[BaseLLMProvider] = None,
        prompt_bld: Optional[PromptBuilder] = None,
        call_ledger: Optional[CallLedger] = None,
    ):
        self.cfg = cfg
        self.provider = provider or get_llm_provider(cfg)
        self.prompt_builder = prompt_bld or prompt_builder
        self.ledger = call_ledger or ledger
        self._lock = asyncio.Lock()
        self._consumed_tick_ids: Set[int] = set()

    def reset_state(self) -> None:
        """Resets consumed tick IDs and audit ledger for fresh simulation runs."""
        self._consumed_tick_ids.clear()
        self.ledger.clear()

    async def decide_batch(
        self,
        tick_id: int,
        telemetry_raw: List[Dict[str, Any]],
        client: Optional[httpx.AsyncClient] = None,
    ) -> Dict[str, Any]:
        """
        Executes single batch decision request for all active vehicles on tick_id.
        Single flight concurrency lock guarantees no simultaneous requests.
        """
        if self._lock.locked():
            raise DecisionServiceError(
                message="Decision service is busy. Concurrency limit is 1.",
                status_code=429,
            )

        async with self._lock:
            t0 = time.perf_counter()

            # 1. Enforce Non-Reusable Monotonic Tick ID
            if tick_id in self._consumed_tick_ids:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                self.ledger.record_rejected_before_provider(
                    tick_id=tick_id,
                    vehicle_ids=[],
                    reason=f"Tick ID {tick_id} has already been processed and cannot be reused.",
                    round_trip_ms=round_trip_ms,
                    status_code=409,
                )
                raise DecisionServiceError(
                    message=f"Tick ID {tick_id} has already been processed and cannot be reused.",
                    status_code=409,
                )

            # 2. Validate Telemetry Payload
            try:
                reports: List[VehicleTelemetryReport] = validate_telemetry_batch(telemetry_raw)
            except ValidationError as exc:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                self.ledger.record_rejected_before_provider(
                    tick_id=tick_id,
                    vehicle_ids=[],
                    reason=f"Invalid telemetry payload: {exc}",
                    round_trip_ms=round_trip_ms,
                    status_code=400,
                )
                raise DecisionServiceError(
                    message="Telemetry batch failed schema validation",
                    status_code=400,
                    details=exc.errors(),
                ) from exc

            if not reports:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                self.ledger.record_rejected_before_provider(
                    tick_id=tick_id,
                    vehicle_ids=[],
                    reason="Telemetry batch is empty",
                    round_trip_ms=round_trip_ms,
                    status_code=400,
                )
                raise DecisionServiceError(
                    message="Telemetry batch cannot be empty",
                    status_code=400,
                )

            if len(reports) > self.cfg.MAX_VEHICLES_PER_BATCH:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                self.ledger.record_rejected_before_provider(
                    tick_id=tick_id,
                    vehicle_ids=[r.id for r in reports],
                    reason=f"Batch size {len(reports)} exceeds maximum limit {self.cfg.MAX_VEHICLES_PER_BATCH}",
                    round_trip_ms=round_trip_ms,
                    status_code=400,
                )
                raise DecisionServiceError(
                    message=f"Batch size exceeds maximum limit of {self.cfg.MAX_VEHICLES_PER_BATCH}",
                    status_code=400,
                )

            vehicle_ids = [r.id for r in reports]
            expected_ids = set(vehicle_ids)

            # 3. Check Provider Configuration
            if not self.cfg.is_configured:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                self.ledger.record_rejected_before_provider(
                    tick_id=tick_id,
                    vehicle_ids=vehicle_ids,
                    reason=f"LLM Provider '{self.cfg.LLM_PROVIDER}' is not configured (missing API key)",
                    round_trip_ms=round_trip_ms,
                    status_code=503,
                )
                raise DecisionServiceError(
                    message=f"LLM Provider '{self.cfg.LLM_PROVIDER}' is not configured. Set API key in backend environment.",
                    status_code=503,
                )

            # 4. Compile Prompts (using compact serialization)
            compiled = self.prompt_builder.compile(reports, tick_id=tick_id)
            system_prompt = compiled["system_prompt"]
            user_prompt = compiled["user_prompt"]

            # 5. Record Provider Attempt in Ledger
            self.ledger.record_provider_attempt(tick_id=tick_id)

            # 6. Call Provider (Exactly ONE call)
            input_tokens = 0
            output_tokens = 0
            try:
                res = await self.provider.generate_decision(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    client=client,
                )
                raw_decision_dict = res[0]
                provider_latency_ms = res[1]
                input_tokens = getattr(res, "input_tokens", 0)
                output_tokens = getattr(res, "output_tokens", 0)
            except LLMProviderError as exc:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                self.ledger.record_provider_failure(
                    tick_id=tick_id,
                    vehicle_ids=vehicle_ids,
                    error=exc.message,
                    provider_latency_ms=None,
                    round_trip_ms=round_trip_ms,
                    status_code=exc.status_code,
                    input_tokens=0,
                    output_tokens=0,
                )
                raise DecisionServiceError(
                    message=f"Provider failed: {exc.message}",
                    status_code=exc.status_code,
                    details=exc.raw_response,
                ) from exc

            # 7. Validate Decision Schema (supports compact actions & classic decisions)
            try:
                verified_response: BatchDecisionResponse = validate_decision_response(raw_decision_dict)
            except (ValidationError, ValueError) as exc:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                err_msg = f"LLM output violated decision schema: {exc}"
                self.ledger.record_provider_failure(
                    tick_id=tick_id,
                    vehicle_ids=vehicle_ids,
                    error=err_msg,
                    provider_latency_ms=provider_latency_ms,
                    round_trip_ms=round_trip_ms,
                    status_code=502,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
                raise DecisionServiceError(
                    message="LLM output did not conform to decision JSON schema",
                    status_code=502,
                    details=str(exc),
                ) from exc

            # 8. Reconcile Decision IDs Against Expected Active Vehicles
            is_valid_ids, mismatch_reason = validate_decision_id_set(
                verified_response.decisions, expected_ids
            )
            if not is_valid_ids:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                err_msg = f"LLM decision ID mismatch: {mismatch_reason}"
                self.ledger.record_provider_failure(
                    tick_id=tick_id,
                    vehicle_ids=vehicle_ids,
                    error=err_msg,
                    provider_latency_ms=provider_latency_ms,
                    round_trip_ms=round_trip_ms,
                    status_code=502,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
                raise DecisionServiceError(
                    message=f"LLM decision IDs do not match active vehicles: {mismatch_reason}",
                    status_code=502,
                )

            # 9. Mark Success & Consume Tick
            round_trip_ms = (time.perf_counter() - t0) * 1000.0
            self._consumed_tick_ids.add(tick_id)
            self.ledger.record_success(
                tick_id=tick_id,
                vehicle_ids=vehicle_ids,
                provider_latency_ms=provider_latency_ms,
                round_trip_ms=round_trip_ms,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )

            return {
                "tickId": tick_id,
                "batchSize": len(verified_response.decisions),
                "decisions": [d.model_dump() for d in verified_response.decisions],
                "providerLatencyMs": round(provider_latency_ms, 1),
                "roundTripLatencyMs": round(round_trip_ms, 1),
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
            }


# Global singleton
decision_service = DecisionService()
