/**
 * GRID LOCK — Rear Sensor
 *
 * Detects the nearest vehicle in the rearward corridor (~1 lane wide) behind the ego rear bumper.
 * Reports bumper-to-bumper gap (clamped at 0 on contact) and relative velocity (rate of change of gap).
 *
 * Relative velocity sign convention:
 * - Negative = closing (trailing vehicle catching up, gap shrinking).
 * - Positive = opening (ego pulling away, gap growing).
 * Returns null if no vehicle is detected within max range.
 */

import { VEHICLE_CONFIG } from '../simulation/config.js'
import { SENSOR_CONFIG, roundSensorValue } from './sensorConfig.js'
import { getTargetCornersInEgoBody, normalizeVehicleMeters } from './bodyFrame.js'

const VEHICLE_LENGTH = VEHICLE_CONFIG.lengthMeters || 4.5

/**
 * Computes the rear sensor reading for egoVehicle against all active vehicles.
 * Returns { distance: number, relativeVelocity: number } or null.
 */
export function computeRearSensor(ego, activeVehicles) {
  const egoNorm = normalizeVehicleMeters(ego)
  const halfL = (egoNorm.length || VEHICLE_LENGTH) / 2
  const halfCorridor = SENSOR_CONFIG.REAR_CORRIDOR_WIDTH / 2
  const maxRange = SENSOR_CONFIG.REAR_MAX_RANGE

  let nearestTarget = null
  let minGap = Infinity

  for (const target of activeVehicles) {
    if (target.id === ego.id || target.status === 'cleared') continue

    const corners = getTargetCornersInEgoBody(target, ego)

    // Check if target has any presence in the lateral corridor [-halfCorridor, +halfCorridor]
    let yMin = Infinity
    let yMax = -Infinity
    for (const pt of corners) {
      if (pt.y < yMin) yMin = pt.y
      if (pt.y > yMax) yMax = pt.y
    }

    // If completely outside the corridor laterally, skip
    if (yMax < -halfCorridor || yMin > halfCorridor) continue

    // Find closest longitudinal point of target behind ego inside corridor with x <= -halfL
    const xCandidates = []

    // 1. Check all corners that fall inside the corridor
    for (const pt of corners) {
      if (pt.y >= -halfCorridor && pt.y <= halfCorridor) {
        if (pt.x <= -halfL + 0.1) {
          xCandidates.push(pt.x)
        }
      }
    }

    // 2. Check intersections of target edges with corridor lateral boundaries
    for (let i = 0; i < 4; i++) {
      const p1 = corners[i]
      const p2 = corners[(i + 1) % 4]

      for (const yBound of [-halfCorridor, halfCorridor]) {
        if ((p1.y <= yBound && p2.y >= yBound) || (p2.y <= yBound && p1.y >= yBound)) {
          if (Math.abs(p2.y - p1.y) > 1e-6) {
            const t = (yBound - p1.y) / (p2.y - p1.y)
            const xInt = p1.x + t * (p2.x - p1.x)
            if (xInt <= -halfL + 0.1) {
              xCandidates.push(xInt)
            }
          }
        }
      }
    }

    // 3. Check if target penetrates rear bumper segment (contact condition)
    let hasContact = false
    for (const pt of corners) {
      if (
        pt.x > -halfL &&
        pt.y >= -halfCorridor &&
        pt.y <= halfCorridor &&
        yMin <= halfCorridor &&
        yMax >= -halfCorridor
      ) {
        hasContact = true
        break
      }
    }

    if (xCandidates.length === 0 && !hasContact) continue

    const closestX = hasContact ? -halfL : Math.max(...xCandidates)
    const gap = Math.max(0.0, -halfL - closestX)

    if (gap <= maxRange && gap < minGap) {
      minGap = gap
      nearestTarget = target
    }
  }

  if (!nearestTarget || minGap === Infinity) {
    return null
  }

  // Relative velocity behind ego = v_ego - (v_target * cos(theta_target - theta_ego))
  // Negative = closing (trailing vehicle faster, gap shrinking), Positive = opening (gap growing)
  const headingDiff = nearestTarget.heading - ego.heading
  const targetProjectedV = nearestTarget.velocity * Math.cos(headingDiff)
  const relativeVelocity = ego.velocity - targetProjectedV

  return {
    distance: roundSensorValue(minGap, SENSOR_CONFIG.DISTANCE_DECIMALS),
    relativeVelocity: roundSensorValue(relativeVelocity, SENSOR_CONFIG.VELOCITY_DECIMALS),
  }
}
