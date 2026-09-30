import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getTrips, getBookings, getItinerary, uploadDocumentFile, createDocument } from '../lib/api'
import type { Booking, DocumentType, ItineraryItem, Trip } from '../lib/types'
import { daysUntil } from '../lib/format'
import { AttachModePicker } from '../components/AttachModePicker'
import type { AttachMode } from '../components/AttachModePicker'

const TYPES: { id: DocumentType; label: string }[] = [
  { id: 'confirmation', label: 'Confirmation' },
  { id: 'photo', label: 'Photo' },
  { id: 'receipt', label: 'Receipt' },
  { id: 'guide', label: 'Guide' },
]

// Photos are camera/gallery images; everything else (confirmations, receipts,
// guides) is just as likely to be a PDF, Word doc, or plain text export.
const ACCEPT_BY_TYPE: Record<DocumentType, string> = {
  photo: 'image/*',
  confirmation: 'image/*,application/pdf,.doc,.docx,.txt',
  receipt: 'image/*,application/pdf,.doc,.docx,.txt',
  guide: 'image/*,application/pdf,.doc,.docx,.txt',
}

export default function Upload() {
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
  const [type, setType] = useState<DocumentType>('photo')
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getTrips().then((t) => {
      setTrips(t)
      // No ?trip= param (e.g. arriving from Home/Settings rather than a
      // trip page) — default to whichever trip is actually under way today
      // by date, not the stored `status` column (which can lag — a trip
      // can still say "upcoming" in the DB after it's started), falling
      // back to the first trip in the list if none is currently active.
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
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const url = await uploadDocumentFile(file)
      await createDocument({
        type,
        file_url: url,
        title: title || file.name,
        trip_id: tripId || null,
        booking_id: attachMode === 'booking' ? bookingId || null : null,
        itinerary_item_id: attachMode === 'itinerary' ? itineraryItemId || null : null,
      })
      if (attachMode === 'booking' && bookingId) {
        navigate(`/trips/${tripId}?tab=bookings&highlight=${bookingId}`)
      } else if (attachMode === 'itinerary' && itineraryItemId) {
        navigate(`/trips/${tripId}?tab=itinerary&highlight=${itineraryItemId}`)
      } else {
        navigate(`/trips/${tripId}?tab=documents`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-stone-800">Upload</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Type</label>
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setType(t.id)}
                className={`flex-1 rounded-xl px-2 py-2 text-sm font-medium ${
                  type === t.id ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Photo / file</label>
          <label className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm">
            <span className="shrink-0 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600">
              Choose file
            </span>
            <span className="truncate text-stone-500">
              {file ? file.name : 'No file selected'}
            </span>
            <input
              type="file"
              accept={ACCEPT_BY_TYPE[type]}
              capture={type === 'photo' ? 'environment' : undefined}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          {type !== 'photo' && (
            <p className="mt-1 text-xs text-stone-400">Images, PDFs, and Word docs all work here.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Title (optional)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full rounded-xl bg-teal-600 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </form>
    </div>
  )
}