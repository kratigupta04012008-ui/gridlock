/**
 * GRID LOCK — Hit Testing Engine
 *
 * Tests canvas world-coordinates against vehicle oriented bounding boxes.
 */

/**
 * Finds the vehicle under the world-space pointer position (worldX, worldY).
 *
 * @param {number} worldX - World X coordinate (0..800)
 * @param {number} worldY - World Y coordinate (0..800)
 * @param {Array} vehicles - Array of vehicles from scene snapshot
 * @param {number} hitPadding - Generous hit tolerance in pixels
 * @returns {object|null} Matched vehicle or null
 */
export function findVehicleAtPoint(worldX, worldY, vehicles, hitPadding = 4) {
  if (!vehicles || !vehicles.length) return null

  // Iterate in reverse order so top-rendered vehicles are picked first
  for (let i = vehicles.length - 1; i >= 0; i--) {
    const car = vehicles[i]
    if (isPointInsideVehicle(worldX, worldY, car, hitPadding)) {
      return car
    }
  }

  return null
}

/**
 * Checks if a world-space point falls inside an oriented vehicle box.
 */
export function isPointInsideVehicle(px, py, car, padding = 4) {
  const { x, y, width, length, heading } = car

  const dx = px - x
  const dy = py - y

  // Rotate point into vehicle's local frame
  const cos = Math.cos(-heading)
  const sin = Math.sin(-heading)

  const localX = dx * cos - dy * sin
  const localY = dx * sin + dy * cos

  const halfLen = length / 2 + padding
  const halfWid = width / 2 + padding

  return Math.abs(localX) <= halfLen && Math.abs(localY) <= halfWid
}
