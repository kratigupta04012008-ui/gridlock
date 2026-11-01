"""
GRID LOCK — Pytest Suite for Backend Telemetry Schema

Verifies:
- All golden valid fixtures accept
- All golden invalid fixtures reject
- Pinned field list strictly prohibits unexpected keys
- Extra fields at every level trigger ValidationError
"""

import json
import os
from pathlib import Path
import pytest
from pydantic import ValidationError

from telemetry_schema import (
    VehicleTelemetryReport,
    validate_telemetry_batch,
    validate_telemetry_report,
)

FIXTURES_DIR = Path(__file__).resolve().parent.parent / "contracts" / "fixtures"
VALID_DIR = FIXTURES_DIR / "valid"
INVALID_DIR = FIXTURES_DIR / "invalid"


def test_valid_fixtures():
    """All golden valid fixtures must successfully validate."""
    valid_files = list(VALID_DIR.glob("*.json"))
    assert len(valid_files) > 0, "No valid fixtures found"

    for file_path in valid_files:
        with open(file_path, "r", encoding="utf-8") as fp:
            data = json.load(fp)
        validated = validate_telemetry_batch(data)
        assert isinstance(validated, list)
        assert len(validated) == len(data)


def test_invalid_fixtures():
    """All golden invalid fixtures must be rejected with ValidationError."""
    invalid_files = list(INVALID_DIR.glob("*.json"))
    assert len(invalid_files) > 0, "No invalid fixtures found"

    for file_path in invalid_files:
        with open(file_path, "r", encoding="utf-8") as fp:
            data = json.load(fp)
        with pytest.raises(ValidationError):
            validate_telemetry_batch(data)


def test_pinned_field_set():
    """Assert the exact permitted top-level fields on VehicleTelemetryReport."""
    permitted_fields = {"id", "front", "rear", "side", "signal"}
    model_fields = set(VehicleTelemetryReport.model_fields.keys())
    assert (
        model_fields == permitted_fields
    ), f"Schema field mismatch! Expected {permitted_fields}, got {model_fields}"


@pytest.mark.parametrize(
    "forbidden_key",
    [
        "speed",
        "velocity",
        "acceleration",
        "x",
        "y",
        "position",
        "heading",
        "lane",
        "laneId",
        "route",
        "movement",
        "approach",
        "occupancy",
        "timestamp",
        "width",
        "length",
    ],
)
def test_explicit_forbidden_keys(forbidden_key):
    """Explicitly test forbidden keys at top level."""
    payload = {
        "id": 1,
        "front": None,
        "rear": None,
        "side": {"left": None, "right": None},
        "signal": None,
        forbidden_key: 123,
    }
    with pytest.raises(ValidationError):
        validate_telemetry_report(payload)


def test_reject_speed_everywhere():
    """Confirms Phase 1 own-speed field is strictly removed and rejected."""
    payload = {
        "id": 1,
        "speed": 10.0,
        "front": None,
        "rear": None,
        "side": {"left": None, "right": None},
        "signal": None,
    }
    with pytest.raises(ValidationError):
        validate_telemetry_report(payload)
