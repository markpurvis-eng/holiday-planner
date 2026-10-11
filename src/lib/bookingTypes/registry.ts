import type { Booking } from '../types'
import type { SegmentEntry } from './segment'
import { flightHasExtras, flightHeadline, flightSegments, parseFlightDetails } from './flight'

// The booking-type registry (Missing Features #83, design decisions 1, 14, 16).
// Each type declares how its card headline is built, which timeline entries it
// produces and whether it has extra fields for the "Show details" toggle. Every
// function returns null when the booking has no usable `details`, so a booking
// of any type (or an unknown type) falls back to today's generic card and
// begin/end timeline markers. Only `flight` is defined so far; cruise, hotel,
// car hire, transfer and excursion follow in phase 3.
type TypeDef = {
  label: string
  icon: string
  headline(b: Booking): string | null
  /** Timeline entries replacing the generic begin/end markers, or null to keep them. */
  segments(b: Booking): SegmentEntry[] | null
  hasExtras(b: Booking): boolean
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

export function bookingHasTypeExtras(b: Booking): boolean {
  return def(b)?.hasExtras(b) ?? false
}
