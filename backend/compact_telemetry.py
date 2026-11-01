"""
GRID LOCK — Compact Positional Telemetry Serialization

Serializes validated VehicleTelemetryReport objects into a minimal positional array format:
{
  "tick": 125,
  "cars": [
    [id, frontDistance, frontRelativeVelocity, rearDistance, rearRelativeVelocity, leftDistance, rightDistance, signalState, signalDistance],
    ...
  ]
}

Signal encoding:
  0 = RED
  1 = YELLOW
  2 = GREEN
  null = No signal reading (e.g. inside/past intersection)

Values are rounded to 2 decimal places to prevent floating-point text bloat.
Preserves 100% of permitted sensor channels without semantic loss.
"""

from typing import Any, Dict, List, Optional
from backend.telemetry_schema import VehicleTelemetryReport

SIGNAL_STATE_TO_INT: Dict[str, int] = {
    "RED": 0,
    "YELLOW": 1,
    "GREEN": 2,
}

INT_TO_SIGNAL_STATE: Dict[int, str] = {
    0: "RED",
    1: "YELLOW",
    2: "GREEN",
}


def _round_val(val: Optional[float]) -> Optional[float]:
    if val is None:
        return None
    return round(float(val), 2)


def report_to_compact_row(report: VehicleTelemetryReport) -> List[Any]:
    """
    Converts a VehicleTelemetryReport into a 9-element positional array:
    [id, frontDist, frontRelVel, rearDist, rearRelVel, leftDist, rightDist, signalState, signalDist]
    """
    front_dist = _round_val(report.front.distance) if report.front else None
    front_rel_vel = _round_val(report.front.relativeVelocity) if report.front else None

    rear_dist = _round_val(report.rear.distance) if report.rear else None
    rear_rel_vel = _round_val(report.rear.relativeVelocity) if report.rear else None

    left_dist = _round_val(report.side.left) if report.side else None
    right_dist = _round_val(report.side.right) if report.side else None

    if report.signal and report.signal.state in SIGNAL_STATE_TO_INT:
        signal_state = SIGNAL_STATE_TO_INT[report.signal.state]
        signal_dist = _round_val(report.signal.distanceToStopLine)
    else:
        signal_state = None
        signal_dist = None

    return [
        report.id,
        front_dist,
        front_rel_vel,
        rear_dist,
        rear_rel_vel,
        left_dist,
        right_dist,
        signal_state,
        signal_dist,
    ]


def serialize_compact_telemetry_batch(
    tick_id: int, reports: List[VehicleTelemetryReport]
) -> Dict[str, Any]:
    """
    Compiles a batch of vehicle telemetry reports into a compact payload.
    """
    return {
        "tick": tick_id,
        "cars": [report_to_compact_row(r) for r in reports],
    }
