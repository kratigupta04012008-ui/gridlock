/**
 * GRID LOCK — Local Telemetry Builder
 *
 * Constructs strict local telemetry reports for active vehicles.
 *
 * NON-NEGOTIABLE SECURITY RULES:
 * 1. Explicit object construction only: NEVER spread (...obj) or Object.assign internal vehicle state.
 * 2. Exactly allowed fields: id, front, rear, side, signal.
 * 3. Pure function: Never mutates snapshot or consumes PRNG draws.
 * 4. Deterministic: Same snapshot yields identical telemetry reports.
 */

import { computeFrontSensor } from './frontSensor.js'
import { computeRearSensor } from './rearSensor.js'
import { computeSideSensors } from './sideSensors.js'
import { computeSignalSensor } from './signalSensor.js'

/**
 * Builds a strict local telemetry report for a single vehicle.
 * Returns null if the vehicle does not exist or has been cleared.
 *
 * @param {Object} snapshot - Read-only engine snapshot
 * @param {number|string} vehicleId - Target vehicle ID
 * @returns {Object|null} Permitted telemetry report or null
 */
export function buildLocalTelemetry(snapshot, vehicleId) {
  if (!snapshot || !Array.isArray(snapshot.vehicles)) {
    throw new Error('Invalid engine snapshot provided to buildLocalTelemetry')
  }

  const numericId = typeof vehicleId === 'number' ? vehicleId : parseInt(vehicleId, 10)
  const ego = snapshot.vehicles.find((v) => v.id === numericId)

  if (!ego || ego.status === 'cleared') {
    return null
  }

  const activeVehicles = snapshot.vehicles.filter((v) => v.status !== 'cleared')
  const step = snapshot.step || 0

  // Explicit literal construction: no spreading (...ego) allowed
  const report = {
    id: numericId,
    front: computeFrontSensor(ego, activeVehicles),
    rear: computeRearSensor(ego, activeVehicles),
    side: computeSideSensors(ego, activeVehicles),
    signal: computeSignalSensor(ego, step),
  }

  return report
}

/**
 * Builds a complete telemetry batch for all active vehicles, ordered by id ascending.
 *
 * @param {Object} snapshot - Read-only engine snapshot
 * @returns {Array<Object>} Array of vehicle telemetry reports
 */
export function buildTelemetryBatch(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.vehicles)) {
    throw new Error('Invalid engine snapshot provided to buildTelemetryBatch')
  }

  const activeVehicles = snapshot.vehicles
    .filter((v) => v.status !== 'cleared')
    .slice()
    .sort((a, b) => a.id - b.id)

  const batch = []
  for (const ego of activeVehicles) {
    const report = buildLocalTelemetry(snapshot, ego.id)
    if (report !== null) {
      batch.push(report)
    }
  }

  return batch
}
