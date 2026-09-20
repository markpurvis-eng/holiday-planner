import type { Booking, Expense, ItineraryItem, PaymentStatus } from './types'
import { updateBooking, updateItineraryItem, updateExpense, deleteExpense } from './api'
import { fetchGbpRate } from './fx'

export type CostLine = {
  key: string
  kind: 'booking' | 'itinerary_item' | 'expense'
  id: string
  label: string
  cost: number
  currency: string
  paymentStatus: PaymentStatus
  fxRateToGbp: number | null
  fxRateLockedAt: string | null
  // Only meaningful for kind === 'expense' — which booking/itinerary item
  // (if any) it's attached to, so the display layer can nest it under
  // that line's card instead of always showing it flat. Both null means
  // trip-level.
  attachedBookingId?: string | null
  attachedItineraryItemId?: string | null
  // Booking start_date / itinerary_item date. Not meaningful for
  // kind === 'expense' (an expense's relevant date is paid_on, not
  // tracked here). Used by CostsTab's per-card "+" (add a pre-filled ad
  // hoc expense) to default Add Expense's date field to the card's own
  // date rather than today.
  date?: string | null
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
      date: b.start_date,
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
      date: item.date,
    })
  }

  return lines
}

// Ad hoc payments (tips, souvenirs, taxis, etc.) - always "paid", since
// an expense is recorded after the fact, not planned then settled later.
export function buildExpenseCostLines(expenses: Expense[]): CostLine[] {
  return expenses.map((e) => ({
    key: `expense-${e.id}`,
    kind: 'expense',
    id: e.id,
    label: e.label,
    cost: e.amount,
    currency: e.currency,
    paymentStatus: 'paid',
    fxRateToGbp: e.fx_rate_to_gbp,
    fxRateLockedAt: e.fx_rate_locked_at,
    attachedBookingId: e.booking_id,
    attachedItineraryItemId: e.itinerary_item_id,
  }))
}

async function writeLockedRate(line: CostLine, rate: number, lockedAt: string): Promise<void> {
  if (line.kind === 'booking') {
    await updateBooking(line.id, { fx_rate_to_gbp: rate, fx_rate_locked_at: lockedAt })
  } else if (line.kind === 'itinerary_item') {
    await updateItineraryItem(line.id, { fx_rate_to_gbp: rate, fx_rate_locked_at: lockedAt })
  } else {
    await updateExpense(line.id, { fx_rate_to_gbp: rate, fx_rate_locked_at: lockedAt })
  }
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
// rather than needing separate handling. Expenses are always created with
// a rate already locked, so in practice this is a no-op for them unless
// one was inserted directly via SQL without one.
export async function ensureLockedRates(lines: CostLine[]): Promise<CostLine[]> {
  const toLock = lines.filter((l) => l.paymentStatus === 'paid' && l.fxRateToGbp == null)
  if (toLock.length === 0) return lines

  const results = await Promise.all(
    toLock.map(async (line) => {
      const rate = await fetchGbpRate(line.currency)
      const lockedAt = new Date().toISOString()
      await writeLockedRate(line, rate, lockedAt)
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
  await writeLockedRate(line, rate, lockedAt)
  return { rate, lockedAt }
}

// Expenses are user-entered ad hoc data (unlike bookings/itinerary items,
// which come from the Claude-for-Excel workflow), so deleting one outright
// is reasonable — no cancelled flag/soft-delete needed for this table.
export async function deleteExpenseLine(line: CostLine): Promise<void> {
  if (line.kind !== 'expense') return
  await deleteExpense(line.id)
}

// --- Display grouping (bundling small ad hoc items) -----------------------
// A trip can accumulate many small ad hoc expenses (tips, souvenirs,
// taxis...) that would otherwise take up more space than the actual
// booking/flight/hotel lines they're attached to. This groups
// the flat CostLine[] into what the Costs tab actually renders: each
// booking/itinerary line as its own row (unchanged), with any ad hoc
// expenses attached specifically to it nested underneath as a collapsible
// sub-total; and every trip-level ad hoc expense (attached to neither)
// collected into one collapsible bundle card. Purely a display transform —
// it doesn't change what counts towards Paid/Outstanding/Grand total,
// which are still summed over every individual CostLine regardless of how
// this groups them for rendering.

export type CostRow =
  | { kind: 'line'; line: CostLine; nested: CostLine[] }
  | { kind: 'expenseBundle'; key: string; label: string; lines: CostLine[] }

export function groupCostLines(lines: CostLine[]): CostRow[] {
  const primary = lines.filter((l) => l.kind !== 'expense')
  const expenses = lines.filter((l) => l.kind === 'expense')

  const nestedByParentKey = new Map<string, CostLine[]>()
  const tripLevel: CostLine[] = []

  for (const e of expenses) {
    const parentKey = e.attachedBookingId
      ? `booking-${e.attachedBookingId}`
      : e.attachedItineraryItemId
        ? `itinerary_item-${e.attachedItineraryItemId}`
        : null
    if (parentKey) {
      const list = nestedByParentKey.get(parentKey) ?? []
      list.push(e)
      nestedByParentKey.set(parentKey, list)
    } else {
      tripLevel.push(e)
    }
  }

  const rows: CostRow[] = primary.map((line) => ({
    kind: 'line',
    line,
    nested: nestedByParentKey.get(line.key) ?? [],
  }))

  if (tripLevel.length > 0) {
    rows.push({
      kind: 'expenseBundle',
      key: 'trip-level-expenses',
      label: 'Ad hoc expenses',
      lines: tripLevel,
    })
  }

  return rows
}
