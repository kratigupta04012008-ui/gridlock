"""
GRID LOCK — Backend Telemetry Schema (Pydantic v2)

Single source of truth mirroring contracts/telemetry.schema.json.
Enforces strict extra='forbid' at all levels and strict types.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

SignalState = Literal["RED", "YELLOW", "GREEN"]


class SensorReading(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    distance: float = Field(ge=0, description="Bumper-to-bumper gap in meters, clamped to 0 on contact")
    relativeVelocity: float = Field(
        description="Rate of change of gap in m/s: negative = closing (danger), positive = opening"
    )


class SideProximity(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    left: Optional[float] = Field(ge=0, description="Left lateral clearance in meters, or null if clear")
    right: Optional[float] = Field(ge=0, description="Right lateral clearance in meters, or null if clear")


class SignalSensor(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    state: SignalState = Field(description="Signal state for governing approach")
    distanceToStopLine: float = Field(ge=0, description="Distance from front bumper to stop line in meters")


class VehicleTelemetryReport(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: int = Field(description="Opaque integer vehicle identifier")
    front: Optional[SensorReading] = Field(description="Forward sensor or null")
    rear: Optional[SensorReading] = Field(description="Rearward sensor or null")
    side: SideProximity = Field(description="Side clearance sensors")
    signal: Optional[SignalSensor] = Field(description="Signal sensor or null")


# Batch validator adapter
TelemetryBatchAdapter = TypeAdapter(List[VehicleTelemetryReport])
VehicleTelemetryReportAdapter = TypeAdapter(VehicleTelemetryReport)


def validate_telemetry_report(data: dict) -> VehicleTelemetryReport:
    """Validates a single vehicle telemetry report dict."""
    return VehicleTelemetryReportAdapter.validate_python(data)


def validate_telemetry_batch(data: list) -> List[VehicleTelemetryReport]:
    """Validates an entire telemetry batch list."""
    return TelemetryBatchAdapter.validate_python(data)
