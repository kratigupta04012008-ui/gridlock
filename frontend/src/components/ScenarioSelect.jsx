/**
 * GRID LOCK — Scenario Selector (Placeholder)
 *
 * Visibly labeled as a placeholder with disabled options for future phases.
 */

export function ScenarioSelect() {
  return (
    <div className="scenario-select" role="region" aria-label="Scenario Selection">
      <div className="scenario-select__header">
        <label htmlFor="scenario-dropdown" className="control-label">
          Traffic Scenario
        </label>
        <span className="badge badge--placeholder">Placeholder — Not implemented</span>
      </div>
      <select
        id="scenario-dropdown"
        className="scenario-select__dropdown"
        disabled
        aria-disabled="true"
        title="Scenarios are not implemented in Phase 1"
        defaultValue="default"
      >
        <option value="default">4-Way Symmetric Queue (Current Fixture)</option>
        <option value="rush-hour" disabled>
          Rush Hour Imbalance (Coming soon)
        </option>
        <option value="heavy-turn" disabled>
          Heavy Left-Turn Volume (Coming soon)
        </option>
        <option value="emergency" disabled>
          Emergency Vehicle Priority (Coming soon)
        </option>
      </select>
      <p className="scenario-select__help">
        Future phases will generate dynamic vehicle arrivals and demand distributions.
      </p>
    </div>
  )
}
