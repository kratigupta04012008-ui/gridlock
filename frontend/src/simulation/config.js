/**
 * GRID LOCK — Central Simulation & Physics Configuration
 *
 * All physical quantities are defined in SI units:
 * - Length / Distance: meters (m)
 * - Time: seconds (s)
 * - Velocity: m/s
 * - Acceleration: m/s^2
 * - Jerk: m/s^3
 *
 * Drawing layers scale to pixels using PIXELS_PER_METER.
 */

export const PIXELS_PER_METER = 10.0

// Timestep: 50 Hz (0.02 s)
export const DT = 0.02

// Intersection Dimensions in Meters
export const WORLD_SIZE_METERS = 80.0
export const CENTER_METERS = 40.0

export const LANE_WIDTH_METERS = 3.8
export const NUM_LANES_PER_DIR = 2
export const ROAD_HALF_WIDTH_METERS = LANE_WIDTH_METERS * NUM_LANES_PER_DIR // 7.6 m
export const ROAD_WIDTH_METERS = ROAD_HALF_WIDTH_METERS * 2 // 15.2 m

// Center intersection box in meters
export const INTERSECTION_BOX_METERS = Object.freeze({
  left: CENTER_METERS - ROAD_HALF_WIDTH_METERS, // 32.4 m
  right: CENTER_METERS + ROAD_HALF_WIDTH_METERS, // 47.6 m
  top: CENTER_METERS - ROAD_HALF_WIDTH_METERS, // 32.4 m
  bottom: CENTER_METERS + ROAD_HALF_WIDTH_METERS, // 47.6 m
  width: ROAD_WIDTH_METERS, // 15.2 m
  height: ROAD_WIDTH_METERS, // 15.2 m
})

// Stop Lines in Meters
export const STOP_LINES_METERS = Object.freeze({
  North: {
    y: INTERSECTION_BOX_METERS.top, // 32.4 m
    x1: INTERSECTION_BOX_METERS.left, // 32.4 m
    x2: CENTER_METERS, // 40.0 m
  },
  South: {
    y: INTERSECTION_BOX_METERS.bottom, // 47.6 m
    x1: CENTER_METERS, // 40.0 m
    x2: INTERSECTION_BOX_METERS.right, // 47.6 m
  },
  East: {
    x: INTERSECTION_BOX_METERS.right, // 47.6 m
    y1: INTERSECTION_BOX_METERS.top, // 32.4 m
    y2: CENTER_METERS, // 40.0 m
  },
  West: {
    x: INTERSECTION_BOX_METERS.left, // 32.4 m
    y1: CENTER_METERS, // 40.0 m
    y2: INTERSECTION_BOX_METERS.bottom, // 47.6 m
  },
})

// Vehicle Physical Limits & Defaults
export const VEHICLE_CONFIG = Object.freeze({
  length: 4.5, // meters (~45 px)
  width: 1.9, // meters (~19 px)
  maxVelocity: 13.5, // m/s (~48.6 km/h)
  maxAcceleration: 3.0, // m/s^2
  maxBraking: 8.0, // m/s^2
  jerkLimit: 8.0, // m/s^3
  waitingVelocityThreshold: 0.05, // m/s (below this is considered waiting for UI display)
})

// Signal Controller Timing (Seconds)
export const SIGNAL_TIMING = Object.freeze({
  greenDuration: 12.0, // 12 seconds
  yellowDuration: 3.0, // 3 seconds
  allRedDuration: 2.0, // 2 seconds
  // Total cycle = 12 + 3 + 2 + 12 + 3 + 2 = 34 seconds (1700 steps at 50 Hz)
})

// Collision Detection
export const COLLISION_CONFIG = Object.freeze({
  contactEpsilon: 0.01, // 1 cm penetration required for contact
  haltOnCollisionDefault: false,
})
