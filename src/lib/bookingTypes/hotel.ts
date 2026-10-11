import type { Booking } from '../types'
import type { SegmentEntry } from './segment'
import { cancelByText, dateRangeText, flat, nightsBetween, rowsOf, startEndSegments } from './fields'
import type { TypeBody } from './fields'

// Hotel / stay details (Holiday_App_Booking_Types_Design.md, "Field lists").
// Check-in and check-out dates and times stay in the core booking columns; the
// timeline's check-in / check-out entries read them from there.
const KEYS = ['room_type', 'board_basis', 'guests', 'phone', 'parking', 'cancel_by', 'cancellation'] as const
export type HotelDetails = Record<(typeof KEYS)[number], string | null>

export function parseHotelDetails(raw: unknown): HotelDetails | null {
  return flat(raw, KEYS)
}

export function hotelHeadline(b: Booking): string | null {
  const range = dateRangeText(b)
  const n = nightsBetween(b)
  const parts = [range, n ? `${n} night${n === 1 ? '' : 's'}` : null].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function hotelBody(d: HotelDetails): TypeBody {
  const cancelBy = cancelByText(d.cancel_by)
  return {
    rows: rowsOf([
      ['Room', d.room_type],
      ['Board', d.board_basis],
      ['Guests', d.guests],
      ['Free cancellation until', cancelBy],
    ]),
    extra: rowsOf([
      ['Phone', d.phone],
      ['Parking', d.parking],
      ['Cancellation', d.cancellation],
    ]),
  }
}

export function hotelSegments(b: Booking, d: HotelDetails): SegmentEntry[] {
  return startEndSegments(b, {
    startLabel: 'Check-in',
    endLabel: 'Check-out',
    startIcon: '🛎️',
    endIcon: '🏁',
    startDetail: d.room_type,
  })
}
