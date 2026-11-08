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

// Trips whose "move to Past?" launch prompt the user answered "Leave it" to,
// so Dashboard doesn't ask about the same trip again on this device.
const ARCHIVE_PROMPT_DISMISSED_KEY = 'holiday-planner:archivePromptDismissed'

export function getArchivePromptDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(ARCHIVE_PROMPT_DISMISSED_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function dismissArchivePrompt(tripId: string): void {
  try {
    const ids = getArchivePromptDismissed()
    ids.add(tripId)
    localStorage.setItem(ARCHIVE_PROMPT_DISMISSED_KEY, JSON.stringify([...ids]))
  } catch {
    // Storage unavailable: the prompt may reappear next launch; harmless.
  }
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
