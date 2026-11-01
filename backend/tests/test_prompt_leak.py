"""
GRID LOCK — Tests for Prompt Telemetry Leak Prevention
"""

import json
from pathlib import Path
import pytest
from pydantic import ValidationError

from backend.services.prompt_builder import prompt_builder
from backend.telemetry_schema import validate_telemetry_batch

CONTRACTS_DIR = Path(__file__).resolve().parent.parent.parent / "contracts"


def test_prompt_contains_no_forbidden_fields():
    sample_path = CONTRACTS_DIR / "fixtures" / "valid" / "full_active.json"
    with open(sample_path, "r", encoding="utf-8") as f:
        telemetry_raw = json.load(f)

    reports = validate_telemetry_batch(telemetry_raw)
    compiled = prompt_builder.compile(reports)

    user_prompt = compiled["user_prompt"]
    system_prompt = compiled["system_prompt"]

    # Verify expected allowed sensor fields are defined across system/user prompts
    full_prompt = system_prompt + user_prompt
    assert "front" in full_prompt
    assert "rear" in full_prompt
    assert "side" in full_prompt
    assert "signal" in full_prompt
    assert "Dist" in full_prompt or "distance" in full_prompt
    assert "RelVel" in full_prompt or "relativeVelocity" in full_prompt

    # Extract JSON portion from user_prompt
    # Check that forbidden telemetry keys are NEVER present in telemetry JSON
    forbidden_keys = [
        '"x":',
        '"y":',
        '"speed":',
        '"targetSpeed":',
        '"acceleration":',
        '"route":',
        '"lane":',
        '"heading":',
        '"angle":',
        '"globalX":',
        '"globalY":',
    ]

    for key in forbidden_keys:
        assert key not in user_prompt, f"Forbidden key {key} leaked in user prompt!"
        assert key not in system_prompt, f"Forbidden key {key} leaked in system prompt!"


def test_canary_leak_rejected_before_prompt():
    """Any attempt to inject forbidden canary fields must fail telemetry validation."""
    canary_payload = [
        {
            "id": 1,
            "front": None,
            "rear": None,
            "side": {"left": None, "right": None},
            "signal": None,
            "global_coordinate_leak_canary": 42.0,
        }
    ]

    with pytest.raises(ValidationError):
        validate_telemetry_batch(canary_payload)
