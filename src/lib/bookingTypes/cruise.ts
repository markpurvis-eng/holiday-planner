import type { Booking } from '../types'
import { formatMoney } from '../format'
import type { SegmentEntry } from './segment'
import { dateRangeText, detailsObject, num, rowsOf, startEndSegments, str } from './fields'
import type { TypeBody } from './fields'

// Cruise details. Embark and disembark dates and times used by the timeline stay
// in the core booking columns; the embark_time / disembark_time here are the
// times printed on the confirmation (for example the sailing time) and are only
// displayed.
export type CruiseExtra = {
  name: string
  paid: boolean
  cost: number | null
  currency: string | null
}

export type CruiseDetails = {
  cruise_line: string | null
  ship: string | null
  voyage: string | null
  cabin: string | null
  category: string | null
  deck: string | null
  dining: string | null
  embark_port: string | null
  embark_terminal: string | null
  embark_time: string | null
  disembark_port: string | null
  disembark_terminal: string | null
  disembark_time: string | null
  muster: string | null
  extras: CruiseExtra[]
}

export function parseCruiseDetails(raw: unknown): CruiseDetails | null {
  const o = detailsObject(raw)
  if (!o) return null
  const extras: CruiseExtra[] = Array.isArray(o.extras)
    ? o.extras.flatMap((e) => {
        if (!e || typeof e !== 'object') return []
        const eo = e as Record<string, unknown>
        const name = str(eo.name)
        return name ? [{ name, paid: eo.paid === true, cost: num(eo.cost), currency: str(eo.currency) }] : []
      })
    : []
  return {
    cruise_line: str(o.cruise_line),
    ship: str(o.ship),
    voyage: str(o.voyage),
    cabin: str(o.cabin),
    category: str(o.category),
    deck: str(o.deck),
    dining: str(o.dining),
    embark_port: str(o.embark_port),
    embark_terminal: str(o.embark_terminal),
    embark_time: str(o.embark_time),
    disembark_port: str(o.disembark_port),
    disembark_terminal: str(o.disembark_terminal),
    disembark_time: str(o.disembark_time),
    muster: str(o.muster),
    extras,
  }
}

export function cruiseHeadline(b: Booking, d: CruiseDetails): string | null {
  const route =
    d.embark_port && d.disembark_port
      ? d.embark_port === d.disembark_port
        ? `Round trip from ${d.embark_port}`
        : `${d.embark_port} → ${d.disembark_port}`
      : null
  const parts = [d.ship, route, dateRangeText(b)].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

function portLine(port: string | null, terminal: string | null, time: string | null): string | null {
  const parts = [port, terminal, time].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function cruiseBody(d: CruiseDetails): TypeBody {
  const cabin = [d.cabin, d.category, d.deck ? `Deck ${d.deck}` : null].filter(Boolean).join(' · ')
  const extras = d.extras
    .map(
      (e) =>
        `${e.name} – ${e.paid ? 'paid' : 'not paid'}${e.cost != null ? ` (${formatMoney(e.cost, e.currency)})` : ''}`
    )
    .join('\n')
  return {
    rows: rowsOf([
      ['Cabin', cabin],
      ['Dining', d.dining],
      ['Embark', portLine(d.embark_port, d.embark_terminal, d.embark_time)],
      ['Disembark', portLine(d.disembark_port, d.disembark_terminal, d.disembark_time)],
      ['Extras', extras],
    ]),
    extra: rowsOf([
      ['Cruise line', d.cruise_line],
      ['Voyage', d.voyage],
      ['Muster station', d.muster],
    ]),
  }
}

export function cruiseSegments(b: Booking, d: CruiseDetails): SegmentEntry[] {
  return startEndSegments(b, {
    startLabel: 'Embark',
    endLabel: 'Disembark',
    startIcon: '🚢',
    endIcon: '⚓',
    startDetail: d.embark_port,
    endDetail: d.disembark_port,
  })
}
