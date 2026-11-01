/**
 * GRID LOCK — Road, Intersection Box, and Crosswalk Rendering
 */

import {
  CENTER,
  ROAD_HALF_WIDTH,
  ROAD_WIDTH,
  WORLD_SIZE,
  INTERSECTION_BOX,
  CROSSWALKS,
} from '../simulation/geometry.js'
import { THEME } from './theme.js'

export function drawRoads(ctx) {
  // 1. Draw entire canvas background
  ctx.fillStyle = THEME.background
  ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE)

  // 2. Draw North-South asphalt road
  ctx.fillStyle = THEME.asphalt
  ctx.fillRect(CENTER - ROAD_HALF_WIDTH, 0, ROAD_WIDTH, WORLD_SIZE)

  // 3. Draw East-West asphalt road
  ctx.fillRect(0, CENTER - ROAD_HALF_WIDTH, WORLD_SIZE, ROAD_WIDTH)

  // 4. Draw curbs / borders along road edges (excluding the intersection openings)
  ctx.strokeStyle = THEME.curb
  ctx.lineWidth = 3

  // North road curbs
  ctx.beginPath()
  ctx.moveTo(CENTER - ROAD_HALF_WIDTH, 0)
  ctx.lineTo(CENTER - ROAD_HALF_WIDTH, INTERSECTION_BOX.top)
  ctx.moveTo(CENTER + ROAD_HALF_WIDTH, 0)
  ctx.lineTo(CENTER + ROAD_HALF_WIDTH, INTERSECTION_BOX.top)

  // South road curbs
  ctx.moveTo(CENTER - ROAD_HALF_WIDTH, INTERSECTION_BOX.bottom)
  ctx.lineTo(CENTER - ROAD_HALF_WIDTH, WORLD_SIZE)
  ctx.moveTo(CENTER + ROAD_HALF_WIDTH, INTERSECTION_BOX.bottom)
  ctx.lineTo(CENTER + ROAD_HALF_WIDTH, WORLD_SIZE)

  // West road curbs
  ctx.moveTo(0, CENTER - ROAD_HALF_WIDTH)
  ctx.lineTo(INTERSECTION_BOX.left, CENTER - ROAD_HALF_WIDTH)
  ctx.moveTo(0, CENTER + ROAD_HALF_WIDTH)
  ctx.lineTo(INTERSECTION_BOX.left, CENTER + ROAD_HALF_WIDTH)

  // East road curbs
  ctx.moveTo(INTERSECTION_BOX.right, CENTER - ROAD_HALF_WIDTH)
  ctx.lineTo(WORLD_SIZE, CENTER - ROAD_HALF_WIDTH)
  ctx.moveTo(INTERSECTION_BOX.right, CENTER + ROAD_HALF_WIDTH)
  ctx.lineTo(WORLD_SIZE, CENTER + ROAD_HALF_WIDTH)
  ctx.stroke()

  // 5. Draw center intersection box (subtly different surface tone & perimeter)
  ctx.fillStyle = THEME.intersectionBox
  ctx.fillRect(
    INTERSECTION_BOX.left,
    INTERSECTION_BOX.top,
    INTERSECTION_BOX.width,
    INTERSECTION_BOX.height
  )

  // Subtle interior box border
  ctx.strokeStyle = THEME.intersectionBoxBorder
  ctx.lineWidth = 1.5
  ctx.strokeRect(
    INTERSECTION_BOX.left,
    INTERSECTION_BOX.top,
    INTERSECTION_BOX.width,
    INTERSECTION_BOX.height
  )

  // Optional: subtle diagonal junction grid lines in center box to highlight junction
  ctx.save()
  ctx.beginPath()
  ctx.rect(
    INTERSECTION_BOX.left,
    INTERSECTION_BOX.top,
    INTERSECTION_BOX.width,
    INTERSECTION_BOX.height
  )
  ctx.clip()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)'
  ctx.lineWidth = 1
  for (let offset = -ROAD_WIDTH; offset < ROAD_WIDTH * 2; offset += 20) {
    ctx.moveTo(INTERSECTION_BOX.left + offset, INTERSECTION_BOX.top)
    ctx.lineTo(INTERSECTION_BOX.left + offset + ROAD_WIDTH, INTERSECTION_BOX.bottom)
  }
  ctx.stroke()
  ctx.restore()

  // 6. Draw crosswalks (Zebra stripes on each approach)
  drawCrosswalks(ctx)

  // 7. Draw compass approach markings
  drawCompassMarkers(ctx)
}

function drawCrosswalks(ctx) {
  ctx.fillStyle = THEME.crosswalk
  const stripeWidth = 6
  const gap = 6

  // North crosswalk (horizontal road crossing)
  const n = CROSSWALKS.North
  for (let x = n.x + 4; x < n.x + n.width - 4; x += stripeWidth + gap) {
    ctx.fillRect(x, n.y, stripeWidth, n.height)
  }

  // South crosswalk
  const s = CROSSWALKS.South
  for (let x = s.x + 4; x < s.x + s.width - 4; x += stripeWidth + gap) {
    ctx.fillRect(x, s.y, stripeWidth, s.height)
  }

  // West crosswalk (vertical road crossing)
  const w = CROSSWALKS.West
  for (let y = w.y + 4; y < w.y + w.height - 4; y += stripeWidth + gap) {
    ctx.fillRect(w.x, y, w.width, stripeWidth)
  }

  // East crosswalk
  const e = CROSSWALKS.East
  for (let y = e.y + 4; y < e.y + e.height - 4; y += stripeWidth + gap) {
    ctx.fillRect(e.x, y, e.width, stripeWidth)
  }
}

function drawCompassMarkers(ctx) {
  ctx.fillStyle = THEME.compassText
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillText('NORTH', CENTER, 18)
  ctx.fillText('SOUTH', CENTER, WORLD_SIZE - 18)
  ctx.fillText('WEST', 24, CENTER)
  ctx.fillText('EAST', WORLD_SIZE - 24, CENTER)
}
