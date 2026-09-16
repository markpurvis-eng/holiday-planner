import type { Booking, ItineraryItem, PaymentStatus } from './types'
import { updateBooking, updateItineraryItem } from './api'
import { fetchGbpRate } from './fx'

export type CostLine = {
  key: string
  kind: 'booking' | 'itinerary_item'
  id: string
  label: string
  cost: number
  currency: string
  paymentStatus: PaymentStatus
  fxRateToGbp: number | null
  fxRateLockedAt: string | null
}

// Only cost-bearing, non-cancelled bookings/itinerary items count towards
// the roll-up — a cancelled line isn't a real cost any more, regardless
// of the personal "hide cancelled" display setting used elsewhere.
export function buildCostLines(bookings: Booking[], itinerary: ItineraryItem[]): CostLine[] {
  const lines: CostLine[] = []

  for (const b of bookings) {
    if (b.cancelled || b.cost == null || !b.currency) continue
    lines.push({
      key: `booking-${b.id}`,
      kind: 'booking',
      id: b.id,
      label: b.provider_name,
      cost: b.cost,
      currency: b.currency,
      paymentStatus: b.payment_status,
      fxRateToGbp: b.fx_rate_to_gbp,
      fxRateLockedAt: b.fx_rate_locked_at,
    })
  }

  for (const item of itinerary) {
    if (item.cancelled || item.cost == null || !item.currency) continue
    lines.push({
      key: `itinerary_item-${item.id}`,
      kind: 'itinerary_item',
      id: item.id,
      label: `${item.type}: ${item.venue ?? ''}`,
      cost: item.cost,
      currency: item.currency,
      paymentStatus: item.payment_status,
      fxRateToGbp: item.fx_rate_to_gbp,
      fxRateLockedAt: item.fx_rate_locked_at,
    })
  }

  return lines
}

// "The moment a cost line flips from outstanding -> paid, fetch and lock
// the rate" (confirmed design) assumes something in the app fires on that
// transition — but there's no in-app edit screen yet (bookings/itinerary
// items only change via direct SQL or the retired Claude-for-Excel
// workflow), so there's no event to hook. This does the equivalent job
// lazily instead: whenever the Costs tab loads and finds a paid line with
// no locked rate yet, it locks one right then. Functionally the same
// outcome — first time the app *notices* a line is paid-but-unlocked, it
// locks it — and it naturally covers the "archive safety net" from the
// design too, since archived trips still go through this same check
// rather than needing separate handling.
export async function ensureLockedRates(lines: CostLine[]): Promise<CostLine[]> {
  const toLock = lines.filter((l) => l.paymentStatus === 'paid' && l.fxRateToGbp == null)
  if (toLock.length === 0) return lines

  const results = await Promise.all(
    toLock.map(async (line) => {
      const rate = await fetchGbpRate(line.currency)
      const lockedAt = new Date().toISOString()
      if (line.kind === 'booking') {
        await updateBooking(line.id, { fx_rate_to_gbp: rate, fx_rate_locked_at: lockedAt })
      } else {
        await updateItineraryItem(line.id, { fx_rate_to_gbp: rate, fx_rate_locked_at: lockedAt })
      }
      return { key: line.key, rate, lockedAt }
    })
  )

  const byKey = new Map(results.map((r) => [r.key, r]))
  return lines.map((line) => {
    const locked = byKey.get(line.key)
    return locked ? { ...line, fxRateToGbp: locked.rate, fxRateLockedAt: locked.lockedAt } : line
  })
}

// Manual override: writes a rate the person typed in directly, stamping
// fx_rate_locked_at so it behaves exactly like a normal locked rate from
// here on (covers "use my card's actual applied rate instead of
// Frankfurter's", or a currency Frankfurter doesn't cover).
export async function setManualRate(line: CostLine, rate: number): Promise<{ rate: number; lockedAt: string }> {
  const lockedAt = new Date().toISOString()
  if (line.kind === 'booking') {
    await updateBooking(line.id, { fx_rate_to_gbp: rate, fx_rate_locked_at: lockedAt })
  } else {
    await updateItineraryItem(line.id, { fx_rate_to_gbp: rate, fx_rate_locked_at: lockedAt })
  }
  return { rate, lockedAt }
}
