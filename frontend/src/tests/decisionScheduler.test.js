/**
 * GRID LOCK — Tests for Decision Scheduler & Clock Policies
 */

import { describe, it, expect, vi } from 'vitest'
import { DecisionScheduler } from '../services/decisionScheduler.js'

describe('DecisionScheduler — Single-Flight & Monotonic Tick Invariant', () => {
  it('increments tickId monotonically and maintains single in-flight lock', async () => {
    let resolveRequest
    const mockFetch = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolveRequest = resolve
      })
    })

    const applied = []
    const scheduler = new DecisionScheduler({
      fetchDecisionsFn: mockFetch,
      onApplyActions: (actions) => applied.push(...actions),
      clockPolicy: 'lockstep',
      decisionIntervalSteps: 10,
    })

    const dummyTelemetry = [
      { id: 1, front: null, rear: null, side: { left: null, right: null }, signal: null },
    ]

    // Step 0: not a boundary
    const res0 = scheduler.checkStep(0, 0.0, () => dummyTelemetry)
    expect(res0.shouldStepEngine).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()

    // Step 10: boundary reached!
    const res10 = scheduler.checkStep(10, 0.2, () => dummyTelemetry)
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch).toHaveBeenLastCalledWith(expect.objectContaining({ tickId: 1 }))
    expect(scheduler.isRequestInFlight).toBe(true)
    expect(res10.shouldStepEngine).toBe(false) // Lockstep pauses

    // Step 10 again or next check while in-flight:
    const resInFlight = scheduler.checkStep(10, 0.2, () => dummyTelemetry)
    expect(resInFlight.shouldStepEngine).toBe(false)
    expect(mockFetch).toHaveBeenCalledTimes(1) // No duplicate request!

    // Resolve request
    resolveRequest({
      tickId: 1,
      batchSize: 1,
      decisions: [{ id: 1, action: 'MAINTAIN' }],
      providerLatencyMs: 120,
      roundTripLatencyMs: 150,
    })

    // Allow promise microtasks to run
    await Promise.resolve()
    await Promise.resolve()

    expect(scheduler.isRequestInFlight).toBe(false)
    expect(applied).toEqual([{ id: 1, action: 'MAINTAIN' }])
    expect(scheduler.status).toBe('running')

    // Next boundary at Step 20
    const res20 = scheduler.checkStep(20, 0.4, () => dummyTelemetry)
    expect(res20.requestTriggered).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenLastCalledWith(expect.objectContaining({ tickId: 2 }))
  })
})

describe('DecisionScheduler — Realtime Policy', () => {
  it('advances simulation, skips overlapping boundaries, and tracks decision age', async () => {
    let resolveRequest
    const mockFetch = vi.fn().mockImplementation(() => {
      return new Promise((resolve) => {
        resolveRequest = resolve
      })
    })

    const scheduler = new DecisionScheduler({
      fetchDecisionsFn: mockFetch,
      onApplyActions: vi.fn(),
      clockPolicy: 'realtime',
      decisionIntervalSteps: 10,
    })

    const dummyTelemetry = [{ id: 1 }]

    // Boundary at step 10: triggers request, but realtime DOES allow stepping!
    const res10 = scheduler.checkStep(10, 0.2, () => dummyTelemetry)
    expect(res10.shouldStepEngine).toBe(true)
    expect(scheduler.isRequestInFlight).toBe(true)

    // Intermediate step 15: engine steps, decision age updates
    const res15 = scheduler.checkStep(15, 0.3, () => dummyTelemetry)
    expect(res15.shouldStepEngine).toBe(true)
    expect(scheduler.decisionAgeMs).toBeCloseTo(300, -1)

    // Overlapping boundary at step 20 while request 1 is still in-flight:
    const res20 = scheduler.checkStep(20, 0.4, () => dummyTelemetry)
    expect(res20.shouldStepEngine).toBe(true)
    expect(scheduler.skippedTicks).toBe(1) // Recorded skipped boundary!
    expect(mockFetch).toHaveBeenCalledTimes(1) // Still only 1 request made

    // Resolve in-flight request
    resolveRequest({
      tickId: 1,
      batchSize: 1,
      decisions: [{ id: 1, action: 'ACCELERATE', throttle: 0.5 }],
      providerLatencyMs: 250,
      roundTripLatencyMs: 280,
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(scheduler.isRequestInFlight).toBe(false)
  })
})

describe('DecisionScheduler — Failure Threshold & Halting', () => {
  it('transitions to uncontrolled on error and halts at max consecutive failures', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('LLM Service 503 Unavailable'))

    const scheduler = new DecisionScheduler({
      fetchDecisionsFn: mockFetch,
      onApplyActions: vi.fn(),
      clockPolicy: 'lockstep',
      decisionIntervalSteps: 10,
      maxConsecutiveFailures: 3,
    })

    const dummyTelemetry = [{ id: 1 }]

    // Failure 1
    scheduler.checkStep(10, 0.2, () => dummyTelemetry)
    await Promise.resolve()
    await Promise.resolve()
    expect(scheduler.consecutiveFailures).toBe(1)
    expect(scheduler.status).toBe('uncontrolled')

    // Failure 2
    scheduler.checkStep(20, 0.4, () => dummyTelemetry)
    await Promise.resolve()
    await Promise.resolve()
    expect(scheduler.consecutiveFailures).toBe(2)
    expect(scheduler.status).toBe('uncontrolled')

    // Failure 3 -> Threshold reached!
    scheduler.checkStep(30, 0.6, () => dummyTelemetry)
    await Promise.resolve()
    await Promise.resolve()
    expect(scheduler.consecutiveFailures).toBe(3)
    expect(scheduler.status).toBe('halted')

    // When halted, engine step check returns shouldStepEngine = false
    const checkHalted = scheduler.checkStep(31, 0.62, () => dummyTelemetry)
    expect(checkHalted.shouldStepEngine).toBe(false)
  })
})
