/**
 * GRID LOCK — Canvas HiDPI Setup & Coordinate Mapping
 */

import { WORLD_SIZE } from '../simulation/geometry.js'

/**
 * Adjusts canvas resolution for devicePixelRatio and returns the viewport transform.
 */
export function setupCanvasResolution(canvas, clientWidth, clientHeight) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(clientWidth * dpr)
  canvas.height = Math.round(clientHeight * dpr)
  canvas.style.width = `${clientWidth}px`
  canvas.style.height = `${clientHeight}px`

  // Uniform scale to fit world inside client dimensions
  const scale = Math.min(clientWidth / WORLD_SIZE, clientHeight / WORLD_SIZE)
  const offsetX = (clientWidth - WORLD_SIZE * scale) / 2
  const offsetY = (clientHeight - WORLD_SIZE * scale) / 2

  return { scale, offsetX, offsetY, dpr }
}

/**
 * Maps a pointer client event coordinate to world coordinates (0..800).
 */
export function screenToWorld(clientX, clientY, canvasRect, transform) {
  const cssX = clientX - canvasRect.left
  const cssY = clientY - canvasRect.top

  const worldX = (cssX - transform.offsetX) / transform.scale
  const worldY = (cssY - transform.offsetY) / transform.scale

  return { worldX, worldY }
}
