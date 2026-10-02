import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createTrip, getTripTypes } from '../lib/api'
import type { TripStatus, TripType } from '../lib/types'
import { AddressField } from '../components/AddressField'
import { useAddressPin } from '../lib/useAddressPin'
import { parseLocalDate, todayDateString } from '../lib/format'

const inputClass =
  'w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'

// The Dashboard splits trips into Active & Upcoming vs Past using the stored
// status, so a new trip needs the right one for its dates (a trip being
// entered after the fact is already past, one that has started is active).
function statusForDates(start: string, end: string): TripStatus {
  const today = todayDateString()
  if (end < today) return 'past'
  if (start <= today) return 'active'
  return 'upcoming'
}

// Whole nights between two YYYY-MM-DD dates, using local-date parsing so a
// timezone behind UTC can't shift either end by a day.
function nightsBetween(start: string, end: string): number {
  const ms = parseLocalDate(end).getTime() - parseLocalDate(start).getTime()
  return Math.round(ms / 86_400_000)
}

export default function AddTrip() {
  const navigate = useNavigate()
  const [tripTypes, setTripTypes] = useState<TripType[]>([])
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [tripTypeId, setTripTypeId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The destination is the trip's weather/forecast anchor (destination_name,
  // destination_lat, destination_lng), not a street address, but it needs the
  // same look-up-or-paste-coordinates handling, so it reuses the same hook.
  const destination = useAddressPin(null)

  useEffect(() => {
    getTripTypes()
      .then(setTripTypes)
      .catch(() => setTripTypes([]))
  }, [])

  function handleStartChange(value: string) {
    setStartDate(value)
    // Most trips are entered start-first; don't leave an end date before it.
    if (!endDate || endDate < value) setEndDate(value)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)

    if (!name.trim()) return setError('Give the trip a name.')
    if (!startDate || !endDate) return setError('Choose a start and end date.')
    if (endDate < startDate) return setError('The end date is before the start date.')

    setSaving(true)
    try {
      const place = await destination.resolveForSave()
      if (!place) return // an address message is showing; the user fixes it or presses Create again

      // The database adds the Google Photos link to every new trip itself
      // (a trigger on trip insert), so nothing more to do here.
      const created = await createTrip({
        name: name.trim(),
        start_date: startDate,
        end_date: endDate,
        nights: nightsBetween(startDate, endDate),
        status: statusForDates(startDate, endDate),
        trip_type_id: tripTypeId || null,
        destination_name: place.address,
        destination_lat: place.pin_lat,
        destination_lng: place.pin_lng,
      })
      navigate(`/trips/${created.id}`)
    } catch {
      setError("Couldn't create the trip — check your connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-stone-800">New Trip</h1>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Trip name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Glasgow Weekend"
            className={inputClass}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-stone-600">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => handleStartChange(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-stone-600">End date</label>
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">
            Trip type <span className="text-stone-400">(optional)</span>
          </label>
          <select
            value={tripTypeId}
            onChange={(e) => setTripTypeId(e.target.value)}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5"
          >
            <option value="">None</option>
            {tripTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.icon} {t.name}
              </option>
            ))}
          </select>
        </div>

        <AddressField
          pin={destination}
          label="Main destination"
          hint="(optional, used for the weather forecast)"
          placeholder="e.g. Glasgow, or Fuengirola, Spain"
          saveLabel="Create trip"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex-1 rounded-xl bg-stone-100 py-2.5 font-medium text-stone-600 hover:bg-stone-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-teal-600 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create trip'}
          </button>
        </div>
      </form>
    </div>
  )
}
