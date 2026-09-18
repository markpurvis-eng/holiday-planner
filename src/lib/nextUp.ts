import type { Booking, ItineraryItem } from './types'
import { mergeItineraryTimeline, type TimelineEntry } from './itineraryTimeline'
import { todayDateString } from './format'

// "What's next" / at-a-glance (Missing Features item 13). Booking.com and
// TripIt both surface the next chronological thing on the home screen
// rather than making you dig into the itinerary tab — this is the same
// idea, built on top of mergeItineraryTimeline() (the same one the
// Itinerary tab and the shared PDF already use), so ordering stays
// consistent across all three presentations rather than being
// reimplemented here.
//
// "Still to come" heuristic: an entry on a future date always counts. An
// entry dated today counts if it has no time (can't tell whether it's
// already happened, so it stays visible all day rather than disappearing
// the moment the day starts — a false positive here is much less annoying
// than the card going blank first thing in the morning) or if its time
// hasn't arrived yet. An entry dated today with a time that's already
// passed is filtered out.
export function findNextUp(bookings: Booking[], itinerary: ItineraryItem[]): TimelineEntry | null {
  const today = todayDateString()
  const now = new Date()
  const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const liveBookings = bookings.filter((b) => !b.cancelled)
  const liveItinerary = itinerary.filter((i) => !i.cancelled)
  const entries = mergeItineraryTimeline(liveBookings, liveItinerary)

  const upcoming = entries.filter((e) => {
    if (e.date > today) return true
    if (e.date < today) return false
    return e.time === null || e.time >= nowTime
  })

  return upcoming[0] ?? null
}

// Display text/icon for a timeline entry, used by NextUpCard. Kept here
// rather than in the component so anything else that wants to render a
// TimelineEntry the same way (unlikely today, but cheap to share) can.
export function nextUpLabel(entry: TimelineEntry): { title: string; subtitle: string; icon: string } {
  if (entry.kind === 'bookingStart') {
    return { title: entry.booking.provider_name, subtitle: 'Begins', icon: '🛎️' }
  }
  if (entry.kind === 'bookingEnd') {
    return { title: entry.booking.provider_name, subtitle: 'Ends', icon: '🏁' }
  }
  return { title: entry.item.venue || entry.item.type, subtitle: entry.item.type, icon: '📍' }
}

// Where tapping the card should go — matches the same `?tab=&highlight=`
// contract TripDetail.tsx already reads (see handleJumpTo(), used by the
// booking-marker cards on the Itinerary tab and the Documents/Links "View
// →" links): a booking marker jumps to the Bookings tab and highlights
// the underlying booking; a real itinerary item jumps to the Itinerary
// tab and highlights itself.
export function nextUpLinkTarget(entry: TimelineEntry): { tab: 'bookings' | 'itinerary'; id: string } {
  if (entry.kind === 'itineraryItem') return { tab: 'itinerary', id: entry.item.id }
  return { tab: 'bookings', id: entry.booking.id }
}
