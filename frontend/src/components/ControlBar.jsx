/**
 * GRID LOCK — Simulation Control Bar (Phase 4: LLM Multi-Agent Control)
 *
 * Controls: Start, Pause, Reset, Speed selector, Controller mode, Clock policy, and Clock display.
 */

import { SpeedControl } from './SpeedControl.jsx'
import { StatusBadge } from './StatusBadge.jsx'

function formatClock(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(1)
  const paddedMins = String(mins).padStart(2, '0')
  const paddedSecs = secs.padStart(4, '0')
  return `${paddedMins}:${paddedSecs}`
}

export function ControlBar({
  status,
  clock,
  speed,
  activeControllerName,
  clockPolicy,
  decisionIntervalSteps = 250,
  onStart,
  onPause,
  onReset,
  onSpeedChange,
  onControllerChange,
  onClockPolicyChange,
  onDecisionIntervalChange,
}) {
  const isRunning = status === 'RUNNING'
  const isLLM = activeControllerName === 'llm_batch'

  return (
    <div className="control-bar" role="region" aria-label="Simulation Controls">
      <div className="control-bar__top">
        <div className="control-bar__group">
          {!isRunning ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={onStart}
              aria-label="Start simulation"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Start</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--warning"
              onClick={onPause}
              aria-label="Pause simulation"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              <span>Pause</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn--secondary"
            onClick={onReset}
            aria-label="Reset simulation"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span>Reset</span>
          </button>

          <SpeedControl currentSpeed={speed} onSpeedChange={onSpeedChange} />
        </div>

        <div className="control-bar__clock-box">
          <span className="clock-label">Sim Clock:</span>
          <span className="clock-value" aria-label={`Simulation clock: ${formatClock(clock)}`}>
            {formatClock(clock)}
          </span>
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Controller Mode & Clock Policy Row */}
      <div
        className="control-bar__controller-row"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="controller-select" className="control-label">
            Controller:
          </label>
          <select
            id="controller-select"
            className="controller-select-dropdown"
            value={activeControllerName}
            onChange={(e) => onControllerChange && onControllerChange(e.target.value)}
          >
            <option value="llm_batch">⚡ LLM Batch Controller (Phase 4)</option>
            <option value="signal_follower">Rule-Based Signal Follower (Heuristic Baseline)</option>
            <option value="coast">Coast / Maintain (Idle Baseline)</option>
            <option value="constant_accel">Constant Acceleration (Collision Test)</option>
          </select>
        </div>

        {isLLM && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="clock-policy-select" className="control-label">
                Clock Policy:
              </label>
              <select
                id="clock-policy-select"
                className="controller-select-dropdown"
                value={clockPolicy}
                onChange={(e) => onClockPolicyChange && onClockPolicyChange(e.target.value)}
              >
                <option value="lockstep">Lockstep (Freeze Sim During Call)</option>
                <option value="realtime">Realtime (Continuous 50Hz, Track Age)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="interval-select" className="control-label">
                Rate:
              </label>
              <select
                id="interval-select"
                className="controller-select-dropdown"
                value={decisionIntervalSteps}
                onChange={(e) =>
                  onDecisionIntervalChange && onDecisionIntervalChange(Number(e.target.value))
                }
                title="Controls how often the LLM is queried. 5.0s is safe for Gemini Free Tier (15 RPM)."
              >
                <option value={250}>5.0s (12 RPM — Free Tier Safe)</option>
                <option value={200}>4.0s (15 RPM — Free Tier Limit)</option>
                <option value={100}>2.0s (30 RPM — Pay-As-You-Go)</option>
                <option value={50}>1.0s (60 RPM — High Quota)</option>
              </select>
            </div>
          </>
        )}

        <span
          className={`badge ${isLLM ? 'badge--success' : 'badge--placeholder'}`}
          style={{ marginLeft: 'auto' }}
        >
          {isLLM ? '1 Batch Request / Tick (Strict)' : 'Non-AI Baseline Controller'}
        </span>
      </div>

      <div className="control-bar__notice" role="note">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>
          {isLLM
            ? 'Phase 4 LLM Controller: Exactly 1 request per tick for all active vehicles. Strict local sensors only (no global coordinates). SAT collisions recorded.'
            : 'Deterministic baseline controller active. Useful for verifying physics and collision boundaries.'}
        </span>
      </div>
    </div>
  )
}
