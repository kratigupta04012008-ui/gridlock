# GRID LOCK — Data Contracts & Architectural Invariants

This document defines the formal data contracts for **GRID LOCK — LLM-Driven Multi-Agent Traffic Control**.

Single source of truth schema: [`contracts/telemetry.schema.json`](../contracts/telemetry.schema.json)
Telemetry layer specification: [`docs/telemetry.md`](telemetry.md)

---

## 1. Two-Layer Architecture

```
Layer 1: Transport Wrapper (HTTP Wire Protocol)
{
  "tickId": <integer>,
  "telemetry": TelemetryReport[]
}
         │
         ▼ (LLM Gate: transport metadata stripped)
Layer 2: Telemetry Batch (LLM Prompt Visible)
TelemetryReport[]
```

### Layer 1: HTTP Transport Wrapper (`BatchDecisionRequest`)
Carried by HTTP requests between the frontend simulation client and the backend server.
```typescript
interface BatchDecisionRequest {
  tickId: number;              // Monotonically increasing simulation step counter
  telemetry: TelemetryReport[]; // Array of active vehicles' local telemetry
}
```

### Layer 2: LLM-Visible Telemetry Report (`TelemetryReport`)
Strict local telemetry for an active vehicle. **Never contains speed, global coordinates, lane IDs, or routing intentions.**
```typescript
interface SensorReading {
  distance: number;            // meters, >= 0, rounded to 0.1m
  relativeVelocity: number;    // m/s, negative = closing (danger), positive = opening, rounded to 0.1m/s
}

interface SideProximity {
  left: number | null;         // meters clearance to nearest vehicle in left adjacent zone, or null
  right: number | null;        // meters clearance to nearest vehicle in right adjacent zone, or null
}

type SignalState = 'RED' | 'YELLOW' | 'GREEN';

interface SignalSensor {
  state: SignalState;          // Current signal lamp color for governing approach
  distanceToStopLine: number;  // meters from front bumper to stop line along road, >= 0, rounded to 0.1m
}

interface TelemetryReport {
  id: number;                  // Integer vehicle identifier (routing key)
  front: SensorReading | null; // Forward sensor or null if clear
  rear: SensorReading | null;  // Rearward sensor or null if clear
  side: SideProximity;         // Side clearances (always an object)
  signal: SignalSensor | null; // Signal sensor or null (null when past stop line or > 60m)
}
```

### Response Contract (`BatchDecisionResponse`)
```typescript
type ActionType = 'ACCELERATE' | 'BRAKE' | 'MAINTAIN';

interface CarAction {
  id: number;                  // Integer vehicle identifier matching report
  action: ActionType;          // Commanded action
  intensity: number;           // Normalized throttle or brake intensity in [0.0, 1.0]
}

interface BatchDecisionResponse {
  tickId: number;              // Echoes request tickId
  actions: CarAction[];        // Actions for active vehicles
}
```

---

## 2. Invariants & Rules

1. **Strictly Local Telemetry**: No global coordinates (`x`, `y`), bird's-eye grids, or global paths are ever included in the telemetry contracts.
2. **Speed Prohibited**: The Phase 1 draft `own-speed` field is strictly removed. An LLM must judge headway and relative velocity from sensor readings alone.
3. **Single Batch LLM Inference**: Exactly one batch inference call per decision tick for all active vehicles.
4. **Validation Parity**: Validated in JavaScript via Ajv and in Python via Pydantic v2 with `extra="forbid"`.
