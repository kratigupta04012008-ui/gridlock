# GRID LOCK — LLM-Driven Multi-Agent Traffic Control

**GRID LOCK** is an intelligent transportation research simulator designed to evaluate multi-agent coordination at a 4-way signalized intersection using a single batch LLM API call per decision tick.

This repository implements **Phase 1 (Visual Frontend & Contracts)** and **Phase 2 (Realistic, Deterministic Traffic Simulation Engine)**.

![Grid Lock Screenshot](./screenshot_desktop.png)

---

## Non-Negotiable Invariants & Honesty Rules

1. **Deterministic, Pure JS Physics**:
   - Simulation state transitions depend only on initial seed and commanded actions.
   - Zero dependency on Canvas, DOM, React, `Date.now()`, or `Math.random()`.
   - Fixed timestep $\Delta t = 0.02\text{ s}$ ($50\text{ Hz}$), decoupled from the 60 FPS animation loop via a time accumulator.
2. **No Hidden Safety Overrides**:
   - Zero emergency braking, zero phantom bumper repulsion, zero speed clamping to leading vehicles.
   - If an external controller commands acceleration into a collision, vehicles will collide physically.
3. **No Artificial Metrics**:
   - HUD statistics reflect real simulation events only. Collisions and cleared vehicles count live physical transitions; LLM latency reports *Not connected*.
4. **Local Telemetry Exclusively**:
   - Per-car local sensor readings only (front/rear distance & relative velocity, side proximity, distance to stop line, signal state). **Global coordinates (x, y) are strictly forbidden** in telemetry contracts.
5. **Single Batch LLM Call**:
   - When connected (Phase 4), exactly one batch inference call per decision tick for all 20 vehicles. Never per-car requests.
6. **Right-Hand Traffic (RHT)**:
   - Vehicles drive on the right side of the road in both directions.

---

## Architecture & Simulation Physics

See detailed specifications in [`docs/physics.md`](docs/physics.md) and [`docs/contracts.md`](docs/contracts.md).

### Kinematic Equations
- Timestep: $\Delta t = 0.02\text{ s}$ ($50\text{ Hz}$)
- Coordinate Conversion: `PIXELS_PER_METER = 10.0` ($800\text{ px} \times 800\text{ px} = 80\text{ m} \times 80\text{ m}$)
- Vehicle Dimensions: Length $4.5\text{ m}$, Width $1.9\text{ m}$
- Speed Limits: $v \in [0, 13.5\text{ m/s}]$ ($\sim 48.6\text{ km/h}$)
- Acceleration Limits: $a \in [-6.0\text{ m/s}^2, +3.0\text{ m/s}^2]$
- Jerk Limit: $J_{max} = 8.0\text{ m/s}^3$
- Anti-Tunneling Proof: At $v_{max} = 13.5\text{ m/s}$, max step displacement $\Delta s = 0.27\text{ m} < 0.95\text{ m}$ (half-car width), preventing any collision tunneling.

### Signal Controller State Machine
- 34-second cycle ($1700\text{ steps}$ at $50\text{ Hz}$):
  1. North/South GREEN ($12\text{ s}$)
  2. North/South YELLOW ($3\text{ s}$)
  3. All-RED clearance ($2\text{ s}$)
  4. East/West GREEN ($12\text{ s}$)
  5. East/West YELLOW ($3\text{ s}$)
  6. All-RED clearance ($2\text{ s}$)
- Proven invariant: Conflicting approaches (NS vs EW) are never GREEN or YELLOW simultaneously.

### Collision Detection
- Full 2D Oriented Bounding Box (OBB) using Separating Axis Theorem (SAT).
- Continuous overlap tracking: Collisions are counted on the transition from disjoint to colliding, avoiding double-counting ongoing contact.

---

## Directory Structure

```
autonomous-intersection/
  frontend/
    src/
      components/
        ControlBar.jsx          # Start, Pause, Reset, Baseline Controller selector, Clock
        HudPanel.jsx            # Live real metrics (Collisions, Cleared, Active, LLM Latency)
        MetricCard.jsx          # Metric presentation with tabular numerals & badges
        ScenarioSelect.jsx      # Placeholder scenario selector (explicitly marked)
        SignalLegend.jsx        # Signal indicators & phase visual preview
        SimulationCanvas.jsx    # Single HTML5 canvas with HiDPI & hit-testing
        SpeedControl.jsx        # 0.5x, 1x, 2x, 4x speed multipliers
        StatusBadge.jsx         # Idle, Running, Paused indicator
        VehicleInspector.jsx    # Attribute inspector & manual action tester
      contracts/
        schemas.js              # Telemetry & action contracts (rejects global x, y)
      controllers/
        baselineControllers.js  # Rule-based Signal Follower, Coast, Constant Accel
      hooks/
        useCanvasLoop.js        # requestAnimationFrame lifecycle hook
        useElementSize.js       # ResizeObserver hook for responsive canvas
      rendering/
        canvasSetup.js          # HiDPI resolution scaling & coordinate transforms
        drawLaneMarkings.js     # Dashed white dividers, double yellow median, stop lines
        drawRoads.js            # Asphalt, center junction box, crosswalks, curbs
        drawSignals.js          # Signal heads with glowing active lamps
        drawVehicles.js         # Oriented vehicle bodies, chevrons, IDs, collision halo
        hitTest.js              # Oriented bounding box click/hover picking
        renderScene.js          # Pure scene renderer: (ctx, snapshot, viewState)
        theme.js                # Canvas color tokens & styling constants
      simulation/
        collisionDetector.js    # SAT OBB collision detector & transition tracking
        config.js               # Physics parameters, SI limits, signal timing
        engine.js               # createEngine() factory with step(), reset(), snapshot()
        geometry.js             # 800x800 world geometry math & boundaries
        paths.js                # Arc-length parameterized paths (straight, left, right)
        prng.js                 # Mulberry32 deterministic PRNG
        sceneFixture.js         # Default initial queue fixture
        signalController.js     # Discrete cyclic signal state machine
        vehicle.js              # 20-vehicle fleet generator & kinematic updater
        vehiclePhysics.js       # Jerk-limited acceleration & piecewise kinematics
      styles/
        index.css               # Design tokens, fonts, and base styling
        dashboard.css           # 2-column responsive layout & card styles
      tests/
        clockState.test.js      # Status transitions & clock speed scaling tests
        collision.test.js       # OBB SAT collision tests (overlap, perpendicular, clear)
        contracts.test.js       # Telemetry validation & spatial coordinate rejection
        engine.test.js          # Determinism, step(), reset(), metrics, and baseline run
        geometry.test.js        # Road and stop line calculation tests
        hitTest.test.js         # Vehicle picking & empty area miss tests
        physics.test.js         # Jerk limiting, braking bounds, zero speed clipping
        sceneFixture.test.js    # Initial queue count and bounds verification
        signalController.test.js# Cycle timing, all-red phases, conflict invariants
        smoke.test.jsx          # Component smoke tests & honesty checks
      App.jsx                   # Fixed-timestep accumulator loop & UI state
      main.jsx                  # React application entrypoint
    package.json
    vite.config.js
    eslint.config.js
    .prettierrc
  docs/
    contracts.md                # Data contract definitions
    physics.md                  # Detailed physics, kinematics & anti-tunneling spec
  package.json                  # Root delegating scripts
  README.md
```

---

## Setup & Running Commands

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Start Development Server
```bash
npm run dev
# Open http://localhost:5173
```

### 3. Run Test Suite (Vitest)
```bash
npm test
```
*Executes all 50 unit and smoke tests covering physics, kinematics, collision detection, signal state machines, determinism, contracts, and UI components.*

### 4. Run Linting & Formatting
```bash
npm run lint
npm run format:check
```

### 5. Production Build
```bash
npm run build
```

---

## Phase Roadmap

- [x] **Phase 1: Visual Frontend & Contracts (Completed)**
  - Top-down HTML5 canvas intersection rendering (roads, center box, stop lines, crosswalks)
  - 20 vehicles queued realistically across 4 approaches with direction chevrons & IDs
  - Glowing traffic signal heads with visual phase preview selector
  - Canvas hit-testing, selection halo, and vehicle inspector
  - Simulation clock with Start/Pause/Reset and speed multipliers (0.5x, 1x, 2x, 4x)
  - Honest HUD metrics (no fabricated AI or collision numbers)
  - Data contracts rejecting global coordinates
- [x] **Phase 2: Realistic, Deterministic Traffic Simulation Engine (Completed)**
  - Fixed-timestep $\Delta t = 0.02\text{ s}$ ($50\text{ Hz}$) pure JS simulation engine
  - Decoupled from rendering loop using time accumulator with catch-up capping
  - SI units ($m, s, m/s, m/s^2, m/s^3$) and Right-Hand Traffic (RHT) convention
  - Arc-length parameterized paths for 4 approaches $\times$ (Straight, Left turn, Right turn)
  - Analytical piecewise kinematics with jerk limiting ($8.0\text{ m/s}^3$)
  - Anti-tunneling verified analytically ($\Delta s_{max} = 0.27\text{ m} < 0.95\text{ m}$)
  - Full 2D OBB Separating Axis Theorem (SAT) collision detector with contact transitions
  - Deterministic 34s cyclic traffic signal state machine with non-conflicting green/yellow invariant
  - Baseline non-AI controllers for testing (Signal Follower, Coast, Constant Accel)
  - Live HUD reporting real collisions and cleared vehicles; LLM latency marked "Not connected"
  - 50 unit and smoke tests passing across 10 test files
- [x] **Phase 3: Strict Local Telemetry Layer (Completed)**
  - Pure body-frame geometric sensors:
    - Front sensor: 1-lane forward corridor with bumper-to-bumper gap (clamped at 0) and relative velocity
    - Rear sensor: 1-lane rearward corridor with bumper-to-bumper gap and relative velocity
    - Side sensors: Left and right adjacent lane clearance with blind-spot longitudinal margin
    - Signal sensor: Current signal color and distance to approach stop line (null after crossing or > 60m)
  - Unified relative velocity sign convention: negative = closing (danger), positive = opening
  - Removal of Phase 1 own-speed field across JS validators, Pydantic models, docs, and tests
  - Single source of truth JSON Schema (`contracts/telemetry.schema.json`) with `additionalProperties: false` at all levels
  - Validation parity: Ajv Draft-07 (JS) and Pydantic v2 (Python) validated against shared golden fixtures
  - Dashboard `TelemetryInspector` with single vehicle / full batch toggle, byte/token estimates, and live validation badge
  - Optional canvas sensor detection zone visualizer
  - Comprehensive leak & locality tests (rigid-transform invariance, canary injection, locality, denylist key scan)
  - 67 passing Vitest tests + 20 passing Pytest tests
- [x] **Phase 4: LLM Batch Decision Engine & Backend Integration (Completed)**
  - Single batch LLM API call per decision tick for all active vehicles (zero retries)
  - Strict local telemetry prompt compilation (zero global coordinates leaked)
  - Transport-level `retries=0` and thread-safe call ledger auditing (`maxProviderRequestsPerTick <= 1`)
  - Dual clock policies: Lockstep (reproducible benchmark) and Realtime (50 Hz continuous with decision age tracking)
  - Live HUD displaying real LLM provider latency (ms), round-trip time (ms), and SAT collisions
  - Prompt Inspector and Decision Inspector panels with live ledger audit
  - 89 passing Vitest tests + 39 passing Pytest tests
