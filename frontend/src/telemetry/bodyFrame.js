/**
 * GRID LOCK — Body Frame Transformations
 *
 * Mathematical utilities to project world-space geometry into a vehicle's local body frame.
 *
 * In the ego body frame:
 * - Origin (0, 0) is the ego vehicle center.
 * - +x_body is forward along the vehicle centerline (front bumper at +L/2).
 * - -x_body is backward along the vehicle centerline (rear bumper at -L/2).
 * - +y_body is lateral LEFT (left side at +W/2).
 * - -y_body is lateral RIGHT (right side at -W/2).
 */

import { VEHICLE_CONFIG, PIXELS_PER_METER } from '../simulation/config.js'

const VEHICLE_LENGTH = VEHICLE_CONFIG.lengthMeters || 4.5
const VEHICLE_WIDTH = VEHICLE_CONFIG.widthMeters || 1.9

/**
 * Normalizes vehicle coordinates to SI meters if passed in rendering pixel units.
 */
export function normalizeVehicleMeters(v) {
  if (!v) return v
  const isPixel =
    (v.width && v.width > 2.5) || (v.length && v.length > 5.5) || v.x > 80.0 || v.y > 80.0
  const scale = isPixel ? 1 / PIXELS_PER_METER : 1.0
  return {
    ...v,
    x: v.x * scale,
    y: v.y * scale,
    width: (v.width || VEHICLE_WIDTH) * scale,
    length: (v.length || VEHICLE_LENGTH) * scale,
  }
}

/**
 * Transforms a 2D world coordinate (x, y in meters) into ego body coordinates.
 */
export function worldToBody(worldPt, ego) {
  const egoNorm = normalizeVehicleMeters(ego)
  const dx = worldPt.x - egoNorm.x
  const dy = worldPt.y - egoNorm.y
  const cos = Math.cos(egoNorm.heading)
  const sin = Math.sin(egoNorm.heading)

  return {
    x: dx * cos + dy * sin, // Longitudinal (+ forward, - backward)
    y: dx * sin - dy * cos, // Lateral (+ left, - right)
  }
}

/**
 * Returns the 4 corners of a vehicle in world coordinates (meters).
 */
export function getVehicleCornersWorld(vehicle, length = VEHICLE_LENGTH, width = VEHICLE_WIDTH) {
  const norm = normalizeVehicleMeters(vehicle)
  const cos = Math.cos(norm.heading)
  const sin = Math.sin(norm.heading)
  const halfL = (norm.length || length) / 2
  const halfW = (norm.width || width) / 2

  // Unit forward: (cos, sin)
  // Unit left: (sin, -cos) in screen space (+x right, +y down)
  const uX = cos
  const uY = sin
  const vX = sin
  const vY = -cos

  return [
    // Front-Left
    { x: norm.x + halfL * uX + halfW * vX, y: norm.y + halfL * uY + halfW * vY },
    // Front-Right
    { x: norm.x + halfL * uX - halfW * vX, y: norm.y + halfL * uY - halfW * vY },
    // Rear-Right
    { x: norm.x - halfL * uX - halfW * vX, y: norm.y - halfL * uY - halfW * vY },
    // Rear-Left
    { x: norm.x - halfL * uX + halfW * vX, y: norm.y - halfL * uY + halfW * vY },
  ]
}

/**
 * Returns the 4 corners of a target vehicle transformed into ego's body frame (meters).
 */
export function getTargetCornersInEgoBody(target, ego) {
  const egoNorm = normalizeVehicleMeters(ego)
  const targetNorm = normalizeVehicleMeters(target)
  const worldCorners = getVehicleCornersWorld(targetNorm)
  return worldCorners.map((pt) => worldToBody(pt, egoNorm))
}
