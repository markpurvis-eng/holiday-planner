import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getTrips, getBookings, getItinerary, getExpenses } from '../lib/api'
import type { Trip, Booking, ItineraryItem, Expense } from '../lib/types'
import { buildCostLines, buildExpenseCostLines, groupCostLines } from '../lib/costs'
import { formatDate, todayDateString } from '../lib/format'
import { getOfflineStatus, readMeta, subscribeOfflineStatus } from '../lib/offlineSnapshots'
import { LoadingSpinner } from '../components/LoadingSpinner'

type TripData = { bookings: Booking[]; itinerary: ItineraryItem[]; expenses: Expense[] }

// The picker either names one trip (its id) or one of three groups of trips.
// Trip ids are uuids, so they can never collide with these three words.
type GroupScope = 'upcoming' | 'past' | 'all'
const GROUP_SCOPES: string[] = ['upcoming', 'past', 'all']
const isGroupScope = (s: string): s is GroupScope => GROUP_SCOPES.includes(s)

// One card/expense's worth of a Costs-tab match, resolved down to just what
// the result list needs to show. `matchedExpenses` is deliberately only the
// ad hoc expenses that matched — not every expense attached to the card —
// so e.g. searching "hockey" shows "Causeway pub" under the matching
// booking/itinerary card, not every unrelated expense nested under it too.
type CostMatch = { key: string; title: string; matchedExpenses: string[] }

type TripResults = {
  trip: Trip
  bookings: Booking[]
  itinerary: ItineraryItem[]
  costs: CostMatch[]
}

function matchesQuery(text: string, q: string): boolean {
  return text.toLowerCase().includes(q)
}

// Which trips a scope covers. Cancelled trips are never searched. Upcoming &
// active versus past goes by the dates, not the stored `status`, which can lag
// behind (the same rule the offline cache uses). Upcoming & active are listed
// soonest first; past newest first.
function tripsForScope(trips: Trip[], scope: string, today: string): Trip[] {
  const live = trips.filter((t) => t.status !== 'cancelled')
  const byStartAsc = (a: Trip, b: Trip) => a.start_date.localeCompare(b.start_date)
  const upcoming = live.filter((t) => t.end_date >= today).sort(byStartAsc)
  const past = live.filter((t) => t.end_date < today).sort((a, b) => byStartAsc(b, a))
  if (scope === 'upcoming') return upcoming
  if (scope === 'past') return past
  if (scope === 'all') return [...upcoming, ...past]
  // A single trip is searched even if it is cancelled: it is the one being looked at.
  const one = trips.find((t) => t.id === scope)
  return one ? [one] : []
}

function searchTrip(trip: Trip, data: TripData, q: string): TripResults {
  const bookings = data.bookings.filter((b) => matchesQuery(b.provider_name, q))
  const itinerary = data.itinerary.filter((item) => matchesQuery(item.venue ?? item.type, q))

  // Reuses the same CostLine/CostRow model the Costs tab itself renders
  // from, so "search costs" means exactly what a Costs-tab card means:
  // the card's own label, or any ad hoc expense attached to it (e.g.
  // searching "hockey" finds the "Causeway pub" expense attached to a
  // booking/itinerary card about hockey), even though the trip-level
  // "Ad hoc expenses" bundle has no card of its own to attach to.
  const lines = [...buildCostLines(data.bookings, data.itinerary), ...buildExpenseCostLines(data.expenses)]
  const costs: CostMatch[] = []
  for (const row of groupCostLines(lines)) {
    if (row.kind === 'expenseBundle') {
      const matchedExpenses = row.lines.filter((l) => matchesQuery(l.label, q)).map((l) => l.label)
      if (matchesQuery(row.label, q) || matchedExpenses.length > 0) {
        costs.push({ key: row.key, title: row.label, matchedExpenses })
      }
    } else {
      const titleMatches = matchesQuery(row.line.label, q)
      const matchedExpenses = row.nested.filter((l) => matchesQuery(l.label, q)).map((l) => l.label)
      if (titleMatches || matchedExpenses.length > 0) {
        costs.push({ key: row.line.key, title: row.line.label, matchedExpenses })
      }
    }
  }
  return { trip, bookings, itinerary, costs }
}

// True when the app can't reach the server. The browser's own online flag is
// not enough on its own: with Wi-Fi off it can still say "online" if the
// computer has another network adapter up (Ethernet, VPN, a virtual adapter).
// So this also counts the app's own "showing saved copy" state, which is set
// when a request fails and a saved copy was used instead (the same thing the
// Offline banner shows). A "slow connection" doesn't count. A browser 'online'
// event overrides the saved-copy state until the next failure.
function useOffline(): boolean {
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine)
  const [recovered, setRecovered] = useState(false)
  const status = useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus)
  useEffect(() => {
    const on = () => {
      setBrowserOnline(true)
      setRecovered(true)
    }
    const off = () => {
      setBrowserOnline(false)
      setRecovered(false)
    }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  const requestsFailing = status !== null && !status.slow
  return !browserOnline || (requestsFailing && !recovered)
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [scope, setScope] = useState<string>(() => {
    const s = searchParams.get('scope')
    return s && isGroupScope(s) ? s : (searchParams.get('trip') ?? '')
  })
  const [query, setQuery] = useState('')
  const [loaded, setLoaded] = useState<Record<string, TripData>>({})
  const loadedRef = useRef<Record<string, TripData>>({})
  const [failed, setFailed] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const online = !useOffline()

  useEffect(() => {
    getTrips().then((all) => {
      setTrips(all)
      // Defaults to whatever trip Search was opened from (BottomNav passes
      // ?trip= the same way it already does for Upload/Link), falling back
      // to the first trip in the list so the picker never opens on nothing
      // selected.
      setScope((prev) => prev || all[0]?.id || '')
    })
  }, [])

  const today = todayDateString()
  const targets = useMemo(() => (trips && scope ? tripsForScope(trips, scope, today) : []), [trips, scope, today])
  const multi = isGroupScope(scope)

  // Offline, only the trip(s) kept on the device can be searched. The picker
  // then lists just those, and the search moves to the one already chosen if
  // it is saved, otherwise the first saved one.
  const [keptIds, setKeptIds] = useState<string[] | null>(null)
  useEffect(() => {
    if (online) {
      setKeptIds(null)
      setNotice(null)
      return
    }
    if (!trips) return
    let cancelled = false
    readMeta().then((meta) => {
      if (cancelled) return
      const kept = meta.tripIds.filter((id) => trips.some((t) => t.id === id))
      setKeptIds(kept)
      if (kept.length === 0) {
        setNotice("You're offline and no trip is saved on this device, so there is nothing to search.")
        return
      }
      setNotice("You're offline, so search is limited to the trip saved on this device.")
      setScope((current) => {
        if (!isGroupScope(current) && kept.includes(current)) return current
        setFailed([])
        setSearchParams({ trip: kept[0] }, { replace: true })
        return kept[0]
      })
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, trips])

  useEffect(() => {
    const missing = targets.filter((t) => !loadedRef.current[t.id])
    if (missing.length === 0) {
      setFailed([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    Promise.allSettled(
      missing.map(async (t) => {
        const [bookings, itinerary, expenses] = await Promise.all([
          getBookings(t.id),
          getItinerary(t.id),
          getExpenses(t.id),
        ])
        return { id: t.id, data: { bookings, itinerary, expenses } as TripData }
      })
    ).then((settled) => {
      // Data that did arrive is kept even if this effect was superseded, so
      // flipping between scopes doesn't throw away finished work.
      const next = { ...loadedRef.current }
      const failedNames: string[] = []
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') next[r.value.id] = r.value.data
        else failedNames.push(missing[i].name)
      })
      loadedRef.current = next
      if (cancelled) return
      setLoaded(next)
      setFailed(failedNames)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [targets, online])

  function handleScopeChange(value: string) {
    setFailed([])
    setScope(value)
    setSearchParams(isGroupScope(value) ? { scope: value } : value ? { trip: value } : {})
  }

  const q = query.trim().toLowerCase()
  const hasQuery = q.length > 0

  const results = useMemo<TripResults[]>(() => {
    if (!hasQuery) return []
    return targets
      .filter((t) => loaded[t.id])
      .map((t) => searchTrip(t, loaded[t.id], q))
      .filter((r) => r.bookings.length + r.itinerary.length + r.costs.length > 0)
  }, [targets, loaded, hasQuery, q])

  const bookingHits = results.flatMap((r) => r.bookings.map((b) => ({ trip: r.trip, b })))
  const itineraryHits = results.flatMap((r) => r.itinerary.map((item) => ({ trip: r.trip, item })))
  const costHits = results.flatMap((r) => r.costs.map((match) => ({ trip: r.trip, match })))
  const hasResults = results.length > 0

  const upcomingCount = trips ? tripsForScope(trips, 'upcoming', today).length : 0
  const pastCount = trips ? tripsForScope(trips, 'past', today).length : 0
  const allCount = upcomingCount + pastCount

  // Offline with something saved: the picker lists only the saved trip(s).
  const offlineOnly = !online && keptIds !== null && keptIds.length > 0
  const pickerTrips = offlineOnly ? (trips ?? []).filter((t) => (keptIds ?? []).includes(t.id)) : []

  return (
    <div className="p-4 pb-24">
      <h1 className="mb-4 text-2xl font-semibold text-stone-800">Search</h1>

      <div className="space-y-3">
        <select
          value={scope}
          onChange={(e) => handleScopeChange(e.target.value)}
          className="w-full rounded-2xl border border-stone-200 bg-white p-3 text-sm text-stone-700 outline-none focus:border-teal-500"
        >
          {trips === null && <option>Loading trips…</option>}
          {trips?.length === 0 && <option value="">No trips yet</option>}
          {offlineOnly ? (
            pickerTrips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))
          ) : (
            <>
              {trips && trips.length > 0 && (
                <optgroup label="Across trips">
                  <option value="upcoming">Upcoming &amp; active trips ({upcomingCount})</option>
                  <option value="past">Past trips ({pastCount})</option>
                  <option value="all">All trips ({allCount})</option>
                </optgroup>
              )}
              {trips && trips.length > 0 && (
                <optgroup label="One trip">
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </>
          )}
        </select>

        {notice && (
          <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {notice}
          </p>
        )}

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bookings, itinerary, costs…"
          disabled={!scope}
          autoFocus
          className="w-full rounded-2xl border border-stone-200 bg-white p-3 text-sm outline-none focus:border-teal-500 disabled:bg-stone-50 disabled:text-stone-400"
        />
      </div>

      {trips !== null && trips.length === 0 && (
        <p className="mt-4 text-sm text-stone-400">No trips yet.</p>
      )}

      {scope && loading && (
        <div className="mt-4">
          <LoadingSpinner label={multi ? 'Loading trips…' : 'Loading trip…'} />
        </div>
      )}

      {failed.length > 0 && (
        <p className="mt-4 text-xs text-amber-800">
          Couldn't load {failed.length === 1 ? failed[0] : `${failed.length} trips (${failed.join(', ')})`}, so
          {failed.length === 1 ? ' it was' : ' they were'} left out of this search.
        </p>
      )}

      {scope && !loading && hasQuery && !hasResults && (
        <p className="mt-4 text-sm text-stone-400">{multi ? 'No matches in these trips.' : 'No matches in this trip.'}</p>
      )}

      {hasQuery && bookingHits.length > 0 && (
        <ResultSection title="Bookings">
          {bookingHits.map(({ trip, b }) => (
            <Link
              key={b.id}
              to={`/trips/${trip.id}?tab=bookings&highlight=${b.id}`}
              className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 hover:ring-teal-300"
            >
              {multi && <TripLabel name={trip.name} />}
              <p className="font-medium text-stone-800">{b.provider_name}</p>
              {b.start_date && <p className="text-sm text-stone-500">{formatDate(b.start_date)}</p>}
            </Link>
          ))}
        </ResultSection>
      )}

      {hasQuery && itineraryHits.length > 0 && (
        <ResultSection title="Itinerary">
          {itineraryHits.map(({ trip, item }) => (
            <Link
              key={item.id}
              to={`/trips/${trip.id}?tab=itinerary&highlight=${item.id}`}
              className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 hover:ring-teal-300"
            >
              {multi && <TripLabel name={trip.name} />}
              <p className="text-xs font-medium uppercase tracking-wide text-teal-600">{item.type}</p>
              <p className="font-medium text-stone-800">{item.venue}</p>
              <p className="text-sm text-stone-500">{formatDate(item.date)}</p>
            </Link>
          ))}
        </ResultSection>
      )}

      {hasQuery && costHits.length > 0 && (
        <ResultSection title="Costs">
          {costHits.map(({ trip, match }) => (
            <Link
              key={`${trip.id}:${match.key}`}
              to={`/trips/${trip.id}?tab=costs&highlight=${match.key}`}
              className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 hover:ring-teal-300"
            >
              {multi && <TripLabel name={trip.name} />}
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

function TripLabel({ name }: { name: string }) {
  return <p className="mb-0.5 text-xs font-medium text-stone-400">{name}</p>
}

function ResultSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-400">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  )
}
