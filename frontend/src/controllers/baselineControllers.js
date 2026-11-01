/**
 * GRID LOCK — Baseline Controllers (Non-AI Test Controllers)
 *
 * Honesty Rule: Nothing here is AI. These are simple deterministic baseline
 * controllers to verify engine dynamics, clearance, and collisions before Phase 4.
 */

/**
 * Controller 1: Coast / Maintain
 * Issues MAINTAIN for all vehicles (vehicles keep their current velocity or remain stationary).
 */
export function createCoastController() {
  return {
    name: 'Coast / Maintain (Baseline)',
    description: 'Issues MAINTAIN to all active vehicles.',
    getActions(snapshot) {
      return snapshot.vehicles
        .filter((v) => v.status !== 'cleared')
        .map((v) => ({
          id: v.id,
          action: 'MAINTAIN',
          intensity: 0.0,
        }))
    },
  }
}

/**
 * Controller 2: Constant Acceleration
 * Commands all active vehicles to accelerate at a fixed throttle.
 * Note: Vehicles will collide if paths cross! Useful for collision detector testing.
 */
export function createConstantAccelerationController(throttle = 0.5) {
  return {
    name: `Constant Accel (${Math.round(throttle * 100)}%)`,
    description: 'Commands all vehicles to accelerate without looking ahead.',
    getActions(snapshot) {
      return snapshot.vehicles
        .filter((v) => v.status !== 'cleared')
        .map((v) => ({
          id: v.id,
          action: 'ACCELERATE',
          intensity: throttle,
        }))
    },
  }
}

/**
 * Controller 3: Simple Signal & Stop Line Adherence Baseline
 * Simple heuristic:
 * - If signal is RED or YELLOW and approaching stop line (distance <= 12m), BRAKE.
 * - If signal is GREEN and at/behind stop line, ACCELERATE gently.
 * - Inside the box: ACCELERATE to clear the intersection quickly.
 */
export function createSimpleSignalBaselineController() {
  return {
    name: 'Rule-Based Signal Follower (Heuristic)',
    description: 'Simple rule-based heuristic that stops at red lights and crosses on green.',
    getActions(snapshot) {
      const actions = []

      for (const v of snapshot.vehicles) {
        if (v.status === 'cleared') continue

        const signalColor = snapshot.signals?.[v.approach] || 'RED'

        // If inside the intersection box, accelerate through
        if (v.distanceToStopLine <= 0) {
          actions.push({
            id: v.id,
            action: 'ACCELERATE',
            intensity: 0.6,
          })
          continue
        }

        // Approaching stop line
        if (signalColor === 'RED' || signalColor === 'YELLOW') {
          if (v.distanceToStopLine < 16.0) {
            // Apply braking intensity proportional to closeness
            const brakeIntensity = Math.min(1.0, 0.4 + (16.0 - v.distanceToStopLine) / 16.0)
            actions.push({
              id: v.id,
              action: 'BRAKE',
              intensity: brakeIntensity,
            })
          } else {
            actions.push({
              id: v.id,
              action: 'MAINTAIN',
              intensity: 0.0,
            })
          }
        } else {
          // Signal is GREEN
          actions.push({
            id: v.id,
            action: 'ACCELERATE',
            intensity: 0.5,
          })
        }
      }

      return actions
    },
  }
}
