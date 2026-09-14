import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getTrips, getBookings, getItinerary, createLink } from '../lib/api'
import type { Booking, ItineraryItem, Trip } from '../lib/types'
import { formatDate, daysUntil } from '../lib/format'

type AttachMode = 'trip' | 'booking' | 'itinerary'

function formatItineraryLabel(item: ItineraryItem) {
  const date = formatDate(item.date, { day: 'numeric', month: 'short' })
  return `${date} · ${item.venue ?? item.type}`
}

export default function AddLink() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const defaultTripId = searchParams.get('trip')
  const [trips, setTrips] = useState<Trip[]>([])
  const [tripId, setTripId] = useState('')
  const [bookings, setBookings] = useState<Booking[]>([])
  const [itineraryItems, setItineraryItems] = useState<ItineraryItem[]>([])
  const [attachMode, setAttachMode] = useState<AttachMode>('trip')
  const [bookingId, setBookingId] = useState('')
  const [itineraryItemId, setItineraryItemId] = useState('')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getTrips().then((t) => {
      setTrips(t)
      // No ?trip= param — default to whichever trip is actually under way
      // today by date, not the stored `status` column (which can lag —
      // a trip can still say "upcoming" after it's started), falling back
      // to the first trip in the list if none is currently active.
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
    setAttachMode('trip')
    setBookingId('')
    setItineraryItemId('')
    getBookings(tripId).then(setBookings)
    getItinerary(tripId).then(setItineraryItems)
  }, [tripId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!label || !url) return
    setSaving(true)
    try {
      await createLink({
        label,
        url,
        trip_id: tripId || null,
        booking_id: attachMode === 'booking' ? bookingId || null : null,
        itinerary_item_id: attachMode === 'itinerary' ? itineraryItemId || null : null,
      })
      if (attachMode === 'booking' && bookingId) {
        navigate(`/trips/${tripId}?tab=bookings&highlight=${bookingId}`)
      } else if (attachMode === 'itinerary' && itineraryItemId) {
        navigate(`/trips/${tripId}?tab=itinerary&highlight=${itineraryItemId}`)
      } else {
        navigate(`/trips/${tripId}?tab=links`)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-stone-800">Add Link</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Airport parking booking"
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
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

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-teal-600 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save link'}
        </button>
      </form>
    </div>
  )
}
