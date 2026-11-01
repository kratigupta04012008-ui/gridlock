/**
 * GRID LOCK — Lane Markings & Stop Lines Renderer
 */

import {
  CENTER,
  LANE_WIDTH,
  WORLD_SIZE,
  INTERSECTION_BOX,
  STOP_LINES,
} from '../simulation/geometry.js'
import { THEME } from './theme.js'

export function drawLaneMarkings(ctx) {
  // 1. Double yellow solid median dividers between opposing traffic flows
  ctx.strokeStyle = THEME.medianYellow
  ctx.lineWidth = 2
  ctx.setLineDash([])

  const mOffset = 3

  // North median (y = 0 to box.top)
  ctx.beginPath()
  ctx.moveTo(CENTER - mOffset, 0)
  ctx.lineTo(CENTER - mOffset, INTERSECTION_BOX.top)
  ctx.moveTo(CENTER + mOffset, 0)
  ctx.lineTo(CENTER + mOffset, INTERSECTION_BOX.top)
  // South median (y = box.bottom to WORLD_SIZE)
  ctx.moveTo(CENTER - mOffset, INTERSECTION_BOX.bottom)
  ctx.lineTo(CENTER - mOffset, WORLD_SIZE)
  ctx.moveTo(CENTER + mOffset, INTERSECTION_BOX.bottom)
  ctx.lineTo(CENTER + mOffset, WORLD_SIZE)
  // West median (x = 0 to box.left)
  ctx.moveTo(0, CENTER - mOffset)
  ctx.lineTo(INTERSECTION_BOX.left, CENTER - mOffset)
  ctx.moveTo(0, CENTER + mOffset)
  ctx.lineTo(INTERSECTION_BOX.left, CENTER + mOffset)
  // East median (x = box.right to WORLD_SIZE)
  ctx.moveTo(INTERSECTION_BOX.right, CENTER - mOffset)
  ctx.lineTo(WORLD_SIZE, CENTER - mOffset)
  ctx.moveTo(INTERSECTION_BOX.right, CENTER + mOffset)
  ctx.lineTo(WORLD_SIZE, CENTER + mOffset)
  ctx.stroke()

  // 2. White dashed lane dividers between same-direction lanes
  ctx.strokeStyle = THEME.laneDividerWhite
  ctx.lineWidth = 1.5
  ctx.setLineDash([12, 10])

  ctx.beginPath()
  // North road lane dividers (x = 362 and x = 438)
  ctx.moveTo(CENTER - LANE_WIDTH, 0)
  ctx.lineTo(CENTER - LANE_WIDTH, INTERSECTION_BOX.top)
  ctx.moveTo(CENTER + LANE_WIDTH, 0)
  ctx.lineTo(CENTER + LANE_WIDTH, INTERSECTION_BOX.top)

  // South road lane dividers
  ctx.moveTo(CENTER - LANE_WIDTH, INTERSECTION_BOX.bottom)
  ctx.lineTo(CENTER - LANE_WIDTH, WORLD_SIZE)
  ctx.moveTo(CENTER + LANE_WIDTH, INTERSECTION_BOX.bottom)
  ctx.lineTo(CENTER + LANE_WIDTH, WORLD_SIZE)

  // West road lane dividers
  ctx.moveTo(0, CENTER - LANE_WIDTH)
  ctx.lineTo(INTERSECTION_BOX.left, CENTER - LANE_WIDTH)
  ctx.moveTo(0, CENTER + LANE_WIDTH)
  ctx.lineTo(INTERSECTION_BOX.left, CENTER + LANE_WIDTH)

  // East road lane dividers
  ctx.moveTo(INTERSECTION_BOX.right, CENTER - LANE_WIDTH)
  ctx.lineTo(WORLD_SIZE, CENTER - LANE_WIDTH)
  ctx.moveTo(INTERSECTION_BOX.right, CENTER + LANE_WIDTH)
  ctx.lineTo(WORLD_SIZE, CENTER + LANE_WIDTH)
  ctx.stroke()

  // Reset line dash
  ctx.setLineDash([])

  // 3. Solid white stop lines on inbound lanes only (just before the intersection box)
  ctx.strokeStyle = THEME.stopLine
  ctx.lineWidth = 4

  // North inbound stop line (West side of North road)
  ctx.beginPath()
  ctx.moveTo(STOP_LINES.North.x1, STOP_LINES.North.y)
  ctx.lineTo(STOP_LINES.North.x2, STOP_LINES.North.y)

  // South inbound stop line (East side of South road)
  ctx.moveTo(STOP_LINES.South.x1, STOP_LINES.South.y)
  ctx.lineTo(STOP_LINES.South.x2, STOP_LINES.South.y)

  // East inbound stop line (North side of East road)
  ctx.moveTo(STOP_LINES.East.x, STOP_LINES.East.y1)
  ctx.lineTo(STOP_LINES.East.x, STOP_LINES.East.y2)

  // West inbound stop line (South side of West road)
  ctx.moveTo(STOP_LINES.West.x, STOP_LINES.West.y1)
  ctx.lineTo(STOP_LINES.West.x, STOP_LINES.West.y2)
  ctx.stroke()
}
