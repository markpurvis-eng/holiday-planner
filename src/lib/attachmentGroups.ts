import type { Booking, ItineraryItem } from './types'

type Attachable = {
  booking_id: string | null
  itinerary_item_id: string | null
}

export type AttachmentGroup<T> = {
  key: string
  label: string
  onJump?: () => void
  items: T[]
}

// Groups documents or links by what they're actually attached to — the
// trip itself, a specific booking, or a specific itinerary item — rather
// than showing one flat trip-wide list. A group is only included when it
// has at least one item, and only real attachment points (a booking or
// itinerary item that still exists) produce a group; the underlying
// booking_id/itinerary_item_id on the item itself never changes here.
// `onJump` (when present) is how the caller wires up "View →" to switch
// tabs and highlight the specific booking/itinerary card.
export function buildAttachmentGroups<T extends Attachable>(
  items: T[],
  bookings: Booking[],
  itinerary: ItineraryItem[],
  onJump: (target: 'bookings' | 'itinerary', id: string) => void
): AttachmentGroup<T>[] {
  const groups: AttachmentGroup<T>[] = []

  const tripLevel = items.filter((i) => !i.booking_id && !i.itinerary_item_id)
  if (tripLevel.length > 0) {
    groups.push({ key: 'trip', label: 'Trip-level', items: tripLevel })
  }

  for (const b of bookings) {
    const forBooking = items.filter((i) => i.booking_id === b.id)
    if (forBooking.length > 0) {
      groups.push({
        key: `booking-${b.id}`,
        label: b.provider_name,
        onJump: () => onJump('bookings', b.id),
        items: forBooking,
      })
    }
  }

  for (const item of itinerary) {
    const forItem = items.filter((i) => i.itinerary_item_id === item.id)
    if (forItem.length > 0) {
      groups.push({
        key: `itinerary-${item.id}`,
        label: `${item.type}: ${item.venue}`,
        onJump: () => onJump('itinerary', item.id),
        items: forItem,
      })
    }
  }

  return groups
}
