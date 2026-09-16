import { useEffect, useState } from 'react'
import { getTrips, getBookings, getItinerary } from '../lib/api'
import type { Trip, Booking, ItineraryItem } from '../lib/types'
import { CostsTab } from '../components/CostsTab'
import { LoadingSpinner } from '../components/LoadingSpinner'

type TripCostData = { trip: Trip; bookings: Booking[]; itinerary: ItineraryItem[] }

export default function AllCosts() {
  const [tripData, setTripData] = useState<TripCostData[] | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false

    async function load() {
      // getTrips() returns every trip regardless of status - active and
      // archived both belong on this dashboard, per the confirmed design
      // (Mark wants the full historical roll-up visible, not just the
      // current roster).
      const trips = await getTrips()
      const data = await Promise.all(
        trips.map(async (trip) => {
          const [bookings, itinerary] = await Promise.all([getBookings(trip.id), getItinerary(trip.id)])
          return { trip, bookings, itinerary }
        })
      )
      if (!cancelled) setTripData(data)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function toggle(tripId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(tripId)) {
        next.delete(tripId)
      } else {
        next.add(tripId)
      }
      return next
    })
  }

  if (tripData === null) {
    return (
      <div className="p-4 pb-24">
        <LoadingSpinner label="Loading all trips' costs…" />
      </div>
    )
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-1 text-2xl font-semibold text-stone-800">Total Costs</h1>
      <p className="mb-5 text-sm text-stone-500">
        Every trip's cost picture, active and archived. Tap a trip to see the breakdown.
      </p>

      {tripData.length === 0 && <p className="text-sm text-stone-400">No trips yet.</p>}

      <div className="space-y-3">
        {tripData.map(({ trip, bookings, itinerary }) => {
          const isOpen = expanded.has(trip.id)
          return (
            <div key={trip.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-stone-100">
              <button
                type="button"
                onClick={() => toggle(trip.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <div>
                  <p className="font-medium text-stone-800">{trip.name}</p>
                  <p className="text-xs text-stone-400">{trip.status}</p>
                </div>
                <span className="text-stone-400">{isOpen ? '▲' : '▼'}</span>
              </button>
              {/* Only mounted once expanded - this is deliberate, not just
                  a rendering nicety: mounting CostsTab triggers its
                  lock-any-paid-but-unlocked-line pass (fetches + writes
                  FX rates), so collapsed-by-default avoids doing that for
                  every trip on every visit to this page, not just the
                  ones actually being reviewed. */}
              {isOpen && (
                <div className="border-t border-stone-100 p-4">
                  <CostsTab tripId={trip.id} bookings={bookings} itinerary={itinerary} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
