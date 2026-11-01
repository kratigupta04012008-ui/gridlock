"""
Tests for Compact Action Response Parsing and Validation
"""

import pytest
from pydantic import ValidationError
from backend.decision_schema import (
    AccelerateDecision,
    BrakeDecision,
    MaintainDecision,
    validate_decision_id_set,
    validate_decision_response,
)


def test_valid_compact_actions():
    raw = {
        "actions": [
            [0, "BRAKE", 0.75],
            [1, "MAINTAIN", 0],
            [2, "ACCELERATE", 0.4],
        ]
    }
    resp = validate_decision_response(raw)
    assert len(resp.decisions) == 3

    d0 = resp.decisions[0]
    assert isinstance(d0, BrakeDecision)
    assert d0.id == 0
    assert d0.action == "BRAKE"
    assert d0.intensity == 0.75

    d1 = resp.decisions[1]
    assert isinstance(d1, MaintainDecision)
    assert d1.id == 1
    assert d1.action == "MAINTAIN"

    d2 = resp.decisions[2]
    assert isinstance(d2, AccelerateDecision)
    assert d2.id == 2
    assert d2.action == "ACCELERATE"
    assert d2.throttle == 0.4


def test_compact_actions_maintain_non_zero_fails():
    raw = {
        "actions": [
            [0, "MAINTAIN", 0.5],  # MAINTAIN must have intensity 0
        ]
    }
    with pytest.raises(ValueError, match="Intensity for MAINTAIN action"):
        validate_decision_response(raw)


def test_compact_actions_intensity_out_of_bounds():
    raw = {
        "actions": [
            [0, "ACCELERATE", 1.5],  # > 1.0
        ]
    }
    with pytest.raises(ValueError, match="out of bounds"):
        validate_decision_response(raw)

    raw_neg = {
        "actions": [
            [0, "BRAKE", -0.1],  # < 0.0
        ]
    }
    with pytest.raises(ValueError, match="out of bounds"):
        validate_decision_response(raw_neg)


def test_compact_actions_invalid_tuple_length():
    raw = {
        "actions": [
            [0, "BRAKE"],  # only 2 elements
        ]
    }
    with pytest.raises(ValueError, match="3-element list"):
        validate_decision_response(raw)


def test_compact_actions_id_reconciliation():
    raw = {
        "actions": [
            [0, "BRAKE", 0.5],
            [1, "MAINTAIN", 0],
        ]
    }
    resp = validate_decision_response(raw)

    # Exact match
    ok, err = validate_decision_id_set(resp.decisions, {0, 1})
    assert ok is True
    assert err is None

    # Missing vehicle 2
    ok_miss, err_miss = validate_decision_id_set(resp.decisions, {0, 1, 2})
    assert ok_miss is False
    assert "Missing decisions for vehicles: [2]" in err_miss

    # Extra vehicle 1
    ok_extra, err_extra = validate_decision_id_set(resp.decisions, {0})
    assert ok_extra is False
    assert "Extra decisions for unknown vehicles: [1]" in err_extra
