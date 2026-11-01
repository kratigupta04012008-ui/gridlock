/**
 * GRID LOCK — Collision Detector (Separating Axis Theorem)
 *
 * Implements exact OBB (Oriented Bounding Box) pairwise collision detection.
 * Measurement only: does not alter vehicle kinematics or position.
 * Tracks collision pair transitions (counted once upon entering contact).
 */

import { COLLISION_CONFIG } from './config.js'

/**
 * Computes the 4 corners of an Oriented Bounding Box in meters.
 */
export function getVehicleCorners(x, y, heading, length, width) {
  const cos = Math.cos(heading)
  const sin = Math.sin(heading)

  const halfL = length / 2
  const halfW = width / 2

  // Vector along vehicle length (forward)
  const dxL = cos * halfL
  const dyL = sin * halfL

  // Vector along vehicle width (perpendicular to length)
  const dxW = -sin * halfW
  const dyW = cos * halfW

  return [
    { x: x + dxL + dxW, y: y + dyL + dyW }, // Front-Right
    { x: x + dxL - dxW, y: y + dyL - dyW }, // Front-Left
    { x: x - dxL - dxW, y: y - dyL - dyW }, // Rear-Left
    { x: x - dxL + dxW, y: y - dyL + dyW }, // Rear-Right
  ]
}

/**
 * Projects a set of polygon vertices onto a 2D normal axis and returns [min, max].
 */
function projectPolygon(vertices, axis) {
  let min = vertices[0].x * axis.x + vertices[0].y * axis.y
  let max = min

  for (let i = 1; i < vertices.length; i++) {
    const proj = vertices[i].x * axis.x + vertices[i].y * axis.y
    if (proj < min) min = proj
    if (proj > max) max = proj
  }

  return { min, max }
}

/**
 * Tests if two Oriented Bounding Boxes overlap using Separating Axis Theorem (SAT).
 * Contact is confirmed only if penetration on all 4 axes exceeds contactEpsilon.
 */
export function testOBBOverlap(cornersA, cornersB, epsilon = COLLISION_CONFIG.contactEpsilon) {
  // 4 orthogonal axes to test: 2 from box A, 2 from box B
  const axes = [
    // Box A edge 0->1 normal
    { x: -(cornersA[1].y - cornersA[0].y), y: cornersA[1].x - cornersA[0].x },
    // Box A edge 1->2 normal
    { x: -(cornersA[2].y - cornersA[1].y), y: cornersA[2].x - cornersA[1].x },
    // Box B edge 0->1 normal
    { x: -(cornersB[1].y - cornersB[0].y), y: cornersB[1].x - cornersB[0].x },
    // Box B edge 1->2 normal
    { x: -(cornersB[2].y - cornersB[1].y), y: cornersB[2].x - cornersB[1].x },
  ]

  for (const axis of axes) {
    const len = Math.hypot(axis.x, axis.y)
    if (len < 1e-9) continue

    const normAxis = { x: axis.x / len, y: axis.y / len }

    const projA = projectPolygon(cornersA, normAxis)
    const projB = projectPolygon(cornersB, normAxis)

    // Check if separated by more than epsilon
    if (projA.max < projB.min + epsilon || projB.max < projA.min + epsilon) {
      return false // Separating axis found
    }
  }

  return true // All 4 axes overlap -> contact
}

/**
 * Creates a collision detector instance that tracks active collisions and pair transitions.
 */
export function createCollisionDetector() {
  let activeOverlappingPairs = new Set() // Set of strings: "minId_maxId"
  let totalCollisionCount = 0

  return {
    detectCollisions(vehicles) {
      const activeVehicles = vehicles.filter((v) => v.status !== 'cleared')
      const newOverlappingPairs = new Set()
      const collidingVehicleIds = new Set()
      const collidingPairs = []

      // Pre-calculate corner vertices for all active vehicles
      const cornersMap = new Map()
      for (const v of activeVehicles) {
        cornersMap.set(v.id, getVehicleCorners(v.x, v.y, v.heading, v.length, v.width))
      }

      // Pairwise O(n^2) test (20 vehicles = 190 pairs max)
      for (let i = 0; i < activeVehicles.length; i++) {
        for (let j = i + 1; j < activeVehicles.length; j++) {
          const vA = activeVehicles[i]
          const vB = activeVehicles[j]

          const cornersA = cornersMap.get(vA.id)
          const cornersB = cornersMap.get(vB.id)

          if (testOBBOverlap(cornersA, cornersB)) {
            const pairKey = `${Math.min(vA.id, vB.id)}_${Math.max(vA.id, vB.id)}`
            newOverlappingPairs.add(pairKey)
            collidingVehicleIds.add(vA.id)
            collidingVehicleIds.add(vB.id)
            collidingPairs.push([vA.id, vB.id])

            // If this pair was NOT overlapping in previous step, count as a new collision event!
            if (!activeOverlappingPairs.has(pairKey)) {
              totalCollisionCount++
              vA.collisionEvents = (vA.collisionEvents || 0) + 1
              vB.collisionEvents = (vB.collisionEvents || 0) + 1
            }
          }
        }
      }

      activeOverlappingPairs = newOverlappingPairs

      // Update inCollision flag on all vehicles
      for (const v of vehicles) {
        v.inCollision = collidingVehicleIds.has(v.id)
      }

      return {
        totalCollisions: totalCollisionCount,
        collidingPairs,
        hasCollisions: collidingPairs.length > 0,
      }
    },

    getMetrics() {
      return {
        totalCollisions: totalCollisionCount,
        activeCollidingPairsCount: activeOverlappingPairs.size,
      }
    },

    reset() {
      activeOverlappingPairs.clear()
      totalCollisionCount = 0
    },
  }
}
