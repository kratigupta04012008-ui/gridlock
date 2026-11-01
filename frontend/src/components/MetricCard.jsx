/**
 * GRID LOCK — Metric Card Component
 *
 * Displays a single HUD statistic with honest reporting:
 * - If not available/connected, shows "—" or "Not connected" with explanation
 * - Uses tabular figures for numbers
 */

export function MetricCard({ label, value, caption, badge, isAlert = false }) {
  return (
    <div className={`metric-card ${isAlert ? 'metric-card--alert' : ''}`}>
      <div className="metric-card__header">
        <span className="metric-card__label">{label}</span>
        {badge && <span className="metric-card__badge">{badge}</span>}
      </div>
      <div className="metric-card__value">{value}</div>
      {caption && <div className="metric-card__caption">{caption}</div>}
    </div>
  )
}
