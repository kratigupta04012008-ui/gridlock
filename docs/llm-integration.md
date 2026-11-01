# GRID LOCK — LLM Batch Integration & Architecture (Phase 4)

## 1. Problem Statement & Invariants

**GRID LOCK** is an autonomous multi-agent traffic control system managing a signalized 4-way intersection. In Phase 4, vehicles are commanded by a single batch LLM API request per decision tick.

### Non-Negotiable Invariants
1. **Exactly ONE Provider Request per Decision Tick**:
   All active vehicles are controlled through a single batch API call. A tick ID is strictly monotonic and never reused. No provider or client retries are permitted (`retries=0` enforced at HTTP transport level).
2. **Strict Local Telemetry ONLY**:
   Input prompts contain only validated Phase 3 local sensor reports:
   - `front`: gap distance (m), relative velocity (m/s).
   - `rear`: gap distance (m), relative velocity (m/s).
   - `side`: lateral left/right clearance (m).
   - `signal`: state (`RED`, `YELLOW`, `GREEN`), distance to stop line (m).
   Zero global $(x, y)$ coordinates, lane identifiers, planned routes, or own-speeds are ever included.
3. **No Artificial Safety Overrides**:
   Unsafe or conflicting actions command physical acceleration/braking directly without artificial collision avoidance clamping. Collisions are recorded honestly by the Phase 2 SAT collision detector.
4. **Honest Failure Handling**:
   Invalid decisions or provider failures result in honest HALTED or UNCONTROLLED states. No synthetic fallback decisions are ever invented.
5. **Secure Credential Storage**:
   API keys reside strictly in backend environment variables (`.env`). Public endpoints (`/api/llm/config`) display masked keys (e.g. `AIza...1234`) and never expose secrets to frontend or logs.

---

## 2. Clock Policies

### Lockstep Policy (Default for Benchmarks & Research)
- When a decision tick boundary is reached (every $N$ physics steps, default 50 steps = 1.0 s), the simulation loop pauses.
- Simulation time remains frozen while the single batch request is in-flight with the LLM provider.
- Once the validated decision response arrives, actions are applied and physics advances until the next tick boundary.
- Guarantees 100% reproducible benchmark evaluation independent of network latency variations.

### Realtime Policy (50 Hz Continuous Dynamic)
- The 50 Hz physics simulation clock continues stepping forward continuously without pausing.
- While the batch request is in-flight, vehicles hold their previous commanded action (momentum and physical acceleration continue).
- **Decision Age**: The HUD tracks the live age of active decisions:
  $$\text{Decision Age} = (t_{\text{current}} - t_{\text{decision\_sent}}) \times 1000\text{ ms}$$
- **Skipped Ticks**: If the next decision tick boundary arrives while an in-flight request has not yet resolved, the new boundary is recorded as a `skippedTick`. Duplicate or concurrent provider requests are strictly prevented.

---

## 3. Decision Contract & Action Semantics

JSON Schema: `contracts/decisions.schema.json`

### Response Payload Structure
```json
{
  "decisions": [
    {
      "id": 1,
      "action": "ACCELERATE",
      "throttle": 0.75
    },
    {
      "id": 2,
      "action": "BRAKE",
      "intensity": 0.9
    },
    {
      "id": 3,
      "action": "MAINTAIN"
    }
  ]
}
```

### Constraints:
- `ACCELERATE`: Requires `throttle` $\in [0.0, 1.0]$ (target acceleration = $\text{throttle} \times 2.5\text{ m/s}^2$). Forbids `intensity`.
- `BRAKE`: Requires `intensity` $\in [0.0, 1.0]$ (target deceleration = $-\text{intensity} \times 4.5\text{ m/s}^2$). Forbids `throttle`.
- `MAINTAIN`: Zero target acceleration ($0.0\text{ m/s}^2$). Forbids `throttle` and `intensity`.
- **Exact ID-Set Match**: The returned `id` set must match the active vehicle ID set exactly. Any missing, extra, or duplicate vehicle ID triggers response rejection.

---

## 4. API Endpoints

| Endpoint | Method | Description | Invariant Enforcement |
| :--- | :--- | :--- | :--- |
| `/api/decide` | POST | Executes single batch LLM decision | Concurrency limit = 1, unique tick ID, transport retries = 0 |
| `/api/decide/preview` | POST | Compiles prompt preview | Verifiably makes 0 provider calls |
| `/api/llm/config` | GET | Status and safe config | Masks credentials (never reveals raw key) |
| `/api/llm/ledger` | GET | Call statistics & latency metrics | Verifies `maxProviderRequestsPerTick <= 1` |
| `/health` | GET | Healthcheck | Returns service status |

---

## 5. Failure Modes & Degradation Handling

1. **Unconfigured Backend (503 Service Unavailable)**:
   - When no API key is set in backend environment, `/api/decide` immediately returns HTTP 503.
   - Provider request count remains 0. HUD displays "Ready / Not Configured".
2. **Duplicate Tick ID (409 Conflict)**:
   - If a request is received with an already consumed `tickId`, backend rejects it immediately without contacting the provider.
3. **Concurrency Conflict (409 Conflict)**:
   - Backend single-flight lock (`asyncio.Lock`) rejects overlapping requests with HTTP 409. Provider request count remains strictly 1.
4. **Provider Timeout or 5xx (504 / 502 Bad Gateway)**:
   - HTTP transport executes with `retries=0`. Any timeout or provider error is captured, recorded in the audit ledger, and returned without retrying.
5. **Consecutive Failure Limit**:
   - The frontend scheduler tracks consecutive failures. After 3 consecutive failures, the simulation halts safely with a prominent banner to prevent runaway open-loop accidents.

---

## 6. Audit & Verification Evidence

- **Pytest Suite (`backend/tests/`)**: 39 passing unit and transport-level tests verifying provider request count = 1, respx mocks with zero retries on 500/429/timeout, prompt canary leak tests, schema validation, and ID reconciliation.
- **Vitest Suite (`frontend/src/tests/`)**: 89 passing tests verifying scheduler single-flight invariant, lockstep vs realtime clock policies, Ajv validation, unclamped SAT physics collisions, and architectural import boundaries (`no-restricted-imports`).
