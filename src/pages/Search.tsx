import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getTrips, getBookings, getItinerary, getExpenses } from '../lib/api'
import type { Trip, Booking, ItineraryItem, Expense } from '../lib/types'
import { buildCostLines, buildExpenseCostLines, groupCostLines } from '../lib/costs'
import { formatDate } from '../lib/format'
import { LoadingSpinner } from '../components/LoadingSpinner'

type TripData = { bookings: Booking[]; itinerary: ItineraryItem[]; expenses: Expense[] }

// One card/expense's worth of a Costs-tab match, resolved down to just what
// the result list needs to show. `matchedExpenses` is deliberately only the
// ad hoc expenses that matched — not every expense attached to the card —
// so e.g. searching "hockey" shows "Causeway pub" under the matching
// booking/itinerary card, not every unrelated expense nested under it too.
type CostMatch = { key: string; title: string; matchedExpenses: string[] }

function matchesQuery(text: string, q: string): boolean {
  return text.toLowerCase().includes(q)
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [tripId, setTripId] = useState<string>(searchParams.get('trip') ?? '')
  const [query, setQuery] = useState('')
  const [tripData, setTripData] = useState<TripData | null>(null)
  const [loadingTripData, setLoadingTripData] = useState(false)

  useEffect(() => {
    getTrips().then((all) => {
      setTrips(all)
      // Defaults to whatever trip Search was opened from (BottomNav passes
      // ?trip= the same way it already does for Upload/Link), falling back
      // to the first trip in the list so the picker never opens on nothing
      // selected.
      setTripId((prev) => prev || searchParams.get('trip') || all[0]?.id || '')
    })
    // Only ever runs once on mount - re-running on searchParams changes
    // would fight with handleTripChange's own setSearchParams call below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!tripId) {
      setTripData(null)
      return
    }
    let cancelled = false
    setLoadingTripData(true)
    Promise.all([getBookings(tripId), getItinerary(tripId), getExpenses(tripId)]).then(
      ([bookings, itinerary, expenses]) => {
        if (cancelled) return
        setTripData({ bookings, itinerary, expenses })
        setLoadingTripData(false)
      }
    )
    return () => {
      cancelled = true
    }
  }, [tripId])

  function handleTripChange(id: string) {
    setTripId(id)
    setSearchParams(id ? { trip: id } : {})
  }

  const q = query.trim().toLowerCase()
  const hasQuery = q.length > 0

  const matchingBookings = useMemo(() => {
    if (!tripData || !hasQuery) return []
    return tripData.bookings.filter((b) => matchesQuery(b.provider_name, q))
  }, [tripData, hasQuery, q])

  const matchingItinerary = useMemo(() => {
    if (!tripData || !hasQuery) return []
    return tripData.itinerary.filter((item) => matchesQuery(item.venue ?? item.type, q))
  }, [tripData, hasQuery, q])

  // Reuses the same CostLine/CostRow model the Costs tab itself renders
  // from, so "search costs" means exactly what a Costs-tab card means:
  // the card's own label, or any ad hoc expense attached to it (e.g.
  // searching "hockey" finds the "Causeway pub" expense attached to a
  // booking/itinerary card about hockey), even though the trip-level
  // "Ad hoc expenses" bundle has no card of its own to attach to.
  const matchingCostRows = useMemo<CostMatch[]>(() => {
    if (!tripData || !hasQuery) return []
    const lines = [
      ...buildCostLines(tripData.bookings, tripData.itinerary),
      ...buildExpenseCostLines(tripData.expenses),
    ]
    const rows = groupCostLines(lines)
    const results: CostMatch[] = []
    for (const row of rows) {
      if (row.kind === 'expenseBundle') {
        const matchedExpenses = row.lines.filter((l) => matchesQuery(l.label, q)).map((l) => l.label)
        if (matchesQuery(row.label, q) || matchedExpenses.length > 0) {
          results.push({ key: row.key, title: row.label, matchedExpenses })
        }
      } else {
        const titleMatches = matchesQuery(row.line.label, q)
        const matchedExpenses = row.nested.filter((l) => matchesQuery(l.label, q)).map((l) => l.label)
        if (titleMatches || matchedExpenses.length > 0) {
          results.push({ key: row.line.key, title: row.line.label, matchedExpenses })
        }
      }
    }
    return results
  }, [tripData, hasQuery, q])

  const hasResults = matchingBookings.length + matchingItinerary.length + matchingCostRows.length > 0

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-4 text-2xl font-semibold text-stone-800">Search</h1>

      <div className="space-y-3">
        <select
          value={tripId}
          onChange={(e) => handleTripChange(e.target.value)}
          className="w-full rounded-2xl border border-stone-200 bg-white p-3 text-sm text-stone-700 outline-none focus:border-teal-500"
        >
          {trips === null && <option>Loading trips…</option>}
          {trips?.length === 0 && <option value="">No trips yet</option>}
          {trips?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bookings, itinerary, costs…"
          disabled={!tripId}
          autoFocus
          className="w-full rounded-2xl border border-stone-200 bg-white p-3 text-sm outline-none focus:border-teal-500 disabled:bg-stone-50 disabled:text-stone-400"
        />
      </div>

      {trips !== null && trips.length === 0 && (
        <p className="mt-4 text-sm text-stone-400">No trips yet.</p>
      )}

      {tripId && loadingTripData && (
        <div className="mt-4">
          <LoadingSpinner label="Loading trip…" />
        </div>
      )}

      {tripId && !loadingTripData && hasQuery && !hasResults && (
        <p className="mt-4 text-sm text-stone-400">No matches in this trip.</p>
      )}

      {hasQuery && matchingBookings.length > 0 && (
        <ResultSection title="Bookings">
          {matchingBookings.map((b) => (
            <Link
              key={b.id}
              to={`/trips/${tripId}?tab=bookings&highlight=${b.id}`}
              className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 hover:ring-teal-300"
            >
              <p className="font-medium text-stone-800">{b.provider_name}</p>
              {b.start_date && <p className="text-sm text-stone-500">{formatDate(b.start_date)}</p>}
            </Link>
          ))}
        </ResultSection>
      )}

      {hasQuery && matchingItinerary.length > 0 && (
        <ResultSection title="Itinerary">
          {matchingItinerary.map((item) => (
            <Link
              key={item.id}
              to={`/trips/${tripId}?tab=itinerary&highlight=${item.id}`}
              className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 hover:ring-teal-300"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-teal-600">{item.type}</p>
              <p className="font-medium text-stone-800">{item.venue}</p>
              <p className="text-sm text-stone-500">{formatDate(item.date)}</p>
            </Link>
          ))}
        </ResultSection>
      )}

      {hasQuery && matchingCostRows.length > 0 && (
        <ResultSection title="Costs">
          {matchingCostRows.map((match) => (
            <Link
              key={match.key}
              to={`/trips/${tripId}?tab=costs&highlight=${match.key}`}
              className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 hover:ring-teal-300"
            >
              <p className="font-medium text-stone-800">{match.title}</p>
              {match.matchedExpenses.length > 0 && (
                <p className="text-sm text-stone-500">Includes: {match.matchedExpenses.join(', ')}</p>
              )}
            </Link>
          ))}
        </ResultSection>
      )}
    </div>
  )
}

function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}
