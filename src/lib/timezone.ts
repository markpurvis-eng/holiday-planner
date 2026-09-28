import tzlookup from 'tz-lookup'
import type { TimelineEntry } from './itineraryTimeline'

// Every trip is planned from the UK; "home" is a fixed zone rather than the
// device's own timezone, so the label reads the same whether Mark checks it
// from his UK phone before leaving or (the whole point of this feature)
// already at the destination confused about what time it is.
export const HOME_TIMEZONE = 'Europe/London'

// Looks up the IANA timezone for a lat/lng pair. tz-lookup throws for a
// handful of points with no resolvable zone (open ocean); treated as
// "unknown" rather than crashing the render.
export function resolveTimezone(lat: number | null | undefined, lng: number | null | undefined): string | null {
  if (lat == null || lng == null) return null
  try {
    return tzlookup(lat, lng)
  } catch {
    return null
  }
}

// A timeline entry's own booking/itinerary_item carries destination_lat/lng
// for its specific leg of a multi-city trip (see weather.ts's
// findLocationForDate/findItineraryLocationForDate). Deliberately does NOT
// fall back to the trip's single anchor point the way weather.ts does:
// weather guessing wrong for a day just shows the wrong forecast, but
// guessing wrong here actively mislabels a time — the bug this was built
// to catch. A taxi to the airport, or the outbound flight's own departure
// marker, are still coordinate-less bookings/items physically in the UK
// even on a trip whose anchor is Canada/Vietnam; falling back to the trip
// anchor was labelling them as if already at the destination. Flights in
// particular are deliberately left with NO coordinates at all (see
// weather.ts) since a single lat/lng can't represent both ends of a
// journey — so an uncoordinated entry now correctly shows no home-time
// label at all, rather than a wrong one. This does mean fewer labels
// appear overall (an itinerary item genuinely at the destination but
// missing its own coordinates won't get one either) — an intentional
// trade of fewer-but-correct over more-but-sometimes-wrong.
export function resolveEntryTimezone(entry: TimelineEntry): string | null {
  const lat = entry.kind === 'itineraryItem' ? entry.item.destination_lat : entry.booking.destination_lat
  const lng = entry.kind === 'itineraryItem' ? entry.item.destination_lng : entry.booking.destination_lng
  return resolveTimezone(lat, lng)
}

// Offset (in minutes) of `timeZone` from UTC at the given instant, i.e.
// local = UTC + offset. Used both directions in convertWallTime below.
function offsetMinutesAt(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return (asUtc - date.getTime()) / 60000
}

// Converts a wall-clock "HH:MM" on a given date, understood to be in
// `fromTz`, into the equivalent wall-clock time (and a -1/0/+1 day offset)
// in `toTz`. Two-pass DST-aware approximation: treat the wall time as UTC to
// get a same-instant ballpark, read fromTz's real offset there to correct to
// the actual UTC instant, then read toTz's offset at that instant for the
// final local time. Wrong only right at a DST transition boundary itself —
// an acceptable edge case for this feature.
export function convertWallTime(
  dateStr: string,
  timeStr: string,
  fromTz: string,
  toTz: string
): { time: string; dayOffset: number } {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const guessUtcMs = Date.UTC(y, m - 1, d, hh, mm)
  const fromOffset = offsetMinutesAt(new Date(guessUtcMs), fromTz)
  const actualUtcMs = guessUtcMs - fromOffset * 60000

  const toOffset = offsetMinutesAt(new Date(actualUtcMs), toTz)
  const local = new Date(actualUtcMs + toOffset * 60000)

  const time = `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`
  const originalMidnightMs = Date.UTC(y, m - 1, d)
  const localMidnightMs = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const dayOffset = Math.round((localMidnightMs - originalMidnightMs) / 86400000)
  return { time, dayOffset }
}

// Home-equivalent label for a destination-local time, e.g. "09:30 UK" or
// "09:30 UK (-1 day)" — or null when the destination is the same timezone
// as home (nothing useful to add, and most bookings/itinerary items have no
// coordinates at all yet, so this is the common case).
export function homeTimeLabel(dateStr: string, timeStr: string, destinationTz: string): string | null {
  if (destinationTz === HOME_TIMEZONE) return null
  const { time, dayOffset } = convertWallTime(dateStr, timeStr, destinationTz, HOME_TIMEZONE)
  const dayNote = dayOffset === 0 ? '' : dayOffset > 0 ? ' (+1 day)' : ' (-1 day)'
  return `${time} UK${dayNote}`
}
