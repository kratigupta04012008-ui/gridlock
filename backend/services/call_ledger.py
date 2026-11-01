"""
GRID LOCK — Call Ledger Service

Thread-safe in-memory ledger tracking provider requests, latency metrics,
validation rejections, token usage, and ring buffer of tick decisions.
Strictly verifies that no tick ever triggers more than 1 provider call.
"""

from collections import deque
import threading
import time
from typing import Any, Dict, List, Optional


class CallLedger:
    def __init__(self, max_records: int = 200):
        self._lock = threading.Lock()
        self.max_records = max_records

        # Atomic counters
        self.provider_requests_attempted = 0
        self.provider_requests_succeeded = 0
        self.provider_requests_failed = 0
        self.rejected_before_provider = 0
        self.rate_limit_count = 0
        self.timeout_count = 0

        # Last call stats
        self.last_batch_size = 0
        self.last_provider_latency_ms: Optional[float] = None
        self.last_round_trip_latency_ms: Optional[float] = None
        self.last_input_tokens: Optional[int] = None
        self.last_output_tokens: Optional[int] = None

        # Latency & token histories for rolling stats
        self._provider_latencies: deque = deque(maxlen=max_records)
        self._round_trip_latencies: deque = deque(maxlen=max_records)
        self._input_tokens: deque = deque(maxlen=max_records)
        self._output_tokens: deque = deque(maxlen=max_records)

        # Ring buffer of recent tick audit records
        self._records: deque = deque(maxlen=max_records)

        # Map of tickId -> provider call count (must strictly be <= 1)
        self._provider_calls_by_tick: Dict[int, int] = {}

    def record_rejected_before_provider(
        self,
        tick_id: int,
        vehicle_ids: List[int],
        reason: str,
        round_trip_ms: float,
        status_code: int = 400,
    ) -> None:
        """Records a request rejected before any provider call (e.g. invalid schema, duplicate tick)."""
        with self._lock:
            self.rejected_before_provider += 1
            self.last_batch_size = len(vehicle_ids)
            self.last_round_trip_latency_ms = round_trip_ms

            record = {
                "tickId": tick_id,
                "timestamp": time.time(),
                "batchSize": len(vehicle_ids),
                "vehicleIds": vehicle_ids,
                "providerCalled": False,
                "providerLatencyMs": None,
                "roundTripLatencyMs": round_trip_ms,
                "inputTokens": 0,
                "outputTokens": 0,
                "success": False,
                "error": reason,
                "statusCode": status_code,
            }
            self._records.append(record)

    def record_provider_attempt(self, tick_id: int) -> None:
        """Records that a provider call is being attempted for tick_id."""
        with self._lock:
            self.provider_requests_attempted += 1
            current = self._provider_calls_by_tick.get(tick_id, 0)
            self._provider_calls_by_tick[tick_id] = current + 1

    def record_success(
        self,
        tick_id: int,
        vehicle_ids: List[int],
        provider_latency_ms: float,
        round_trip_ms: float,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> None:
        """Records a successful LLM provider call and verified response."""
        with self._lock:
            self.provider_requests_succeeded += 1
            self.last_batch_size = len(vehicle_ids)
            self.last_provider_latency_ms = provider_latency_ms
            self.last_round_trip_latency_ms = round_trip_ms
            self.last_input_tokens = input_tokens
            self.last_output_tokens = output_tokens

            self._provider_latencies.append(provider_latency_ms)
            self._round_trip_latencies.append(round_trip_ms)
            if input_tokens > 0:
                self._input_tokens.append(input_tokens)
            if output_tokens > 0:
                self._output_tokens.append(output_tokens)

            record = {
                "tickId": tick_id,
                "timestamp": time.time(),
                "batchSize": len(vehicle_ids),
                "vehicleIds": vehicle_ids,
                "providerCalled": True,
                "providerLatencyMs": provider_latency_ms,
                "roundTripLatencyMs": round_trip_ms,
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "success": True,
                "error": None,
                "statusCode": 200,
            }
            self._records.append(record)

    def record_provider_failure(
        self,
        tick_id: int,
        vehicle_ids: List[int],
        error: str,
        provider_latency_ms: Optional[float],
        round_trip_ms: float,
        status_code: int = 502,
        input_tokens: int = 0,
        output_tokens: int = 0,
    ) -> None:
        """Records a provider failure (timeout, bad status, malformed response, or ID mismatch)."""
        with self._lock:
            self.provider_requests_failed += 1
            self.last_batch_size = len(vehicle_ids)
            self.last_provider_latency_ms = provider_latency_ms
            self.last_round_trip_latency_ms = round_trip_ms
            self.last_input_tokens = input_tokens
            self.last_output_tokens = output_tokens

            if status_code == 429:
                self.rate_limit_count += 1
            elif status_code == 504:
                self.timeout_count += 1

            if provider_latency_ms is not None:
                self._provider_latencies.append(provider_latency_ms)
            self._round_trip_latencies.append(round_trip_ms)

            record = {
                "tickId": tick_id,
                "timestamp": time.time(),
                "batchSize": len(vehicle_ids),
                "vehicleIds": vehicle_ids,
                "providerCalled": True,
                "providerLatencyMs": provider_latency_ms,
                "roundTripLatencyMs": round_trip_ms,
                "inputTokens": input_tokens,
                "outputTokens": output_tokens,
                "success": False,
                "error": error,
                "statusCode": status_code,
            }
            self._records.append(record)

    def get_summary(self) -> Dict[str, Any]:
        """Calculates current ledger summary and audits invariants."""
        with self._lock:
            p_lats = sorted(list(self._provider_latencies))
            rt_lats = sorted(list(self._round_trip_latencies))
            in_toks = list(self._input_tokens)
            out_toks = list(self._output_tokens)

            def p95(data: List[float]) -> Optional[float]:
                if not data:
                    return None
                idx = int(0.95 * len(data))
                return round(data[min(idx, len(data) - 1)], 1)

            def avg(data: List[float]) -> Optional[float]:
                if not data:
                    return None
                return round(sum(data) / len(data), 1)

            max_calls_for_any_tick = (
                max(self._provider_calls_by_tick.values())
                if self._provider_calls_by_tick
                else 0
            )

            max_lat = max(p_lats) if p_lats else None

            return {
                "providerRequestsAttempted": self.provider_requests_attempted,
                "providerRequestsSucceeded": self.provider_requests_succeeded,
                "providerRequestsFailed": self.provider_requests_failed,
                "rejectedBeforeProvider": self.rejected_before_provider,
                "rateLimitCount": self.rate_limit_count,
                "timeoutCount": self.timeout_count,
                "lastBatchSize": self.last_batch_size,
                "lastProviderLatencyMs": (
                    round(self.last_provider_latency_ms, 1)
                    if self.last_provider_latency_ms is not None
                    else None
                ),
                "lastRoundTripLatencyMs": (
                    round(self.last_round_trip_latency_ms, 1)
                    if self.last_round_trip_latency_ms is not None
                    else None
                ),
                "avgProviderLatencyMs": avg(p_lats),
                "maxProviderLatencyMs": round(max_lat, 1) if max_lat is not None else None,
                "p95ProviderLatencyMs": p95(p_lats),
                "avgRoundTripLatencyMs": avg(rt_lats),
                "p95RoundTripLatencyMs": p95(rt_lats),
                "latestInputTokens": self.last_input_tokens,
                "latestOutputTokens": self.last_output_tokens,
                "avgInputTokens": round(sum(in_toks) / len(in_toks), 1) if in_toks else None,
                "avgOutputTokens": round(sum(out_toks) / len(out_toks), 1) if out_toks else None,
                "invariant_maxProviderRequestsPerTick": max_calls_for_any_tick,
                "invariant_singleCallPerTickSatisfied": max_calls_for_any_tick <= 1,
                "recentRecords": list(self._records)[-20:],
            }

    def clear(self) -> None:
        """Reset ledger (used in test setup & reset)."""
        with self._lock:
            self.provider_requests_attempted = 0
            self.provider_requests_succeeded = 0
            self.provider_requests_failed = 0
            self.rejected_before_provider = 0
            self.rate_limit_count = 0
            self.timeout_count = 0
            self.last_batch_size = 0
            self.last_provider_latency_ms = None
            self.last_round_trip_latency_ms = None
            self.last_input_tokens = None
            self.last_output_tokens = None
            self._provider_latencies.clear()
            self._round_trip_latencies.clear()
            self._input_tokens.clear()
            self._output_tokens.clear()
            self._records.clear()
            self._provider_calls_by_tick.clear()


# Global ledger singleton
ledger = CallLedger()
