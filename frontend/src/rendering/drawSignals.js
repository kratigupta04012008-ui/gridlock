/**
 * GRID LOCK — Traffic Signal Heads Renderer
 *
 * One signal head per approach, mounted beside the road facing inbound traffic.
 * Renders Red, Yellow, and Green lamps with intense glow on the active lamp
 * and dimmed appearance on inactive lamps.
 */

import { THEME } from './theme.js'

// Signal head placement for each approach
const SIGNAL_CONFIGS = Object.freeze({
  North: {
    // Inbound traffic heading South: mounted on outer curb near stop line
    x: 308,
    y: 306,
    orientation: 'vertical',
    label: 'N',
  },
  South: {
    // Inbound traffic heading North: mounted on outer curb near stop line
    x: 492,
    y: 494,
    orientation: 'vertical',
    label: 'S',
  },
  East: {
    // Inbound traffic heading West: mounted on outer curb near stop line
    x: 494,
    y: 308,
    orientation: 'horizontal',
    label: 'E',
  },
  West: {
    // Inbound traffic heading East: mounted on outer curb near stop line
    x: 306,
    y: 492,
    orientation: 'horizontal',
    label: 'W',
  },
})

export function drawSignals(ctx, signals) {
  if (!signals) return

  for (const [approach, activeColor] of Object.entries(signals)) {
    const config = SIGNAL_CONFIGS[approach]
    if (!config) continue

    drawSignalHead(ctx, config.x, config.y, config.orientation, activeColor, config.label)
  }
}

function drawSignalHead(ctx, centerX, centerY, orientation, activeColor, _label) {
  const isVertical = orientation === 'vertical'
  const boxWidth = isVertical ? 16 : 38
  const boxHeight = isVertical ? 38 : 16
  const x = centerX - boxWidth / 2
  const y = centerY - boxHeight / 2

  // 1. Signal housing
  ctx.save()
  ctx.fillStyle = THEME.signalHousing
  ctx.strokeStyle = THEME.signalBorder
  ctx.lineWidth = 1.5

  ctx.beginPath()
  ctx.roundRect(x, y, boxWidth, boxHeight, 4)
  ctx.fill()
  ctx.stroke()

  // 2. Lamps: Red, Yellow, Green
  const lampRadius = 4.2
  const lamps = ['RED', 'YELLOW', 'GREEN']

  lamps.forEach((color, idx) => {
    let lx, ly
    if (isVertical) {
      lx = centerX
      ly = y + 7 + idx * 12
    } else {
      lx = x + 7 + idx * 12
      ly = centerY
    }

    const isActive = activeColor === color

    if (isActive) {
      // Draw glow
      ctx.save()
      let glowColor, activeFill
      if (color === 'RED') {
        glowColor = THEME.signalRedGlow
        activeFill = THEME.signalRedActive
      } else if (color === 'YELLOW') {
        glowColor = THEME.signalYellowGlow
        activeFill = THEME.signalYellowActive
      } else {
        glowColor = THEME.signalGreenGlow
        activeFill = THEME.signalGreenActive
      }

      ctx.shadowColor = glowColor
      ctx.shadowBlur = 12
      ctx.fillStyle = activeFill

      ctx.beginPath()
      ctx.arc(lx, ly, lampRadius + 0.5, 0, Math.PI * 2)
      ctx.fill()

      // High-intensity core
      ctx.shadowBlur = 0
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(lx, ly, lampRadius * 0.45, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    } else {
      // Inactive dimmed lamp
      ctx.fillStyle = THEME.signalLampInactive
      ctx.beginPath()
      ctx.arc(lx, ly, lampRadius, 0, Math.PI * 2)
      ctx.fill()

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.lineWidth = 1
      ctx.stroke()
    }
  })

  ctx.restore()
}
