"""
GRID LOCK — Tests for Decision Schema & ID Reconciliation
"""

import json
from pathlib import Path
import pytest
from pydantic import ValidationError

from backend.decision_schema import (
    validate_decision_id_set,
    validate_decision_response,
)

FIXTURES_DIR = (
    Path(__file__).resolve().parent.parent.parent
    / "contracts"
    / "fixtures"
    / "decisions"
)


def load_fixture(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_valid_fixtures():
    valid_dir = FIXTURES_DIR / "valid"
    assert valid_dir.exists(), f"Missing {valid_dir}"

    fixture_files = list(valid_dir.glob("*.json"))
    assert len(fixture_files) >= 3

    for fpath in fixture_files:
        data = load_fixture(fpath)
        resp = validate_decision_response(data)
        assert len(resp.decisions) > 0


def test_invalid_fixtures():
    invalid_dir = FIXTURES_DIR / "invalid"
    assert invalid_dir.exists(), f"Missing {invalid_dir}"

    fixture_files = list(invalid_dir.glob("*.json"))
    assert len(fixture_files) >= 8

    for fpath in fixture_files:
        data = load_fixture(fpath)
        with pytest.raises(ValidationError):
            validate_decision_response(data)


def test_id_set_validation_exact_match():
    data = {
        "decisions": [
            {"id": 1, "action": "ACCELERATE", "throttle": 0.5},
            {"id": 2, "action": "BRAKE", "intensity": 0.8},
            {"id": 3, "action": "MAINTAIN"},
        ]
    }
    resp = validate_decision_response(data)
    ok, err = validate_decision_id_set(resp.decisions, {1, 2, 3})
    assert ok is True
    assert err is None


def test_id_set_validation_missing_id():
    data = {
        "decisions": [
            {"id": 1, "action": "ACCELERATE", "throttle": 0.5},
            {"id": 2, "action": "BRAKE", "intensity": 0.8},
        ]
    }
    resp = validate_decision_response(data)
    ok, err = validate_decision_id_set(resp.decisions, {1, 2, 3})
    assert ok is False
    assert "Missing decisions for vehicles: [3]" in err


def test_id_set_validation_extra_id():
    data = {
        "decisions": [
            {"id": 1, "action": "ACCELERATE", "throttle": 0.5},
            {"id": 2, "action": "BRAKE", "intensity": 0.8},
            {"id": 4, "action": "MAINTAIN"},
        ]
    }
    resp = validate_decision_response(data)
    ok, err = validate_decision_id_set(resp.decisions, {1, 2})
    assert ok is False
    assert "Extra decisions for unknown vehicles: [4]" in err


def test_id_set_validation_duplicate_id():
    data = {
        "decisions": [
            {"id": 1, "action": "ACCELERATE", "throttle": 0.5},
            {"id": 1, "action": "BRAKE", "intensity": 0.8},
        ]
    }
    resp = validate_decision_response(data)
    ok, err = validate_decision_id_set(resp.decisions, {1})
    assert ok is False
    assert "Duplicate decision IDs found: [1]" in err
