/**
 * GRID LOCK — Intersection Geometry Definitions
 *
 * All coordinates are defined in an 800x800 world coordinate space.
 * 4-way intersection: North, East, South, West.
 * Each road has 4 lanes: 2 inbound, 2 outbound.
 */

export const WORLD_SIZE = 800
export const CENTER = WORLD_SIZE / 2 // 400

export const LANE_WIDTH = 38
export const NUM_LANES_PER_DIR = 2
export const ROAD_HALF_WIDTH = LANE_WIDTH * NUM_LANES_PER_DIR // 76
export const ROAD_WIDTH = ROAD_HALF_WIDTH * 2 // 152

// Center intersection box
export const INTERSECTION_BOX = Object.freeze({
  x: CENTER - ROAD_HALF_WIDTH, // 324
  y: CENTER - ROAD_HALF_WIDTH, // 324
  width: ROAD_WIDTH, // 152
  height: ROAD_WIDTH, // 152
  left: CENTER - ROAD_HALF_WIDTH, // 324
  right: CENTER + ROAD_HALF_WIDTH, // 476
  top: CENTER - ROAD_HALF_WIDTH, // 324
  bottom: CENTER + ROAD_HALF_WIDTH, // 476
})

// Stop line positions (solid white line across inbound lanes, just before intersection box)
export const STOP_LINES = Object.freeze({
  North: {
    // Inbound traffic moves South (+y) on West side of median [CENTER - ROAD_HALF_WIDTH, CENTER]
    x1: CENTER - ROAD_HALF_WIDTH,
    x2: CENTER,
    y: INTERSECTION_BOX.top, // 324
  },
  South: {
    // Inbound traffic moves North (-y) on East side of median [CENTER, CENTER + ROAD_HALF_WIDTH]
    x1: CENTER,
    x2: CENTER + ROAD_HALF_WIDTH,
    y: INTERSECTION_BOX.bottom, // 476
  },
  East: {
    // Inbound traffic moves West (-x) on North side of median [CENTER - ROAD_HALF_WIDTH, CENTER]
    x: INTERSECTION_BOX.right, // 476
    y1: CENTER - ROAD_HALF_WIDTH,
    y2: CENTER,
  },
  West: {
    // Inbound traffic moves East (+x) on South side of median [CENTER, CENTER + ROAD_HALF_WIDTH]
    x: INTERSECTION_BOX.left, // 324
    y1: CENTER,
    y2: CENTER + ROAD_HALF_WIDTH,
  },
})

// Lane centerlines for inbound traffic
// Lane 0 = inner lane (closer to median), Lane 1 = outer lane (closer to curb)
export const INBOUND_LANES = Object.freeze({
  North: [
    { lane: 0, x: CENTER - LANE_WIDTH / 2 }, // 381
    { lane: 1, x: CENTER - LANE_WIDTH * 1.5 }, // 343
  ],
  South: [
    { lane: 0, x: CENTER + LANE_WIDTH / 2 }, // 419
    { lane: 1, x: CENTER + LANE_WIDTH * 1.5 }, // 457
  ],
  East: [
    { lane: 0, y: CENTER - LANE_WIDTH / 2 }, // 381
    { lane: 1, y: CENTER - LANE_WIDTH * 1.5 }, // 343
  ],
  West: [
    { lane: 0, y: CENTER + LANE_WIDTH / 2 }, // 419
    { lane: 1, y: CENTER + LANE_WIDTH * 1.5 }, // 457
  ],
})

// Crosswalk stripe boundaries (just outside the stop lines)
export const CROSSWALKS = Object.freeze({
  North: {
    x: CENTER - ROAD_HALF_WIDTH,
    y: INTERSECTION_BOX.top - 20,
    width: ROAD_WIDTH,
    height: 16,
  },
  South: {
    x: CENTER - ROAD_HALF_WIDTH,
    y: INTERSECTION_BOX.bottom + 4,
    width: ROAD_WIDTH,
    height: 16,
  },
  East: {
    x: INTERSECTION_BOX.right + 4,
    y: CENTER - ROAD_HALF_WIDTH,
    width: 16,
    height: ROAD_WIDTH,
  },
  West: {
    x: INTERSECTION_BOX.left - 20,
    y: CENTER - ROAD_HALF_WIDTH,
    width: 16,
    height: ROAD_WIDTH,
  },
})

/**
 * Checks if a bounding box intersects the center intersection box.
 */
export function isInsideIntersectionBox(x, y, width, height) {
  const left = x - width / 2
  const right = x + width / 2
  const top = y - height / 2
  const bottom = y + height / 2

  return (
    left < INTERSECTION_BOX.right &&
    right > INTERSECTION_BOX.left &&
    top < INTERSECTION_BOX.bottom &&
    bottom > INTERSECTION_BOX.top
  )
}
