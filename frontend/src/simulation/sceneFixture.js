/**
 * GRID LOCK — Scene Fixture
 *
 * Provides a pure immutable snapshot of the scene:
 * - 20 vehicles (ids 0–19), 5 per approach
 * - Realistic queue spacing behind stop lines, strictly outside intersection box
 * - Signal states across 4 approaches
 *
 * In future phases, a real simulation engine will produce this snapshot.
 */

import { INBOUND_LANES, STOP_LINES, INTERSECTION_BOX } from './geometry.js'

export const VEHICLE_LENGTH = 38
export const VEHICLE_WIDTH = 20

// Curated distinctive, high-contrast palette
export const VEHICLE_PALETTE = Object.freeze([
  '#38bdf8', // 0: Sky Blue
  '#f59e0b', // 1: Amber
  '#10b981', // 2: Emerald
  '#f43f5e', // 3: Rose
  '#8b5cf6', // 4: Violet
  '#fb923c', // 5: Light Orange
  '#06b6d4', // 6: Cyan
  '#eab308', // 7: Yellow
  '#6366f1', // 8: Indigo
  '#14b8a6', // 9: Teal
  '#ec4899', // 10: Pink
  '#a855f7', // 11: Purple
  '#22c55e', // 12: Bright Green
  '#f87171', // 13: Coral
  '#0284c7', // 14: Dark Sky Blue
  '#d97706', // 15: Ochre
  '#84cc16', // 16: Lime
  '#4f46e5', // 17: Deep Indigo
  '#d946ef', // 18: Fuchsia
  '#2dd4bf', // 19: Mint
])

export const SIGNAL_PHASES = Object.freeze({
  NS_GREEN: {
    name: 'NS green',
    signals: { North: 'GREEN', South: 'GREEN', East: 'RED', West: 'RED' },
  },
  NS_YELLOW: {
    name: 'NS yellow',
    signals: { North: 'YELLOW', South: 'YELLOW', East: 'RED', West: 'RED' },
  },
  EW_GREEN: {
    name: 'EW green',
    signals: { North: 'RED', South: 'RED', East: 'GREEN', West: 'GREEN' },
  },
  EW_YELLOW: {
    name: 'EW yellow',
    signals: { North: 'RED', South: 'RED', East: 'YELLOW', West: 'YELLOW' },
  },
  ALL_RED: {
    name: 'All red',
    signals: { North: 'RED', South: 'RED', East: 'RED', West: 'RED' },
  },
})

// Build the static vehicle queue for all 20 vehicles
function buildVehicles() {
  const vehicles = []
  const centerToCenter = VEHICLE_LENGTH + 18 // 56px (18px bumper-to-bumper gap)
  const stopBuffer = 15 // distance from bumper to stop line

  // --- North Approach: ids 0-4, traveling South (+y, heading: PI/2) ---
  const nStopY = STOP_LINES.North.y
  const nFirstCenterY = nStopY - stopBuffer - VEHICLE_LENGTH / 2 // 324 - 15 - 19 = 290
  // Lane 0: 3 cars (0, 1, 2)
  for (let i = 0; i < 3; i++) {
    vehicles.push({
      id: i,
      approach: 'North',
      lane: 0,
      laneName: 'Inner (Left)',
      x: INBOUND_LANES.North[0].x,
      y: nFirstCenterY - i * centerToCenter,
      width: VEHICLE_WIDTH,
      length: VEHICLE_LENGTH,
      heading: Math.PI / 2,
      headingText: 'South (↓)',
      color: VEHICLE_PALETTE[i],
      status: 'Queued',
    })
  }
  // Lane 1: 2 cars (3, 4)
  for (let i = 0; i < 2; i++) {
    const id = 3 + i
    vehicles.push({
      id,
      approach: 'North',
      lane: 1,
      laneName: 'Outer (Right)',
      x: INBOUND_LANES.North[1].x,
      y: nFirstCenterY - i * centerToCenter,
      width: VEHICLE_WIDTH,
      length: VEHICLE_LENGTH,
      heading: Math.PI / 2,
      headingText: 'South (↓)',
      color: VEHICLE_PALETTE[id],
      status: 'Queued',
    })
  }

  // --- East Approach: ids 5-9, traveling West (-x, heading: PI) ---
  const eStopX = STOP_LINES.East.x
  const eFirstCenterX = eStopX + stopBuffer + VEHICLE_LENGTH / 2 // 476 + 15 + 19 = 510
  // Lane 0: 3 cars (5, 6, 7)
  for (let i = 0; i < 3; i++) {
    const id = 5 + i
    vehicles.push({
      id,
      approach: 'East',
      lane: 0,
      laneName: 'Inner (Left)',
      x: eFirstCenterX + i * centerToCenter,
      y: INBOUND_LANES.East[0].y,
      width: VEHICLE_WIDTH,
      length: VEHICLE_LENGTH,
      heading: Math.PI,
      headingText: 'West (←)',
      color: VEHICLE_PALETTE[id],
      status: 'Queued',
    })
  }
  // Lane 1: 2 cars (8, 9)
  for (let i = 0; i < 2; i++) {
    const id = 8 + i
    vehicles.push({
      id,
      approach: 'East',
      lane: 1,
      laneName: 'Outer (Right)',
      x: eFirstCenterX + i * centerToCenter,
      y: INBOUND_LANES.East[1].y,
      width: VEHICLE_WIDTH,
      length: VEHICLE_LENGTH,
      heading: Math.PI,
      headingText: 'West (←)',
      color: VEHICLE_PALETTE[id],
      status: 'Queued',
    })
  }

  // --- South Approach: ids 10-14, traveling North (-y, heading: -PI/2) ---
  const sStopY = STOP_LINES.South.y
  const sFirstCenterY = sStopY + stopBuffer + VEHICLE_LENGTH / 2 // 476 + 15 + 19 = 510
  // Lane 0: 3 cars (10, 11, 12)
  for (let i = 0; i < 3; i++) {
    const id = 10 + i
    vehicles.push({
      id,
      approach: 'South',
      lane: 0,
      laneName: 'Inner (Left)',
      x: INBOUND_LANES.South[0].x,
      y: sFirstCenterY + i * centerToCenter,
      width: VEHICLE_WIDTH,
      length: VEHICLE_LENGTH,
      heading: -Math.PI / 2,
      headingText: 'North (↑)',
      color: VEHICLE_PALETTE[id],
      status: 'Queued',
    })
  }
  // Lane 1: 2 cars (13, 14)
  for (let i = 0; i < 2; i++) {
    const id = 13 + i
    vehicles.push({
      id,
      approach: 'South',
      lane: 1,
      laneName: 'Outer (Right)',
      x: INBOUND_LANES.South[1].x,
      y: sFirstCenterY + i * centerToCenter,
      width: VEHICLE_WIDTH,
      length: VEHICLE_LENGTH,
      heading: -Math.PI / 2,
      headingText: 'North (↑)',
      color: VEHICLE_PALETTE[id],
      status: 'Queued',
    })
  }

  // --- West Approach: ids 15-19, traveling East (+x, heading: 0) ---
  const wStopX = STOP_LINES.West.x
  const wFirstCenterX = wStopX - stopBuffer - VEHICLE_LENGTH / 2 // 324 - 15 - 19 = 290
  // Lane 0: 3 cars (15, 16, 17)
  for (let i = 0; i < 3; i++) {
    const id = 15 + i
    vehicles.push({
      id,
      approach: 'West',
      lane: 0,
      laneName: 'Inner (Left)',
      x: wFirstCenterX - i * centerToCenter,
      y: INBOUND_LANES.West[0].y,
      width: VEHICLE_WIDTH,
      length: VEHICLE_LENGTH,
      heading: 0,
      headingText: 'East (→)',
      color: VEHICLE_PALETTE[id],
      status: 'Queued',
    })
  }
  // Lane 1: 2 cars (18, 19)
  for (let i = 0; i < 2; i++) {
    const id = 18 + i
    vehicles.push({
      id,
      approach: 'West',
      lane: 1,
      laneName: 'Outer (Right)',
      x: wFirstCenterX - i * centerToCenter,
      y: INBOUND_LANES.West[1].y,
      width: VEHICLE_WIDTH,
      length: VEHICLE_LENGTH,
      heading: 0,
      headingText: 'East (→)',
      color: VEHICLE_PALETTE[id],
      status: 'Queued',
    })
  }

  return Object.freeze(vehicles)
}

const STATIC_VEHICLES = buildVehicles()

/**
 * Creates an immutable scene snapshot for the visual renderer.
 *
 * @param {string} phaseKey - One of SIGNAL_PHASES keys (default: 'NS_GREEN')
 * @param {number} timestamp - Current simulation clock in seconds
 * @returns {object} Scene snapshot
 */
export function createSceneSnapshot(phaseKey = 'NS_GREEN', timestamp = 0) {
  const phaseConfig = SIGNAL_PHASES[phaseKey] || SIGNAL_PHASES.NS_GREEN

  return Object.freeze({
    timestamp,
    phaseKey,
    phaseName: phaseConfig.name,
    signals: phaseConfig.signals,
    vehicles: STATIC_VEHICLES,
    intersectionBox: INTERSECTION_BOX,
    stopLines: STOP_LINES,
  })
}
