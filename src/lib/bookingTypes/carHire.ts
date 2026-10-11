import type { Booking } from '../types'
import type { SegmentEntry } from './segment'
import { cancelByText, dateRangeText, detailsObject, flat, rowsOf, startEndSegments, strList } from './fields'
import type { TypeBody } from './fields'

// Car hire details. Pick-up and drop-off dates and times stay in the core
// booking columns.
const KEYS = [
  'supplier',
  'pickup_location',
  'return_location',
  'car_class',
  'fuel_policy',
  'excess',
  'insurance',
  'registration',
  'phone',
  'mileage',
  'cancel_by',
] as const
export type CarHireDetails = Record<(typeof KEYS)[number], string | null> & { drivers: string[] }

export function parseCarHireDetails(raw: unknown): CarHireDetails | null {
  const f = flat(raw, KEYS)
  const o = detailsObject(raw)
  if (!f || !o) return null
  return { ...f, drivers: strList(o.drivers) }
}

export function carHireHeadline(b: Booking, d: CarHireDetails): string | null {
  const place =
    d.pickup_location && d.return_location
      ? d.pickup_location === d.return_location
        ? `Pick-up and return ${d.pickup_location}`
        : `${d.pickup_location} → ${d.return_location}`
      : null
  const parts = [place, dateRangeText(b)].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function carHireBody(d: CarHireDetails): TypeBody {
  const same = d.pickup_location != null && d.pickup_location === d.return_location
  return {
    rows: rowsOf([
      ['Car', d.car_class],
      same ? ['Pick-up / return', d.pickup_location] : ['Pick-up', d.pickup_location],
      same ? ['Drop-off', null] : ['Drop-off', d.return_location],
      ['Excess', d.excess],
      ['Free cancellation until', cancelByText(d.cancel_by)],
    ]),
    extra: rowsOf([
      ['Supplier', d.supplier],
      ['Drivers', d.drivers.join(', ')],
      ['Fuel policy', d.fuel_policy],
      ['Mileage', d.mileage],
      ['Insurance', d.insurance],
      ['Registration', d.registration],
      ['Phone', d.phone],
    ]),
  }
}

export function carHireSegments(b: Booking, d: CarHireDetails): SegmentEntry[] {
  return startEndSegments(b, {
    startLabel: 'Car pick-up',
    endLabel: 'Car drop-off',
    startIcon: '🚗',
    endIcon: '🔑',
    startDetail: d.pickup_location,
    endDetail: d.return_location,
  })
}
