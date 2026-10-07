import { fetchTrips, fetchTripBundle } from './api'
import { parseLocalDate, todayDateString } from './format'
import type { Trip } from './types'
import { purgeSnapshots, snapshotKey, writeMeta, writeSnapshot } from './offlineSnapshots'
import { reconcileFiles } from './offlineFiles'
import { fetchGbpRate } from './fx'

// The offline rule: keep the trip that is under way, from the day before it
// starts (so the boarding pass is saved before the airport) to the day after it
// ends. Dates only; the stored `status` column can lag behind. Everything else
// is purged on the next sync.
const DAYS_BEFORE = 1
const DAYS_AFTER = 1
const MIN_GAP_MS = 3 * 60 * 60 * 1000
const LAST_SYNC_KEY = 'hp-offline-last-sync'

function shiftDate(dateStr: string, days: number): string {
  const d = parseLocalDate(dateStr)
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function tripsToCache(trips: Trip[], today: string): Trip[] {
  return trips.filter(
    (t) =>
      t.status !== 'cancelled' &&
      shiftDate(t.start_date, -DAYS_BEFORE) <= today &&
      today <= shiftDate(t.end_date, DAYS_AFTER),
  )
}

function dueForSync(today: string): boolean {
  try {
    const last = JSON.parse(localStorage.getItem(LAST_SYNC_KEY) ?? 'null') as { at: number; day: string } | null
    return !last || last.day !== today || Date.now() - last.at >= MIN_GAP_MS
  } catch {
    return true
  }
}

function markSynced(today: string) {
  try {
    localStorage.setItem(LAST_SYNC_KEY, JSON.stringify({ at: Date.now(), day: today }))
  } catch {
    return
  }
}

async function doSync(force: boolean): Promise<void> {
  if (!navigator.onLine) return
  const today = todayDateString()
  if (!force && !dueForSync(today)) return

  const trips = await fetchTrips()
  const targets = tripsToCache(trips, today)
  const bundles = await Promise.all(targets.map((t) => fetchTripBundle(t.id)))
  const now = Date.now()

  await writeSnapshot('getTrips', trips, now)
  for (const [i, trip] of targets.entries()) {
    const b = bundles[i]
    await Promise.all([
      writeSnapshot(snapshotKey('getTrip', trip.id), trip, now),
      writeSnapshot(snapshotKey('getBookings', trip.id), b.bookings, now),
      writeSnapshot(snapshotKey('getItinerary', trip.id), b.itinerary, now),
      writeSnapshot(snapshotKey('getDocuments', trip.id), b.documents, now),
      writeSnapshot(snapshotKey('getLinks', trip.id), b.links, now),
      writeSnapshot(snapshotKey('getTodos', trip.id), b.todos, now),
      writeSnapshot(snapshotKey('getExpenses', trip.id), b.expenses, now),
    ])
  }
  const currencies = new Set<string>()
  for (const b of bundles) {
    for (const row of [...b.bookings, ...b.itinerary, ...b.expenses]) {
      if (row.currency) currencies.add(row.currency.toUpperCase())
    }
  }
  await Promise.all([...currencies].map((c) => fetchGbpRate(c).catch(() => undefined)))
  const ids = targets.map((t) => t.id)
  await writeMeta({ tripIds: ids, syncedAt: now })
  await purgeSnapshots(ids)
  await reconcileFiles()
  markSynced(today)
}

let running: Promise<void> | null = null

// Safe to call whenever: it does nothing offline, does nothing again within a
// few hours on the same day, and never throws. Old data is only removed once
// the new data has been saved, so a sync cut off by a dropped signal leaves
// the previous copy intact.
export function syncOfflineCache(force = false): Promise<void> {
  if (!running) {
    running = doSync(force)
      .catch(() => {})
      .finally(() => {
        running = null
      })
  }
  return running
}
