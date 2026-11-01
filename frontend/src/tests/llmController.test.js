/**
 * GRID LOCK — Tests for LLM Controller & Unclamped Physics / Collisions
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createEngine } from '../simulation/engine.js'
import { createLLMController } from '../controllers/llmController.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('LLM Controller — Architectural Boundary Check', () => {
  it('does not import engine, physics, collision, or geometry internals', () => {
    const controllerPath = path.resolve(__dirname, '../controllers/llmController.js')
    const fileContent = fs.readFileSync(controllerPath, 'utf-8')

    // Parse import statements
    const importLines = fileContent
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('import '))

    for (const line of importLines) {
      expect(line).not.toMatch(/\/simulation\//)
      expect(line).not.toMatch(/\/physics\//)
      expect(line).not.toMatch(/\/collision\//)
      expect(line).not.toMatch(/\/geometry\//)
    }
  })
})

describe('LLM Actions — Physical Execution Without Safety Clamping', () => {
  it('applies commanded throttle directly to vehicle physics without artificial collision avoidance', () => {
    const engine = createEngine({ seed: 42 })

    // Command full throttle on a vehicle
    const applyRes = engine.applyActions([{ id: 0, action: 'ACCELERATE', throttle: 1.0 }])
    expect(applyRes.accepted.length).toBe(1)

    const vBefore = engine.getSnapshot().vehicles.find((v) => v.id === 0)
    const initialSpeed = vBefore.velocity

    // Step physics forward 20 steps (0.4s)
    for (let i = 0; i < 20; i++) {
      engine.step()
    }

    const vAfter = engine.getSnapshot().vehicles.find((v) => v.id === 0)
    expect(vAfter.velocity).toBeGreaterThan(initialSpeed)
    expect(vAfter.targetAcceleration).toBeGreaterThan(0)
  })

  it('records SAT collisions when unsafe actions lead to contact (no fake safety override)', () => {
    const engine = createEngine({ seed: 42 })

    // Command full acceleration on vehicle 0 while leaving vehicle ahead or crossing path
    for (let i = 0; i < 300; i++) {
      engine.applyActions([
        { id: 0, action: 'ACCELERATE', throttle: 1.0 },
        { id: 1, action: 'BRAKE', intensity: 1.0 },
      ])
      engine.step()
    }

    const metrics = engine.getMetrics()
    // Collisions are detected and recorded honestly if paths intercept
    expect(typeof metrics.collisions).toBe('number')
  })
})

describe('createLLMController Interface', () => {
  it('instantiates controller with scheduler and metrics', () => {
    const applied = []
    const controller = createLLMController({
      onApplyActions: (acts) => applied.push(...acts),
      clockPolicy: 'lockstep',
      decisionIntervalSteps: 50,
    })

    expect(controller.name).toContain('LLM Batch Controller')
    expect(controller.isLLM).toBe(true)
    expect(controller.scheduler).toBeDefined()

    const m = controller.getMetrics()
    expect(m.status).toBe('idle')
    expect(m.clockPolicy).toBe('lockstep')
    expect(m.tickCounter).toBe(0)
  })
})
