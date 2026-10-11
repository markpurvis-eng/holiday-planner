import type { Booking } from '../lib/types'
import { parseFlightDetails } from '../lib/bookingTypes/flight'
import { bookingBody } from '../lib/bookingTypes/registry'
import type { Row } from '../lib/bookingTypes/fields'
import type { FlightLeg } from '../lib/bookingTypes/flight'
import { airportName, airportTimezone } from '../lib/bookingTypes/airports'
import { formatDate, formatDayAbbrev, formatTime } from '../lib/format'
import { HOME_TIMEZONE, homeTimeLabel } from '../lib/timezone'

// The type-specific body of a booking card (Missing Features #83): for a flight
// with usable details, one sub-card per leg; for a cruise, hotel, car hire,
// excursion or transfer, its label/value rows. Renders nothing for any other
// booking, so those keep today's generic card. `expanded` is the card's
// existing "Show details" state; the extra fields (operator, baggage, aircraft,
// e-tickets) only appear when it is open.
export function BookingTypeBody({
  booking,
  expanded,
  highlightId,
}: {
  booking: Booking
  expanded: boolean
  highlightId: string | null
}) {
  if (booking.type !== 'flight') return <RowsBody booking={booking} expanded={expanded} />
  const d = parseFlightDetails(booking.details)
  if (!d) return null
  return (
    <div className="mt-2 space-y-2">
      {d.legs.map((leg) => (
        <LegCard key={leg.id} bookingId={booking.id} leg={leg} expanded={expanded} highlightId={highlightId} />
      ))}
      {expanded && d.passengers.some((p) => p.eticket) && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">E-tickets</p>
          {d.passengers
            .filter((p) => p.eticket)
            .map((p) => (
              <p key={p.name} className="text-sm text-stone-600">
                {p.name}: {p.eticket}
              </p>
            ))}
        </div>
      )}
    </div>
  )
}

function RowList({ rows }: { rows: Row[] }) {
  return (
    <>
      {rows.map((r) => (
        <p key={r.label} className="whitespace-pre-line text-sm text-stone-600">
          <span className="text-stone-400">{r.label}</span> {r.value}
        </p>
      ))}
    </>
  )
}

function RowsBody({ booking, expanded }: { booking: Booking; expanded: boolean }) {
  const body = bookingBody(booking)
  if (!body || (body.rows.length === 0 && (!expanded || body.extra.length === 0))) return null
  return (
    <div className="mt-1 space-y-0.5">
      <RowList rows={body.rows} />
      {expanded && <RowList rows={body.extra} />}
    </div>
  )
}

function endpoint(code: string, terminal: string | null): string {
  return terminal ? `${code} T${terminal.replace(/^T(erminal)?\s*/i, '')}` : code
}

// "Wed 9 Sep 14:10 (13:10 UK)" — the home-time part only when the airport is
// in a different timezone from home.
function timeLine(date: string, time: string | null, airport: string): string {
  const day = `${formatDayAbbrev(date)} ${formatDate(date, { day: 'numeric', month: 'short' })}`
  if (!time) return day
  const tz = airportTimezone(airport)
  const home = tz && tz !== HOME_TIMEZONE ? homeTimeLabel(date, time, tz) : null
  return `${day} ${formatTime(time)}${home ? ` (${home})` : ''}`
}

function LegCard({
  bookingId,
  leg,
  expanded,
  highlightId,
}: {
  bookingId: string
  leg: FlightLeg
  expanded: boolean
  highlightId: string | null
}) {
  const domId = `${bookingId}-${leg.id}`
  const fromName = airportName(leg.from)
  const toName = airportName(leg.to)
  const heading = [leg.flight_number, leg.airline].filter(Boolean).join(' · ')
  const seatText = leg.seats
    .map((s) => (s.passenger ? `${s.passenger} ${s.seat}` : s.seat))
    .join(', ')
  const arrDate = leg.arr_date ?? leg.dep_date

  return (
    <div
      id={`item-${domId}`}
      className={`rounded-xl bg-stone-50 p-3 transition-shadow ${
        highlightId === domId ? 'ring-2 ring-teal-400' : 'ring-1 ring-stone-200'
      }`}
    >
      {heading && <p className="text-xs font-medium uppercase tracking-wide text-teal-600">{heading}</p>}
      <p className="font-medium text-stone-800">
        {endpoint(leg.from, leg.from_terminal)} → {endpoint(leg.to, leg.to_terminal)}
      </p>
      {(fromName || toName) && (
        <p className="text-xs text-stone-500">
          {fromName ?? leg.from} → {toName ?? leg.to}
        </p>
      )}
      <p className="mt-1 text-sm text-stone-600">
        Dep {timeLine(leg.dep_date, leg.dep_time, leg.from)}
      </p>
      {(leg.arr_time || leg.arr_date) && (
        <p className="text-sm text-stone-600">Arr {timeLine(arrDate, leg.arr_time, leg.to)}</p>
      )}
      {leg.cabin && <p className="text-sm text-stone-500">{leg.cabin}</p>}
      {seatText && <p className="text-sm text-stone-500">Seats: {seatText}</p>}
      {expanded && (
        <div className="mt-1 space-y-0.5 text-sm text-stone-600">
          {leg.operated_by && <p>Operated by {leg.operated_by}</p>}
          {leg.aircraft && <p>Aircraft: {leg.aircraft}</p>}
          {leg.duration && <p>Duration: {leg.duration}</p>}
          {leg.baggage && <p>Baggage: {leg.baggage}</p>}
        </div>
      )}
    </div>
  )
}
