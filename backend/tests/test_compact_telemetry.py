"""
Tests for Compact Positional Telemetry Serialization
"""

import json
from pathlib import Path
import pytest
from backend.compact_telemetry import (
    SIGNAL_STATE_TO_INT,
    report_to_compact_row,
    serialize_compact_telemetry_batch,
)
from backend.telemetry_schema import VehicleTelemetryReport, validate_telemetry_batch

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "contracts" / "fixtures" / "valid"


def test_compact_row_field_order_and_encoding():
    report_data = {
        "id": 5,
        "front": {"distance": 12.3456, "relativeVelocity": -2.109},
        "rear": {"distance": 8.0, "relativeVelocity": 0.55},
        "side": {"left": 1.75, "right": None},
        "signal": {"state": "GREEN", "distanceToStopLine": 23.498},
    }
    report = VehicleTelemetryReport.model_validate(report_data)
    row = report_to_compact_row(report)

    # Must have exact length 9
    assert len(row) == 9
    # [id, frontDist, frontRelVel, rearDist, rearRelVel, leftDist, rightDist, signalState, signalDist]
    assert row[0] == 5
    assert row[1] == 12.35  # rounded to 2 decimals
    assert row[2] == -2.11
    assert row[3] == 8.0
    assert row[4] == 0.55
    assert row[5] == 1.75
    assert row[6] is None
    assert row[7] == 2  # GREEN = 2
    assert row[8] == 23.50


def test_compact_row_nulls_and_all_signals():
    # Test RED
    r_red = VehicleTelemetryReport.model_validate(
        {"id": 1, "front": None, "rear": None, "side": {"left": None, "right": None}, "signal": {"state": "RED", "distanceToStopLine": 10.0}}
    )
    row_red = report_to_compact_row(r_red)
    assert row_red[7] == 0  # RED = 0
    assert row_red[8] == 10.0

    # Test YELLOW
    r_yellow = VehicleTelemetryReport.model_validate(
        {"id": 2, "front": None, "rear": None, "side": {"left": None, "right": None}, "signal": {"state": "YELLOW", "distanceToStopLine": 5.0}}
    )
    row_yellow = report_to_compact_row(r_yellow)
    assert row_yellow[7] == 1  # YELLOW = 1

    # Test null signal (inside/past intersection)
    r_none = VehicleTelemetryReport.model_validate(
        {"id": 3, "front": None, "rear": None, "side": {"left": None, "right": None}, "signal": None}
    )
    row_none = report_to_compact_row(r_none)
    assert row_none[7] is None
    assert row_none[8] is None


def test_compact_batch_size_reduction():
    # Load 20 simulated vehicles
    sample_file = FIXTURES_DIR / "full_active.json"
    with open(sample_file, "r", encoding="utf-8") as f:
        data = json.load(f)[0]

    batch = []
    for i in range(20):
        item = json.loads(json.dumps(data))
        item["id"] = i
        batch.append(item)

    reports = validate_telemetry_batch(batch)

    # Original indented JSON size
    orig_json = json.dumps([r.model_dump() for r in reports], indent=2)
    orig_bytes = len(orig_json.encode("utf-8"))

    # Compact payload size
    compact_payload = serialize_compact_telemetry_batch(tick_id=100, reports=reports)
    compact_json = json.dumps(compact_payload, separators=(",", ":"))
    compact_bytes = len(compact_json.encode("utf-8"))

    # Assert > 75% byte reduction
    reduction = (orig_bytes - compact_bytes) / orig_bytes
    assert reduction > 0.75, f"Expected >75% reduction, got {reduction * 100:.1f}%"
    print(f"Original: {orig_bytes} bytes -> Compact: {compact_bytes} bytes ({reduction * 100:.1f}% savings)")
