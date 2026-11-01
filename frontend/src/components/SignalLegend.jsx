/**
 * GRID LOCK — Signal Legend (Phase 2: Live State Machine)
 *
 * Requirements:
 * - Shows current approach signal states from the deterministic state machine.
 * - Displays active controller cycle phase (e.g. North/South Green, Yellow, All-Red, etc.).
 * - Phase 1 preview selector retired / hidden behind an optional dev tools toggle.
 */

import { useState } from 'react'
import { SIGNAL_PHASES } from '../simulation/sceneFixture.js'

export function SignalLegend({ currentPhaseName, signals, onManualPhaseOverride }) {
  const [showDevOverride, setShowDevOverride] = useState(false)
  const phases = Object.entries(SIGNAL_PHASES)

  return (
    <div className="signal-legend" role="region" aria-label="Signal State Machine">
      <div className="signal-legend__header">
        <div>
          <h3 className="section-title">Traffic Signals</h3>
          <span className="signal-legend__phase-text">
            {currentPhaseName || 'Controller Active'}
          </span>
        </div>
        <span className="badge badge--notice">State Machine (34s Cycle)</span>
      </div>

      {/* Live approach cards */}
      <div className="signal-legend__approaches" aria-label="Approach Signal Statuses">
        {['North', 'East', 'South', 'West'].map((appr) => {
          const color = signals?.[appr] || 'RED'

          return (
            <div key={appr} className="approach-card">
              <span className="approach-card__name">{appr}</span>
              <div className="approach-card__indicator">
                <span
                  className={`signal-dot signal-dot--${color.toLowerCase()}`}
                  aria-hidden="true"
                />
                <span className="approach-card__state-text">{color}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Dev preview toggle */}
      <div className="signal-legend__dev-bar">
        <label className="dev-toggle-label">
          <input
            type="checkbox"
            checked={showDevOverride}
            onChange={(e) => setShowDevOverride(e.target.checked)}
          />
          <span>Dev manual preview override</span>
        </label>
      </div>

      {showDevOverride && (
        <div className="signal-legend__selector">
          <div className="signal-legend__buttons" role="group" aria-label="Manual Phase Override">
            {phases.map(([key, config]) => (
              <button
                key={key}
                type="button"
                className="btn btn--pill"
                onClick={() => onManualPhaseOverride && onManualPhaseOverride(key)}
              >
                {config.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
