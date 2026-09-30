import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getTrips, getBookings, getItinerary, createLink } from '../lib/api'
import type { Booking, ItineraryItem, Trip } from '../lib/types'
import { daysUntil } from '../lib/format'
import { AttachModePicker } from '../components/AttachModePicker'
import type { AttachMode } from '../components/AttachModePicker'

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

        <AttachModePicker
          mode={attachMode}
          onModeChange={setAttachMode}
          bookings={bookings}
          itineraryItems={itineraryItems}
          bookingId={bookingId}
          onBookingIdChange={setBookingId}
          itineraryItemId={itineraryItemId}
          onItineraryItemIdChange={setItineraryItemId}
        />

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
