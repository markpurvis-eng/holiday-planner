import { Link } from 'react-router-dom'
import type { Trip } from '../lib/types'
import { formatDate, daysUntil } from '../lib/format'

function formatDateRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${formatDate(start, opts)} – ${formatDate(end, opts)}`
}

function formatCountdown(days: number): string {
  if (days <= 0) return 'Departs today'
  if (days === 1) return 'Departs tomorrow'
  return `Departs in ${days} days`
}

export function TripCard({ trip }: { trip: Trip }) {
  const icon = trip.trip_type?.icon ?? '🧳'
  const showCountdown = trip.status === 'upcoming'
  return (
    <Link
      to={`/trips/${trip.id}`}
      className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 transition hover:shadow-md active:scale-[0.99]"
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
      </div>
      {trip.status === 'active' && (
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
          Active
        </span>
      )}
    </Link>
  )
}
