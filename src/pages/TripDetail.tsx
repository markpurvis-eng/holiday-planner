import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  getTrip,
  getBookings,
  getItinerary,
  getDocuments,
  getLinks,
  getTodos,
  createTodo,
  toggleTodo,
} from '../lib/api'
import type { Booking, Document, ItineraryItem, Link as LinkType, Todo, Trip } from '../lib/types'
import { TabBar } from '../components/TabBar'
import { DocumentGroup } from '../components/DocumentGroup'
import { AttachedItems } from '../components/AttachedItems'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { formatMoney, formatTime, formatDayAbbrev, formatDate, daysUntil, todayDateString } from '../lib/format'
import { WeatherForecast } from '../components/WeatherForecast'
import { resolveTodaysLocation } from '../lib/weather'
import { getHideCancelledItems } from '../lib/settings'
import { PaymentBadge } from '../components/PaymentBadge'
import { mergeItineraryTimeline } from '../lib/itineraryTimeline'
import { buildAttachmentGroups } from '../lib/attachmentGroups'
import { CostsTab } from '../components/CostsTab'

type Tab = 'bookings' | 'itinerary' | 'documents' | 'links' | 'costs' | 'todos'

// Scrolls a card into view sitting just below the sticky header, instead of
// scrollIntoView's block:'start'/'center', which would tuck the card
// underneath the sticky header — position: sticky covers that same space,
// so the usual viewport-relative alignment ends up hidden behind it.
function scrollToItem(targetId: string, behavior: ScrollBehavior) {
  const el = document.getElementById(`item-${targetId}`)
  if (!el) return
  const header = document.getElementById('trip-sticky-header')
  const headerHeight = header?.getBoundingClientRect().height ?? 0
  const elTop = el.getBoundingClientRect().top + window.scrollY
  window.scrollTo({ top: elTop - headerHeight - 12, behavior })
}

export default function TripDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const VALID_TABS: Tab[] = ['bookings', 'itinerary', 'documents', 'links', 'costs', 'todos']
  const tabParam = searchParams.get('tab')
  const initialTab = VALID_TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'bookings'
  const highlightId = searchParams.get('highlight')
  const [trip, setTrip] = useState<Trip | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [links, setLinks] = useState<LinkType[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [newTodo, setNewTodo] = useState('')
  const [hideCancelled] = useState(() => getHideCancelledItems())
  const [tripHeaderExpanded, setTripHeaderExpanded] = useState(false)
  const [paymentFilters, setPaymentFilters] = useState<Set<Booking['payment_status']>>(new Set())

  // Toggles one status in/out of the payment filter set — e.g. Unpaid and
  // Partially paid can both be active at once. An empty set means no
  // filter is applied (shows every status).
  function togglePaymentFilter(status: Booking['payment_status']) {
    setPaymentFilters((prev) => {
      const next = new Set(prev)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return next
    })
  }

  useEffect(() => {
    if (!id) return
    Promise.all([
      getTrip(id),
      getBookings(id),
      getItinerary(id),
      getDocuments(id),
      getLinks(id),
      getTodos(id),
    ])
      .then(([t, b, i, d, l, td]) => {
        setTrip(t)
        setBookings(b)
        setItinerary(i)
        setDocuments(d)
        setLinks(l)
        setTodos(td)
      })
      .finally(() => setLoading(false))
  }, [id])

  // Scroll to the card the person was just sent back to (from Upload or Add
  // Link), then clear the highlight from the URL after a few seconds so it
  // doesn't stick around on refresh or when sharing the link.
  useEffect(() => {
    if (!highlightId || loading) return
    scrollToItem(highlightId, 'smooth')
    const timeout = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('highlight')
          return next
        },
        { replace: true }
      )
    }, 2500)
    return () => clearTimeout(timeout)
  }, [highlightId, loading, setSearchParams])

  // On landing on Bookings or Itinerary, scroll so current-day items sit at
  // the top of the screen, with past days scrollable up and future days
  // scrollable down. Both lists come sorted ascending by date already
  // (getBookings/getItinerary), so this is just "first item today or
  // later". Skipped when a highlight target is already driving the scroll
  // (arriving from Upload/Add Link) — that's the more specific destination.
  // Only depends on tab and the raw data (not the filtered visible lists),
  // so toggling the payment filter doesn't re-trigger it.
  useEffect(() => {
    if (loading || highlightId) return
    if (tab !== 'bookings' && tab !== 'itinerary') return
    const todayStr = todayDateString()
    const targetId =
      tab === 'itinerary'
        ? itinerary.find((item) => item.date >= todayStr)?.id
        : bookings.find((b) => (b.end_date ?? b.start_date ?? '') >= todayStr)?.id
    if (!targetId) return
    scrollToItem(targetId, 'auto')
  }, [tab, loading, highlightId, itinerary, bookings])

  async function handleAddTodo(e: FormEvent) {
    e.preventDefault()
    if (!id || !newTodo.trim()) return
    const todo = await createTodo(id, newTodo.trim())
    setTodos((prev) => [...prev, todo])
    setNewTodo('')
  }

  async function handleToggleTodo(todo: Todo) {
    const updated = await toggleTodo(todo.id, !todo.done)
    setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
  }

  if (loading) return <LoadingSpinner label="Loading trip…" />
  if (!trip) return <p className="p-6 text-center text-stone-500">Trip not found.</p>

  const visibleBookings = bookings
    .filter((b) => !hideCancelled || !b.cancelled)
    .filter((b) => paymentFilters.size === 0 || paymentFilters.has(b.payment_status))
  const visibleItinerary = itinerary
    .filter((item) => !hideCancelled || !item.cancelled)
    .filter((item) => paymentFilters.size === 0 || (item.cost != null && paymentFilters.has(item.payment_status)))

  // Booking start/end markers on the Itinerary tab respect hideCancelled
  // (consistent with cancelled itinerary items also being hidden there),
  // but deliberately not paymentFilters — a "trip begins" marker isn't a
  // cost line the way itinerary items with a cost are, so filtering by
  // payment status doesn't have a sensible meaning for it.
  const bookingsForTimeline = bookings.filter((b) => !hideCancelled || !b.cancelled)
  const timeline = mergeItineraryTimeline(bookingsForTimeline, visibleItinerary)

  // Jumps to and highlights a specific booking/itinerary-item card on its
  // own tab. `tab` is local state (only read from the URL once, on mount),
  // so it needs setting directly here — updating searchParams alone
  // wouldn't switch the visible tab.
  function handleJumpTo(targetTab: 'bookings' | 'itinerary', id: string) {
    setTab(targetTab)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', targetTab)
      next.set('highlight', id)
      return next
    })
  }

  const documentGroups = buildAttachmentGroups(documents, bookings, itinerary, handleJumpTo)
  const linkGroups = buildAttachmentGroups(links, bookings, itinerary, handleJumpTo)

  // Once the trip has started (and hasn't ended), prefer today's actual
  // location — from today's itinerary item if there is one (e.g. a cruise's
  // day-by-day port stops), else whichever booking's date range covers
  // today — over the trip's single pre-trip anchor. Falls back to the trip
  // anchor on days with no coordinated itinerary item or booking (e.g. a
  // "Sea Day" with no port).
  const tripUnderway = daysUntil(trip.start_date) <= 0 && daysUntil(trip.end_date) >= 0
  const todaysLocation = tripUnderway ? resolveTodaysLocation(itinerary, bookings, todayDateString()) : null
  const weatherLat = todaysLocation?.lat ?? trip.destination_lat
  const weatherLng = todaysLocation?.lng ?? trip.destination_lng
  const weatherName = todaysLocation?.name ?? trip.destination_name
  const weatherVisible =
    weatherLat != null && weatherLng != null && daysUntil(trip.start_date) <= 10 && daysUntil(trip.end_date) >= 0

  // The trip header only becomes collapsible when the weather card is also
  // showing, and only on Bookings/Itinerary (the two tabs with filters
  // stacked underneath) — that's the specific combination that runs short
  // on screen height on a phone. Elsewhere it's always shown in full.
  const tripHeaderCollapsible = weatherVisible && (tab === 'bookings' || tab === 'itinerary')
  const showFullTripHeader = !tripHeaderCollapsible || tripHeaderExpanded
  const TripHeaderTag = tripHeaderCollapsible ? 'button' : 'div'

  return (
    <div className="mx-auto max-w-lg px-4 pb-24">
      <div id="trip-sticky-header" className="sticky top-0 z-10 -mx-4 bg-[#fdf8f3] px-4 pb-2 pt-4">
        <TripHeaderTag
          {...(tripHeaderCollapsible
            ? { type: 'button', onClick: () => setTripHeaderExpanded((prev) => !prev) }
            : {})}
          className={`mb-6 flex w-full items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 ${
            tripHeaderCollapsible ? 'text-left' : ''
          }`}
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-3xl">
            {trip.trip_type?.icon ?? '🧳'}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-stone-800">{trip.name}</h1>
            {showFullTripHeader && (
              <p className="text-sm text-stone-500">
                {formatDate(trip.start_date)} –{' '}
                {formatDate(trip.end_date)}
                {trip.nights ? ` · ${trip.nights} nights` : ''}
              </p>
            )}
          </div>
          {tripHeaderCollapsible && (
            <span className="shrink-0 text-xs text-stone-400">{tripHeaderExpanded ? '▲' : '▼'}</span>
          )}
        </TripHeaderTag>

        {weatherVisible && (
          <WeatherForecast lat={weatherLat} lng={weatherLng} destinationName={weatherName} />
        )}

        <TabBar<Tab>
          tabs={[
            { id: 'bookings', label: 'Bookings' },
            { id: 'itinerary', label: 'Itinerary' },
            { id: 'documents', label: 'Documents' },
            { id: 'links', label: 'Links' },
            { id: 'costs', label: 'Costs' },
            { id: 'todos', label: 'To-dos' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {(tab === 'bookings' || tab === 'itinerary') && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPaymentFilters(new Set())}
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                paymentFilters.size === 0
                  ? 'bg-teal-600 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              All
            </button>
            {(
              [
                { id: 'unpaid', label: 'Unpaid' },
                { id: 'partially_paid', label: 'Partially paid' },
                { id: 'paid', label: 'Paid' },
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => togglePaymentFilter(option.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  paymentFilters.has(option.id)
                    ? 'bg-teal-600 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {tab === 'bookings' && (
          <>
            {bookings.length === 0 && <EmptyState text="No bookings yet." />}
            {bookings.length > 0 && visibleBookings.length === 0 && (
              <EmptyState text="No bookings match the current filters." />
            )}
            {visibleBookings.map((b) => (
              <div
                key={b.id}
                id={`item-${b.id}`}
                className={`rounded-2xl bg-white p-4 shadow-sm transition-shadow ${
                  b.id === highlightId ? 'ring-2 ring-teal-400' : 'ring-1 ring-stone-100'
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3
                    className={`font-semibold text-stone-800 ${b.cancelled ? 'line-through' : ''}`}
                  >
                    {b.provider_name}
                  </h3>
                  <div className="flex shrink-0 gap-1.5">
                    {b.cancelled && (
                      <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600">
                        Cancelled
                      </span>
                    )}
                    <PaymentBadge status={b.payment_status} />
                  </div>
                </div>
                {b.confirmation_ref && (
                  <p className="mt-1 text-sm text-stone-500">Ref: {b.confirmation_ref}</p>
                )}
                {(b.start_date || b.end_date) && (
                  <p className="text-sm text-stone-500">
                    {b.start_date ? formatDate(b.start_date) : ''}
                    {b.start_time ? ` ${formatTime(b.start_time)}` : ''}
                    {b.end_date ? ` – ${formatDate(b.end_date)}` : ''}
                    {b.end_date && b.end_time ? ` ${formatTime(b.end_time)}` : ''}
                  </p>
                )}
                {b.cost != null && (
                  <p className="text-sm text-stone-500">{formatMoney(b.cost, b.currency)}</p>
                )}
                {b.check_in_details && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">
                    {b.check_in_details}
                  </p>
                )}
                <AttachedItems
                  documents={documents.filter((d) => d.booking_id === b.id)}
                  links={links.filter((l) => l.booking_id === b.id)}
                />
              </div>
            ))}
          </>
        )}

        {tab === 'itinerary' && (
          <>
            {timeline.length === 0 && itinerary.length === 0 && bookings.length === 0 && (
              <EmptyState text="No itinerary items yet." />
            )}
            {timeline.length === 0 && (itinerary.length > 0 || bookings.length > 0) && (
              <EmptyState text="No itinerary items match the current filters." />
            )}
            {timeline.map((entry) => {
              if (entry.kind === 'bookingStart' || entry.kind === 'bookingEnd') {
                const booking = entry.booking
                return (
                  <button
                    key={`${entry.kind}-${booking.id}`}
                    type="button"
                    onClick={() => handleJumpTo('bookings', booking.id)}
                    className="flex w-full items-center gap-3 rounded-2xl bg-stone-50 p-4 text-left shadow-sm ring-1 ring-stone-200 transition-shadow hover:ring-teal-300"
                  >
                    <div className="w-16 shrink-0 text-sm text-stone-500">
                      <div>{formatDayAbbrev(entry.date)}</div>
                      <div>{formatDate(entry.date, { day: 'numeric', month: 'short' })}</div>
                      {entry.time && <div>{formatTime(entry.time)}</div>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
                        Booking {entry.kind === 'bookingStart' ? 'begins' : 'ends'}
                      </p>
                      <p className="font-medium text-stone-700">{booking.provider_name}</p>
                      {booking.destination_name && (
                        <p className="text-sm text-stone-500">{booking.destination_name}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-teal-600">View →</span>
                  </button>
                )
              }

              const item = entry.item
              return (
                <div
                  key={item.id}
                  id={`item-${item.id}`}
                  className={`flex gap-3 rounded-2xl bg-white p-4 shadow-sm transition-shadow ${
                    item.id === highlightId ? 'ring-2 ring-teal-400' : 'ring-1 ring-stone-100'
                  }`}
                >
                  <div className="w-16 shrink-0 text-sm text-stone-500">
                    <div>{formatDayAbbrev(item.date)}</div>
                    <div>{formatDate(item.date, { day: 'numeric', month: 'short' })}</div>
                    {item.time && <div>{formatTime(item.time)}</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium uppercase tracking-wide text-teal-600">
                        {item.type}
                      </p>
                      {item.cancelled && (
                        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
                          Cancelled
                        </span>
                      )}
                    </div>
                    <p className={`font-medium text-stone-800 ${item.cancelled ? 'line-through' : ''}`}>
                      {item.venue}
                    </p>
                    {item.reference && (
                      <p className="text-sm text-stone-500">Ref: {item.reference}</p>
                    )}
                    {item.cost != null && (
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="text-sm text-stone-500">{formatMoney(item.cost, item.currency)}</p>
                        <PaymentBadge status={item.payment_status} />
                      </div>
                    )}
                    <AttachedItems
                      documents={documents.filter((d) => d.itinerary_item_id === item.id)}
                      links={links.filter((l) => l.itinerary_item_id === item.id)}
                    />
                  </div>
                </div>
              )
            })}
          </>
        )}

        {tab === 'documents' && (
          <>
            {documents.length === 0 && <EmptyState text="No documents yet." />}
            <div className="space-y-6">
              {documentGroups.map((group) => (
                <div key={group.key}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-medium text-stone-700">{group.label}</h3>
                    {group.onJump && (
                      <button
                        type="button"
                        onClick={group.onJump}
                        className="shrink-0 text-xs text-teal-600 hover:text-teal-700"
                      >
                        View →
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <DocumentGroup
                      type="confirmation"
                      documents={group.items.filter((d) => d.type === 'confirmation')}
                    />
                    <DocumentGroup type="photo" documents={group.items.filter((d) => d.type === 'photo')} />
                    <DocumentGroup type="receipt" documents={group.items.filter((d) => d.type === 'receipt')} />
                    <DocumentGroup type="guide" documents={group.items.filter((d) => d.type === 'guide')} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'links' && (
          <>
            {links.length === 0 && <EmptyState text="No links yet." />}
            <div className="space-y-6">
              {linkGroups.map((group) => (
                <div key={group.key}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-medium text-stone-700">{group.label}</h3>
                    {group.onJump && (
                      <button
                        type="button"
                        onClick={group.onJump}
                        className="shrink-0 text-xs text-teal-600 hover:text-teal-700"
                      >
                        View →
                      </button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {group.items.map((link) => (
                      <a
                        key={link.id}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100 hover:shadow-md"
                      >
                        <span className="text-xl">🔗</span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-stone-800">{link.label}</p>
                          <p className="truncate text-sm text-stone-500">{link.url}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'costs' && <CostsTab tripId={trip.id} bookings={bookings} itinerary={itinerary} />}

        {tab === 'todos' && (
          <>
            <form onSubmit={handleAddTodo} className="flex gap-2">
              <input
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                placeholder="Add a to-do…"
                className="flex-1 rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
              <button
                type="submit"
                className="rounded-xl bg-teal-600 px-4 font-medium text-white hover:bg-teal-700"
              >
                Add
              </button>
            </form>
            {todos.length === 0 && <EmptyState text="No to-dos yet." />}
            <div className="space-y-2">
              {todos.map((todo) => (
                <label
                  key={todo.id}
                  className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-100"
                >
                  <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={() => handleToggleTodo(todo)}
                    className="h-5 w-5 rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className={todo.done ? 'text-stone-400 line-through' : 'text-stone-700'}>
                    {todo.text}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-400 ring-1 ring-stone-100">
      {text}
    </p>
  )
}