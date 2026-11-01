import { describe, it, expect } from 'vitest'
import {
  WORLD_SIZE,
  CENTER,
  LANE_WIDTH,
  ROAD_WIDTH,
  ROAD_HALF_WIDTH,
  INTERSECTION_BOX,
  STOP_LINES,
  INBOUND_LANES,
  isInsideIntersectionBox,
} from '../simulation/geometry.js'

describe('Intersection Geometry', () => {
  it('has consistent coordinate boundaries in 800x800 world', () => {
    expect(WORLD_SIZE).toBe(800)
    expect(CENTER).toBe(400)
    expect(ROAD_WIDTH).toBe(ROAD_HALF_WIDTH * 2)
    expect(ROAD_WIDTH).toBe(LANE_WIDTH * 4) // 4 lanes total
    expect(INBOUND_LANES.North).toHaveLength(2)
  })

  it('defines symmetric center intersection box', () => {
    expect(INTERSECTION_BOX.left).toBe(CENTER - ROAD_HALF_WIDTH)
    expect(INTERSECTION_BOX.right).toBe(CENTER + ROAD_HALF_WIDTH)
    expect(INTERSECTION_BOX.top).toBe(CENTER - ROAD_HALF_WIDTH)
    expect(INTERSECTION_BOX.bottom).toBe(CENTER + ROAD_HALF_WIDTH)
    expect(INTERSECTION_BOX.width).toBe(ROAD_WIDTH)
    expect(INTERSECTION_BOX.height).toBe(ROAD_WIDTH)
  })

  it('positions stop lines precisely at inbound approach borders', () => {
    // North stop line: y at box top (324) across West half [324, 400]
    expect(STOP_LINES.North.y).toBe(INTERSECTION_BOX.top)
    expect(STOP_LINES.North.x1).toBe(INTERSECTION_BOX.left)
    expect(STOP_LINES.North.x2).toBe(CENTER)

    // South stop line: y at box bottom (476) across East half [400, 476]
    expect(STOP_LINES.South.y).toBe(INTERSECTION_BOX.bottom)
    expect(STOP_LINES.South.x1).toBe(CENTER)
    expect(STOP_LINES.South.x2).toBe(INTERSECTION_BOX.right)

    // East stop line: x at box right (476) across North half [324, 400]
    expect(STOP_LINES.East.x).toBe(INTERSECTION_BOX.right)
    expect(STOP_LINES.East.y1).toBe(INTERSECTION_BOX.top)
    expect(STOP_LINES.East.y2).toBe(CENTER)

    // West stop line: x at box left (324) across South half [400, 476]
    expect(STOP_LINES.West.x).toBe(INTERSECTION_BOX.left)
    expect(STOP_LINES.West.y1).toBe(CENTER)
    expect(STOP_LINES.West.y2).toBe(INTERSECTION_BOX.bottom)
  })

  it('correctly detects points inside and outside the intersection box', () => {
    // Center point is inside
    expect(isInsideIntersectionBox(CENTER, CENTER, 20, 38)).toBe(true)

    // Vehicle placed behind North stop line (y = 290) is outside
    expect(isInsideIntersectionBox(381, 290, 20, 38)).toBe(false)

    // Vehicle placed behind South stop line (y = 510) is outside
    expect(isInsideIntersectionBox(419, 510, 20, 38)).toBe(false)
  })
})
