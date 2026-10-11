import type { Booking } from '../types'
import type { SegmentEntry } from './segment'
import { cancelByText, dateRangeText, flat, rowsOf, singleSegment } from './fields'
import type { TypeBody } from './fields'

// Transfer details: one journey segment (from, to, pick-up point, vehicle, the
// flight to track). A hotel transfer whose cost is included in the stay leaves
// the booking's cost null. There is no data for this type yet; the layout is
// ready for the first transfer booking.
const KEYS = ['from', 'to', 'pickup_point', 'flight_to_track', 'driver_contact', 'vehicle', 'cancel_by'] as const
export type TransferDetails = Record<(typeof KEYS)[number], string | null>

export function parseTransferDetails(raw: unknown): TransferDetails | null {
  return flat(raw, KEYS)
}

function route(d: TransferDetails): string | null {
  return d.from && d.to ? `${d.from} → ${d.to}` : null
}

export function transferHeadline(b: Booking, d: TransferDetails): string | null {
  const parts = [route(d), dateRangeText(b)].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function transferBody(d: TransferDetails): TypeBody {
  return {
    rows: rowsOf([
      ['Pick-up point', d.pickup_point],
      ['Flight to track', d.flight_to_track],
      ['Vehicle', d.vehicle],
      ['Free cancellation until', cancelByText(d.cancel_by)],
    ]),
    extra: rowsOf([['Driver contact', d.driver_contact]]),
  }
}

export function transferSegments(b: Booking, d: TransferDetails): SegmentEntry[] {
  return singleSegment(b, {
    kindLabel: 'Transfer',
    title: route(d) ?? b.provider_name,
    subtitle: d.flight_to_track ?? '',
    detail: d.pickup_point ? `Pick-up: ${d.pickup_point}` : '',
    icon: '🚐',
  })
}
