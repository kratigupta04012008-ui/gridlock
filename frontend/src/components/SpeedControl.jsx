/**
 * GRID LOCK — Speed Control Component
 */

export function SpeedControl({ currentSpeed, onSpeedChange }) {
  const speeds = [0.5, 1, 2, 4]

  return (
    <div className="speed-control" role="group" aria-label="Simulation speed multiplier">
      <span className="control-label">Speed:</span>
      <div className="speed-control__buttons">
        {speeds.map((spd) => {
          const isActive = currentSpeed === spd
          return (
            <button
              key={spd}
              type="button"
              className={`btn btn--pill ${isActive ? 'btn--pill-active' : ''}`}
              onClick={() => onSpeedChange(spd)}
              aria-pressed={isActive}
              aria-label={`Set simulation speed to ${spd}x`}
            >
              {spd}x
            </button>
          )
        })}
      </div>
    </div>
  )
}
