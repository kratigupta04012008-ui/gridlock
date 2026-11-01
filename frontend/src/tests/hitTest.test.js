import { describe, it, expect } from 'vitest'
import { findVehicleAtPoint, isPointInsideVehicle } from '../rendering/hitTest.js'
import { createSceneSnapshot } from '../simulation/sceneFixture.js'
import { CENTER } from '../simulation/geometry.js'

describe('Hit Testing Engine', () => {
  const snapshot = createSceneSnapshot('NS_GREEN')
  const { vehicles } = snapshot

  it('accurately hits North approach vehicle (car 0)', () => {
    const car0 = vehicles.find((v) => v.id === 0)
    expect(car0).toBeDefined()

    // Test exact center of car 0
    const hit = findVehicleAtPoint(car0.x, car0.y, vehicles)
    expect(hit).not.toBeNull()
    expect(hit.id).toBe(0)
    expect(isPointInsideVehicle(car0.x, car0.y, car0)).toBe(true)
  })

  it('accurately hits East approach vehicle (car 5)', () => {
    const car5 = vehicles.find((v) => v.id === 5)
    expect(car5).toBeDefined()

    const hit = findVehicleAtPoint(car5.x, car5.y, vehicles)
    expect(hit).not.toBeNull()
    expect(hit.id).toBe(5)
  })

  it('accurately hits South approach vehicle (car 10)', () => {
    const car10 = vehicles.find((v) => v.id === 10)
    expect(car10).toBeDefined()

    const hit = findVehicleAtPoint(car10.x, car10.y, vehicles)
    expect(hit).not.toBeNull()
    expect(hit.id).toBe(10)
  })

  it('accurately hits West approach vehicle (car 15)', () => {
    const car15 = vehicles.find((v) => v.id === 15)
    expect(car15).toBeDefined()

    const hit = findVehicleAtPoint(car15.x, car15.y, vehicles)
    expect(hit).not.toBeNull()
    expect(hit.id).toBe(15)
  })

  it('returns null when clicking inside the empty center intersection', () => {
    const hit = findVehicleAtPoint(CENTER, CENTER, vehicles)
    expect(hit).toBeNull()
  })

  it('returns null when clicking outside road boundaries', () => {
    const hit = findVehicleAtPoint(50, 50, vehicles)
    expect(hit).toBeNull()
  })
})
