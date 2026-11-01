"""
GRID LOCK — Decision Service Orchestrator

Coordinates telemetry validation, concurrency locks, tick uniqueness,
prompt building, LLM provider invocation, response validation, ID reconciliation,
and ledger auditing.
"""

import asyncio
import time
from typing import Any, Dict, List, Optional, Set
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
    def __init__(self, message: str, status_code: int = 400, details: Any = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.details = details


class DecisionService:
    def __init__(
        self,
        cfg: Settings = settings,
        ledger_instance: CallLedger = ledger,
        prompt_bld: PromptBuilder = prompt_builder,
        provider_instance: Optional[BaseLLMProvider] = None,
    ):
        self.cfg = cfg
        self.ledger = ledger_instance
        self.prompt_builder = prompt_bld
        self._provider = provider_instance
        self._in_flight_lock = asyncio.Lock()
        self._consumed_tick_ids: Set[int] = set()

    @property
    def provider(self) -> BaseLLMProvider:
        if self._provider is None:
            self._provider = get_llm_provider(self.cfg)
        return self._provider

    def reset_state(self) -> None:
        """Resets consumed tick IDs and ledger (for testing)."""
        self._consumed_tick_ids.clear()
        self.ledger.clear()

    async def decide_batch(
        self,
        tick_id: int,
        telemetry_raw: List[Dict[str, Any]],
        client=None,
    ) -> Dict[str, Any]:
        """
        Executes a single decision batch for a tick.
        Guarantees:
        - At most 1 in-flight request at any time (409 Conflict if locked).
        - Tick IDs are never reused (409 Conflict if already consumed).
        - Exactly ONE provider HTTP request attempted.
        - Strict JSON schema validation and exact ID set match.
        """
        t0 = time.perf_counter()

        # Check concurrency lock non-blocking
        if self._in_flight_lock.locked():
            round_trip_ms = (time.perf_counter() - t0) * 1000.0
            self.ledger.record_rejected_before_provider(
                tick_id=tick_id,
                vehicle_ids=[],
                reason="Another decision request is currently in-flight",
                round_trip_ms=round_trip_ms,
                status_code=409,
            )
            raise DecisionServiceError(
                message="Decision request already in-flight. Concurrency limit is 1.",
                status_code=409,
            )

        async with self._in_flight_lock:
            # 1. Verify tick ID uniqueness
            if tick_id in self._consumed_tick_ids:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                self.ledger.record_rejected_before_provider(
                    tick_id=tick_id,
                    vehicle_ids=[],
                    reason=f"Tick ID {tick_id} has already been consumed",
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

            # 4. Compile Prompts
            compiled = self.prompt_builder.compile(reports)
            system_prompt = compiled["system_prompt"]
            user_prompt = compiled["user_prompt"]

            # 5. Record Provider Attempt in Ledger
            self.ledger.record_provider_attempt(tick_id=tick_id)

            # 6. Call Provider (Exactly ONE call)
            try:
                raw_decision_dict, provider_latency_ms = await self.provider.generate_decision(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    client=client,
                )
            except LLMProviderError as exc:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                self.ledger.record_provider_failure(
                    tick_id=tick_id,
                    vehicle_ids=vehicle_ids,
                    error=exc.message,
                    provider_latency_ms=None,
                    round_trip_ms=round_trip_ms,
                    status_code=exc.status_code,
                )
                raise DecisionServiceError(
                    message=f"Provider failed: {exc.message}",
                    status_code=exc.status_code,
                    details=exc.raw_response,
                ) from exc

            # 7. Validate Decision Schema
            try:
                verified_response: BatchDecisionResponse = validate_decision_response(raw_decision_dict)
            except ValidationError as exc:
                round_trip_ms = (time.perf_counter() - t0) * 1000.0
                err_msg = f"LLM output violated decision schema: {exc}"
                self.ledger.record_provider_failure(
                    tick_id=tick_id,
                    vehicle_ids=vehicle_ids,
                    error=err_msg,
                    provider_latency_ms=provider_latency_ms,
                    round_trip_ms=round_trip_ms,
                    status_code=502,
                )
                raise DecisionServiceError(
                    message="LLM output did not conform to decision JSON schema",
                    status_code=502,
                    details=exc.errors(),
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
            )

            return {
                "tickId": tick_id,
                "batchSize": len(verified_response.decisions),
                "decisions": [d.model_dump() for d in verified_response.decisions],
                "providerLatencyMs": round(provider_latency_ms, 1),
                "roundTripLatencyMs": round(round_trip_ms, 1),
            }


# Global singleton
decision_service = DecisionService()
