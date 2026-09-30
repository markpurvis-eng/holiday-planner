import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  getTrips,
  getTrip,
  getBookings,
  getItinerary,
  getExpense,
  getExpenses,
  createExpense,
  updateExpense,
  updateBooking,
  updateItineraryItem,
  repointExpenseDocuments,
} from '../lib/api'
import { fetchGbpRate } from '../lib/fx'
import type { Booking, Expense, ItineraryItem, Trip } from '../lib/types'
import { daysUntil, todayDateString } from '../lib/format'
import { CurrencyQuickPicks } from '../components/CurrencyQuickPicks'
import { AttachModePicker } from '../components/AttachModePicker'
import type { AttachMode } from '../components/AttachModePicker'

// A booking/itinerary item that only had a cost because an ad hoc expense
// was once backfilled onto it (see ensureCostBearing below) and now has no
// expenses left attached — i.e. the exact stub state that backfill
// creates, with nothing left nesting under it. There's no column marking
// "this cost is synthetic", so this is a heuristic (an intentionally
// entered real £0.00 GBP paid line with rate exactly 1 would also match)
// — deliberately offered as a prompt rather than auto-deleted, so a false
// positive costs nothing.
function looksLikeBackfillStub(
  cost: number | null,
  currency: string | null,
  paymentStatus: string,
  fxRateToGbp: number | null
) {
  return cost === 0 && currency === 'GBP' && paymentStatus === 'paid' && fxRateToGbp === 1
}

type OrphanCandidate = { kind: 'booking' | 'itinerary'; id: string; label: string }

export default function AddExpense() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const expenseId = searchParams.get('id')
  // No ?id= means this is the "Add expense" flow rather than editing an
  // existing one — same form, same route, just backed by createExpense
  // instead of updateExpense on submit (same doubling pattern as
  // EditItineraryItem.tsx).
  const isNew = !expenseId
  const defaultTripId = searchParams.get('trip')
  // Pre-fill from the "+" on a Costs-tab card (Missing Features #43):
  // ?booking=<id> or ?itinerary=<id> picks the attach target, ?date=
  // pre-fills the date paid (the card's own date). The attach-mode
  // picker below still renders as normal and stays fully editable — this
  // only sets its initial value, in case the guess needs correcting.
  // Only meaningful for the Add flow — editing loads its own target from
  // the existing expense instead.
  const presetBookingId = searchParams.get('booking')
  const presetItineraryItemId = searchParams.get('itinerary')
  const presetDate = searchParams.get('date')
  const [expense, setExpense] = useState<Expense | null>(null)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [ready, setReady] = useState(isNew)
  const [trips, setTrips] = useState<Trip[]>([])
  const [tripId, setTripId] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [itineraryItems, setItineraryItems] = useState<ItineraryItem[]>([])
  const [attachMode, setAttachMode] = useState<AttachMode>(
    presetBookingId ? 'booking' : presetItineraryItemId ? 'itinerary' : 'trip'
  )
  const [bookingId, setBookingId] = useState(presetBookingId ?? '')
  const [itineraryItemId, setItineraryItemId] = useState(presetItineraryItemId ?? '')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('GBP')
  const [paidOn, setPaidOn] = useState(presetDate || todayDateString())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [orphanCandidate, setOrphanCandidate] = useState<OrphanCandidate | null>(null)
  const [resolvingOrphan, setResolvingOrphan] = useState(false)
  // The tripId-change effect below resets attach mode back to "Whole
  // trip" on every change, since normally switching trips invalidates
  // whatever booking/itinerary item was selected. That would also wipe
  // out a preset from the URL (or the existing expense's own target, when
  // editing) the instant tripId is first set — this ref lets that first
  // set through untouched, so only a trip switch the person makes *after*
  // landing here resets the attach mode.
  const initializedTripRef = useRef(false)

  useEffect(() => {
    if (!isNew && expenseId) {
      getExpense(expenseId).then((e) => {
        if (!e) return
        setExpense(e)
        setLabel(e.label)
        setAmount(String(e.amount))
        setCurrency(e.currency)
        setPaidOn(e.paid_on)
        setAttachMode(e.booking_id ? 'booking' : e.itinerary_item_id ? 'itinerary' : 'trip')
        setBookingId(e.booking_id ?? '')
        setItineraryItemId(e.itinerary_item_id ?? '')
        setTripId(e.trip_id)
        getTrip(e.trip_id).then(setTrip)
        setReady(true)
      })
    }
  }, [isNew, expenseId])

  useEffect(() => {
    if (isNew) {
      getTrips().then((t) => {
        setTrips(t)
        // Same "whichever trip is actually under way today" default as
        // AddLink/Upload use, so this page behaves consistently with them.
        const activeTrip = t.find((trip) => daysUntil(trip.start_date) <= 0 && daysUntil(trip.end_date) >= 0)
        const preferred =
          defaultTripId && t.some((trip) => trip.id === defaultTripId)
            ? defaultTripId
            : activeTrip?.id ?? t[0]?.id
        if (preferred) setTripId(preferred)
      })
    } else {
      // Editing still needs the trip picker's own list disabled/hidden
      // (see the JSX below) but not fetched — the trip a booking/expense
      // belongs to never changes here, only what it's attached to within
      // that trip.
      getTrips().then(setTrips)
    }
  }, [isNew, defaultTripId])

  useEffect(() => {
    if (!tripId) {
      setBookings([])
      setItineraryItems([])
      return
    }
    if (initializedTripRef.current) {
      setAttachMode('trip')
      setBookingId('')
      setItineraryItemId('')
    }
    initializedTripRef.current = true
    getBookings(tripId).then(setBookings)
    getItinerary(tripId).then(setItineraryItems)
  }, [tripId])

  // If this expense attaches to a booking/itinerary item that has no cost
  // of its own (e.g. a free walking tour you still tip the guide on), give
  // it a nominal £0.00 cost first. The Costs tab only shows a card for
  // cost-bearing lines, so without this an attached ad hoc expense would
  // have nothing to nest under. Zero cost is inherently "settled", so it's
  // marked paid too — GBP is arbitrary but harmless (0 in any currency is
  // 0 GBP; the point is just to create a line to nest under). Shared by
  // both the Add flow and Edit's re-point-to-a-new-target case.
  async function ensureCostBearing(mode: AttachMode, targetId: string) {
    if (mode === 'booking') {
      const booking = bookings.find((b) => b.id === targetId)
      if (booking && booking.cost == null) {
        await updateBooking(targetId, {
          cost: 0,
          currency: 'GBP',
          payment_status: 'paid',
          fx_rate_to_gbp: 1,
          fx_rate_locked_at: new Date().toISOString(),
        })
      }
    } else if (mode === 'itinerary') {
      const item = itineraryItems.find((i) => i.id === targetId)
      if (item && item.cost == null) {
        await updateItineraryItem(targetId, {
          cost: 0,
          currency: 'GBP',
          payment_status: 'paid',
          fx_rate_to_gbp: 1,
          fx_rate_locked_at: new Date().toISOString(),
        })
      }
    }
  }

  // After moving an expense off a booking/itinerary item, checks whether
  // that old target is now an orphaned zero-cost stub — created by
  // ensureCostBearing above at some point in this expense's life, and now
  // left with nothing nested under it. Flags it for the person to decide
  // on rather than deleting it outright (see looksLikeBackfillStub's
  // comment on why this is a heuristic, not a certainty).
  async function checkOrphan(
    oldBookingId: string | null,
    oldItineraryItemId: string | null,
    movedExpenseId: string
  ): Promise<OrphanCandidate | null> {
    if (!oldBookingId && !oldItineraryItemId) return null
    const remaining = await getExpenses(tripId)
    const stillAttached = remaining.some(
      (e) =>
        e.id !== movedExpenseId &&
        ((oldBookingId && e.booking_id === oldBookingId) ||
          (oldItineraryItemId && e.itinerary_item_id === oldItineraryItemId))
    )
    if (stillAttached) return null

    if (oldBookingId) {
      const b = bookings.find((b) => b.id === oldBookingId)
      if (b && looksLikeBackfillStub(b.cost, b.currency, b.payment_status, b.fx_rate_to_gbp)) {
        return { kind: 'booking', id: b.id, label: b.provider_name }
      }
    }
    if (oldItineraryItemId) {
      const i = itineraryItems.find((i) => i.id === oldItineraryItemId)
      if (i && looksLikeBackfillStub(i.cost, i.currency, i.payment_status, i.fx_rate_to_gbp)) {
        return { kind: 'itinerary', id: i.id, label: i.venue ?? i.type }
      }
    }
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsedAmount = Number(amount)
    if (!label || !currency || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return
    setSaving(true)
    setError(false)
    try {
      const newBookingId = attachMode === 'booking' ? bookingId || null : null
      const newItineraryItemId = attachMode === 'itinerary' ? itineraryItemId || null : null

      if (attachMode === 'booking' && bookingId) await ensureCostBearing('booking', bookingId)
      if (attachMode === 'itinerary' && itineraryItemId) await ensureCostBearing('itinerary', itineraryItemId)

      if (isNew) {
        // Recorded after the fact - lock the FX rate right at entry, same
        // as any other cost line that's already paid, rather than leaving
        // it to be picked up later.
        const rate = await fetchGbpRate(currency.toUpperCase())
        await createExpense({
          trip_id: tripId,
          booking_id: newBookingId,
          itinerary_item_id: newItineraryItemId,
          label,
          amount: parsedAmount,
          currency: currency.toUpperCase(),
          paid_on: paidOn,
          fx_rate_to_gbp: rate,
          fx_rate_locked_at: new Date().toISOString(),
        })
        navigate(`/trips/${tripId}?tab=costs`)
        return
      }

      if (!expense) return
      const targetChanged =
        newBookingId !== expense.booking_id || newItineraryItemId !== expense.itinerary_item_id
      const currencyChanged = currency.toUpperCase() !== expense.currency

      let rateFields: { fx_rate_to_gbp: number; fx_rate_locked_at: string } | Record<string, never> = {}
      if (currencyChanged) {
        const rate = await fetchGbpRate(currency.toUpperCase())
        rateFields = { fx_rate_to_gbp: rate, fx_rate_locked_at: new Date().toISOString() }
      }

      await updateExpense(expense.id, {
        booking_id: newBookingId,
        itinerary_item_id: newItineraryItemId,
        label,
        amount: parsedAmount,
        currency: currency.toUpperCase(),
        paid_on: paidOn,
        ...rateFields,
      })

      if (targetChanged) {
        await repointExpenseDocuments(expense.id, {
          booking_id: newBookingId,
          itinerary_item_id: newItineraryItemId,
        })
        const candidate = await checkOrphan(expense.booking_id, expense.itinerary_item_id, expense.id)
        if (candidate) {
          setOrphanCandidate(candidate)
          return
        }
      }

      navigate(`/trips/${tripId}?tab=costs`)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteOrphan() {
    if (!orphanCandidate) return
    setResolvingOrphan(true)
    try {
      const clearFields = {
        cost: null,
        currency: null,
        payment_status: 'unpaid' as const,
        fx_rate_to_gbp: null,
        fx_rate_locked_at: null,
      }
      if (orphanCandidate.kind === 'booking') {
        await updateBooking(orphanCandidate.id, clearFields)
      } else {
        await updateItineraryItem(orphanCandidate.id, clearFields)
      }
      navigate(`/trips/${tripId}?tab=costs`)
    } finally {
      setResolvingOrphan(false)
    }
  }

  function handleKeepOrphan() {
    navigate(`/trips/${tripId}?tab=costs`)
  }

  if (!isNew && !ready) {
    return <p className="p-4 text-sm text-stone-500">Loading expense…</p>
  }

  if (orphanCandidate) {
    const label = orphanCandidate.kind === 'booking' ? 'booking' : 'itinerary item'
    return (
      <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
        <h1 className="mb-6 text-2xl font-bold text-stone-800">Expense moved</h1>
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          <p>
            "{orphanCandidate.label}" now has no ad hoc expenses attached, and its £0.00 cost looks
            like it was only created to hold them (Costs tab entries need a cost to have something
            to nest under). It's now a worthless empty entry there — delete it?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleDeleteOrphan}
              disabled={resolvingOrphan}
              className="flex-1 rounded-xl bg-amber-600 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {resolvingOrphan ? 'Deleting…' : `Delete the empty ${label} entry`}
            </button>
            <button
              type="button"
              onClick={handleKeepOrphan}
              disabled={resolvingOrphan}
              className="flex-1 rounded-xl bg-stone-100 py-2 font-medium text-stone-600 hover:bg-stone-200"
            >
              Leave it
            </button>
          </div>
        </div>
      </div>
    )
  }

  const tripLocked = trip?.total_cost_locked_at != null

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-stone-800">{isNew ? 'Add Expense' : 'Edit Expense'}</h1>

      {tripLocked && (
        <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
          🔒 This trip's total cost is locked. Changing the amount or currency here won't update it
          automatically — ask to have the trip re-locked once you're done editing. Moving this expense
          to a different booking/itinerary item is unaffected either way, since it doesn't change the
          total.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">What was it for</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Tip for tour guide"
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-stone-600">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="w-36">
            <label className="mb-1 block text-sm font-medium text-stone-600">Currency</label>
            <CurrencyQuickPicks value={currency} onChange={setCurrency} />
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="GBP"
              maxLength={3}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 uppercase outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Date paid</label>
          <input
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {isNew ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-600">Trip</label>
            <select
              value={tripId}
              onChange={(e) => setTripId(e.target.value)}
              className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5"
            >
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-stone-400">
            Trip: {trips.find((t) => t.id === tripId)?.name ?? '…'} (can't be changed here)
          </p>
        )}

        <AttachModePicker
          mode={attachMode}
          onModeChange={setAttachMode}
          bookings={bookings}
          itineraryItems={itineraryItems}
          bookingId={bookingId}
          onBookingIdChange={setBookingId}
          itineraryItemId={itineraryItemId}
          onItineraryItemIdChange={setItineraryItemId}
          currentBookingId={expense?.booking_id}
          currentItineraryItemId={expense?.itinerary_item_id}
        />

        {error && (
          <p className="text-sm text-red-500">
            Couldn't save — check your connection (needed to fetch the exchange rate) and try again.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-teal-600 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save expense'}
        </button>
      </form>
    </div>
  )
}
