"""
GRID LOCK — Backend Decision Schema (Pydantic v2)

Single source of truth mirroring contracts/decisions.schema.json.
Enforces strict extra='forbid', mutually exclusive action payloads,
and exact ID-set reconciliation against active vehicles.
"""

from typing import Annotated, List, Literal, Optional, Set, Tuple, Union
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


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


# TypeAdapter for single vehicle decision or response
VehicleDecisionAdapter = TypeAdapter(VehicleDecision)
BatchDecisionResponseAdapter = TypeAdapter(BatchDecisionResponse)


def validate_decision_response(data: dict) -> BatchDecisionResponse:
    """Validates raw dict against BatchDecisionResponse schema."""
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
