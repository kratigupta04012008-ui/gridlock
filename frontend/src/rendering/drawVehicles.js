/**
 * GRID LOCK — Vehicle Renderer
 *
 * Renders 20 vehicles with:
 * - Rounded rectangle chassis in curated high-contrast colors
 * - Windshield, roof panel, and direction heading chevron
 * - Clear numeric ID badge
 * - Animated selection halo and hover highlight
 */

import { THEME } from './theme.js'

export function drawVehicles(ctx, vehicles, viewState = {}) {
  if (!vehicles || !vehicles.length) return

  const { selectedVehicleId, hoveredVehicleId, showSensorZones } = viewState

  // 1. Draw all unselected active vehicles first
  for (const car of vehicles) {
    if (car.status === 'cleared') continue
    if (car.id === selectedVehicleId) continue
    const isHovered = car.id === hoveredVehicleId
    drawSingleVehicle(ctx, car, false, isHovered, false)
  }

  // 2. Draw selected vehicle last so its halo renders on top
  if (selectedVehicleId !== null && selectedVehicleId !== undefined) {
    const selectedCar = vehicles.find((v) => v.id === selectedVehicleId)
    if (selectedCar && selectedCar.status !== 'cleared') {
      const isHovered = selectedCar.id === hoveredVehicleId
      drawSingleVehicle(ctx, selectedCar, true, isHovered, showSensorZones)
    }
  }
}

function drawSensorZones(ctx, car) {
  const halfLen = car.length / 2
  const halfWid = car.width / 2

  // Dimensions scaled by PIXELS_PER_METER (10.0)
  const frontRange = 400 // 40m
  const corridorHalfW = 17.5 // 3.5m / 2 = 1.75m -> 17.5px
  const rearRange = 300 // 30m
  const sideRange = 35 // 3.5m
  const sideMargin = 5 // 0.5m

  ctx.save()
  ctx.rotate(car.heading)

  // 1. Front Corridor (translucent green)
  ctx.fillStyle = 'rgba(34, 197, 94, 0.10)'
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.5)'
  ctx.lineWidth = 1.5
  ctx.setLineDash([4, 3])
  ctx.fillRect(halfLen, -corridorHalfW, frontRange, corridorHalfW * 2)
  ctx.strokeRect(halfLen, -corridorHalfW, frontRange, corridorHalfW * 2)

  // 2. Rear Corridor (translucent amber)
  ctx.fillStyle = 'rgba(234, 179, 8, 0.10)'
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.5)'
  ctx.fillRect(-halfLen - rearRange, -corridorHalfW, rearRange, corridorHalfW * 2)
  ctx.strokeRect(-halfLen - rearRange, -corridorHalfW, rearRange, corridorHalfW * 2)

  // 3. Left Side Zone (translucent blue)
  ctx.fillStyle = 'rgba(59, 130, 246, 0.10)'
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
  ctx.fillRect(-halfLen - sideMargin, -halfWid - sideRange, car.length + sideMargin * 2, sideRange)
  ctx.strokeRect(
    -halfLen - sideMargin,
    -halfWid - sideRange,
    car.length + sideMargin * 2,
    sideRange
  )

  // 4. Right Side Zone (translucent purple)
  ctx.fillStyle = 'rgba(168, 85, 247, 0.10)'
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.5)'
  ctx.fillRect(-halfLen - sideMargin, halfWid, car.length + sideMargin * 2, sideRange)
  ctx.strokeRect(-halfLen - sideMargin, halfWid, car.length + sideMargin * 2, sideRange)

  ctx.restore()
}

function drawSingleVehicle(ctx, car, isSelected, isHovered, showSensorZones) {
  const { x, y, width, length, heading, color, id, inCollision } = car
  const halfLen = length / 2
  const halfWid = width / 2

  ctx.save()
  ctx.translate(x, y)

  // Optional sensor detection zone visualization
  if (isSelected && showSensorZones) {
    drawSensorZones(ctx, car)
  }

  // 1. Collision Aura (if currently in collision)
  if (inCollision) {
    ctx.save()
    ctx.rotate(heading)
    ctx.shadowColor = THEME.collisionHalo
    ctx.shadowBlur = 16
    ctx.fillStyle = THEME.collisionHaloBg
    ctx.strokeStyle = THEME.collisionHalo
    ctx.lineWidth = 3

    ctx.beginPath()
    ctx.roundRect(-halfLen - 7, -halfWid - 7, length + 14, width + 14, 8)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  }

  // 2. Draw Selection Halo / Hover Ring
  if (isSelected) {
    ctx.save()
    ctx.rotate(heading)
    // Outer glow
    ctx.shadowColor = THEME.selectionHalo
    ctx.shadowBlur = 14
    ctx.fillStyle = THEME.selectionHaloBg
    ctx.strokeStyle = THEME.selectionHalo
    ctx.lineWidth = 2.5

    ctx.beginPath()
    ctx.roundRect(-halfLen - 6, -halfWid - 6, length + 12, width + 12, 7)
    ctx.fill()
    ctx.stroke()
    ctx.restore()
  } else if (isHovered) {
    ctx.save()
    ctx.rotate(heading)
    ctx.strokeStyle = THEME.hoverHalo
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(-halfLen - 4, -halfWid - 4, length + 8, width + 8, 6)
    ctx.stroke()
    ctx.restore()
  }

  // 2. Draw Vehicle Body in oriented space
  ctx.save()
  ctx.rotate(heading)

  // Subtle drop shadow under vehicle
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2

  // Vehicle chassis
  ctx.fillStyle = color
  ctx.strokeStyle = THEME.vehicleBorder
  ctx.lineWidth = 1

  ctx.beginPath()
  ctx.roundRect(-halfLen, -halfWid, length, width, 4)
  ctx.fill()
  ctx.stroke()

  ctx.shadowColor = 'transparent'

  // Windshield (facing forward, towards +halfLen)
  ctx.fillStyle = THEME.vehicleWindshield
  ctx.beginPath()
  ctx.roundRect(halfLen * 0.1, -halfWid * 0.75, halfLen * 0.45, width * 0.75, 2)
  ctx.fill()

  // Rear window
  ctx.beginPath()
  ctx.roundRect(-halfLen * 0.75, -halfWid * 0.75, halfLen * 0.35, width * 0.75, 2)
  ctx.fill()

  // Direction Chevron / Arrow on vehicle hood (pointing forward +x)
  ctx.fillStyle = THEME.vehicleArrow
  ctx.beginPath()
  const arrowX = halfLen * 0.65
  ctx.moveTo(arrowX + 4, 0)
  ctx.lineTo(arrowX - 3, -halfWid * 0.45)
  ctx.lineTo(arrowX - 1, 0)
  ctx.lineTo(arrowX - 3, halfWid * 0.45)
  ctx.closePath()
  ctx.fill()

  ctx.restore() // un-rotate to keep ID badge cleanly upright and readable

  // 3. Upright Numeric ID Badge (drawn at center of vehicle)
  ctx.save()
  const badgeRadius = 7.5
  ctx.fillStyle = THEME.idBadgeBg
  ctx.strokeStyle = isSelected ? THEME.selectionHalo : 'rgba(255, 255, 255, 0.25)'
  ctx.lineWidth = isSelected ? 1.5 : 1

  ctx.beginPath()
  ctx.arc(0, 0, badgeRadius, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = isSelected ? THEME.selectionHalo : THEME.idBadgeText
  ctx.font = '700 9px ui-monospace, SFMono-Regular, monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(id), 0, 0.5)

  ctx.restore()

  ctx.restore()
}
