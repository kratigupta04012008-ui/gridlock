# GRID LOCK — Phase 3: Strict Local Telemetry Layer

This document specifies the **strict local telemetry layer** for **GRID LOCK — LLM-Driven Multi-Agent Traffic Control**.
This layer represents the **ONLY** data pipeline by which simulation state can reach an LLM.

---

## 1. Architectural Layers & Contract Boundary

The system maintains a strict two-layer boundary:

```
+-----------------------------------------------------------------------------------+
| 1. HTTP Transport Wrapper (Carried by API client, discarded before LLM prompt)    |
|    - tickId: <integer> (monotonically increasing simulation step counter)         |
|    - telemetry: TelemetryReport[]                                                 |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼ (LLM Gate: only the array is passed)
+-----------------------------------------------------------------------------------+
| 2. Telemetry Batch (What the LLM prompt is permitted to see)                      |
|    Array of TelemetryReport objects, exactly one per ACTIVE vehicle, sorted by ID |
+-----------------------------------------------------------------------------------+
```

### The Permitted Payload per Active Vehicle
```json
{
  "id": <integer>,
  "front": { "distance": <m>, "relativeVelocity": <m/s> } | null,
  "rear":  { "distance": <m>, "relativeVelocity": <m/s> } | null,
  "side":  { "left": <m> | null, "right": <m> | null },
  "signal": { "state": "RED"|"YELLOW"|"GREEN", "distanceToStopLine": <m> } | null
}
```

### Strictly Forbidden Fields
Any key not in `["id", "front", "rear", "side", "signal"]` is forbidden.
The following fields are strictly prohibited from ever entering telemetry:
- **Kinematics**: Ego speed (`speed`, `velocity`), ego acceleration (`acceleration`, `targetAcceleration`), heading (`heading`, `yaw`).
- **Global Coordinates**: Any global position (`x`, `y`, `posX`, `posY`, `position`, `grid`, `globalX`, `globalY`, `coord`, `coordinates`).
- **Topological State**: Lane assignments (`lane`, `laneId`, `laneIndex`), movement intentions (`movement`, `route`, `path`, `trajectory`), approach name (`approach`), intersection occupancy or junction status.
- **Other Agents**: IDs, bounding boxes, or trajectories of other vehicles (`targetId`, `otherVehicles`, `fleet`).
- **Metadata**: Simulation timestamps, vehicle dimensions (`length`, `width`), signal countdown timers (`secondsRemaining`).

---

## 2. Sensor Models & Physical Geometry

Every reading is computed from physical geometry in the **ego vehicle's body frame**.
No routing data, lane ownership, or "who is ahead in lane" bookkeeping is used to determine visibility.

### Coordinate System & Body Frame
- Let ego center be $(x_{ego}, y_{ego})$ in meters, and heading be $\theta_{ego}$ (clockwise from $+x$).
- Unit forward vector: $\hat{\mathbf{u}} = (\cos\theta_{ego}, \sin\theta_{ego})$.
- Unit left vector: $\hat{\mathbf{v}}_{left} = (\sin\theta_{ego}, -\cos\theta_{ego})$.
- For any world point $\mathbf{P} = (x, y)$ in meters:
  - Longitudinal coordinate: $x_{body} = (x - x_{ego}) \cos\theta_{ego} + (y - y_{ego}) \sin\theta_{ego}$
  - Lateral coordinate: $y_{body} = (x - x_{ego}) \sin\theta_{ego} - (y - y_{ego}) \cos\theta_{ego}$
- In this frame:
  - $+x_{body}$ is forward (front bumper at $+L/2 = +2.25\text{ m}$).
  - $-x_{body}$ is rearward (rear bumper at $-L/2 = -2.25\text{ m}$).
  - $+y_{body}$ is lateral left (left side at $+W/2 = +0.95\text{ m}$).
  - $-y_{body}$ is lateral right (right side at $-W/2 = -0.95\text{ m}$).

### Sensor Ranges, Zones, and Justifications

| Sensor | Range Parameter | Default | Detection Region (Ego Frame) | Justification |
| :--- | :--- | :---: | :--- | :--- |
| **Front** | `FRONT_MAX_RANGE` | $40.0\text{ m}$ | Corridor $y \in [-1.75, +1.75]\text{ m}$, $x \ge +2.25\text{ m}$ | Standard 1-lane corridor ($3.5\text{ m}$ wide). $40\text{ m}$ corresponds to $\sim 3\text{ seconds}$ preview at $v_{max} = 13.5\text{ m/s}$. |
| **Rear** | `REAR_MAX_RANGE` | $30.0\text{ m}$ | Corridor $y \in [-1.75, +1.75]\text{ m}$, $x \le -2.25\text{ m}$ | Standard 1-lane corridor behind ego. $30\text{ m}$ provides sufficient stopping buffer for trailing vehicles. |
| **Side (Left & Right)** | `SIDE_MAX_RANGE`<br>`SIDE_LONGITUDINAL_MARGIN` | $3.5\text{ m}$<br>$0.5\text{ m}$ | Lateral: $[+0.95, +4.45]\text{ m}$ (left) / $[-4.45, -0.95]\text{ m}$ (right). Longitudinal: $[-2.75, +2.75]\text{ m}$. | Covers one adjacent lane width ($3.5\text{ m}$) across the full vehicle chassis plus $0.5\text{ m}$ front/rear blind-spot margin. |
| **Signal** | `SIGNAL_MAX_RANGE` | $60.0\text{ m}$ | Longitudinal distance along approach axis from front bumper to stop line. | The approach queue length is $\sim 45\text{ m}$; $60\text{ m}$ ensures queued vehicles always see the governing signal. |

### Relative Velocity Sign Convention
`relativeVelocity` is the **rate of change of the reported gap**, in m/s, for BOTH front and rear sensors:
$$\frac{d(\text{gap})}{dt}$$
- **Negative ($< 0$)**: The gap is **shrinking (closing)** — representing danger.
- **Positive ($> 0$)**: The gap is **growing (opening)**.

Mathematical Formulation:
- **Front Sensor**: $\frac{d(\text{gap})}{dt} = (\mathbf{v}_{target} \cdot \hat{\mathbf{u}}_{ego}) - v_{ego} = v_{target} \cos(\theta_{target} - \theta_{ego}) - v_{ego}$.
  - Target slower than ego: $v_{target} < v_{ego} \implies v_{rel} < 0$ (closing).
  - Target faster than ego: $v_{target} > v_{ego} \implies v_{rel} > 0$ (opening).
- **Rear Sensor**: $\frac{d(\text{gap})}{dt} = v_{ego} - (\mathbf{v}_{target} \cdot \hat{\mathbf{u}}_{ego}) = v_{ego} - v_{target} \cos(\theta_{target} - \theta_{ego})$.
  - Trailing car faster than ego: $v_{target} > v_{ego} \implies v_{rel} < 0$ (closing).
  - Ego pulling away from trailing car: $v_{ego} > v_{target} \implies v_{rel} > 0$ (opening).

### Bumper-to-Bumper Gap & Null Semantics
- **Gap Measurement**: Distance from ego bumper to the nearest surface point of the other vehicle inside the corridor. Clamped at $0.0\text{ m}$ on contact.
- **Null Semantics**: When no vehicle is in range or in the corridor, the field is `null` (never a sentinel like `-1` or `9999`).
- **Signal Null Semantics**: Once the front bumper crosses the stop line into the intersection box ($dist < 0$), or when beyond $60\text{ m}$, `signal` becomes `null`.
- **Side Object**: The `side` field is always an object `{ "left": <number> | null, "right": <number> | null }`.
- **Rounding Precision**:
  - Distance: Rounded to $0.1\text{ m}$.
  - Relative velocity: Rounded to $0.1\text{ m/s}$.
  - Non-finite numbers (NaN, Infinity) are strictly rejected before serialization.

---

## 3. Compliance Matrix

| Hackathon Rule | Implementation Requirement | Verification Test Name | Status |
| :--- | :--- | :--- | :---: |
| **No Global Coordinates** | World positions $(x, y)$ strictly omitted from all reports | `test_explicit_forbidden_keys` (pytest)<br>`strictly rejects any global spatial coordinate fields` (vitest) | **PASS** |
| **Rigid-Transform Invariance** | Translating and rotating the entire world yields byte-identical sensor readings | `is strictly invariant under global rigid translations and rotations` (vitest) | **PASS** |
| **No Own-Speed Leak** | Phase 1 draft `speed` field removed everywhere | `test_reject_speed_everywhere` (pytest)<br>`strictly rejects own-speed field in telemetry` (vitest) | **PASS** |
| **Canary Proof** | Internal state injection never appears in serialized string | `never leaks internal canary values into the serialized batch` (vitest) | **PASS** |
| **Locality Proof** | Distant changes or route adjustments do not alter local report | `proves locality: modifying a distant vehicle or route does not affect vehicle 0 report` (vitest) | **PASS** |
| **Strict Schema Enforcement** | `additionalProperties: false` at all nesting levels; Ajv & Pydantic parity | `test_valid_fixtures` / `test_invalid_fixtures` (pytest)<br>`Golden Fixtures & Pinned Fields` (vitest) | **PASS** |
| **Single Serialization Gate** | Invalid batch throws; only `serializeTelemetryBatch` formats output | `refuses to serialize an invalid batch and throws` (vitest) | **PASS** |
| **Single Batch API Wrapper** | Exactly one report per active vehicle, ordered by ID | `produces exactly one report per active vehicle, ordered by id, excluding cleared` (vitest) | **PASS** |

---

## 4. Simplifications & Known Limitations

1. **No Occlusion Raycasting**: Sensor corridors detect the closest vehicle by longitudinal distance without computing ray shadowing through intermediate vehicles.
2. **Perpendicular Crossing Gap Rate**: A vehicle passing perpendicularly in front of ego ($\theta_{target} - \theta_{ego} = \pm 90^\circ$) has $\mathbf{v}_{target} \cdot \hat{\mathbf{u}}_{ego} = 0$, so its gap rate is reported as $-v_{ego}$.
3. **Discrete Metric Rounding**: Rounding to $0.1\text{ m}$ eliminates float noise and keeps prompts compact, but introduces $\pm 0.05\text{ m}$ discretization.
