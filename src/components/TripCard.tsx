import { useRef } from 'react'
import type { PointerEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Trip } from '../lib/types'
import { formatDate, daysUntil, formatMoney } from '../lib/format'

function formatDateRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${formatDate(start, opts)} – ${formatDate(end, opts)}`
}

function formatCountdown(days: number): string {
  if (days <= 0) return 'Departs today'
  if (days === 1) return 'Departs tomorrow'
  return `Departs in ${days} days`
}

// Trip-level (not booking/itinerary-attached) document/link counts —
// Missing Features #23. Optional: Dashboard only fetches these for
// Active & Upcoming trips, so a Past Trips card renders with none.
export type TripAttachmentCounts = { documents: number; links: number }

export function TripCard({
  trip,
  attachmentCounts,
}: {
  trip: Trip
  attachmentCounts?: TripAttachmentCounts
}) {
  const navigate = useNavigate()
  // Swipe left on the card opens that trip's Map tab. Pointer events cover
  // touch, pen and mouse drag, so it can be tried on desktop too.
  const swipeStart = useRef<{ x: number; y: number } | null>(null)
  const swiped = useRef(false)

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    swiped.current = false
    // Android's system Back gesture starts at either screen edge, so a
    // swipe that begins right at an edge is left alone.
    const edge = 24
    if (e.clientX < edge || e.clientX > window.innerWidth - edge) {
      swipeStart.current = null
      return
    }
    swipeStart.current = { x: e.clientX, y: e.clientY }
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (dx <= -60 && Math.abs(dx) > Math.abs(dy) * 2) {
      swiped.current = true
      navigate(`/trips/${trip.id}?tab=map`)
    }
  }

  const icon = trip.trip_type?.icon ?? '🧳'
  const showCountdown = trip.status === 'upcoming'
  const hasAttachments = !!attachmentCounts && (attachmentCounts.documents > 0 || attachmentCounts.links > 0)
  // Not a <Link> itself, because the 📎/🔗 badges below need to be their
  // own links to the Documents/Links tab specifically — an <a> can't
  // nest another <a>, so the whole-card tap target is a div with its own
  // click handler instead, and each badge's Link calls stopPropagation()
  // so tapping it doesn't also fire the card's own navigate().
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => {
        if (swiped.current) {
          swiped.current = false
          return
        }
        navigate(`/trips/${trip.id}`)
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        swipeStart.current = null
      }}
      style={{ touchAction: 'pan-y' }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') navigate(`/trips/${trip.id}`)
      }}
      className="flex cursor-pointer items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 transition hover:shadow-md active:scale-[0.99]"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-3xl">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="truncate font-semibold text-stone-800">{trip.name}</h3>
        <p className="text-sm text-stone-500">
          {formatDateRange(trip.start_date, trip.end_date)}
          {trip.nights ? ` · ${trip.nights} nights` : ''}
        </p>
        {showCountdown && (
          <p className="mt-1 text-xs font-medium text-teal-600">
            {formatCountdown(daysUntil(trip.start_date))}
          </p>
        )}
        {trip.total_cost_gbp != null && (
          <p className="mt-1 text-xs text-stone-400">Total: {formatMoney(trip.total_cost_gbp, 'GBP')}</p>
        )}
        {hasAttachments && (
          <p className="mt-1 flex items-center gap-3 text-xs text-stone-400">
            {attachmentCounts!.documents > 0 && (
              <Link
                to={`/trips/${trip.id}?tab=documents`}
                onClick={(e) => e.stopPropagation()}
                className="hover:text-teal-600"
              >
                📎 {attachmentCounts!.documents}
              </Link>
            )}
            {attachmentCounts!.links > 0 && (
              <Link
                to={`/trips/${trip.id}?tab=links`}
                onClick={(e) => e.stopPropagation()}
                className="hover:text-teal-600"
              >
                🔗 {attachmentCounts!.links}
              </Link>
            )}
          </p>
        )}
      </div>
      {trip.status === 'active' && (
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
          Active
        </span>
      )}
    </div>
  )
}
