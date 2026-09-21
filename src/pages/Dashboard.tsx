import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTrips, getBookings, getItinerary, getDocuments, getLinks } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Trip } from '../lib/types'
import type { TimelineEntry } from '../lib/itineraryTimeline'
import { findNextUp } from '../lib/nextUp'
import { TripCard, type TripAttachmentCounts } from '../components/TripCard'
import { NextUpCard } from '../components/NextUpCard'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { getYear, todayDateString } from '../lib/format'

function YearDivider({ year }: { year: number }) {
  return (
    <div className="flex items-center gap-3 py-1 text-xs font-semibold tracking-wide text-stone-400">
      <span className="h-px flex-1 bg-stone-200" />
      {year}
      <span className="h-px flex-1 bg-stone-200" />
    </div>
  )
}

// Renders trip cards with a year header before the first trip and a divider
// inserted wherever the year changes after that. Trips are expected in date
// order already (getTrips orders by start_date).
function TripListWithYearDividers({
  trips,
  attachmentCounts,
}: {
  trips: Trip[]
  attachmentCounts: Map<string, TripAttachmentCounts>
}) {
  let lastYear: number | null = null
  return (
    <>
      {trips.map((trip) => {
        const year = getYear(trip.start_date)
        const showDivider = lastYear === null || year !== lastYear
        lastYear = year
        return (
          <div key={trip.id}>
            {showDivider && <YearDivider year={year} />}
            <TripCard trip={trip} attachmentCounts={attachmentCounts.get(trip.id)} />
          </div>
        )
      })}
    </>
  )
}

export default function Dashboard() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [showPast, setShowPast] = useState(false)
  const [nextUp, setNextUp] = useState<{ tripId: string; entry: TimelineEntry } | null>(null)
  const [attachmentCounts, setAttachmentCounts] = useState<Map<string, TripAttachmentCounts>>(new Map())
  const { signOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    getTrips()
      .then(setTrips)
      .finally(() => setLoading(false))
  }, [])

  const active = trips.filter((t) => t.status === 'active' || t.status === 'upcoming')
  const past = trips.filter((t) => t.status === 'past' || t.status === 'cancelled')

  // Trip-level (not booking/itinerary-attached) document/link counts, shown
  // as small badges on each card (Missing Features #23) — a quick way to
  // spot which trips already have a guide/reference link saved without
  // opening each one. Scoped to Active & Upcoming only, same reasoning as
  // "What's next" below: Past Trips is collapsed by default, so fetching
  // for trips nobody's about to look at would be wasted work.
  useEffect(() => {
    if (active.length === 0) return
    let cancelled = false
    Promise.all(
      active.map(async (t) => {
        const [docs, links] = await Promise.all([getDocuments(t.id), getLinks(t.id)])
        const tripLevelCount = (items: { booking_id: string | null; itinerary_item_id: string | null }[]) =>
          items.filter((i) => i.booking_id == null && i.itinerary_item_id == null).length
        return [t.id, { documents: tripLevelCount(docs), links: tripLevelCount(links) }] as const
      })
    ).then((entries) => {
      if (cancelled) return
      setAttachmentCounts(new Map(entries))
    })
    return () => {
      cancelled = true
    }
    // Keyed off length, same approximation CostsTab uses elsewhere in this
    // app — re-running on every trips render would refetch constantly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.length])

  // "What's next" / at-a-glance (Missing Features item 13) — only
  // meaningful for a trip that's actually underway today. Found by date
  // range rather than the stored `status` column, which can lag behind
  // (same reasoning as the Upload/Add Link trip default, see Fixed #18).
  // getTrips() doesn't include bookings/itinerary, so that one trip's data
  // is fetched separately here rather than pulling it for every trip.
  useEffect(() => {
    const today = todayDateString()
    const current = trips.find((t) => t.start_date <= today && t.end_date >= today)
    if (!current) {
      setNextUp(null)
      return
    }
    let cancelled = false
    Promise.all([getBookings(current.id), getItinerary(current.id)]).then(([bookings, itinerary]) => {
      if (cancelled) return
      const entry = findNextUp(bookings, itinerary)
      setNextUp(entry ? { tripId: current.id, entry } : null)
    })
    return () => {
      cancelled = true
    }
  }, [trips])

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">My Trips</h1>
        <button onClick={handleSignOut} className="text-sm text-stone-400 hover:text-stone-600">
          Sign out
        </button>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading trips…" />
      ) : (
        <>
          {nextUp && <NextUpCard tripId={nextUp.tripId} entry={nextUp.entry} />}

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
              Active &amp; Upcoming
            </h2>
            {active.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-400 ring-1 ring-stone-100">
                No upcoming trips yet. Add one in Settings once trip types are set up, or via
                Supabase.
              </p>
            ) : (
              <TripListWithYearDividers trips={active} attachmentCounts={attachmentCounts} />
            )}
          </section>

          {past.length > 0 && (
            <section className="mt-8">
              <button
                onClick={() => setShowPast((s) => !s)}
                className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-wide text-stone-400"
              >
                Past Trips ({past.length})
                <span>{showPast ? '▲' : '▼'}</span>
              </button>
              {showPast && (
                <div className="mt-3 space-y-3 opacity-80">
                  <TripListWithYearDividers trips={past} attachmentCounts={attachmentCounts} />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
