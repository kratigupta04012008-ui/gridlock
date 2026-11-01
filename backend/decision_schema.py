"""
GRID LOCK — Backend Decision Schema (Pydantic v2)

Single source of truth mirroring contracts/decisions.schema.json.
Supports both:
1. Compact fixed-order action tuples:
   {"actions": [[vehicleId, "ACCELERATE"|"BRAKE"|"MAINTAIN", intensity], ...]}
2. Classic object decisions:
   {"decisions": [{"id": 0, "action": "ACCELERATE", "throttle": 0.5}, ...]}

Enforces strict extra='forbid', mutually exclusive action payloads,
and exact ID-set reconciliation against active vehicles.
"""

from typing import Annotated, Any, Dict, List, Literal, Optional, Set, Tuple, Union
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError


class AccelerateDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int = Field(description="Opaque routing key matching the vehicle report ID")
    action: Literal["ACCELERATE"]
    throttle: float = Field(ge=0.0, le=1.0, description="Throttle fraction [0.0, 1.0]")


class BrakeDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int = Field(description="Opaque routing key matching the vehicle report ID")
    action: Literal["BRAKE"]
    intensity: float = Field(ge=0.0, le=1.0, description="Braking fraction [0.0, 1.0]")


class MaintainDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: int = Field(description="Opaque routing key matching the vehicle report ID")
    action: Literal["MAINTAIN"]


VehicleDecision = Annotated[
    Union[AccelerateDecision, BrakeDecision, MaintainDecision],
    Field(discriminator="action"),
]


class BatchDecisionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decisions: List[VehicleDecision] = Field(
        description="Array of decisions, one per active vehicle."
    )


# TypeAdapters
VehicleDecisionAdapter = TypeAdapter(VehicleDecision)
BatchDecisionResponseAdapter = TypeAdapter(BatchDecisionResponse)


def _convert_compact_actions_to_decisions(actions: List[Any]) -> List[Dict[str, Any]]:
    """
    Normalizes compact [vehicleId, action, intensity] tuples into structured decision dicts.
    Validates:
    - 3-tuple structure [id: int, action: str, intensity: float]
    - action in ACCELERATE, BRAKE, MAINTAIN
    - intensity in [0.0, 1.0] (must be 0 for MAINTAIN)
    """
    normalized: List[Dict[str, Any]] = []
    for idx, item in enumerate(actions):
        if not isinstance(item, (list, tuple)) or len(item) != 3:
            raise ValueError(
                f"Action entry at index {idx} must be a 3-element list [id, action, intensity], got: {item}"
            )

        v_id, action_str, intensity_val = item

        if not isinstance(v_id, int) or isinstance(v_id, bool):
            raise ValueError(f"Vehicle ID at index {idx} must be an integer, got: {v_id}")

        if not isinstance(action_str, str):
            raise ValueError(f"Action at index {idx} must be a string, got: {action_str}")

        action_upper = action_str.strip().upper()
        if action_upper not in ("ACCELERATE", "BRAKE", "MAINTAIN"):
            raise ValueError(
                f"Unknown action '{action_str}' at index {idx}. Must be ACCELERATE, BRAKE, or MAINTAIN."
            )

        try:
            intensity = float(intensity_val)
        except (TypeError, ValueError) as err:
            raise ValueError(
                f"Intensity at index {idx} must be a valid float, got: {intensity_val}"
            ) from err

        if not (0.0 <= intensity <= 1.0):
            raise ValueError(
                f"Intensity {intensity} at index {idx} out of bounds [0.0, 1.0]"
            )

        if action_upper == "ACCELERATE":
            normalized.append({"id": v_id, "action": "ACCELERATE", "throttle": intensity})
        elif action_upper == "BRAKE":
            normalized.append({"id": v_id, "action": "BRAKE", "intensity": intensity})
        elif action_upper == "MAINTAIN":
            if intensity != 0.0:
                raise ValueError(
                    f"Intensity for MAINTAIN action at index {idx} must be 0, got: {intensity}"
                )
            normalized.append({"id": v_id, "action": "MAINTAIN"})

    return normalized


def validate_decision_response(data: Any) -> BatchDecisionResponse:
    """
    Validates raw data against BatchDecisionResponse schema.
    Transparently parses both compact 'actions' format and classic 'decisions' format.
    """
    if isinstance(data, list):
        data = {"actions": data}

    if isinstance(data, dict) and "actions" in data and "decisions" not in data:
        normalized_decisions = _convert_compact_actions_to_decisions(data["actions"])
        data = {"decisions": normalized_decisions}

    return BatchDecisionResponseAdapter.validate_python(data)


def validate_decision_id_set(
    decisions: List[VehicleDecision], expected_ids: Set[int]
) -> Tuple[bool, Optional[str]]:
    """
    Validates exact set equality between returned decision IDs and expected active vehicle IDs.
    Returns (True, None) if exact match.
    Returns (False, reason) if mismatch (duplicates, missing, or extra IDs).
    """
    decision_ids = [d.id for d in decisions]
    if len(decision_ids) != len(set(decision_ids)):
        duplicates = [x for x in set(decision_ids) if decision_ids.count(x) > 1]
        return False, f"Duplicate decision IDs found: {sorted(duplicates)}"

    returned_set = set(decision_ids)
    missing = expected_ids - returned_set
    extra = returned_set - expected_ids

    if missing or extra:
        errors = []
        if missing:
            errors.append(f"Missing decisions for vehicles: {sorted(list(missing))}")
        if extra:
            errors.append(f"Extra decisions for unknown vehicles: {sorted(list(extra))}")
        return False, "; ".join(errors)

    return True, None
