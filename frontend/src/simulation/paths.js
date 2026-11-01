/**
 * GRID LOCK — Parametric Intersection Paths
 *
 * All coordinates in SI meters (80m x 80m world).
 * Implements Right-Hand Traffic (RHT):
 * - Straight: direct crossing
 * - Right turn: from outer lane (1) to adjacent outer outbound lane
 * - Left turn: from inner lane (0) to cross-traffic inner outbound lane
 *
 * Each path is parameterized by arc-length s in meters [0, totalLength].
 * getPoseAt(s) returns { x, y, heading, distanceToStopLine, isInsideIntersection, isExitReached }.
 */

/**
 * Creates a composite path with entry straight segment, curve or crossing, and exit segment.
 */
function createPath({
  id,
  approach,
  lane,
  movement,
  entryLength,
  arcRadius,
  exitLength,
  getPoseFn,
}) {
  const totalLength = entryLength + (arcRadius ? (Math.PI / 2) * arcRadius : 15.2) + exitLength
  const stopLineS = entryLength
  const exitLineS = totalLength - exitLength

  return Object.freeze({
    id,
    approach,
    lane,
    movement,
    stopLineS,
    exitLineS,
    totalLength,

    getPoseAt(s) {
      const clampedS = Math.max(0, Math.min(s, totalLength))
      const pose = getPoseFn(clampedS, stopLineS, exitLineS)

      const distanceToStopLine = Math.max(0, stopLineS - clampedS)
      const isInsideIntersection = clampedS > stopLineS && clampedS < exitLineS
      const isExitReached = clampedS >= exitLineS

      return {
        x: pose.x,
        y: pose.y,
        heading: pose.heading,
        s: clampedS,
        distanceToStopLine,
        isInsideIntersection,
        isExitReached,
      }
    },
  })
}

// -------------------------------------------------------------
// North Approach (Inbound Southbound: moving +y, initial heading: PI/2)
// Stop line at y = 32.4m, s = 32.4m
// -------------------------------------------------------------
function buildNorthStraightPath(lane) {
  const x = lane === 0 ? 38.1 : 34.3
  const entryLength = 32.4
  const exitLength = 32.4

  return createPath({
    id: `North_L${lane}_straight`,
    approach: 'North',
    lane,
    movement: 'straight',
    entryLength,
    arcRadius: 0,
    exitLength,
    getPoseFn(s) {
      return { x, y: s, heading: Math.PI / 2 }
    },
  })
}

function buildNorthRightPath() {
  // Lane 1 (outer, x = 34.3). Turns right onto Westbound outer lane (y = 34.3)
  const entryLength = 32.4
  const R = 1.9 // 34.3 - 32.4
  const arcLen = (Math.PI / 2) * R // ~2.98m
  const exitLength = 32.4

  return createPath({
    id: 'North_L1_right',
    approach: 'North',
    lane: 1,
    movement: 'right',
    entryLength,
    arcRadius: R,
    exitLength,
    getPoseFn(s, sStop, sExit) {
      if (s <= sStop) {
        return { x: 34.3, y: s, heading: Math.PI / 2 }
      }
      if (s >= sExit) {
        const exitProgress = s - sExit
        return { x: 32.4 - exitProgress, y: 34.3, heading: Math.PI }
      }
      // In curve: center is at (32.4, 32.4).
      // Angle theta from center goes from 0 rad (at (34.3, 32.4)) to PI/2 rad (at (32.4, 34.3))
      const u = (s - sStop) / arcLen
      const theta = u * (Math.PI / 2)
      const x = 32.4 + R * Math.cos(theta)
      const y = 32.4 + R * Math.sin(theta)
      const heading = Math.PI / 2 + theta // rotates from PI/2 to PI
      return { x, y, heading }
    },
  })
}

function buildNorthLeftPath() {
  // Lane 0 (inner, x = 38.1). Turns left onto Eastbound inner lane (y = 41.9)
  const entryLength = 32.4
  const R = 9.5 // 47.6 - 38.1 = 9.5m
  const arcLen = (Math.PI / 2) * R // ~14.92m
  const exitLength = 32.4

  return createPath({
    id: 'North_L0_left',
    approach: 'North',
    lane: 0,
    movement: 'left',
    entryLength,
    arcRadius: R,
    exitLength,
    getPoseFn(s, sStop, sExit) {
      if (s <= sStop) {
        return { x: 38.1, y: s, heading: Math.PI / 2 }
      }
      if (s >= sExit) {
        const exitProgress = s - sExit
        return { x: 47.6 + exitProgress, y: 41.9, heading: 0 }
      }
      // In curve: center is at (47.6, 32.4).
      // At sStop, point is at (38.1, 32.4) which is angle PI from center.
      // Rotates counter-clockwise to angle PI/2 at (47.6, 41.9)
      const u = (s - sStop) / arcLen
      const theta = Math.PI - u * (Math.PI / 2) // PI down to PI/2
      const x = 47.6 + R * Math.cos(theta)
      const y = 32.4 + R * Math.sin(theta)
      const heading = Math.PI / 2 - u * (Math.PI / 2) // PI/2 down to 0
      return { x, y, heading }
    },
  })
}

// -------------------------------------------------------------
// South Approach (Inbound Northbound: moving -y, initial heading: -PI/2)
// Stop line at y = 47.6m, s = 80 - 47.6 = 32.4m
// -------------------------------------------------------------
function buildSouthStraightPath(lane) {
  const x = lane === 0 ? 41.9 : 45.7
  const entryLength = 32.4
  const exitLength = 32.4

  return createPath({
    id: `South_L${lane}_straight`,
    approach: 'South',
    lane,
    movement: 'straight',
    entryLength,
    arcRadius: 0,
    exitLength,
    getPoseFn(s) {
      return { x, y: 80.0 - s, heading: -Math.PI / 2 }
    },
  })
}

function buildSouthRightPath() {
  // Lane 1 (outer, x = 45.7). Turns right onto Eastbound outer lane (y = 45.7)
  const entryLength = 32.4
  const R = 1.9 // 47.6 - 45.7
  const arcLen = (Math.PI / 2) * R
  const exitLength = 32.4

  return createPath({
    id: 'South_L1_right',
    approach: 'South',
    lane: 1,
    movement: 'right',
    entryLength,
    arcRadius: R,
    exitLength,
    getPoseFn(s, sStop, sExit) {
      if (s <= sStop) {
        return { x: 45.7, y: 80.0 - s, heading: -Math.PI / 2 }
      }
      if (s >= sExit) {
        const exitProgress = s - sExit
        return { x: 47.6 + exitProgress, y: 45.7, heading: 0 }
      }
      // In curve: center is at (47.6, 47.6).
      // Starts at (45.7, 47.6) which is angle PI from center.
      // Rotates clockwise to angle -PI/2 (or 3PI/2) at (47.6, 45.7)
      const u = (s - sStop) / arcLen
      const theta = Math.PI + u * (Math.PI / 2)
      const x = 47.6 + R * Math.cos(theta)
      const y = 47.6 + R * Math.sin(theta)
      const heading = -Math.PI / 2 + u * (Math.PI / 2) // -PI/2 up to 0
      return { x, y, heading }
    },
  })
}

function buildSouthLeftPath() {
  // Lane 0 (inner, x = 41.9). Turns left onto Westbound inner lane (y = 38.1)
  const entryLength = 32.4
  const R = 9.5
  const arcLen = (Math.PI / 2) * R
  const exitLength = 32.4

  return createPath({
    id: 'South_L0_left',
    approach: 'South',
    lane: 0,
    movement: 'left',
    entryLength,
    arcRadius: R,
    exitLength,
    getPoseFn(s, sStop, sExit) {
      if (s <= sStop) {
        return { x: 41.9, y: 80.0 - s, heading: -Math.PI / 2 }
      }
      if (s >= sExit) {
        const exitProgress = s - sExit
        return { x: 32.4 - exitProgress, y: 38.1, heading: Math.PI }
      }
      // In curve: center is at (32.4, 47.6).
      // Starts at (41.9, 47.6) which is angle 0 from center.
      // Rotates counter-clockwise to angle -PI/2 at (32.4, 38.1)
      const u = (s - sStop) / arcLen
      const theta = -u * (Math.PI / 2)
      const x = 32.4 + R * Math.cos(theta)
      const y = 47.6 + R * Math.sin(theta)
      const heading = -Math.PI / 2 - u * (Math.PI / 2) // -PI/2 down to -PI (Math.PI)
      return { x, y, heading }
    },
  })
}

// -------------------------------------------------------------
// East Approach (Inbound Westbound: moving -x, initial heading: PI)
// Stop line at x = 47.6m, s = 80 - 47.6 = 32.4m
// -------------------------------------------------------------
function buildEastStraightPath(lane) {
  const y = lane === 0 ? 38.1 : 34.3
  const entryLength = 32.4
  const exitLength = 32.4

  return createPath({
    id: `East_L${lane}_straight`,
    approach: 'East',
    lane,
    movement: 'straight',
    entryLength,
    arcRadius: 0,
    exitLength,
    getPoseFn(s) {
      return { x: 80.0 - s, y, heading: Math.PI }
    },
  })
}

function buildEastRightPath() {
  // Lane 1 (outer, y = 34.3). Turns right onto Northbound outer lane (x = 45.7)
  const entryLength = 32.4
  const R = 1.9
  const arcLen = (Math.PI / 2) * R
  const exitLength = 32.4

  return createPath({
    id: 'East_L1_right',
    approach: 'East',
    lane: 1,
    movement: 'right',
    entryLength,
    arcRadius: R,
    exitLength,
    getPoseFn(s, sStop, sExit) {
      if (s <= sStop) {
        return { x: 80.0 - s, y: 34.3, heading: Math.PI }
      }
      if (s >= sExit) {
        const exitProgress = s - sExit
        return { x: 45.7, y: 32.4 - exitProgress, heading: -Math.PI / 2 }
      }
      // Center at (47.6, 32.4).
      // Starts at (47.6, 34.3), angle PI/2 from center.
      // Rotates to angle 0 at (49.5, 32.4)? Wait:
      // Turn right from heading West (PI) means heading North (-PI/2).
      const u = (s - sStop) / arcLen
      return {
        x: 47.6 - R * (1 - Math.cos((u * Math.PI) / 2)),
        y: 34.3 - R * Math.sin((u * Math.PI) / 2),
        heading: Math.PI + u * (Math.PI / 2), // PI towards 3PI/2 (-PI/2)
      }
    },
  })
}

function buildEastLeftPath() {
  // Lane 0 (inner, y = 38.1). Turns left onto Southbound inner lane (x = 38.1)
  // Wait, outbound Southbound inner lane is at x = 41.9
  const entryLength = 32.4
  const R = 9.5
  const arcLen = (Math.PI / 2) * R
  const exitLength = 32.4

  return createPath({
    id: 'East_L0_left',
    approach: 'East',
    lane: 0,
    movement: 'left',
    entryLength,
    arcRadius: R,
    exitLength,
    getPoseFn(s, sStop, sExit) {
      if (s <= sStop) {
        return { x: 80.0 - s, y: 38.1, heading: Math.PI }
      }
      if (s >= sExit) {
        const exitProgress = s - sExit
        return { x: 41.9, y: 47.6 + exitProgress, heading: Math.PI / 2 }
      }
      const u = (s - sStop) / arcLen
      return {
        x: 47.6 - R * Math.sin(u * (Math.PI / 2)),
        y: 38.1 + R * (1 - Math.cos(u * (Math.PI / 2))),
        heading: Math.PI - u * (Math.PI / 2), // PI down to PI/2
      }
    },
  })
}

// -------------------------------------------------------------
// West Approach (Inbound Eastbound: moving +x, initial heading: 0)
// Stop line at x = 32.4m, s = 32.4m
// -------------------------------------------------------------
function buildWestStraightPath(lane) {
  const y = lane === 0 ? 41.9 : 45.7
  const entryLength = 32.4
  const exitLength = 32.4

  return createPath({
    id: `West_L${lane}_straight`,
    approach: 'West',
    lane,
    movement: 'straight',
    entryLength,
    arcRadius: 0,
    exitLength,
    getPoseFn(s) {
      return { x: s, y, heading: 0 }
    },
  })
}

function buildWestRightPath() {
  // Lane 1 (outer, y = 45.7). Turns right onto Southbound outer lane (x = 34.3)
  const entryLength = 32.4
  const R = 1.9
  const arcLen = (Math.PI / 2) * R
  const exitLength = 32.4

  return createPath({
    id: 'West_L1_right',
    approach: 'West',
    lane: 1,
    movement: 'right',
    entryLength,
    arcRadius: R,
    exitLength,
    getPoseFn(s, sStop, sExit) {
      if (s <= sStop) {
        return { x: s, y: 45.7, heading: 0 }
      }
      if (s >= sExit) {
        const exitProgress = s - sExit
        return { x: 34.3, y: 47.6 + exitProgress, heading: Math.PI / 2 }
      }
      const u = (s - sStop) / arcLen
      return {
        x: 32.4 + R * Math.sin((u * Math.PI) / 2),
        y: 45.7 + R * (1 - Math.cos((u * Math.PI) / 2)),
        heading: u * (Math.PI / 2), // 0 to PI/2
      }
    },
  })
}

function buildWestLeftPath() {
  // Lane 0 (inner, y = 41.9). Turns left onto Northbound inner lane (x = 41.9)
  const entryLength = 32.4
  const R = 9.5
  const arcLen = (Math.PI / 2) * R
  const exitLength = 32.4

  return createPath({
    id: 'West_L0_left',
    approach: 'West',
    lane: 0,
    movement: 'left',
    entryLength,
    arcRadius: R,
    exitLength,
    getPoseFn(s, sStop, sExit) {
      if (s <= sStop) {
        return { x: s, y: 41.9, heading: 0 }
      }
      if (s >= sExit) {
        const exitProgress = s - sExit
        return { x: 41.9, y: 32.4 - exitProgress, heading: -Math.PI / 2 }
      }
      const u = (s - sStop) / arcLen
      return {
        x: 32.4 + R * Math.sin((u * Math.PI) / 2),
        y: 41.9 - R * (1 - Math.cos((u * Math.PI) / 2)),
        heading: -u * (Math.PI / 2), // 0 to -PI/2
      }
    },
  })
}

/**
 * Registry of all predefined intersection paths.
 */
export const INTERSECTION_PATHS = Object.freeze({
  // North
  North_L0_straight: buildNorthStraightPath(0),
  North_L1_straight: buildNorthStraightPath(1),
  North_L0_left: buildNorthLeftPath(),
  North_L1_right: buildNorthRightPath(),

  // South
  South_L0_straight: buildSouthStraightPath(0),
  South_L1_straight: buildSouthStraightPath(1),
  South_L0_left: buildSouthLeftPath(),
  South_L1_right: buildSouthRightPath(),

  // East
  East_L0_straight: buildEastStraightPath(0),
  East_L1_straight: buildEastStraightPath(1),
  East_L0_left: buildEastLeftPath(),
  East_L1_right: buildEastRightPath(),

  // West
  West_L0_straight: buildWestStraightPath(0),
  West_L1_straight: buildWestStraightPath(1),
  West_L0_left: buildWestLeftPath(),
  West_L1_right: buildWestRightPath(),
})

/**
 * Returns a path given approach, lane, and movement.
 */
export function getPath(approach, lane, movement = 'straight') {
  const key = `${approach}_L${lane}_${movement}`
  const path = INTERSECTION_PATHS[key]
  if (!path) {
    // Fallback to straight if movement not found
    return INTERSECTION_PATHS[`${approach}_L${lane}_straight`]
  }
  return path
}
