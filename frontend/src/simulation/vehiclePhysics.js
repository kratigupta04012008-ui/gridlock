/**
 * GRID LOCK — Vehicle Kinematics & Analytical Integration
 *
 * Implements piecewise-constant acceleration with analytical boundary clipping:
 * - Speed cannot go negative (no reverse rolling)
 * - Speed cannot exceed maxVelocity
 * - Jerk limit restricts change in acceleration per timestep dt
 * - Exact integration of displacement deltaS
 */

/**
 * Updates acceleration toward targetAcceleration bounded by jerkLimit * dt.
 */
export function updateAccelerationWithJerk(currentAcc, targetAcc, jerkLimit, dt) {
  const maxDeltaA = jerkLimit * dt
  const deltaA = targetAcc - currentAcc
  const clampedDeltaA = Math.max(-maxDeltaA, Math.min(deltaA, maxDeltaA))
  return currentAcc + clampedDeltaA
}

/**
 * Performs exact analytical kinematic integration over timestep dt.
 *
 * @param {number} v0 - Initial velocity (m/s), v0 >= 0
 * @param {number} a - Commanded acceleration for this step (m/s^2)
 * @param {number} maxVel - Maximum velocity limit (m/s)
 * @param {number} dt - Timestep duration (s)
 * @returns {{ deltaS: number, newVelocity: number, newAcceleration: number }}
 */
export function integrateKinematics(v0, a, maxVel, dt) {
  // Case 1: Coasting (zero acceleration)
  if (Math.abs(a) < 1e-9) {
    const deltaS = v0 * dt
    return {
      deltaS,
      newVelocity: v0,
      newAcceleration: 0,
    }
  }

  // Case 2: Braking / Decelerating (a < 0)
  if (a < 0) {
    const decel = -a
    const timeToStop = v0 / decel

    // Vehicle stops mid-step
    if (timeToStop < dt) {
      const deltaS = (v0 * v0) / (2 * decel)
      return {
        deltaS: Math.max(0, deltaS),
        newVelocity: 0,
        newAcceleration: 0,
      }
    }

    // Vehicle decelerates throughout the entire step
    const deltaS = v0 * dt + 0.5 * a * dt * dt
    const newVelocity = Math.max(0, v0 + a * dt)
    return {
      deltaS: Math.max(0, deltaS),
      newVelocity,
      newAcceleration: a,
    }
  }

  // Case 3: Accelerating (a > 0)
  const timeToMax = (maxVel - v0) / a

  // Vehicle reaches max velocity mid-step
  if (timeToMax < dt && timeToMax >= 0) {
    const distDuringAcc = v0 * timeToMax + 0.5 * a * timeToMax * timeToMax
    const timeAtMax = dt - timeToMax
    const distAtMax = maxVel * timeAtMax
    const deltaS = distDuringAcc + distAtMax

    return {
      deltaS: Math.max(0, deltaS),
      newVelocity: maxVel,
      newAcceleration: 0,
    }
  }

  // Vehicle accelerates throughout the entire step
  const deltaS = v0 * dt + 0.5 * a * dt * dt
  const newVelocity = Math.min(maxVel, v0 + a * dt)
  return {
    deltaS: Math.max(0, deltaS),
    newVelocity,
    newAcceleration: a,
  }
}
