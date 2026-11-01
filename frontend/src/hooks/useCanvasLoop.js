/**
 * GRID LOCK — Canvas Render Loop Hook
 *
 * Runs an animation frame loop and calls the render callback.
 * Ensures proper cleanup with cancelAnimationFrame on unmount.
 */

import { useEffect, useRef } from 'react'

export function useCanvasLoop(renderCallback, isRunning = true) {
  const callbackRef = useRef(renderCallback)
  callbackRef.current = renderCallback

  useEffect(() => {
    let animationFrameId
    let isSubscribed = true

    const loop = (timestamp) => {
      if (!isSubscribed) return
      if (callbackRef.current) {
        callbackRef.current(timestamp)
      }
      animationFrameId = requestAnimationFrame(loop)
    }

    if (isRunning) {
      animationFrameId = requestAnimationFrame(loop)
    }

    return () => {
      isSubscribed = false
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isRunning])
}
