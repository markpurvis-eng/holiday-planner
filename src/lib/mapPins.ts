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
