import { Link } from 'react-router-dom'
import type { TimelineEntry } from '../lib/itineraryTimeline'
import { nextUpLabel, nextUpLinkTarget } from '../lib/nextUp'
import { formatDate, formatTime } from '../lib/format'
import { resolveEntryTimezone, homeTimeLabel } from '../lib/timezone'

// The "What's next" card shown on the Dashboard for whichever trip is
// currently underway (Missing Features item 13). Tapping it jumps straight
// to the underlying booking/itinerary card on that trip, reusing the same
// tab+highlight navigation the Itinerary tab's own booking markers use.
export function NextUpCard({ tripId, entry }: { tripId: string; entry: TimelineEntry }) {
  const { title, subtitle, icon } = nextUpLabel(entry)
  const { tab, id } = nextUpLinkTarget(entry)
  const dateLabel = formatDate(entry.date, { weekday: 'short', day: 'numeric', month: 'short' })
  const timeLabel = entry.time ? formatTime(entry.time) : null
  // Home-equivalent time (Missing Features #16) — this is arguably the
  // single most useful spot for it: the moment you're most likely to be
  // confused about what time it actually is is right before the next
  // thing on the trip happens. Only shows when this entry's own
  // booking/itinerary_item has coordinates — no trip-level fallback (see
  // resolveEntryTimezone's comment for why that was mislabelling things
  // like an outbound flight's UK departure marker).
  const tz = entry.time ? resolveEntryTimezone(entry) : null
  const homeLabel = tz && entry.time ? homeTimeLabel(entry.date, entry.time, tz) : null

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
          {homeLabel && <p className="truncate text-xs text-teal-200">{homeLabel}</p>}
        </div>
      </div>
    </Link>
  )
}
