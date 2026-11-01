/**
 * GRID LOCK — Pure Scene Renderer
 *
 * Requirements:
 * - Pure function: renderScene(ctx, snapshot, viewState)
 * - Never reads React state or mutates the snapshot.
 * - Composes roads, lane markings, signals, and vehicles.
 */

import { drawRoads } from './drawRoads.js'
import { drawLaneMarkings } from './drawLaneMarkings.js'
import { drawSignals } from './drawSignals.js'
import { drawVehicles } from './drawVehicles.js'

/**
 * Pure scene render function.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
 * @param {object} snapshot - Immutable scene snapshot (from sceneFixture)
 * @param {object} viewState - View options { selectedVehicleId, hoveredVehicleId, transform }
 */
export function renderScene(ctx, snapshot, viewState = {}) {
  if (!ctx || !snapshot) return

  ctx.save()

  // Apply viewport scale/offset transform if provided
  if (viewState.transform) {
    const { scale, offsetX, offsetY } = viewState.transform
    ctx.translate(offsetX, offsetY)
    ctx.scale(scale, scale)
  }

  // 1. Draw roads, center junction box, curbs, and crosswalks
  drawRoads(ctx)

  // 2. Draw lane dividers, yellow median, and stop lines
  drawLaneMarkings(ctx)

  // 3. Draw signal heads with active glowing lamp
  drawSignals(ctx, snapshot.signals)

  // 4. Draw all 20 vehicles with orientation, chevrons, and selection state
  drawVehicles(ctx, snapshot.vehicles, viewState)

  ctx.restore()
}
