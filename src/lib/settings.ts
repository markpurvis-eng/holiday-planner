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

// Remembers the type/currency used on the last new itinerary item added
// from this device, so the "Add itinerary item" form can default to them.
// While travelling, adding a run of similar items (several dining stops, a
// few local transport hops) is the common case, so repeating the last
// choice saves retyping more often than it guesses wrong.
const LAST_ITINERARY_TYPE_KEY = 'holiday-planner:lastItineraryType'
const LAST_ITINERARY_CURRENCY_KEY = 'holiday-planner:lastItineraryCurrency'

export function getLastItineraryType(): string {
  return localStorage.getItem(LAST_ITINERARY_TYPE_KEY) ?? ''
}

export function setLastItineraryType(value: string): void {
  if (value) localStorage.setItem(LAST_ITINERARY_TYPE_KEY, value)
}

export function getLastItineraryCurrency(): string {
  return localStorage.getItem(LAST_ITINERARY_CURRENCY_KEY) ?? ''
}

export function setLastItineraryCurrency(value: string): void {
  if (value) localStorage.setItem(LAST_ITINERARY_CURRENCY_KEY, value)
}
