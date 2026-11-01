/**
 * GRID LOCK — Telemetry Inspector Panel (Phase 3: Strict Local Telemetry)
 *
 * Displays the EXACT serialized telemetry payload produced by serializeTelemetryBatch:
 * - Single vehicle view (pretty-printed JSON)
 * - Full batch view with byte count and token estimates
 * - Live Ajv Draft-07 schema validation badge
 * - "Copy JSON" functionality
 * - Visible disclaimer: "Payload preview. LLM not connected; nothing is being sent."
 * - Throttled updates (4 Hz) to ensure simulation loop performance is unaffected.
 */

import { useState, useEffect, useMemo } from 'react'
import { buildLocalTelemetry, buildTelemetryBatch } from '../telemetry/buildLocalTelemetry.js'
import {
  serializeTelemetryBatch,
  serializeTelemetryReport,
  validateTelemetryBatch,
  validateTelemetryReport,
} from '../telemetry/serializeTelemetryBatch.js'

export function TelemetryInspector({
  snapshot,
  selectedVehicleId,
  showSensorZones,
  onToggleSensorZones,
}) {
  const [viewMode, setViewMode] = useState('selected') // 'selected' | 'batch'
  const [copied, setCopied] = useState(false)
  const [throttledSnapshot, setThrottledSnapshot] = useState(snapshot)

  // Throttle updates to ~4 Hz (250ms) so telemetry serialization never impacts the 60 FPS canvas loop
  useEffect(() => {
    const timer = setInterval(() => {
      setThrottledSnapshot(snapshot)
    }, 250)
    return () => clearInterval(timer)
  }, [snapshot])

  // Compute telemetry payload based on current view mode
  const { jsonString, isValid, errors, reportCount, byteSize, tokenEstimate } = useMemo(() => {
    if (!throttledSnapshot) {
      return {
        jsonString: '// No active simulation snapshot',
        isValid: true,
        errors: null,
        reportCount: 0,
        byteSize: 0,
        tokenEstimate: 0,
      }
    }

    if (viewMode === 'batch') {
      try {
        const batch = buildTelemetryBatch(throttledSnapshot)
        const validation = validateTelemetryBatch(batch)
        const json = serializeTelemetryBatch(batch, true)
        const bytes = new TextEncoder().encode(json).length
        const tokens = Math.ceil(json.length / 4)

        return {
          jsonString: json,
          isValid: validation.valid,
          errors: validation.errors,
          reportCount: batch.length,
          byteSize: bytes,
          tokenEstimate: tokens,
        }
      } catch (err) {
        return {
          jsonString: `// Serialization Error:\n${err.message}`,
          isValid: false,
          errors: [err.message],
          reportCount: 0,
          byteSize: 0,
          tokenEstimate: 0,
        }
      }
    } else {
      // Selected vehicle mode
      if (selectedVehicleId === null || selectedVehicleId === undefined) {
        return {
          jsonString: '// Select a vehicle on the canvas to inspect its local telemetry report',
          isValid: true,
          errors: null,
          reportCount: 0,
          byteSize: 0,
          tokenEstimate: 0,
        }
      }

      try {
        const report = buildLocalTelemetry(throttledSnapshot, selectedVehicleId)
        if (!report) {
          return {
            jsonString: `// Vehicle #${selectedVehicleId} has completed its route and cleared the intersection`,
            isValid: true,
            errors: null,
            reportCount: 0,
            byteSize: 0,
            tokenEstimate: 0,
          }
        }

        const validation = validateTelemetryReport(report)
        const json = serializeTelemetryReport(report, true)
        const bytes = new TextEncoder().encode(json).length
        const tokens = Math.ceil(json.length / 4)

        return {
          jsonString: json,
          isValid: validation.valid,
          errors: validation.errors,
          reportCount: 1,
          byteSize: bytes,
          tokenEstimate: tokens,
        }
      } catch (err) {
        return {
          jsonString: `// Serialization Error:\n${err.message}`,
          isValid: false,
          errors: [err.message],
          reportCount: 0,
          byteSize: 0,
          tokenEstimate: 0,
        }
      }
    }
  }, [throttledSnapshot, viewMode, selectedVehicleId])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      setCopied(false)
    }
  }

  return (
    <div className="telemetry-inspector" role="region" aria-label="Local Telemetry Inspector">
      <div className="telemetry-inspector__header">
        <div className="telemetry-inspector__title-box">
          <div className="telemetry-inspector__icon" aria-hidden="true">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div>
            <h3 className="section-title">Telemetry Payload (LLM Gate)</h3>
            <span className="telemetry-inspector__sub">
              Strict Local Sensors • No Global Coordinates
            </span>
          </div>
        </div>

        <div className="telemetry-inspector__badge-group">
          {isValid ? (
            <span
              className="badge badge--success"
              title="Complies with contracts/telemetry.schema.json"
            >
              Schema Valid (Ajv)
            </span>
          ) : (
            <span className="badge badge--collision" role="alert" title={errors?.join('; ')}>
              Schema Violation
            </span>
          )}
        </div>
      </div>

      <div className="telemetry-inspector__controls">
        <div className="telemetry-mode-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'selected'}
            className={`btn btn--pill ${viewMode === 'selected' ? 'btn--pill-active' : ''}`}
            onClick={() => setViewMode('selected')}
          >
            {selectedVehicleId !== null ? `Vehicle #${selectedVehicleId}` : 'Selected Vehicle'}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'batch'}
            className={`btn btn--pill ${viewMode === 'batch' ? 'btn--pill-active' : ''}`}
            onClick={() => setViewMode('batch')}
          >
            Full Batch (
            {throttledSnapshot?.vehicles?.filter((v) => v.status !== 'cleared').length || 0})
          </button>
        </div>

        <div className="telemetry-inspector__actions">
          {onToggleSensorZones && (
            <label
              className="sensor-toggle-label"
              title="Visualize detection corridors and zones on the canvas"
            >
              <input
                type="checkbox"
                checked={showSensorZones}
                onChange={(e) => onToggleSensorZones(e.target.checked)}
              />
              <span>Sensor Zones</span>
            </label>
          )}

          <button
            type="button"
            className="btn btn--sm btn--secondary"
            onClick={handleCopy}
            title="Copy exact JSON payload to clipboard"
          >
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      </div>

      {viewMode === 'batch' && (
        <div className="telemetry-inspector__stats" aria-label="Payload Statistics">
          <div className="stat-pill">
            <span className="stat-label">Reports:</span>
            <span className="stat-value tabular-nums">{reportCount}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">Payload Size:</span>
            <span className="stat-value tabular-nums">{byteSize} B</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">Est. LLM Tokens:</span>
            <span className="stat-value tabular-nums">~{tokenEstimate}</span>
          </div>
        </div>
      )}

      <div className="telemetry-inspector__viewer-container">
        <pre className="telemetry-json-viewer" tabIndex="0" aria-label="Serialized Telemetry JSON">
          <code>{jsonString}</code>
        </pre>
      </div>

      <div className="telemetry-inspector__disclaimer" role="note">
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
        <span>Payload preview. LLM not connected; nothing is being sent.</span>
      </div>
    </div>
  )
}
