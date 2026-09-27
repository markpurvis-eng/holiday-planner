import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLongPress } from '../lib/useLongPress'

// Missing Features #6: one shared long-press-to-reveal-actions component,
// used on every Document/Link card (Documents/Links tabs, every
// AttachedItems instance) and on ad hoc expense lines on the Costs tab —
// rather than a permanently-visible delete button cluttering every card.
// Bookings/itinerary items and Trip Types are deliberately NOT wrapped in
// this anywhere (see roadmap #6 for why).
export interface LongPressAction {
  label: string
  onSelect: () => void
  destructive?: boolean
}

export function LongPressMenu({ actions, children }: { actions: LongPressAction[]; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  // Long-pressing a card that's really an <a> (or wraps a Link) shouldn't
  // also navigate once the finger/mouse lifts - suppressed via a capturing
  // click handler on our own wrapper, since preventDefault() during bubbling
  // still stops the anchor's default navigation.
  const suppressNextClick = useRef(false)

  const longPress = useLongPress(() => {
    suppressNextClick.current = true
    setOpen(true)
  })

  function handleClickCapture(e: React.MouseEvent) {
    if (suppressNextClick.current) {
      e.preventDefault()
      e.stopPropagation()
      suppressNextClick.current = false
    }
  }

  return (
    <>
      <div {...longPress} onClickCapture={handleClickCapture} className="contents select-none">
        {children}
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="mb-6 w-[90%] max-w-sm overflow-hidden rounded-2xl bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => {
                  setOpen(false)
                  action.onSelect()
                }}
                className={`block w-full border-b border-stone-100 px-4 py-3 text-center font-medium last:border-b-0 ${
                  action.destructive ? 'text-red-600' : 'text-stone-700'
                }`}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="block w-full bg-stone-50 px-4 py-3 text-center font-medium text-stone-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}
