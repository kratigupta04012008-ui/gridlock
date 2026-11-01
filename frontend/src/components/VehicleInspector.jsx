/**
 * GRID LOCK — Vehicle Inspector Panel (Phase 2: Live Dynamics)
 *
 * Displays live kinematic telemetry for selected vehicle:
 * - Speed (m/s and km/h)
 * - Acceleration (m/s^2) and target acceleration
 * - Path progress & distance to stop line (m)
 * - Movement intent (Straight, Left turn, Right turn)
 * - Collision status (live warning if in contact)
 * - Direct manual action buttons to test acceleration/braking
 */

export function VehicleInspector({ vehicle, onDeselect, onApplyManualAction }) {
  if (!vehicle) {
    return (
      <div
        className="vehicle-inspector vehicle-inspector--empty"
        role="region"
        aria-label="Vehicle Inspector"
      >
        <div className="vehicle-inspector__empty-state">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="m9 9 6 6" />
            <path d="m15 9-6 6" />
          </svg>
          <p className="empty-title">No Vehicle Selected</p>
          <p className="empty-subtitle">
            Click any vehicle on the canvas to inspect live velocity, acceleration, and path
            progress. Press <kbd>Esc</kbd> to deselect.
          </p>
        </div>
      </div>
    )
  }

  const speedKmh = ((vehicle.velocity || 0) * 3.6).toFixed(1)
  const speedMs = (vehicle.velocity || 0).toFixed(2)
  const accMs2 = (vehicle.acceleration || 0).toFixed(2)
  const distStop = (vehicle.distanceToStopLine || 0).toFixed(1)

  return (
    <div
      className={`vehicle-inspector ${vehicle.inCollision ? 'vehicle-inspector--collision' : ''}`}
      role="region"
      aria-label={`Inspector for Vehicle ${vehicle.id}`}
    >
      <div className="vehicle-inspector__header">
        <div className="vehicle-inspector__title-group">
          <span
            className="vehicle-color-swatch"
            style={{ backgroundColor: vehicle.color }}
            aria-hidden="true"
          />
          <div>
            <h3 className="section-title">Vehicle #{vehicle.id}</h3>
            <span className="badge badge--placeholder" style={{ fontSize: '0.6875rem' }}>
              Simulation internals (never sent to the LLM)
            </span>
          </div>
          {vehicle.inCollision && (
            <span className="badge badge--collision" role="alert">
              COLLISION
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onDeselect}
          aria-label="Deselect vehicle"
        >
          Deselect (Esc)
        </button>
      </div>

      <div className="vehicle-inspector__grid">
        <div className="inspector-row">
          <span className="inspector-key">Movement Intent</span>
          <span className="inspector-val">
            {vehicle.approach}bound → {vehicle.movement.toUpperCase()}
          </span>
        </div>
        <div className="inspector-row">
          <span className="inspector-key">Speed</span>
          <span className="inspector-val tabular-nums">
            {speedMs} m/s ({speedKmh} km/h)
          </span>
        </div>
        <div className="inspector-row">
          <span className="inspector-key">Acceleration</span>
          <span className="inspector-val tabular-nums">
            {accMs2} m/s² (Target: {(vehicle.targetAcceleration || 0).toFixed(1)})
          </span>
        </div>
        <div className="inspector-row">
          <span className="inspector-key">Dist to Stop Line</span>
          <span className="inspector-val tabular-nums">{distStop} m</span>
        </div>
        <div className="inspector-row">
          <span className="inspector-key">Engine Status</span>
          <span className={`inspector-val inspector-val--${vehicle.status}`}>
            {vehicle.status.toUpperCase()}
          </span>
        </div>
        <div className="inspector-row">
          <span className="inspector-key">Last Action Held</span>
          <span className="inspector-val font-mono">
            {vehicle.lastAction?.action} ({Math.round((vehicle.lastAction?.intensity || 0) * 100)}%)
          </span>
        </div>
      </div>

      {/* Manual Action Injection to test vehicle physics */}
      {onApplyManualAction && vehicle.status !== 'cleared' && (
        <div
          className="vehicle-inspector__actions"
          role="group"
          aria-label="Manual Action Override"
        >
          <span className="control-label">Manual Test Action:</span>
          <div className="inspector-action-buttons">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => onApplyManualAction(vehicle.id, 'ACCELERATE', 0.6)}
              title="Apply 60% throttle acceleration"
            >
              Accelerate (60%)
            </button>
            <button
              type="button"
              className="btn btn--sm btn--warning"
              onClick={() => onApplyManualAction(vehicle.id, 'BRAKE', 1.0)}
              title="Apply 100% braking deceleration"
            >
              Full Brake
            </button>
            <button
              type="button"
              className="btn btn--sm btn--secondary"
              onClick={() => onApplyManualAction(vehicle.id, 'MAINTAIN', 0.0)}
              title="Maintain / Coast"
            >
              Maintain
            </button>
          </div>
        </div>
      )}

      <div className="vehicle-inspector__contract-note" role="note">
        <div className="contract-badge">Phase 2 Physical Limits Enforced</div>
        <p>
          Acceleration is jerk-limited to 8.0 m/s³. Speed cannot go negative or exceed 13.5 m/s. No
          artificial collision avoidance is applied.
        </p>
      </div>
    </div>
  )
}
