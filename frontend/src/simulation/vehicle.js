/**
 * GRID LOCK — Vehicle Entity & State Management
 *
 * All coordinates and metrics are in SI units (meters, seconds, radians).
 */

import { VEHICLE_CONFIG, DT } from './config.js'
import { getPath } from './paths.js'
import { updateAccelerationWithJerk, integrateKinematics } from './vehiclePhysics.js'
import { VEHICLE_PALETTE } from './sceneFixture.js'

/**
 * Creates initial fleet of 20 vehicles.
 *
 * @param {object} prng - Seeded PRNG instance
 * @returns {Array<object>} Initial vehicles array
 */
export function createInitialFleet(prng) {
  const vehicles = []

  // Spacing in meters
  const stopBuffer = 1.5 // 1.5 meters behind stop line
  const carLength = VEHICLE_CONFIG.length // 4.5 m
  const carWidth = VEHICLE_CONFIG.width // 1.9 m
  const centerToCenter = carLength + 1.8 // 6.3 m (1.8m gap)

  const approaches = ['North', 'East', 'South', 'West']

  approaches.forEach((approach, appIdx) => {
    const baseId = appIdx * 5

    // Movement configuration for the 5 cars per approach:
    // Lane 0: car 0 (left turn), car 1 (straight), car 2 (straight)
    // Lane 1: car 3 (right turn), car 4 (straight)
    const configs = [
      { id: baseId + 0, lane: 0, movement: 'left', laneIndex: 0 },
      { id: baseId + 1, lane: 0, movement: 'straight', laneIndex: 1 },
      { id: baseId + 2, lane: 0, movement: 'straight', laneIndex: 2 },
      { id: baseId + 3, lane: 1, movement: 'right', laneIndex: 0 },
      { id: baseId + 4, lane: 1, movement: 'straight', laneIndex: 1 },
    ]

    for (const cfg of configs) {
      const path = getPath(approach, cfg.lane, cfg.movement)

      // Initial s so front bumper is behind stop line
      // Front bumper is at s + carLength / 2
      // We want: s + carLength / 2 <= path.stopLineS - stopBuffer
      // sFirst = path.stopLineS - stopBuffer - carLength / 2
      const sFirst = path.stopLineS - stopBuffer - carLength / 2
      const s0 = Math.max(0, sFirst - cfg.laneIndex * centerToCenter)

      const pose = path.getPoseAt(s0)

      // Slight deterministic variation in max velocity (e.g. 13.0 to 14.0 m/s)
      const maxVelVariation = prng ? prng.nextRange(-0.5, 0.5) : 0
      const maxVelocity = VEHICLE_CONFIG.maxVelocity + maxVelVariation

      vehicles.push({
        id: cfg.id,
        approach,
        lane: cfg.lane,
        laneName: cfg.lane === 0 ? 'Inner (Left)' : 'Outer (Right)',
        movement: cfg.movement,
        path,

        // Geometry & limits in meters
        length: carLength,
        width: carWidth,
        maxVelocity,
        maxAcceleration: VEHICLE_CONFIG.maxAcceleration,
        maxBraking: VEHICLE_CONFIG.maxBraking,
        jerkLimit: VEHICLE_CONFIG.jerkLimit,

        // Dynamic kinematics
        s: s0,
        x: pose.x,
        y: pose.y,
        heading: pose.heading,
        velocity: 0.0,
        acceleration: 0.0,
        targetAcceleration: 0.0,

        // Status & telemetry
        status: 'waiting', // 'waiting' | 'active' | 'cleared'
        inCollision: false,
        collisionEvents: 0,
        distanceToStopLine: pose.distanceToStopLine,
        isInsideIntersection: pose.isInsideIntersection,

        // Actions
        lastAction: { action: 'MAINTAIN', intensity: 0 },

        // Presentation
        color: VEHICLE_PALETTE[cfg.id % VEHICLE_PALETTE.length],
      })
    }
  })

  return vehicles
}

/**
 * Updates a vehicle's physics and progress along its path for one timestep dt.
 */
export function stepVehicle(vehicle, dt = DT) {
  if (vehicle.status === 'cleared') return

  // 1. Advance acceleration toward targetAcceleration bounded by jerk limit
  vehicle.acceleration = updateAccelerationWithJerk(
    vehicle.acceleration,
    vehicle.targetAcceleration,
    vehicle.jerkLimit,
    dt
  )

  // 2. Exact analytical integration of kinematics
  const { deltaS, newVelocity, newAcceleration } = integrateKinematics(
    vehicle.velocity,
    vehicle.acceleration,
    vehicle.maxVelocity,
    dt
  )

  vehicle.velocity = newVelocity
  vehicle.acceleration = newAcceleration
  vehicle.s += deltaS

  // 3. Update spatial position and heading from path
  const pose = vehicle.path.getPoseAt(vehicle.s)
  vehicle.x = pose.x
  vehicle.y = pose.y
  vehicle.heading = pose.heading
  vehicle.distanceToStopLine = pose.distanceToStopLine
  vehicle.isInsideIntersection = pose.isInsideIntersection

  // 4. Check if cleared (rear bumper passes exit line)
  const rearBumperS = vehicle.s - vehicle.length / 2
  if (rearBumperS >= vehicle.path.exitLineS) {
    vehicle.status = 'cleared'
    return
  }

  // 5. Update waiting vs active status
  if (vehicle.velocity < VEHICLE_CONFIG.waitingVelocityThreshold && !vehicle.isInsideIntersection) {
    vehicle.status = 'waiting'
  } else {
    vehicle.status = 'active'
  }
}
