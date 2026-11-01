# GRID LOCK — Data Contracts & Architectural Invariants

## Core Principles & Invariants
1. **Single Batch Request**: Exactly ONE batch LLM decision request per decision tick for all active vehicles. Never individual requests per vehicle.
2. **Local Telemetry Only**: Telemetry payload to and from the decision engine contains exclusively ego-centric local sensor data:
   - Front sensor: distance, relative velocity
   - Rear sensor: distance, relative velocity
   - Side proximity: left, right clearances
   - Signal sensor: current signal state (`RED`, `YELLOW`, `GREEN`) and distance to the inbound stop line
   - Own speed
   - **STRICT PROHIBITION**: No global coordinates (`x`, `y`, `posX`, `posY`), bird's eye grids, or global paths are ever included in the telemetry contracts.
3. **Decoupled Physics & Rendering**:
   - Canvas render loop runs at 60 FPS (via `requestAnimationFrame`).
   - Decision tick loop runs at lower frequency (e.g. 2–5 Hz).
   - Vehicles hold the last received action between ticks.
4. **Honest Reporting**: Metrics never fabricate status, collisions, or artificial latency. If a module is not active, it reports "—" or "Not connected".

---

## Data Schema Specification

### 1. Local Sensor Types
```typescript
interface SensorReading {
  distance: number;          // meters, >= 0
  relativeVelocity: number;  // m/s, negative = closing, positive = opening
}

interface SideProximity {
  left: number;              // meters clearance to left obstacle/lane boundary
  right: number;             // meters clearance to right obstacle/lane boundary
}

type SignalState = 'RED' | 'YELLOW' | 'GREEN';

interface SignalSensor {
  state: SignalState;
  distanceToStopLine: number; // meters, >= 0
}
```

### 2. Vehicle Telemetry (`CarTelemetry`)
```typescript
interface CarTelemetry {
  id: string;                // e.g. "car-0", "car-1"
  front: SensorReading | null;
  rear: SensorReading | null;
  side: SideProximity;
  signal: SignalSensor;
  speed: number;             // m/s, >= 0
}
```
*Note: Any additional keys (especially spatial `x`, `y`, `position`) are strictly forbidden and will be rejected by backend and frontend validators.*

### 3. Batch Decision Request (`BatchDecisionRequest`)
```typescript
interface BatchDecisionRequest {
  tickId: number;            // Monotonically increasing tick counter
  cars: CarTelemetry[];      // Telemetry for all active cars
}
```

### 4. Vehicle Action & Batch Decision Response (`BatchDecisionResponse`)
```typescript
type ActionType = 'ACCELERATE' | 'BRAKE' | 'MAINTAIN';

interface CarAction {
  id: string;                // Matches car id
  action: ActionType;
  intensity: number;         // Range [0.0, 1.0] representing throttle or brake pressure
}

interface BatchDecisionResponse {
  tickId: number;
  actions: CarAction[];
}
```
