import { cloneElement, useRef, useState } from 'react'
import type { ReactElement } from 'react'
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

interface ClonableProps {
  onClick?: (e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  className?: string
  style?: React.CSSProperties
}

export function LongPressMenu({ actions, children }: { actions: LongPressAction[]; children: ReactElement }) {
  const [open, setOpen] = useState(false)
  // Long-pressing a card that's really an <a> shouldn't also navigate once
  // the finger/mouse lifts.
  const suppressNextClick = useRef(false)

  const longPress = useLongPress(() => {
    suppressNextClick.current = true
    setOpen(true)
  })

  const childProps = children.props as ClonableProps

  function handleChildClick(e: React.MouseEvent) {
    if (suppressNextClick.current) {
      e.preventDefault()
      e.stopPropagation()
      suppressNextClick.current = false
      return
    }
    childProps.onClick?.(e)
  }

  function handleChildContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    childProps.onContextMenu?.(e)
  }

  // The handlers/style are cloned directly onto the child (not a wrapping
  // div) - on Android Chrome, `user-select`/`-webkit-touch-callout` set on
  // an ancestor with `display: contents` don't reliably reach the actual
  // pressed element, which was letting the OS's native "select text"
  // toolbar (Copy / Select all / Web search) fire alongside this menu.
  // Cloning puts them on the element that's actually touched.
  const child = cloneElement(children, {
    ...longPress,
    onClick: (e: React.MouseEvent) => handleChildClick(e),
    onContextMenu: (e: React.MouseEvent) => handleChildContextMenu(e),
    className: [childProps.className, 'select-none'].filter(Boolean).join(' '),
    style: {
      ...childProps.style,
      WebkitUserSelect: 'none',
      userSelect: 'none',
      WebkitTouchCallout: 'none',
      touchAction: 'manipulation',
    },
  } as Partial<ClonableProps>)

  return (
    <>
      {child}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
          onClick={() => setOpen(false)}
        >
          <div
            className="mb-10 w-[90%] max-w-sm overflow-hidden rounded-2xl bg-white shadow-lg"
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
