import type { Booking } from '../types'
import type { SegmentEntry } from './segment'
import { cancelByText, dateRangeText, flat, rowsOf, singleSegment } from './fields'
import type { TypeBody } from './fields'

// Excursion / tour details. An excursion is usually a child booking of a cruise
// (parent_booking_id), but this layout works for a standalone tour too.
const KEYS = ['operator', 'meeting_point', 'duration', 'tickets', 'guide_contact', 'bring', 'cancel_by'] as const
export type ExcursionDetails = Record<(typeof KEYS)[number], string | null>

export function parseExcursionDetails(raw: unknown): ExcursionDetails | null {
  return flat(raw, KEYS)
}

export function excursionHeadline(b: Booking): string | null {
  return dateRangeText(b) || null
}

export function excursionBody(d: ExcursionDetails): TypeBody {
  return {
    rows: rowsOf([
      ['Operator', d.operator],
      ['Meeting point', d.meeting_point],
      ['Duration', d.duration],
      ['Tickets', d.tickets],
      ['Free cancellation until', cancelByText(d.cancel_by)],
    ]),
    extra: rowsOf([
      ['Guide contact', d.guide_contact],
      ['Bring', d.bring],
    ]),
  }
}

export function excursionSegments(b: Booking, d: ExcursionDetails): SegmentEntry[] {
  return singleSegment(b, {
    kindLabel: 'Excursion',
    title: b.provider_name,
    detail: d.meeting_point ? `Meet: ${d.meeting_point}` : '',
    icon: '🧭',
  })
}
