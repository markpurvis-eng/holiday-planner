import type { Booking } from '../types'

// A child booking's dates should normally sit within its parent's (Missing
// Features #83, design decision 11). This is a warning only, never a block:
// a transfer can fall a day either side of a stay. Returns false whenever
// either side lacks the dates to compare.
export function childOutsideParentDates(child: Booking, parent: Booking): boolean {
  if (!child.start_date || !parent.start_date) return false
  const parentEnd = parent.end_date ?? parent.start_date
  const childEnd = child.end_date ?? child.start_date
  return child.start_date < parent.start_date || childEnd > parentEnd
}
