/**
 * GRID LOCK — Deterministic Simulation Engine
 *
 * Requirements:
 * - Pure JavaScript: No Canvas, DOM, React, Date.now(), or Math.random().
 * - Fixed timestep dt = 0.02s.
 * - Exact kinematics, OBB collision detection, signal state machine.
 * - External action interface: engine.applyActions(actions).
 */

import { DT, PIXELS_PER_METER } from './config.js'
import { createPRNG } from './prng.js'
import { createInitialFleet, stepVehicle } from './vehicle.js'
import { createCollisionDetector } from './collisionDetector.js'
import { getAllSignals, getPhaseKey, getPhaseName } from './signalController.js'
import { validateCarAction } from '../contracts/schemas.js'

/**
 * Creates a deterministic traffic simulation engine.
 *
 * @param {object} customConfig - Optional engine configuration overrides
 * @returns {object} Simulation engine instance
 */
export function createEngine(customConfig = {}) {
  const seed = customConfig.seed !== undefined ? customConfig.seed : 42
  const haltOnCollision = customConfig.haltOnCollision || false

  let prng = createPRNG(seed)
  let stepCounter = 0
  let vehicles = createInitialFleet(prng)
  let collisionDetector = createCollisionDetector()

  // Track vehicles map by ID for O(1) lookup
  let vehicleMap = new Map(vehicles.map((v) => [v.id, v]))

  return {
    /**
     * Advances simulation by exactly one fixed timestep dt.
     */
    step() {
      stepCounter++

      // 1. Advance physics for each vehicle
      for (const vehicle of vehicles) {
        stepVehicle(vehicle, DT)
      }

      // 2. Perform Separating Axis Theorem (SAT) collision detection
      const collisionResult = collisionDetector.detectCollisions(vehicles)

      // Optional halt on collision for inspection
      if (haltOnCollision && collisionResult.hasCollisions) {
        return {
          halted: true,
          collisionResult,
        }
      }

      return {
        halted: false,
        collisionResult,
      }
    },

    /**
     * Applies commanded actions to vehicles from external controllers.
     * Validates action format; holds last action until new action arrives.
     *
     * @param {Array<object>} actions - Array of { id, action, intensity|throttle }
     * @returns {{ accepted: Array, rejected: Array }}
     */
    applyActions(actions) {
      const accepted = []
      const rejected = []

      if (!Array.isArray(actions)) {
        return { accepted: [], rejected: [{ error: 'Actions must be an array' }] }
      }

      for (const rawAction of actions) {
        const actionObj = {
          id: rawAction.id,
          action: rawAction.action,
          throttle: rawAction.throttle,
          intensity: rawAction.intensity,
        }

        const valRes = validateCarAction(actionObj)
        if (!valRes.valid) {
          rejected.push({ action: rawAction, reason: valRes.error })
          continue
        }

        const vehicle = vehicleMap.get(actionObj.id)
        if (!vehicle) {
          rejected.push({ action: rawAction, reason: `Unknown vehicle id ${actionObj.id}` })
          continue
        }

        if (vehicle.status === 'cleared') {
          rejected.push({ action: rawAction, reason: `Vehicle ${actionObj.id} is already cleared` })
          continue
        }

        // Map action to target acceleration in m/s^2
        let targetAcc = 0.0
        const magnitude =
          actionObj.throttle !== undefined ? actionObj.throttle : actionObj.intensity
        if (actionObj.action === 'ACCELERATE') {
          targetAcc = (magnitude !== undefined ? magnitude : 1.0) * vehicle.maxAcceleration
        } else if (actionObj.action === 'BRAKE') {
          targetAcc = -(magnitude !== undefined ? magnitude : 1.0) * vehicle.maxBraking
        } else if (actionObj.action === 'MAINTAIN') {
          targetAcc = 0.0
        }

        vehicle.targetAcceleration = targetAcc
        vehicle.lastAction = {
          action: actionObj.action,
          throttle: actionObj.throttle,
          intensity: actionObj.intensity,
        }

        accepted.push(actionObj)
      }

      return { accepted, rejected }
    },

    /**
     * Returns an immutable scene snapshot scaled for canvas rendering.
     */
    getSnapshot() {
      const simTime = stepCounter * DT
      const signals = getAllSignals(stepCounter)
      const phaseKey = getPhaseKey(stepCounter)
      const phaseName = getPhaseName(stepCounter)

      // Transform vehicles to rendering format (meters -> pixels)
      const renderVehicles = vehicles.map((v) => ({
        id: v.id,
        approach: v.approach,
        lane: v.lane,
        laneName: v.laneName,
        movement: v.movement,

        // Pixel-scaled coordinates for canvas
        x: v.x * PIXELS_PER_METER,
        y: v.y * PIXELS_PER_METER,
        width: v.width * PIXELS_PER_METER,
        length: v.length * PIXELS_PER_METER,
        heading: v.heading,
        headingText: `${v.approach} (${v.movement})`,

        // Live kinematic telemetry
        velocity: v.velocity,
        acceleration: v.acceleration,
        targetAcceleration: v.targetAcceleration,
        distanceToStopLine: v.distanceToStopLine,

        // Status flags
        status: v.status,
        inCollision: v.inCollision,
        collisionEvents: v.collisionEvents,
        lastAction: v.lastAction,

        // Presentation
        color: v.color,
      }))

      return Object.freeze({
        timestamp: simTime,
        step: stepCounter,
        phaseKey,
        phaseName,
        signals,
        vehicles: Object.freeze(renderVehicles),
      })
    },

    /**
     * Returns live simulation metrics.
     */
    getMetrics() {
      const collisionMetrics = collisionDetector.getMetrics()

      let clearedTotal = 0
      let clearedClean = 0
      let active = 0
      let waiting = 0

      for (const v of vehicles) {
        if (v.status === 'cleared') {
          clearedTotal++
          if (!v.collisionEvents || v.collisionEvents === 0) {
            clearedClean++
          }
        } else if (v.status === 'active') {
          active++
        } else if (v.status === 'waiting') {
          waiting++
        }
      }

      return {
        collisions: collisionMetrics.totalCollisions,
        activeCollidingPairs: collisionMetrics.activeCollidingPairsCount,
        clearedTotal,
        clearedClean,
        active,
        waiting,
        simTime: stepCounter * DT,
        step: stepCounter,
      }
    },

    /**
     * Resets the simulation engine state.
     */
    reset(newSeed = seed) {
      prng.reset(newSeed)
      stepCounter = 0
      vehicles = createInitialFleet(prng)
      vehicleMap = new Map(vehicles.map((v) => [v.id, v]))
      collisionDetector.reset()
    },
  }
}
