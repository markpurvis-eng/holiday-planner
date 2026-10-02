import type { Booking, ItineraryItem } from './types'

export type MapPinItem = {
  kind: 'booking' | 'itinerary'
  id: string
  title: string
  startDate: string | null
  endDate: string | null
  time: string | null
  address: string | null
  lat: number
  lng: number
}

export type MapPinGroup = {
  key: string
  lat: number
  lng: number
  items: MapPinItem[]
}

// Only rows with a saved pin_lat/pin_lng appear on the map. Deliberately
// not destination_lat/lng, which is a coarse per-city weather anchor and
// would put hotel/restaurant pins in the middle of town.
export function buildMapPinItems(bookings: Booking[], itinerary: ItineraryItem[]): MapPinItem[] {
  const items: MapPinItem[] = []
  for (const b of bookings) {
    if (b.pin_lat == null || b.pin_lng == null) continue
    items.push({
      kind: 'booking',
      id: b.id,
      title: b.provider_name,
      startDate: b.start_date,
      endDate: b.end_date ?? b.start_date,
      time: b.start_time,
      address: b.address,
      lat: b.pin_lat,
      lng: b.pin_lng,
    })
  }
  for (const i of itinerary) {
    if (i.pin_lat == null || i.pin_lng == null) continue
    items.push({
      kind: 'itinerary',
      id: i.id,
      title: i.venue ?? i.type,
      startDate: i.date,
      endDate: i.date,
      time: i.time,
      address: i.address,
      lat: i.pin_lat,
      lng: i.pin_lng,
    })
  }
  return items
}

// A booking pin is shown on every day its stay/booking covers; an
// itinerary item only on its own date. Undated bookings never match a
// specific day, only "All days".
export function itemOnDay(item: MapPinItem, day: string): boolean {
  if (!item.startDate) return false
  return item.startDate <= day && day <= (item.endDate ?? item.startDate)
}

// Several items often share one place (every La Cala round and lesson,
// a hotel plus its dinner reservations), so pins at the same coordinates
// collapse into one marker with a count rather than stacking invisibly.
export function groupPins(items: MapPinItem[]): MapPinGroup[] {
  const groups = new Map<string, MapPinGroup>()
  for (const item of items) {
    const key = `${item.lat.toFixed(5)},${item.lng.toFixed(5)}`
    const existing = groups.get(key)
    if (existing) existing.items.push(item)
    else groups.set(key, { key, lat: item.lat, lng: item.lng, items: [item] })
  }
  return [...groups.values()]
}

// Every calendar day from start to end inclusive, as YYYY-MM-DD built from
// local parts (not toISOString(), which shifts through UTC).
export function daysBetween(start: string, end: string): string[] {
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const days: string[] = []
  const cursor = new Date(sy, sm - 1, sd)
  const last = new Date(ey, em - 1, ed)
  while (cursor <= last && days.length < 400) {
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const d = String(cursor.getDate()).padStart(2, '0')
    days.push(`${cursor.getFullYear()}-${m}-${d}`)
    cursor.setDate(cursor.getDate() + 1)
  }
  return days
}

/**
 * Google Maps link for a booking / itinerary item, or null if there is
 * nothing to point at.
 *
 * The aim is Google's full place page (reviews, photos, opening hours) rather
 * than a bare pin, and that only comes from searching by *name*:
 *  - name (+ address) and a pin: a name search biased to the pin, using the
 *    path form /maps/search/<text>/@lat,lng,17z. The bias keeps "Hotel Sol"
 *    from matching one in another country, and the pin is often hand-corrected.
 *  - name (+ address) with no pin: the documented search URL with the text.
 *  - a pin but no name or address: a bare pin at the coordinates.
 *  - an address but no name: a search on the address text.
 *  - neither a pin nor an address: no link, whatever the name (flights, car
 *    hire and similar have names but no real place).
 * Google decides whether a text search opens a single place card or a list of
 * results, so the more specific the name and address, the better.
 */
export function googleMapsUrl(
  entry: { pin_lat: number | null; pin_lng: number | null; address: string | null },
  name?: string | null,
): string | null {
  const text = [name?.trim(), entry.address?.trim()].filter(Boolean).join(', ')
  const hasPin = entry.pin_lat != null && entry.pin_lng != null

  // A name alone isn't enough: flights, car hire and the like have names but no
  // real place, and a search for them would return junk. Needs a pin or address.
  if (!hasPin && !entry.address?.trim()) return null

  if (text && hasPin) {
    return `https://www.google.com/maps/search/${encodeURIComponent(text)}/@${entry.pin_lat},${entry.pin_lng},17z`
  }
  if (text) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`
  }
  if (hasPin) {
    return `https://www.google.com/maps/search/?api=1&query=${entry.pin_lat},${entry.pin_lng}`
  }
  return null
}
