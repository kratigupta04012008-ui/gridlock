/**
 * GRID LOCK — Side Sensors
 *
 * Computes lateral side-to-side clearance in meters to the nearest vehicle in left and right zones.
 * Covers a lateral band of ~1 lane width (3.5m) and a longitudinal window covering ego body
 * plus a small blind-spot margin (0.5m).
 *
 * Returns { left: number | null, right: number | null }.
 */

import { VEHICLE_CONFIG } from '../simulation/config.js'
import { SENSOR_CONFIG, roundSensorValue } from './sensorConfig.js'
import { getTargetCornersInEgoBody, normalizeVehicleMeters } from './bodyFrame.js'

const VEHICLE_LENGTH = VEHICLE_CONFIG.lengthMeters || 4.5
const VEHICLE_WIDTH = VEHICLE_CONFIG.widthMeters || 1.9

/**
 * Computes side sensor readings (left and right lateral clearance) for egoVehicle.
 */
export function computeSideSensors(ego, activeVehicles) {
  const egoNorm = normalizeVehicleMeters(ego)
  const halfL = (egoNorm.length || VEHICLE_LENGTH) / 2
  const halfW = (egoNorm.width || VEHICLE_WIDTH) / 2
  const margin = SENSOR_CONFIG.SIDE_LONGITUDINAL_MARGIN
  const maxRange = SENSOR_CONFIG.SIDE_MAX_RANGE

  const xMinWindow = -halfL - margin // -2.75m
  const xMaxWindow = halfL + margin // +2.75m

  let minLeftClearance = Infinity
  let minRightClearance = Infinity

  for (const target of activeVehicles) {
    if (target.id === ego.id || target.status === 'cleared') continue

    const corners = getTargetCornersInEgoBody(target, ego)

    // Check if target overlaps the longitudinal window [xMinWindow, xMaxWindow]
    let targetXMin = Infinity
    let targetXMax = -Infinity
    for (const pt of corners) {
      if (pt.x < targetXMin) targetXMin = pt.x
      if (pt.x > targetXMax) targetXMax = pt.x
    }

    if (targetXMax < xMinWindow || targetXMin > xMaxWindow) continue

    // Find all target boundary points within the longitudinal window
    const windowPoints = []

    // 1. Vertices inside the longitudinal window
    for (const pt of corners) {
      if (pt.x >= xMinWindow && pt.x <= xMaxWindow) {
        windowPoints.push(pt)
      }
    }

    // 2. Intersections of target edges with longitudinal boundaries xMinWindow, xMaxWindow
    for (let i = 0; i < 4; i++) {
      const p1 = corners[i]
      const p2 = corners[(i + 1) % 4]

      for (const xBound of [xMinWindow, xMaxWindow]) {
        if ((p1.x <= xBound && p2.x >= xBound) || (p2.x <= xBound && p1.x >= xBound)) {
          if (Math.abs(p2.x - p1.x) > 1e-6) {
            const t = (xBound - p1.x) / (p2.x - p1.x)
            const yInt = p1.y + t * (p2.y - p1.y)
            windowPoints.push({ x: xBound, y: yInt })
          }
        }
      }
    }

    if (windowPoints.length === 0) continue

    // Evaluate Left clearance (y >= halfW, band up to halfW + maxRange)
    const leftCandidates = windowPoints.filter((pt) => pt.y >= halfW - 0.05)
    if (leftCandidates.length > 0) {
      const closestY = Math.min(...leftCandidates.map((pt) => pt.y))
      const clearance = Math.max(0.0, closestY - halfW)
      if (clearance <= maxRange && clearance < minLeftClearance) {
        minLeftClearance = clearance
      }
    }

    // Evaluate Right clearance (y <= -halfW, band down to -halfW - maxRange)
    const rightCandidates = windowPoints.filter((pt) => pt.y <= -halfW + 0.05)
    if (rightCandidates.length > 0) {
      const closestY = Math.max(...rightCandidates.map((pt) => pt.y))
      const clearance = Math.max(0.0, -halfW - closestY)
      if (clearance <= maxRange && clearance < minRightClearance) {
        minRightClearance = clearance
      }
    }
  }

  const left =
    minLeftClearance !== Infinity
      ? roundSensorValue(minLeftClearance, SENSOR_CONFIG.DISTANCE_DECIMALS)
      : null
  const right =
    minRightClearance !== Infinity
      ? roundSensorValue(minRightClearance, SENSOR_CONFIG.DISTANCE_DECIMALS)
      : null

  return { left, right }
}
