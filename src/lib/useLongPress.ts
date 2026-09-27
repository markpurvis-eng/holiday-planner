import { useCallback, useRef } from 'react'

// Missing Features #6: shared long-press detection for the delete/re-point
// gesture. Cancels on movement (scrolling) so it doesn't fire mid-scroll,
// and works for both touch and mouse (desktop testing, trackpad).
const LONG_PRESS_MS = 500

export function useLongPress(onLongPress: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const movedRef = useRef(false)

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const start = useCallback(() => {
    movedRef.current = false
    clear()
    timerRef.current = setTimeout(() => {
      if (!movedRef.current) onLongPress()
    }, LONG_PRESS_MS)
  }, [clear, onLongPress])

  const cancel = useCallback(() => {
    movedRef.current = true
    clear()
  }, [clear])

  return {
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: cancel,
    onTouchCancel: cancel,
    onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  }
}
