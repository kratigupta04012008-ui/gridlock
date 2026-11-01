import { describe, it, expect } from 'vitest'
import {
  getPhaseKey,
  getSignalFor,
  getAllSignals,
  PHASE_KEYS,
  TOTAL_CYCLE_STEPS,
} from '../simulation/signalController.js'

describe('Traffic Signal Controller', () => {
  it('follows the configured cyclic duration structure', () => {
    // 50 Hz -> 50 steps per second
    expect(TOTAL_CYCLE_STEPS).toBe(1700) // 34 seconds * 50

    // Step 0 -> NS_GREEN (starts at 0)
    expect(getPhaseKey(0)).toBe(PHASE_KEYS.NS_GREEN)

    // Step 599 -> NS_GREEN (last step of 12s green)
    expect(getPhaseKey(599)).toBe(PHASE_KEYS.NS_GREEN)

    // Step 600 -> NS_YELLOW (starts at 12s)
    expect(getPhaseKey(600)).toBe(PHASE_KEYS.NS_YELLOW)

    // Step 749 -> NS_YELLOW (last step of 3s yellow)
    expect(getPhaseKey(749)).toBe(PHASE_KEYS.NS_YELLOW)

    // Step 750 -> ALL_RED_1 (starts at 15s)
    expect(getPhaseKey(750)).toBe(PHASE_KEYS.ALL_RED_1)

    // Step 850 -> EW_GREEN (starts at 17s)
    expect(getPhaseKey(850)).toBe(PHASE_KEYS.EW_GREEN)

    // Step 1450 -> EW_YELLOW (starts at 29s)
    expect(getPhaseKey(1450)).toBe(PHASE_KEYS.EW_YELLOW)

    // Step 1600 -> ALL_RED_2 (starts at 32s)
    expect(getPhaseKey(1600)).toBe(PHASE_KEYS.ALL_RED_2)

    // Step 1700 -> cycles back to NS_GREEN
    expect(getPhaseKey(1700)).toBe(PHASE_KEYS.NS_GREEN)
  })

  it('guarantees conflicting approaches are never GREEN or YELLOW simultaneously', () => {
    // Test across 10,000 simulation steps (~3.3 minutes of traffic)
    for (let step = 0; step < 10000; step++) {
      const signals = getAllSignals(step)

      const nsActive = signals.North === 'GREEN' || signals.North === 'YELLOW'
      const ewActive = signals.East === 'GREEN' || signals.East === 'YELLOW'

      // Invariant: NS and EW must never be active at the same time
      expect(nsActive && ewActive).toBe(false)

      // Symmetric approach consistency
      expect(signals.North).toBe(signals.South)
      expect(signals.East).toBe(signals.West)
    }
  })

  it('reports all approaches as RED during all-red phases', () => {
    // Step 760 is in ALL_RED_1
    const redSignals = getAllSignals(760)
    expect(redSignals.North).toBe('RED')
    expect(redSignals.South).toBe('RED')
    expect(redSignals.East).toBe('RED')
    expect(redSignals.West).toBe('RED')
  })

  it('correctly retrieves individual approach signals via getSignalFor', () => {
    expect(getSignalFor('North', 0)).toBe('GREEN')
    expect(getSignalFor('South', 0)).toBe('GREEN')
    expect(getSignalFor('East', 0)).toBe('RED')
    expect(getSignalFor('West', 0)).toBe('RED')

    expect(getSignalFor('North', 650)).toBe('YELLOW')
    expect(getSignalFor('East', 900)).toBe('GREEN')
    expect(getSignalFor('East', 1500)).toBe('YELLOW')
  })
})
