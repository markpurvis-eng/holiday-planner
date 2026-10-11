import type { Booking } from '../types'
import { formatDate, formatTime } from '../format'
import { resolveTimezone } from '../timezone'
import type { SegmentEntry } from './segment'

// Helpers shared by the non-flight booking types (cruise, hotel, car hire,
// transfer, excursion). Their `details` are flat label/value fields, so each
// type module only has to say which fields it has and in what order; the card
// renders them as rows (see BookingTypeBody). All parsing is defensive: the
// column is free-form JSON, and anything malformed returns null so the booking
// falls back to the generic card.

/** One "Label  value" line on a booking card. */
export type Row = { label: string; value: string }

/** What a typed booking shows under its headline: always-visible rows, and rows behind "Show details". */
export type TypeBody = { rows: Row[]; extra: Row[] }

export function str(x: unknown): string | null {
  return typeof x === 'string' && x.trim() !== '' ? x.trim() : null
}

export function strList(x: unknown): string[] {
  return Array.isArray(x) ? x.flatMap((s) => (str(s) ? [str(s) as string] : [])) : []
}

export function num(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}

/** Returns the details object when it is a v1 object, otherwise null. */
export function detailsObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  return r.v === 1 ? r : null
}

/** Reads a v1 details object as a record of optional text fields (numbers become text). */
export function flat<K extends string>(raw: unknown, keys: readonly K[]): Record<K, string | null> | null {
  const o = detailsObject(raw)
  if (!o) return null
  const out = {} as Record<K, string | null>
  for (const k of keys) {
    const v = o[k]
    out[k] = typeof v === 'number' && Number.isFinite(v) ? String(v) : str(v)
  }
  return out
}

/** Keeps only the pairs that have a value. */
export function rowsOf(pairs: [string, string | null | undefined][]): Row[] {
  return pairs.flatMap(([label, value]) => (value ? [{ label, value }] : []))
}

/** "03/06/2026 12:00 – 05/06/2026 12:00", the same text the generic card shows. */
export function dateRangeText(b: Booking): string {
  const start = b.start_date ? `${formatDate(b.start_date)}${b.start_time ? ` ${formatTime(b.start_time)}` : ''}` : ''
  const end = b.end_date ? `${formatDate(b.end_date)}${b.end_time ? ` ${formatTime(b.end_time)}` : ''}` : ''
  if (start && end && b.start_date === b.end_date && !b.end_time) return start
  return start && end ? `${start} – ${end}` : start || end
}

/** Whole nights between start and end date, or null when it is not a multi-day stay. */
export function nightsBetween(b: Booking): number | null {
  if (!b.start_date || !b.end_date) return null
  const ms = Date.parse(`${b.end_date}T00:00:00Z`) - Date.parse(`${b.start_date}T00:00:00Z`)
  const n = Math.round(ms / 86400000)
  return n > 0 ? n : null
}

/** "free cancellation until 16/09/2026" from a YYYY-MM-DD or free text value. */
export function cancelByText(value: string | null): string | null {
  if (!value) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : value
}

type StartEndConfig = {
  startLabel: string
  endLabel: string
  startIcon: string
  endIcon: string
  startDetail?: string | null
  endDetail?: string | null
}

// Timeline entries for a booking with a start and an end (hotel check-in and
// check-out, cruise embark and disembark, car pick-up and drop-off). Dates and
// times come from the core booking columns, which stay the single source for
// them (design decision 15). Mirrors the generic begin/end markers' rules: no
// end entry when the end is the same day as the start, and a booking with only
// an end date gets just the end entry.
export function startEndSegments(b: Booking, cfg: StartEndConfig): SegmentEntry[] {
  const tz = resolveTimezone(b.destination_lat, b.destination_lng)
  const entries: SegmentEntry[] = []
  if (b.start_date) {
    entries.push({
      date: b.start_date,
      time: b.start_time,
      segment: {
        id: `${b.id}-start`,
        jumpId: b.id,
        kindLabel: cfg.startLabel,
        title: b.provider_name,
        subtitle: '',
        detail: cfg.startDetail ?? '',
        icon: cfg.startIcon,
        tz,
      },
    })
  }
  if (b.end_date && b.end_date !== b.start_date) {
    entries.push({
      date: b.end_date,
      time: b.end_time,
      segment: {
        id: `${b.id}-end`,
        jumpId: b.id,
        kindLabel: cfg.endLabel,
        title: b.provider_name,
        subtitle: '',
        detail: cfg.endDetail ?? '',
        icon: cfg.endIcon,
        tz,
      },
    })
  }
  return entries
}

// One timeline entry for a single-event booking (an excursion or a transfer).
export function singleSegment(
  b: Booking,
  cfg: { kindLabel: string; title: string; subtitle?: string; detail?: string; icon: string }
): SegmentEntry[] {
  if (!b.start_date) return []
  return [
    {
      date: b.start_date,
      time: b.start_time,
      segment: {
        id: `${b.id}-event`,
        jumpId: b.id,
        kindLabel: cfg.kindLabel,
        title: cfg.title,
        subtitle: cfg.subtitle ?? '',
        detail: cfg.detail ?? '',
        icon: cfg.icon,
        tz: resolveTimezone(b.destination_lat, b.destination_lng),
      },
    },
  ]
}
