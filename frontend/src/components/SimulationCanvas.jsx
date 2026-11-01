/**
 * GRID LOCK — Simulation Canvas Component
 *
 * Requirements:
 * - Exactly one <canvas> element.
 * - Pure rendering driven by renderScene(ctx, snapshot, viewState).
 * - HiDPI scaling and responsive resizing.
 * - Canvas-based hit-testing (hitTest.js).
 * - Hover tooltip showing vehicle ID.
 * - Click selection with highlight ring.
 * - Esc key or background click deselects.
 */

import { useRef, useEffect, useState, useCallback } from 'react'
import { renderScene } from '../rendering/renderScene.js'
import { setupCanvasResolution, screenToWorld } from '../rendering/canvasSetup.js'
import { findVehicleAtPoint } from '../rendering/hitTest.js'
import { useCanvasLoop } from '../hooks/useCanvasLoop.js'
import { useElementSize } from '../hooks/useElementSize.js'

export function SimulationCanvas({
  snapshot,
  selectedVehicleId,
  onSelectVehicle,
  showSensorZones = false,
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const transformRef = useRef({ scale: 1, offsetX: 0, offsetY: 0, dpr: 1 })

  const [hoveredVehicle, setHoveredVehicle] = useState(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  const containerSize = useElementSize(containerRef)

  // 1. Resize canvas whenever container dimensions change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || containerSize.width === 0 || containerSize.height === 0) return

    // Set square canvas dimension fitting within container
    const size = Math.min(containerSize.width, containerSize.height)
    const transform = setupCanvasResolution(canvas, size, size)
    transformRef.current = transform
  }, [containerSize])

  // 2. Render loop (requestAnimationFrame with pure renderer)
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const transform = transformRef.current
    const viewState = {
      selectedVehicleId,
      hoveredVehicleId: hoveredVehicle?.id ?? null,
      showSensorZones,
      transform,
    }

    // Reset transform to identity and clear background
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Render pure snapshot
    renderScene(ctx, snapshot, viewState)
  }, [snapshot, selectedVehicleId, hoveredVehicle])

  useCanvasLoop(renderFrame, true)

  // 3. Pointer move for hover detection and tooltip
  const handlePointerMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas || !snapshot?.vehicles) return

    const rect = canvas.getBoundingClientRect()
    const transform = transformRef.current
    const { worldX, worldY } = screenToWorld(e.clientX, e.clientY, rect, transform)

    const vehicle = findVehicleAtPoint(worldX, worldY, snapshot.vehicles)

    if (vehicle) {
      setHoveredVehicle(vehicle)
      // Screen coordinates of the vehicle center
      const screenX = transform.offsetX + vehicle.x * transform.scale
      const screenY = transform.offsetY + vehicle.y * transform.scale
      setTooltipPos({ x: screenX, y: screenY })
    } else {
      setHoveredVehicle(null)
    }
  }

  const handlePointerLeave = () => {
    setHoveredVehicle(null)
  }

  // 4. Click for selection
  const handlePointerDown = (e) => {
    const canvas = canvasRef.current
    if (!canvas || !snapshot?.vehicles) return

    const rect = canvas.getBoundingClientRect()
    const transform = transformRef.current
    const { worldX, worldY } = screenToWorld(e.clientX, e.clientY, rect, transform)

    const vehicle = findVehicleAtPoint(worldX, worldY, snapshot.vehicles)

    if (vehicle) {
      onSelectVehicle(vehicle.id)
    } else {
      onSelectVehicle(null)
    }
  }

  // 5. Keyboard Escape listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onSelectVehicle(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSelectVehicle])

  return (
    <div
      ref={containerRef}
      className="simulation-canvas-container"
      role="application"
      aria-label="4-Way Intersection Simulation Canvas"
    >
      <canvas
        ref={canvasRef}
        className="simulation-canvas"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        onPointerDown={handlePointerDown}
        tabIndex={0}
        aria-label="Interactive intersection display. Hover to inspect vehicle ID, click to select, Esc to deselect."
      />

      {/* Hover Tooltip (Accessible overlay with vehicle ID) */}
      {hoveredVehicle && (
        <div
          className="canvas-tooltip"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y - 28}px`,
          }}
          role="tooltip"
          aria-live="polite"
        >
          <span className="tooltip-swatch" style={{ backgroundColor: hoveredVehicle.color }} />
          <span>Car #{hoveredVehicle.id}</span>
          <span className="tooltip-sub">({hoveredVehicle.approach})</span>
        </div>
      )}
    </div>
  )
}
