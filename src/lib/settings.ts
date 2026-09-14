// Simple localStorage-backed display preferences. These are personal,
// per-device UI choices (not trip data), so they don't need to live in
// Supabase or sync between Mark and Andi's devices — unlike a booking or
// itinerary item, there's no meaningful "shared" value for whether cancelled
// items are hidden on any given phone.

const HIDE_CANCELLED_KEY = 'holiday-planner:hideCancelledItems'

export function getHideCancelledItems(): boolean {
  return localStorage.getItem(HIDE_CANCELLED_KEY) === 'true'
}

export function setHideCancelledItems(value: boolean): void {
  localStorage.setItem(HIDE_CANCELLED_KEY, value ? 'true' : 'false')
}
