/**
 * GRID LOCK — Signal Sensor
 *
 * Computes the state of the traffic signal governing the vehicle's approach and the distance
 * from the ego front bumper to the approach stop line along the road.
 *
 * Rules:
 * - Distance is measured from ego front bumper to the stop line in meters.
 * - If the front bumper has crossed the stop line (distance < 0), returns null.
 * - If distance > SIGNAL_MAX_RANGE (60m), returns null.
 * - If no signal governs the vehicle or vehicle is cleared, returns null.
 */

import { VEHICLE_CONFIG, STOP_LINES_METERS } from '../simulation/config.js'
import { getSignalFor } from '../simulation/signalController.js'
import { SENSOR_CONFIG, roundSensorValue } from './sensorConfig.js'
import { normalizeVehicleMeters } from './bodyFrame.js'

const VEHICLE_LENGTH = VEHICLE_CONFIG.lengthMeters || 4.5

// Stop line positions in meters (world size 80m x 80m)
const STOP_LINES = Object.freeze({
  North: STOP_LINES_METERS.North.y, // 32.4m
  South: STOP_LINES_METERS.South.y, // 47.6m
  East: STOP_LINES_METERS.East.x, // 47.6m
  West: STOP_LINES_METERS.West.x, // 32.4m
})

/**
 * Computes signal sensor reading for ego vehicle at the given simulation step.
 * Returns { state: 'RED'|'YELLOW'|'GREEN', distanceToStopLine: number } or null.
 */
export function computeSignalSensor(ego, step) {
  if (!ego.approach || ego.status === 'cleared') return null

  const egoNorm = normalizeVehicleMeters(ego)
  const halfL = (egoNorm.length || VEHICLE_LENGTH) / 2
  let distToStopLine = null

  switch (egoNorm.approach) {
    case 'North': {
      // Vehicles move south (+y). Front bumper is at y + halfL.
      const frontY = egoNorm.y + halfL
      distToStopLine = STOP_LINES.North - frontY
      break
    }
    case 'South': {
      // Vehicles move north (-y). Front bumper is at y - halfL.
      const frontY = egoNorm.y - halfL
      distToStopLine = frontY - STOP_LINES.South
      break
    }
    case 'East': {
      // Vehicles move west (-x). Front bumper is at x - halfL.
      const frontX = egoNorm.x - halfL
      distToStopLine = frontX - STOP_LINES.East
      break
    }
    case 'West': {
      // Vehicles move east (+x). Front bumper is at x + halfL.
      const frontX = egoNorm.x + halfL
      distToStopLine = STOP_LINES.West - frontX
      break
    }
    default:
      return null
  }

  // Once front bumper has crossed stop line, signal field is null
  if (distToStopLine < 0) return null

  // If beyond max signal range, signal field is null
  if (distToStopLine > SENSOR_CONFIG.SIGNAL_MAX_RANGE) return null

  const state = getSignalFor(ego.approach, step)

  return {
    state,
    distanceToStopLine: roundSensorValue(distToStopLine, SENSOR_CONFIG.DISTANCE_DECIMALS),
  }
}
