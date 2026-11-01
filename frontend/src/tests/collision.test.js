import { describe, it, expect } from 'vitest'
import {
  getVehicleCorners,
  testOBBOverlap,
  createCollisionDetector,
} from '../simulation/collisionDetector.js'

describe('Collision Detection (Separating Axis Theorem)', () => {
  it('computes symmetric Oriented Bounding Box corner coordinates', () => {
    // Box at (10, 10), length 4.0, width 2.0, heading 0 (pointing East +x)
    const corners = getVehicleCorners(10, 10, 0, 4.0, 2.0)
    expect(corners).toHaveLength(4)

    // Front-Right: (12, 11)
    expect(corners[0].x).toBeCloseTo(12, 5)
    expect(corners[0].y).toBeCloseTo(11, 5)

    // Rear-Left: (8, 9)
    expect(corners[2].x).toBeCloseTo(8, 5)
    expect(corners[2].y).toBeCloseTo(9, 5)
  })

  it('accurately identifies separated non-overlapping boxes', () => {
    // Two cars separated along the X axis by 5 meters
    const cornersA = getVehicleCorners(10, 10, 0, 4.5, 1.9)
    const cornersB = getVehicleCorners(16, 10, 0, 4.5, 1.9)

    expect(testOBBOverlap(cornersA, cornersB)).toBe(false)
  })

  it('accurately identifies overlapping aligned and rotated boxes', () => {
    // Two cars bumper-to-bumper with 0.5m overlap
    const cornersA = getVehicleCorners(10, 10, 0, 4.5, 1.9)
    const cornersB = getVehicleCorners(13.8, 10, 0, 4.5, 1.9)

    expect(testOBBOverlap(cornersA, cornersB)).toBe(true)

    // Orthogonally crossing cars (T-bone intersection collision)
    const carHeadingEast = getVehicleCorners(40, 40, 0, 4.5, 1.9)
    const carHeadingNorth = getVehicleCorners(40, 40, -Math.PI / 2, 4.5, 1.9)

    expect(testOBBOverlap(carHeadingEast, carHeadingNorth)).toBe(true)
  })

  it('counts collision pairs only on initial overlap transition', () => {
    const detector = createCollisionDetector()

    // Step 1: Two vehicles separated
    const vA = { id: 0, x: 10, y: 10, heading: 0, length: 4.5, width: 1.9, status: 'active' }
    const vB = { id: 1, x: 20, y: 10, heading: 0, length: 4.5, width: 1.9, status: 'active' }

    let res = detector.detectCollisions([vA, vB])
    expect(res.totalCollisions).toBe(0)
    expect(vA.inCollision).toBe(false)
    expect(vB.inCollision).toBe(false)

    // Step 2: vB moves into vA (initial contact transition)
    vB.x = 13.5
    res = detector.detectCollisions([vA, vB])
    expect(res.totalCollisions).toBe(1)
    expect(vA.inCollision).toBe(true)
    expect(vB.inCollision).toBe(true)

    // Step 3: Vehicles remain overlapping in next step
    res = detector.detectCollisions([vA, vB])
    // Must NOT double-count the same ongoing collision pair!
    expect(res.totalCollisions).toBe(1)
    expect(vA.inCollision).toBe(true)

    // Step 4: Vehicles separate
    vB.x = 25
    res = detector.detectCollisions([vA, vB])
    expect(res.totalCollisions).toBe(1)
    expect(vA.inCollision).toBe(false)

    // Step 5: Vehicles contact a second time
    vB.x = 13.5
    res = detector.detectCollisions([vA, vB])
    expect(res.totalCollisions).toBe(2)
  })

  it('skips cleared vehicles during collision detection', () => {
    const detector = createCollisionDetector()

    const vA = { id: 0, x: 10, y: 10, heading: 0, length: 4.5, width: 1.9, status: 'active' }
    const vB = { id: 1, x: 10, y: 10, heading: 0, length: 4.5, width: 1.9, status: 'cleared' }

    const res = detector.detectCollisions([vA, vB])
    expect(res.totalCollisions).toBe(0)
    expect(vA.inCollision).toBe(false)
  })
})
