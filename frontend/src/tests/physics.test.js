import { describe, it, expect } from 'vitest'
import { DT, VEHICLE_CONFIG } from '../simulation/config.js'
import { updateAccelerationWithJerk, integrateKinematics } from '../simulation/vehiclePhysics.js'

describe('Physics & Kinematics Engine', () => {
  it('satisfies the anti-tunneling safety check', () => {
    // Check (a): maximum displacement per step is well below half the smallest vehicle dimension
    const maxVelocity = VEHICLE_CONFIG.maxVelocity // 13.5 m/s
    const maxDisplacementPerStep = maxVelocity * DT // 0.27 m
    const halfSmallestDimension = VEHICLE_CONFIG.width / 2 // 1.9 / 2 = 0.95 m

    expect(maxDisplacementPerStep).toBeLessThan(halfSmallestDimension * 0.35)
    expect(maxDisplacementPerStep).toBeLessThan(halfSmallestDimension)
  })

  it('ensures decision intervals are exact integer multiples of dt', () => {
    // Check (b): decision intervals are exact integer multiples of dt
    const intervals = [0.1, 0.2, 0.5, 1.0]

    for (const interval of intervals) {
      const steps = interval / DT
      expect(Number.isInteger(Math.round(steps))).toBe(true)
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-10)
    }
  })

  it('restricts acceleration change rates according to jerkLimit', () => {
    const jerkLimit = 8.0 // m/s^3
    const dt = 0.02
    const currentAcc = 0.0
    const commandedTargetAcc = 3.0

    const nextAcc = updateAccelerationWithJerk(currentAcc, commandedTargetAcc, jerkLimit, dt)
    // Max deltaA per step = 8.0 * 0.02 = 0.16 m/s^2
    expect(nextAcc).toBeCloseTo(0.16, 5)

    // Over multiple steps, it eventually reaches targetAcc
    let acc = currentAcc
    for (let i = 0; i < 25; i++) {
      acc = updateAccelerationWithJerk(acc, commandedTargetAcc, jerkLimit, dt)
    }
    expect(acc).toBeCloseTo(3.0, 4)
  })

  it('calculates exact displacement under constant acceleration', () => {
    const v0 = 5.0 // m/s
    const a = 2.0 // m/s^2
    const maxVel = 14.0
    const dt = 0.02

    const { deltaS, newVelocity } = integrateKinematics(v0, a, maxVel, dt)
    // Exact kinematic formula: v0 * dt + 0.5 * a * dt^2
    const expectedDeltaS = 5.0 * 0.02 + 0.5 * 2.0 * 0.02 * 0.02 // 0.1004 m
    const expectedVel = 5.0 + 2.0 * 0.02 // 5.04 m/s

    expect(deltaS).toBeCloseTo(expectedDeltaS, 7)
    expect(newVelocity).toBeCloseTo(expectedVel, 7)
  })

  it('analytically clips braking to zero velocity without reverse rolling', () => {
    const v0 = 0.05 // m/s (small speed)
    const a = -8.0 // m/s^2 (full braking deceleration)
    const maxVel = 14.0
    const dt = 0.02

    // Time to stop = 0.05 / 8 = 0.00625 s (< dt 0.02 s)
    // Exact stopping distance = v0^2 / (2 * |a|) = 0.0025 / 16 = 0.00015625 m
    const { deltaS, newVelocity, newAcceleration } = integrateKinematics(v0, a, maxVel, dt)

    expect(newVelocity).toBe(0)
    expect(newAcceleration).toBe(0)
    expect(deltaS).toBeCloseTo(0.00015625, 7)
    expect(deltaS).toBeGreaterThanOrEqual(0)
  })

  it('analytically clips acceleration at maxVelocity', () => {
    const v0 = 13.48 // m/s (close to maxVel 13.5)
    const a = 3.0 // m/s^2
    const maxVel = 13.5
    const dt = 0.02

    const { deltaS, newVelocity } = integrateKinematics(v0, a, maxVel, dt)

    expect(newVelocity).toBe(13.5)
    // Distance should be distance accelerating to max + distance cruising at max
    expect(deltaS).toBeGreaterThan(v0 * dt)
    expect(deltaS).toBeLessThanOrEqual(maxVel * dt)
  })
})
