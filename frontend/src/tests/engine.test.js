import { describe, it, expect } from 'vitest'
import { createEngine } from '../simulation/engine.js'

describe('Simulation Engine', () => {
  it('initializes fleet with 20 queued vehicles', () => {
    const engine = createEngine({ seed: 42 })
    const snapshot = engine.getSnapshot()

    expect(snapshot.vehicles).toHaveLength(20)
    expect(snapshot.step).toBe(0)
    expect(snapshot.timestamp).toBe(0)

    const metrics = engine.getMetrics()
    expect(metrics.collisions).toBe(0)
    expect(metrics.clearedTotal).toBe(0)
    expect(metrics.waiting).toBe(20)
    expect(metrics.active).toBe(0)
  })

  it('guarantees 100% deterministic reproducibility across runs with the same seed', () => {
    const engine1 = createEngine({ seed: 100 })
    const engine2 = createEngine({ seed: 100 })

    // Accelerate first 4 vehicles in both engines
    const actions = [
      { id: 0, action: 'ACCELERATE', intensity: 0.6 },
      { id: 5, action: 'ACCELERATE', intensity: 0.6 },
      { id: 10, action: 'ACCELERATE', intensity: 0.6 },
      { id: 15, action: 'ACCELERATE', intensity: 0.6 },
    ]

    engine1.applyActions(actions)
    engine2.applyActions(actions)

    // Run 250 steps (5 seconds)
    for (let step = 0; step < 250; step++) {
      engine1.step()
      engine2.step()
    }

    const snap1 = engine1.getSnapshot()
    const snap2 = engine2.getSnapshot()

    expect(snap1.step).toBe(snap2.step)
    expect(snap1.timestamp).toBe(snap2.timestamp)
    expect(snap1.vehicles).toHaveLength(snap2.vehicles.length)

    for (let i = 0; i < 20; i++) {
      expect(snap1.vehicles[i].x).toBeCloseTo(snap2.vehicles[i].x, 8)
      expect(snap1.vehicles[i].y).toBeCloseTo(snap2.vehicles[i].y, 8)
      expect(snap1.vehicles[i].velocity).toBeCloseTo(snap2.vehicles[i].velocity, 8)
      expect(snap1.vehicles[i].heading).toBeCloseTo(snap2.vehicles[i].heading, 8)
    }

    const metrics1 = engine1.getMetrics()
    const metrics2 = engine2.getMetrics()
    expect(metrics1).toEqual(metrics2)
  })

  it('applies actions, rejects invalid actions, and holds last action between steps', () => {
    const engine = createEngine({ seed: 42 })

    // Apply valid actions
    const res = engine.applyActions([
      { id: 0, action: 'ACCELERATE', intensity: 0.5 },
      { id: 1, action: 'BRAKE', intensity: 1.0 },
      { id: 999, action: 'ACCELERATE', intensity: 0.5 }, // Unknown ID
      { id: 2, action: 'INVALID_ACTION', intensity: 0.5 }, // Invalid action
    ])

    expect(res.accepted).toHaveLength(2)
    expect(res.rejected).toHaveLength(2)

    // Step forward 10 steps (0.2s): car 0 should have accelerated and moved
    for (let i = 0; i < 10; i++) {
      engine.step()
    }

    const snap = engine.getSnapshot()
    const car0 = snap.vehicles.find((v) => v.id === 0)
    expect(car0.velocity).toBeGreaterThan(0)
    expect(car0.lastAction.action).toBe('ACCELERATE')
    expect(car0.lastAction.intensity).toBe(0.5)

    // Stale action holds without new command
    for (let i = 0; i < 10; i++) {
      engine.step()
    }
    const car0Later = engine.getSnapshot().vehicles.find((v) => v.id === 0)
    expect(car0Later.velocity).toBeGreaterThan(car0.velocity)
  })

  it('tracks cleared vehicles and differentiates clean vs collided clearances', () => {
    const engine = createEngine({ seed: 42 })

    // Drive Car 0 straight through to the exit
    engine.applyActions([{ id: 0, action: 'ACCELERATE', intensity: 1.0 }])

    // Advance until Car 0 reaches exit
    for (let step = 0; step < 800; step++) {
      engine.step()
    }

    const metrics = engine.getMetrics()
    expect(metrics.clearedTotal).toBeGreaterThanOrEqual(1)
    expect(metrics.clearedClean).toBeGreaterThanOrEqual(1)
  })

  it('resets cleanly back to initial state', () => {
    const engine = createEngine({ seed: 42 })

    engine.applyActions([{ id: 0, action: 'ACCELERATE', intensity: 1.0 }])
    for (let step = 0; step < 50; step++) {
      engine.step()
    }

    expect(engine.getMetrics().simTime).toBeGreaterThan(0)

    engine.reset(42)

    const resetMetrics = engine.getMetrics()
    expect(resetMetrics.step).toBe(0)
    expect(resetMetrics.simTime).toBe(0)
    expect(resetMetrics.collisions).toBe(0)
    expect(resetMetrics.clearedTotal).toBe(0)

    const snap = engine.getSnapshot()
    expect(snap.vehicles[0].velocity).toBe(0)
    expect(snap.vehicles[0].status).toBe('waiting')
  })
})
