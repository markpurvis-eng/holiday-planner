import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getTrips, getBookings, getItinerary, createExpense, updateBooking, updateItineraryItem } from '../lib/api'
import { fetchGbpRate } from '../lib/fx'
import type { Booking, ItineraryItem, Trip } from '../lib/types'
import { formatDate, daysUntil, todayDateString } from '../lib/format'

type AttachMode = 'trip' | 'booking' | 'itinerary'

function formatItineraryLabel(item: ItineraryItem) {
  const date = formatDate(item.date, { day: 'numeric', month: 'short' })
  return `${date} · ${item.venue ?? item.type}`
}

export default function AddExpense() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const defaultTripId = searchParams.get('trip')
  // Pre-fill from the "+" on a Costs-tab card (Missing Features #43):
  // ?booking=<id> or ?itinerary=<id> picks the attach target, ?date=
  // pre-fills the date paid (the card's own date). The attach-mode
  // picker below still renders as normal and stays fully editable — this
  // only sets its initial value, in case the guess needs correcting.
  const presetBookingId = searchParams.get('booking')
  const presetItineraryItemId = searchParams.get('itinerary')
  const presetDate = searchParams.get('date')
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
  // The tripId-change effect below resets attach mode back to "Whole
  // trip" on every change, since normally switching trips invalidates
  // whatever booking/itinerary item was selected. That would also wipe
  // out a preset from the URL the instant tripId is first set (from '' to
  // the target trip) — this ref lets that first set through untouched,
  // so only a trip switch the person makes *after* landing here resets
  // the attach mode, same as before presets existed.
  const initializedTripRef = useRef(false)

  useEffect(() => {
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
  }, [defaultTripId])

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const parsedAmount = Number(amount)
    if (!label || !currency || !Number.isFinite(parsedAmount) || parsedAmount <= 0) return
    setSaving(true)
    setError(false)
    try {
      // If this expense attaches to a booking/itinerary item that has no
      // cost of its own (e.g. a free walking tour you still tip the guide
      // on), give it a nominal £0.00 cost first. The Costs tab only shows
      // a card for cost-bearing lines, so without this an attached ad hoc
      // expense would have nothing to nest under. Zero cost is inherently
      // "settled", so it's marked paid too - GBP is arbitrary but harmless
      // (0 in any currency is 0 GBP; the point is just to create a line).
      if (attachMode === 'booking' && bookingId) {
        const booking = bookings.find((b) => b.id === bookingId)
        if (booking && booking.cost == null) {
          await updateBooking(bookingId, {
            cost: 0,
            currency: 'GBP',
            payment_status: 'paid',
            fx_rate_to_gbp: 1,
            fx_rate_locked_at: new Date().toISOString(),
          })
        }
      } else if (attachMode === 'itinerary' && itineraryItemId) {
        const item = itineraryItems.find((i) => i.id === itineraryItemId)
        if (item && item.cost == null) {
          await updateItineraryItem(itineraryItemId, {
            cost: 0,
            currency: 'GBP',
            payment_status: 'paid',
            fx_rate_to_gbp: 1,
            fx_rate_locked_at: new Date().toISOString(),
          })
        }
      }

      // Recorded after the fact - lock the FX rate right at entry, same as
      // any other cost line that's already paid, rather than leaving it
      // to be picked up later.
      const rate = await fetchGbpRate(currency.toUpperCase())
      await createExpense({
        trip_id: tripId,
        booking_id: attachMode === 'booking' ? bookingId || null : null,
        itinerary_item_id: attachMode === 'itinerary' ? itineraryItemId || null : null,
        label,
        amount: parsedAmount,
        currency: currency.toUpperCase(),
        paid_on: paidOn,
        fx_rate_to_gbp: rate,
        fx_rate_locked_at: new Date().toISOString(),
      })
      navigate(`/trips/${tripId}?tab=costs`)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-stone-800">Add Expense</h1>

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
          <div className="w-28">
            <label className="mb-1 block text-sm font-medium text-stone-600">Currency</label>
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

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Attach to</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAttachMode('trip')}
              className={`flex-1 rounded-xl px-2 py-2 text-sm font-medium ${
                attachMode === 'trip' ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600'
              }`}
            >
              Whole trip
            </button>
            <button
              type="button"
              onClick={() => setAttachMode('booking')}
              disabled={bookings.length === 0}
              className={`flex-1 rounded-xl px-2 py-2 text-sm font-medium disabled:opacity-40 ${
                attachMode === 'booking' ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600'
              }`}
            >
              A booking
            </button>
            <button
              type="button"
              onClick={() => setAttachMode('itinerary')}
              disabled={itineraryItems.length === 0}
              className={`flex-1 rounded-xl px-2 py-2 text-sm font-medium disabled:opacity-40 ${
                attachMode === 'itinerary' ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600'
              }`}
            >
              An itinerary item
            </button>
          </div>

          {attachMode === 'booking' && (
            <select
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5"
            >
              <option value="">Choose a booking…</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.provider_name}
                </option>
              ))}
            </select>
          )}

          {attachMode === 'itinerary' && (
            <select
              value={itineraryItemId}
              onChange={(e) => setItineraryItemId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5"
            >
              <option value="">Choose an itinerary item…</option>
              {itineraryItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {formatItineraryLabel(item)}
                </option>
              ))}
            </select>
          )}
        </div>

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
