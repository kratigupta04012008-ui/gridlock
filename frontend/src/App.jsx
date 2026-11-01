/**
 * GRID LOCK — LLM-Driven Multi-Agent Traffic Control
 * Phase 4: Batch LLM-Driven Autonomous Traffic Control
 *
 * Responsibilities:
 * - Drives simulation loop with fixed-timestep accumulator (DT = 0.02s / 50 Hz).
 * - Integrates Phase 4 LLM Batch Controller with lockstep and realtime clock policies.
 * - Enforces single batch request per tick; provides fallback-free honest metrics.
 * - Displays HUD, live SAT collision detection, Telemetry Gate, and Prompt/Decision Inspectors.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createEngine } from './simulation/engine.js'
import { DT } from './simulation/config.js'
import {
  createCoastController,
  createConstantAccelerationController,
  createSimpleSignalBaselineController,
} from './controllers/baselineControllers.js'
import { createLLMController } from './controllers/llmController.js'
import { resetBackendSession } from './services/decisionClient.js'
import { buildLocalTelemetry } from './telemetry/buildLocalTelemetry.js'
import { SimulationCanvas } from './components/SimulationCanvas.jsx'
import { HudPanel } from './components/HudPanel.jsx'
import { ControlBar } from './components/ControlBar.jsx'
import { SignalLegend } from './components/SignalLegend.jsx'
import { VehicleInspector } from './components/VehicleInspector.jsx'
import { TelemetryInspector } from './components/TelemetryInspector.jsx'
import { PromptInspector } from './components/PromptInspector.jsx'
import { DecisionInspector } from './components/DecisionInspector.jsx'
import { ScenarioSelect } from './components/ScenarioSelect.jsx'

export function App() {
  // 1. Simulation Engine Instance
  const engineRef = useRef(null)
  if (!engineRef.current) {
    engineRef.current = createEngine({ seed: 42 })
  }
  const engine = engineRef.current

  // 2. UI & Simulation State
  const [status, setStatus] = useState('IDLE') // 'IDLE' | 'RUNNING' | 'PAUSED'
  const [speed, setSpeed] = useState(1) // 0.5, 1, 2, 4
  const [controllerKey, setControllerKey] = useState('llm_batch')
  const [clockPolicy, setClockPolicy] = useState('lockstep')
  const [decisionIntervalSteps, setDecisionIntervalSteps] = useState(250) // 5.0s at 50 Hz (12 RPM)
  const [selectedVehicleId, setSelectedVehicleId] = useState(null)
  const [showSensorZones, setShowSensorZones] = useState(false)

  // Reactive state synced with engine and LLM scheduler
  const [snapshot, setSnapshot] = useState(() => engine.getSnapshot())
  const [metrics, setMetrics] = useState(() => engine.getMetrics())
  const [llmMetrics, setLlmMetrics] = useState(null)

  // 3. LLM Controller Instance (Ref persists across renders)
  const llmControllerRef = useRef(null)
  if (!llmControllerRef.current) {
    llmControllerRef.current = createLLMController({
      onApplyActions: (actions) => {
        engineRef.current?.applyActions(actions)
      },
      clockPolicy: 'lockstep',
      decisionIntervalSteps: 250,
    })
  }

  // Sync clock policy changes with scheduler
  useEffect(() => {
    llmControllerRef.current?.scheduler.setClockPolicy(clockPolicy)
  }, [clockPolicy])

  // Sync decision interval changes with scheduler
  useEffect(() => {
    llmControllerRef.current?.scheduler.setDecisionIntervalSteps(decisionIntervalSteps)
  }, [decisionIntervalSteps])

  // Reset backend session on mount so tick IDs start fresh
  useEffect(() => {
    resetBackendSession()
  }, [])

  // 4. Baseline Controller Mapping
  const activeBaselineController = useMemo(() => {
    switch (controllerKey) {
      case 'coast':
        return createCoastController()
      case 'constant_accel':
        return createConstantAccelerationController(0.4)
      case 'signal_follower':
        return createSimpleSignalBaselineController()
      default:
        return null
    }
  }, [controllerKey])

  const isLLM = controllerKey === 'llm_batch'

  // 5. Fixed-Timestep Accumulator Simulation Loop
  useEffect(() => {
    if (status !== 'RUNNING') return

    let lastTime = performance.now()
    let accumulator = 0
    const MAX_CATCHUP_STEPS = 10

    const intervalId = setInterval(() => {
      const now = performance.now()
      const dtReal = (now - lastTime) / 1000
      lastTime = now

      accumulator += dtReal * speed

      let stepsRan = 0
      while (accumulator >= DT && stepsRan < MAX_CATCHUP_STEPS) {
        if (isLLM) {
          const controller = llmControllerRef.current
          const snap = engine.getSnapshot()

          const stepCheck = controller.step(
            engine.getMetrics().step,
            engine.getMetrics().simTime,
            () => {
              const activeVehicles = snap.vehicles.filter(
                (v) => v.status === 'active' || v.status === 'waiting'
              )
              return activeVehicles.map((v) => buildLocalTelemetry(snap, v.id))
            }
          )

          if (stepCheck.shouldStepEngine) {
            engine.step()
            accumulator -= DT
            stepsRan++
          } else {
            // Frozen by scheduler (e.g. lockstep awaiting API or halted)
            accumulator = 0
            break
          }
        } else {
          // Baseline Non-AI Controller
          if (activeBaselineController && activeBaselineController.getActions) {
            const actions = activeBaselineController.getActions(engine.getSnapshot())
            if (actions && actions.length > 0) {
              engine.applyActions(actions)
            }
          }

          engine.step()
          accumulator -= DT
          stepsRan++
        }
      }

      if (accumulator > DT * MAX_CATCHUP_STEPS) {
        accumulator = 0
      }

      setSnapshot(engine.getSnapshot())
      setMetrics(engine.getMetrics())
      if (isLLM) {
        setLlmMetrics(llmControllerRef.current?.getMetrics())
      }
    }, 16) // ~60 Hz poll

    return () => clearInterval(intervalId)
  }, [status, speed, isLLM, activeBaselineController, engine])

  // 6. Controls Handlers
  const handleStart = useCallback(() => {
    setStatus('RUNNING')
  }, [])

  const handlePause = useCallback(() => {
    setStatus('PAUSED')
  }, [])

  const handleReset = useCallback(() => {
    setStatus('IDLE')
    engine.reset(42)
    llmControllerRef.current?.reset()
    resetBackendSession()
    setSelectedVehicleId(null)
    setSnapshot(engine.getSnapshot())
    setMetrics(engine.getMetrics())
    setLlmMetrics(llmControllerRef.current?.getMetrics())
  }, [engine])

  const handleResumeSimulation = useCallback(() => {
    llmControllerRef.current?.resume()
    setStatus('RUNNING')
    setLlmMetrics(llmControllerRef.current?.getMetrics())
  }, [])

  const handleSpeedChange = useCallback((newSpeed) => {
    setSpeed(newSpeed)
  }, [])

  const handleControllerChange = useCallback((newKey) => {
    setControllerKey(newKey)
  }, [])

  const handleClockPolicyChange = useCallback((newPolicy) => {
    setClockPolicy(newPolicy)
  }, [])

  const handleSelectVehicle = useCallback((id) => {
    setSelectedVehicleId(id)
  }, [])

  const handleDeselect = useCallback(() => {
    setSelectedVehicleId(null)
  }, [])

  // Manual action injection for selected vehicle
  const handleApplyManualAction = useCallback(
    (id, action, val) => {
      const payload = { id, action }
      if (action === 'ACCELERATE') payload.throttle = val
      else if (action === 'BRAKE') payload.intensity = val
      engine.applyActions([payload])
      setSnapshot(engine.getSnapshot())
      setMetrics(engine.getMetrics())
    },
    [engine]
  )

  const selectedVehicle = useMemo(() => {
    if (selectedVehicleId === null || selectedVehicleId === undefined) return null
    return snapshot.vehicles.find((v) => v.id === selectedVehicleId) || null
  }, [snapshot.vehicles, selectedVehicleId])

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="app-header" role="banner">
        <div className="app-header__branding">
          <svg
            className="app-header__icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M12 3v18" />
            <path d="M3 12h18" />
          </svg>
          <div>
            <h1 className="app-header__title">GRID LOCK</h1>
            <span className="app-header__subtitle">
              Phase 4: LLM-Driven Multi-Agent Traffic Control
            </span>
          </div>
        </div>

        <div className="app-header__status">
          {isLLM ? (
            <span
              className={`badge ${
                llmMetrics?.status === 'running' || llmMetrics?.status === 'requesting'
                  ? 'badge--success'
                  : llmMetrics?.status === 'rate_limited'
                    ? 'badge--notice'
                    : llmMetrics?.status === 'halted'
                      ? 'badge--alert'
                      : 'badge--placeholder'
              }`}
              role="status"
            >
              {llmMetrics?.status === 'rate_limited'
                ? 'RATE LIMITED: Cooldown in progress'
                : llmMetrics?.status === 'halted'
                  ? 'HALTED: Decision Failure Threshold'
                  : llmMetrics?.status === 'uncontrolled'
                    ? 'UNCONTROLLED: Open-Loop Inertia'
                    : 'Phase 4: Single-Batch LLM Active'}
            </span>
          ) : (
            <span className="badge badge--placeholder" role="status">
              Baseline Mode: Non-AI Heuristic Active
            </span>
          )}
        </div>
      </header>

      {/* Rate Limited Cooldown Alert */}
      {isLLM && llmMetrics?.status === 'rate_limited' && (
        <div
          className="alert alert--warning"
          style={{
            margin: '0 24px 12px 24px',
            padding: '12px 16px',
            background: '#f59e0b22',
            border: '1px solid #f59e0b',
            borderRadius: '6px',
            color: '#fbbf24',
            fontWeight: '600',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
          role="alert"
        >
          <div>
            ⏳ <strong>Gemini Free Tier Quota Limit (15 RPM)</strong>: {llmMetrics.lastError}
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ padding: '4px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
            onClick={handleResumeSimulation}
          >
            Resume Now
          </button>
        </div>
      )}

      {/* Failure Banner Alert */}
      {isLLM && llmMetrics?.status === 'halted' && (
        <div
          className="alert alert--error"
          style={{
            margin: '0 24px 12px 24px',
            padding: '12px 16px',
            background: '#ef444422',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#f87171',
            fontWeight: '600',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
          role="alert"
        >
          <div>
            SIMULATION HALTED: LLM decision service reached consecutive failure threshold. Reason:{' '}
            {llmMetrics.lastError || 'Unknown provider error'}. Simulation clock paused to prevent
            unmonitored runaway.
          </div>
          <button
            type="button"
            className="btn btn--secondary"
            style={{ padding: '4px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
            onClick={handleResumeSimulation}
          >
            Resume / Retry
          </button>
        </div>
      )}

      {isLLM && llmMetrics?.status === 'uncontrolled' && (
        <div
          className="alert alert--warning"
          style={{
            margin: '0 24px 12px 24px',
            padding: '12px 16px',
            background: '#f59e0b22',
            border: '1px solid #f59e0b',
            borderRadius: '6px',
            color: '#fbbf24',
            fontWeight: '600',
            fontSize: '13px',
          }}
          role="alert"
        >
          WARNING: Last LLM decision failed ({llmMetrics.lastError}). Operating open-loop with
          vehicles holding inertia.
        </div>
      )}

      {/* Main 2-Column Responsive Layout */}
      <main className="app-layout" role="main">
        {/* Left Column: Canvas Viewport */}
        <section className="canvas-column" aria-label="Intersection Viewport">
          <SimulationCanvas
            snapshot={snapshot}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={handleSelectVehicle}
            showSensorZones={showSensorZones}
          />
          <ControlBar
            status={status}
            clock={metrics.simTime}
            speed={speed}
            activeControllerName={controllerKey}
            clockPolicy={clockPolicy}
            decisionIntervalSteps={decisionIntervalSteps}
            onStart={handleStart}
            onPause={handlePause}
            onReset={handleReset}
            onSpeedChange={handleSpeedChange}
            onControllerChange={handleControllerChange}
            onClockPolicyChange={handleClockPolicyChange}
            onDecisionIntervalChange={setDecisionIntervalSteps}
          />
        </section>

        {/* Right Sidebar: HUD, Telemetry Gate, & Inspectors */}
        <aside className="sidebar-column" aria-label="Simulation Dashboard">
          <HudPanel metrics={metrics} llmMetrics={llmMetrics} activeControllerKey={controllerKey} />
          <SignalLegend currentPhaseName={snapshot.phaseName} signals={snapshot.signals} />
          <PromptInspector snapshot={snapshot} />
          <DecisionInspector
            schedulerMetrics={llmMetrics}
            lastDecisions={llmControllerRef.current?.scheduler.lastDecisions}
          />
          <TelemetryInspector
            snapshot={snapshot}
            selectedVehicleId={selectedVehicleId}
            showSensorZones={showSensorZones}
            onToggleSensorZones={setShowSensorZones}
          />
          <VehicleInspector
            vehicle={selectedVehicle}
            onDeselect={handleDeselect}
            onApplyManualAction={handleApplyManualAction}
          />
          <ScenarioSelect />
        </aside>
      </main>
    </div>
  )
}

export default App
