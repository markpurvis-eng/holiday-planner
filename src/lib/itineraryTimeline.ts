import type { Booking, ItineraryItem } from './types'
import { bookingSegments } from './bookingTypes/registry'
import type { TimelineSegment } from './bookingTypes/segment'

export type TimelineEntry =
  | { kind: 'bookingStart'; date: string; time: string | null; booking: Booking }
  | { kind: 'bookingEnd'; date: string; time: string | null; booking: Booking }
  // One journey segment of a typed booking (a flight leg). Produced by the
  // booking-type registry in place of the generic begin/end markers.
  | { kind: 'bookingSegment'; date: string; time: string | null; booking: Booking; segment: TimelineSegment }
  | { kind: 'itineraryItem'; date: string; time: string | null; item: ItineraryItem }

// Merges bookings and itinerary items into one chronological timeline.
// `Booking` stays the single source of truth for its own dates — nothing
// gets copied into `itinerary_item` (see Holiday_App_Architecture_Notes.md,
// "Itinerary item"). A booking contributes a start marker on its
// start_date and, if end_date differs, a separate end marker there too
// (a booking with only one of the two dates gets a single marker on
// whichever date it has).
//
// Time-of-day precision: `booking.start_time`/`end_time` are nullable —
// most existing bookings don't have one backfilled yet (see
// Holiday_App_Issues_and_Roadmap.md, "Time-of-day precision for bookings").
// The sort below is a hybrid: an entry with a known time sorts
// chronologically alongside every other timed entry that day, regardless
// of kind. An entry with no known time falls back to a placeholder
// position — a booking-start with no time sorts before the day's timed
// entries, a booking-end with no time sorts after them — since that's a
// better guess than pretending it happened at midnight. As real times get
// backfilled, ordering improves automatically; nothing here needs
// changing again.
export function mergeItineraryTimeline(bookings: Booking[], itinerary: ItineraryItem[]): TimelineEntry[] {
  const entries: TimelineEntry[] = []

  for (const b of bookings) {
    // A typed booking with usable details contributes its own entries (one
    // per flight leg) instead of the generic begin/end markers. Anything
    // else falls through to the markers below, unchanged.
    const segments = bookingSegments(b)
    if (segments) {
      for (const s of segments) {
        entries.push({ kind: 'bookingSegment', date: s.date, time: s.time, booking: b, segment: s.segment })
      }
      continue
    }
    if (b.start_date) {
      entries.push({ kind: 'bookingStart', date: b.start_date, time: b.start_time, booking: b })
    }
    if (b.end_date && b.end_date !== b.start_date) {
      entries.push({ kind: 'bookingEnd', date: b.end_date, time: b.end_time, booking: b })
    } else if (b.end_date && !b.start_date) {
      entries.push({ kind: 'bookingEnd', date: b.end_date, time: b.end_time, booking: b })
    }
  }

  for (const item of itinerary) {
    entries.push({ kind: 'itineraryItem', date: item.date, time: item.time, item })
  }

  // Tier 1 is "sorts by real time" — every itinerary item lands there
  // (whether or not it has a time, matching the pre-existing convention of
  // an empty-string time key sorting first), and so does any booking
  // marker whose time is actually known. Tiers 0/2 are the placeholder
  // positions for booking markers still missing a time.
  function tier(e: TimelineEntry): number {
    if (e.kind === 'itineraryItem' || e.time) return 1
    // An untimed segment sorts like an untimed start marker: before the day's timed entries.
    return e.kind === 'bookingEnd' ? 2 : 0
  }

  return entries.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    const tierDiff = tier(a) - tier(b)
    if (tierDiff !== 0) return tierDiff
    return (a.time ?? '').localeCompare(b.time ?? '')
  })
}
