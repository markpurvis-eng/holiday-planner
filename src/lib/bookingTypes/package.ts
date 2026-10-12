import type { Booking } from '../types'
import type { SegmentEntry } from './segment'
import { dateRangeText, detailsObject, flat, rowsOf, strList } from './fields'
import type { TypeBody } from './fields'

// Package details (booking type `other`; Missing Features #83, phase 5). A
// package bundles several things (a golf or pickleball package, an
// all-inclusive stay), so the layout is a short free-form summary: who sold it,
// where you stay, what is included and how it is paid for. It is display only.
// Dates and times stay in the core booking columns, and a package keeps the
// generic begin/end timeline markers (it has no segments of its own).
const KEYS = ['supplier', 'accommodation', 'payments'] as const
export type PackageDetails = Record<(typeof KEYS)[number], string | null> & { includes: string[] }

export function parsePackageDetails(raw: unknown): PackageDetails | null {
  const f = flat(raw, KEYS)
  const o = detailsObject(raw)
  if (!f || !o) return null
  return { ...f, includes: strList(o.includes) }
}

export function packageHeadline(b: Booking): string | null {
  return dateRangeText(b) || null
}

export function packageBody(d: PackageDetails): TypeBody {
  return {
    rows: rowsOf([
      ['Stay', d.accommodation],
      ['Includes', d.includes.join('; ')],
    ]),
    extra: rowsOf([
      ['Supplier', d.supplier],
      ['Payments', d.payments],
    ]),
  }
}

/** A package keeps the generic begin/end timeline markers. */
export function packageSegments(): SegmentEntry[] | null {
  return null
}
