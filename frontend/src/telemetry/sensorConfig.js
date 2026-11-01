/**
 * GRID LOCK — Sensor Configuration
 *
 * Physical sensor parameters defining detection regions, ranges, and rounding precision.
 * Units: meters (distance), m/s (velocity).
 */

export const SENSOR_CONFIG = Object.freeze({
  // Forward sensor: 1-lane corridor ahead of ego front bumper
  FRONT_MAX_RANGE: 40.0, // meters
  FRONT_CORRIDOR_WIDTH: 3.5, // meters (~1 standard lane width)

  // Rear sensor: 1-lane corridor behind ego rear bumper
  REAR_MAX_RANGE: 30.0, // meters
  REAR_CORRIDOR_WIDTH: 3.5, // meters (~1 standard lane width)

  // Side sensors: adjacent lane clearance with blind-spot longitudinal margin
  SIDE_MAX_RANGE: 3.5, // meters (~1 adjacent lane width)
  SIDE_LONGITUDINAL_MARGIN: 0.5, // meters beyond front/rear bumper for blind spot

  // Signal sensor: approach signal range (covers queue length)
  SIGNAL_MAX_RANGE: 60.0, // meters

  // Rounding precision: 0.1 m and 0.1 m/s
  DISTANCE_DECIMALS: 1,
  VELOCITY_DECIMALS: 1,
})

/**
 * Rounds a finite number to configured decimal places.
 * Throws if the value is NaN or infinite to prevent silent conversion to null during JSON serialization.
 */
export function roundSensorValue(value, decimals = 1) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Non-finite sensor value encountered: ${value}`)
  }
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}
