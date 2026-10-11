import type { Booking } from '../types'
import type { SegmentEntry } from './segment'
import type { TypeBody } from './fields'
import { flightHasExtras, flightHeadline, flightSegments, parseFlightDetails } from './flight'
import { cruiseBody, cruiseHeadline, cruiseSegments, parseCruiseDetails } from './cruise'
import { hotelBody, hotelHeadline, hotelSegments, parseHotelDetails } from './hotel'
import { carHireBody, carHireHeadline, carHireSegments, parseCarHireDetails } from './carHire'
import { excursionBody, excursionHeadline, excursionSegments, parseExcursionDetails } from './excursion'
import { parseTransferDetails, transferBody, transferHeadline, transferSegments } from './transfer'

// The booking-type registry (Missing Features #83, design decisions 1, 14, 16).
// Each type declares how its card headline is built, which timeline entries it
// produces, the rows its card shows and whether it has extra fields for the
// "Show details" toggle. Every function returns null when the booking has no
// usable `details`, so a booking of any type (or an unknown type) falls back to
// today's generic card and begin/end timeline markers. Flight (phase 2) renders
// its legs in BookingTypeBody; cruise, hotel, car hire, excursion and transfer
// (phase 3) render rows. `other` (package) has no layout yet.
type TypeDef = {
  label: string
  icon: string
  headline(b: Booking): string | null
  /** Timeline entries replacing the generic begin/end markers, or null to keep them. */
  segments(b: Booking): SegmentEntry[] | null
  /** Label/value rows under the headline, for the types that are not leg-based. */
  body?(b: Booking): TypeBody | null
  /** Only needed when the extras are not simply the body's `extra` rows (flight). */
  hasExtras?(b: Booking): boolean
}

const REGISTRY: Record<string, TypeDef> = {
  flight: {
    label: 'Flight',
    icon: '✈️',
    headline(b) {
      const d = parseFlightDetails(b.details)
      return d ? flightHeadline(d) : null
    },
    segments(b) {
      const d = parseFlightDetails(b.details)
      return d ? flightSegments(b, d) : null
    },
    hasExtras(b) {
      const d = parseFlightDetails(b.details)
      return d ? flightHasExtras(d) : false
    },
  },
  cruise: {
    label: 'Cruise',
    icon: '🚢',
    headline(b) {
      const d = parseCruiseDetails(b.details)
      return d ? cruiseHeadline(b, d) : null
    },
    segments(b) {
      const d = parseCruiseDetails(b.details)
      return d ? cruiseSegments(b, d) : null
    },
    body(b) {
      const d = parseCruiseDetails(b.details)
      return d ? cruiseBody(d) : null
    },
  },
  hotel: {
    label: 'Hotel',
    icon: '🏨',
    headline(b) {
      return parseHotelDetails(b.details) ? hotelHeadline(b) : null
    },
    segments(b) {
      const d = parseHotelDetails(b.details)
      return d ? hotelSegments(b, d) : null
    },
    body(b) {
      const d = parseHotelDetails(b.details)
      return d ? hotelBody(d) : null
    },
  },
  car_hire: {
    label: 'Car hire',
    icon: '🚗',
    headline(b) {
      const d = parseCarHireDetails(b.details)
      return d ? carHireHeadline(b, d) : null
    },
    segments(b) {
      const d = parseCarHireDetails(b.details)
      return d ? carHireSegments(b, d) : null
    },
    body(b) {
      const d = parseCarHireDetails(b.details)
      return d ? carHireBody(d) : null
    },
  },
  excursion: {
    label: 'Excursion',
    icon: '🧭',
    headline(b) {
      return parseExcursionDetails(b.details) ? excursionHeadline(b) : null
    },
    segments(b) {
      const d = parseExcursionDetails(b.details)
      return d ? excursionSegments(b, d) : null
    },
    body(b) {
      const d = parseExcursionDetails(b.details)
      return d ? excursionBody(d) : null
    },
  },
  transfer: {
    label: 'Transfer',
    icon: '🚐',
    headline(b) {
      const d = parseTransferDetails(b.details)
      return d ? transferHeadline(b, d) : null
    },
    segments(b) {
      const d = parseTransferDetails(b.details)
      return d ? transferSegments(b, d) : null
    },
    body(b) {
      const d = parseTransferDetails(b.details)
      return d ? transferBody(d) : null
    },
  },
}

function def(b: Booking): TypeDef | null {
  return b.type ? (REGISTRY[b.type] ?? null) : null
}

export function bookingHeadline(b: Booking): string | null {
  return def(b)?.headline(b) ?? null
}

export function bookingSegments(b: Booking): SegmentEntry[] | null {
  return def(b)?.segments(b) ?? null
}

/** The rows for a non-flight typed booking, or null for the generic card. */
export function bookingBody(b: Booking): TypeBody | null {
  return def(b)?.body?.(b) ?? null
}

export function bookingHasTypeExtras(b: Booking): boolean {
  const d = def(b)
  if (!d) return false
  if (d.hasExtras) return d.hasExtras(b)
  return (d.body?.(b)?.extra.length ?? 0) > 0
}
