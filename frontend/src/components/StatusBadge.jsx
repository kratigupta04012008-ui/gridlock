/**
 * GRID LOCK — Simulation Status Badge
 */

export function StatusBadge({ status }) {
  const isRunning = status === 'RUNNING'
  const isPaused = status === 'PAUSED'

  let badgeColor = 'var(--text-muted)'
  let dotColor = '#94a3b8'
  let label = 'Idle'

  if (isRunning) {
    badgeColor = '#34d399'
    dotColor = '#10b981'
    label = 'Running (Clock only)'
  } else if (isPaused) {
    badgeColor = '#fbbf24'
    dotColor = '#f59e0b'
    label = 'Paused'
  }

  return (
    <div
      className="status-badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        padding: '0.25rem 0.65rem',
        borderRadius: '9999px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid var(--border-subtle)',
        fontSize: '0.8125rem',
        fontWeight: 500,
        color: badgeColor,
      }}
      aria-label={`Simulation Status: ${label}`}
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: dotColor,
          boxShadow: isRunning ? `0 0 8px ${dotColor}` : 'none',
        }}
      />
      <span>{label}</span>
    </div>
  )
}
