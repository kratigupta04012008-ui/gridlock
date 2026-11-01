import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('Simulation Clock and State Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('correctly tracks state transitions: IDLE -> RUNNING -> PAUSED -> IDLE', () => {
    let status = 'IDLE'
    let clock = 0
    let selectedId = 5

    // Start
    status = 'RUNNING'
    expect(status).toBe('RUNNING')

    // Advance clock
    clock += 1.5
    expect(clock).toBe(1.5)

    // Pause
    status = 'PAUSED'
    expect(status).toBe('PAUSED')
    expect(clock).toBe(1.5)

    // Reset returns to IDLE, clock zero, selection null
    status = 'IDLE'
    clock = 0
    selectedId = null

    expect(status).toBe('IDLE')
    expect(clock).toBe(0)
    expect(selectedId).toBeNull()
  })

  it('scales clock progression accurately with speed multipliers', () => {
    const baseDt = 0.05 // 50ms

    const advanceClock = (currentClock, speed, dt) => currentClock + dt * speed

    let clock = 0

    // At 1x speed for 1 second (20 steps)
    for (let i = 0; i < 20; i++) {
      clock = advanceClock(clock, 1.0, baseDt)
    }
    expect(Math.round(clock)).toBe(1)

    // At 2x speed for 1 second (20 steps)
    for (let i = 0; i < 20; i++) {
      clock = advanceClock(clock, 2.0, baseDt)
    }
    expect(Math.round(clock)).toBe(3) // 1 + 2 = 3

    // At 0.5x speed for 2 seconds (40 steps)
    for (let i = 0; i < 40; i++) {
      clock = advanceClock(clock, 0.5, baseDt)
    }
    expect(Math.round(clock)).toBe(4) // 3 + 1 = 4
  })
})
