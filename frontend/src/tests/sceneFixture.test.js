import { describe, it, expect } from 'vitest'
import { createSceneSnapshot, SIGNAL_PHASES } from '../simulation/sceneFixture.js'
import { isInsideIntersectionBox, STOP_LINES } from '../simulation/geometry.js'

describe('Scene Fixture', () => {
  const snapshot = createSceneSnapshot('NS_GREEN', 0)
  const { vehicles } = snapshot

  it('contains exactly 20 vehicles with unique ids 0 through 19', () => {
    expect(vehicles).toHaveLength(20)
    const ids = vehicles.map((v) => v.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(20)

    for (let i = 0; i < 20; i++) {
      expect(uniqueIds.has(i)).toBe(true)
    }
  })

  it('distributes exactly 5 vehicles per approach', () => {
    const north = vehicles.filter((v) => v.approach === 'North')
    const east = vehicles.filter((v) => v.approach === 'East')
    const south = vehicles.filter((v) => v.approach === 'South')
    const west = vehicles.filter((v) => v.approach === 'West')

    expect(north).toHaveLength(5)
    expect(east).toHaveLength(5)
    expect(south).toHaveLength(5)
    expect(west).toHaveLength(5)

    // Verify approach ID ranges
    expect(north.map((v) => v.id)).toEqual([0, 1, 2, 3, 4])
    expect(east.map((v) => v.id)).toEqual([5, 6, 7, 8, 9])
    expect(south.map((v) => v.id)).toEqual([10, 11, 12, 13, 14])
    expect(west.map((v) => v.id)).toEqual([15, 16, 17, 18, 19])
  })

  it('ensures no vehicle sits inside the center intersection box', () => {
    for (const car of vehicles) {
      const isInside = isInsideIntersectionBox(car.x, car.y, car.width, car.length)
      expect(isInside).toBe(false)
    }
  })

  it('ensures all vehicles are queued behind their respective stop lines', () => {
    for (const car of vehicles) {
      if (car.approach === 'North') {
        // Heading South (+y): front bumper (y + length/2) must be <= stop line y
        const frontBumperY = car.y + car.length / 2
        expect(frontBumperY).toBeLessThanOrEqual(STOP_LINES.North.y)
      } else if (car.approach === 'South') {
        // Heading North (-y): front bumper (y - length/2) must be >= stop line y
        const frontBumperY = car.y - car.length / 2
        expect(frontBumperY).toBeGreaterThanOrEqual(STOP_LINES.South.y)
      } else if (car.approach === 'East') {
        // Heading West (-x): front bumper (x - length/2) must be >= stop line x
        const frontBumperX = car.x - car.length / 2
        expect(frontBumperX).toBeGreaterThanOrEqual(STOP_LINES.East.x)
      } else if (car.approach === 'West') {
        // Heading East (+x): front bumper (x + length/2) must be <= stop line x
        const frontBumperX = car.x + car.length / 2
        expect(frontBumperX).toBeLessThanOrEqual(STOP_LINES.West.x)
      }
    }
  })

  it('ensures no vehicles overlap each other', () => {
    // For each pair of vehicles, check that axis-aligned bounding boxes do not overlap
    for (let i = 0; i < vehicles.length; i++) {
      for (let j = i + 1; j < vehicles.length; j++) {
        const a = vehicles[i]
        const b = vehicles[j]

        // Compute AABB for vehicle A
        const aHalfW =
          a.heading === 0 || Math.abs(a.heading) === Math.PI ? a.length / 2 : a.width / 2
        const aHalfH =
          a.heading === 0 || Math.abs(a.heading) === Math.PI ? a.width / 2 : a.length / 2
        const aLeft = a.x - aHalfW
        const aRight = a.x + aHalfW
        const aTop = a.y - aHalfH
        const aBottom = a.y + aHalfH

        // Compute AABB for vehicle B
        const bHalfW =
          b.heading === 0 || Math.abs(b.heading) === Math.PI ? b.length / 2 : b.width / 2
        const bHalfH =
          b.heading === 0 || Math.abs(b.heading) === Math.PI ? b.width / 2 : b.length / 2
        const bLeft = b.x - bHalfW
        const bRight = b.x + bHalfW
        const bTop = b.y - bHalfH
        const bBottom = b.y + bHalfH

        const overlapX = aLeft < bRight && aRight > bLeft
        const overlapY = aTop < bBottom && aBottom > bTop
        const overlap = overlapX && overlapY

        expect(overlap).toBe(false)
      }
    }
  })

  it('supports all signal phases', () => {
    const phases = ['NS_GREEN', 'NS_YELLOW', 'EW_GREEN', 'EW_YELLOW', 'ALL_RED']
    for (const p of phases) {
      const snap = createSceneSnapshot(p)
      expect(snap.signals).toBeDefined()
      expect(snap.phaseKey).toBe(p)
      expect(snap.signals.North).toBe(SIGNAL_PHASES[p].signals.North)
    }
  })
})
