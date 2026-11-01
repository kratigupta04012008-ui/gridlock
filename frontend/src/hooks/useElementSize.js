/**
 * GRID LOCK — Element Size Hook (ResizeObserver)
 *
 * Measures and tracks the client width/height of a DOM container ref.
 */

import { useState, useEffect } from 'react'

export function useElementSize(elementRef) {
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const updateSize = () => {
      const rect = element.getBoundingClientRect()
      setSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      })
    }

    updateSize()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        if (!entries || !entries.length) return
        const entry = entries[0]
        if (entry.contentRect) {
          setSize({
            width: Math.floor(entry.contentRect.width),
            height: Math.floor(entry.contentRect.height),
          })
        }
      })

      observer.observe(element)

      return () => {
        observer.disconnect()
      }
    } else {
      window.addEventListener('resize', updateSize)
      return () => {
        window.removeEventListener('resize', updateSize)
      }
    }
  }, [elementRef])

  return size
}
