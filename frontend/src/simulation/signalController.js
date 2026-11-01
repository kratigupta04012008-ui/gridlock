/**
 * GRID LOCK — Traffic Signal Controller
 *
 * Deterministic discrete cyclic state machine driven solely by the simulation step counter.
 * Sequence:
 *   NS green (12s) -> NS yellow (3s) -> All red (2s) ->
 *   EW green (12s) -> EW yellow (3s) -> All red (2s) -> repeat.
 *
 * Invariant: Conflicting approaches (NS vs EW) are never GREEN or YELLOW simultaneously.
 */

import { DT, SIGNAL_TIMING } from './config.js'

export const PHASE_KEYS = Object.freeze({
  NS_GREEN: 'NS_GREEN',
  NS_YELLOW: 'NS_YELLOW',
  ALL_RED_1: 'ALL_RED_1',
  EW_GREEN: 'EW_GREEN',
  EW_YELLOW: 'EW_YELLOW',
  ALL_RED_2: 'ALL_RED_2',
})

// Calculate step boundaries based on DT = 0.02s
const greenSteps = Math.round(SIGNAL_TIMING.greenDuration / DT) // 600 steps (12s)
const yellowSteps = Math.round(SIGNAL_TIMING.yellowDuration / DT) // 150 steps (3s)
const allRedSteps = Math.round(SIGNAL_TIMING.allRedDuration / DT) // 100 steps (2s)

export const TOTAL_CYCLE_STEPS = greenSteps * 2 + yellowSteps * 2 + allRedSteps * 2 // 1700 steps (34s)

const BOUNDARY_1 = greenSteps // 600 (12s)
const BOUNDARY_2 = BOUNDARY_1 + yellowSteps // 750 (15s)
const BOUNDARY_3 = BOUNDARY_2 + allRedSteps // 850 (17s)
const BOUNDARY_4 = BOUNDARY_3 + greenSteps // 1450 (29s)
const BOUNDARY_5 = BOUNDARY_4 + yellowSteps // 1600 (32s)
// BOUNDARY_6 = BOUNDARY_5 + allRedSteps = 1700 (34s)

/**
 * Returns the current phase key for a given simulation step.
 */
export function getPhaseKey(step) {
  const cycleStep = ((step % TOTAL_CYCLE_STEPS) + TOTAL_CYCLE_STEPS) % TOTAL_CYCLE_STEPS

  if (cycleStep < BOUNDARY_1) return PHASE_KEYS.NS_GREEN
  if (cycleStep < BOUNDARY_2) return PHASE_KEYS.NS_YELLOW
  if (cycleStep < BOUNDARY_3) return PHASE_KEYS.ALL_RED_1
  if (cycleStep < BOUNDARY_4) return PHASE_KEYS.EW_GREEN
  if (cycleStep < BOUNDARY_5) return PHASE_KEYS.EW_YELLOW
  return PHASE_KEYS.ALL_RED_2
}

/**
 * Returns human-readable phase display name.
 */
export function getPhaseName(step) {
  const phase = getPhaseKey(step)
  switch (phase) {
    case PHASE_KEYS.NS_GREEN:
      return 'North/South Green'
    case PHASE_KEYS.NS_YELLOW:
      return 'North/South Yellow'
    case PHASE_KEYS.EW_GREEN:
      return 'East/West Green'
    case PHASE_KEYS.EW_YELLOW:
      return 'East/West Yellow'
    default:
      return 'All Red'
  }
}

/**
 * Returns signal color ('GREEN' | 'YELLOW' | 'RED') for a specific approach.
 */
export function getSignalFor(approach, step) {
  const phase = getPhaseKey(step)

  if (approach === 'North' || approach === 'South') {
    if (phase === PHASE_KEYS.NS_GREEN) return 'GREEN'
    if (phase === PHASE_KEYS.NS_YELLOW) return 'YELLOW'
    return 'RED'
  }

  if (approach === 'East' || approach === 'West') {
    if (phase === PHASE_KEYS.EW_GREEN) return 'GREEN'
    if (phase === PHASE_KEYS.EW_YELLOW) return 'YELLOW'
    return 'RED'
  }

  return 'RED'
}

/**
 * Returns the signal state for all 4 approaches.
 */
export function getAllSignals(step) {
  return {
    North: getSignalFor('North', step),
    South: getSignalFor('South', step),
    East: getSignalFor('East', step),
    West: getSignalFor('West', step),
  }
}
