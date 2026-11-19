import { useCallback, useEffect, useRef, useState } from 'react'

// Same colour as the bar's own background (Tailwind stone-100). The fades are
// inline styles rather than utility classes so they can't depend on the
// stylesheet generating them (see Fixed #71's button-colour fix).
const BAR_BG = '#f5f5f4'

// When the tabs are wider than the screen the bar scrolls sideways, but
// nothing showed that more tabs were hiding off the edge (Costs and To-dos on
// a phone). A fade with a small arrow now appears on whichever side still has
// tabs to scroll to, and goes away once that end is reached.
export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })

  const update = useCallback(() => {
    const el = scroller.current
    if (!el) return
    // 2px of slack: scrollLeft is fractional on high-density screens.
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setMore((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useEffect(() => {
    update()
    const el = scroller.current
    if (!el) return
    window.addEventListener('resize', update)
    let observer: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(update)
      observer.observe(el)
    }
    return () => {
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [update, tabs.length])

  const fade = (side: 'left' | 'right', visible: boolean) => (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 flex w-10 items-center text-base font-semibold text-stone-500 transition-opacity ${
        side === 'left' ? 'left-0 justify-start rounded-l-xl pl-1.5' : 'right-0 justify-end rounded-r-xl pr-1.5'
      }`}
      style={{
        opacity: visible ? 1 : 0,
        background: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, ${BAR_BG} 40%, rgba(245, 245, 244, 0))`,
      }}
    >
      {side === 'left' ? '‹' : '›'}
    </div>
  )

  return (
    <div className="relative">
      <div ref={scroller} onScroll={update} className="flex gap-1 overflow-x-auto rounded-xl bg-stone-100 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              active === tab.id
                ? 'bg-white text-teal-700 shadow-sm'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {fade('left', more.left)}
      {fade('right', more.right)}
    </div>
  )
}
