import { Link } from 'react-router-dom'
import type { TimelineEntry } from '../lib/itineraryTimeline'
import { nextUpLabel, nextUpLinkTarget } from '../lib/nextUp'
import { formatDate, formatTime } from '../lib/format'

// The "What's next" card shown on the Dashboard for whichever trip is
// currently underway (Missing Features item 13). Tapping it jumps straight
// to the underlying booking/itinerary card on that trip, reusing the same
// tab+highlight navigation the Itinerary tab's own booking markers use.
export function NextUpCard({ tripId, entry }: { tripId: string; entry: TimelineEntry }) {
  const { title, subtitle, icon } = nextUpLabel(entry)
  const { tab, id } = nextUpLinkTarget(entry)
  const dateLabel = formatDate(entry.date, { weekday: 'short', day: 'numeric', month: 'short' })
  const timeLabel = entry.time ? formatTime(entry.time) : null

  return (
    <Link
      to={`/trips/${tripId}?tab=${tab}&highlight=${id}`}
      className="mb-6 block rounded-2xl bg-teal-700 p-4 text-white shadow-sm transition hover:bg-teal-800"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-100">Next up</p>
      <div className="mt-1 flex items-center gap-3">
        <span className="text-2xl leading-none">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="truncate text-sm text-teal-100">
            {subtitle} · {dateLabel}
            {timeLabel ? ` · ${timeLabel}` : ''}
          </p>
        </div>
      </div>
    </Link>
  )
}
