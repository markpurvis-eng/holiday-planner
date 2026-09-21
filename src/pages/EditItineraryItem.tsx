import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { createItineraryItem, getItineraryItem, getTrip, updateItineraryItem } from '../lib/api'
import type { ItineraryItem, PaymentStatus, Trip } from '../lib/types'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { clampToTripRange, nowTimeString, todayDateString } from '../lib/format'
import {
  getLastItineraryCurrency,
  getLastItineraryType,
  setLastItineraryCurrency,
  setLastItineraryType,
} from '../lib/settings'

export default function EditItineraryItem() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const itemId = searchParams.get('id')
  const tripId = searchParams.get('trip')
  // No ?id= means this is the "Add itinerary item" flow rather than
  // editing an existing one — same form, same route, just backed by
  // createItineraryItem instead of updateItineraryItem on submit.
  const isNew = !itemId

  const [item, setItem] = useState<ItineraryItem | null>(null)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [ready, setReady] = useState(false)
  const [type, setType] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [venue, setVenue] = useState('')
  const [reference, setReference] = useState('')
  const [cost, setCost] = useState('')
  const [currency, setCurrency] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('unpaid')
  const [cancelled, setCancelled] = useState(false)
  const [extractedDetails, setExtractedDetails] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let stale = false

    async function load() {
      const t = tripId ? await getTrip(tripId) : null
      if (stale) return
      setTrip(t)

      if (itemId) {
        const i = await getItineraryItem(itemId)
        if (stale || !i) return
        setItem(i)
        setType(i.type)
        setDate(i.date)
        setTime(i.time ?? '')
        setVenue(i.venue ?? '')
        setReference(i.reference ?? '')
        setCost(i.cost != null ? String(i.cost) : '')
        setCurrency(i.currency ?? '')
        setPaymentStatus(i.payment_status)
        setCancelled(i.cancelled)
        setExtractedDetails(i.extracted_details ?? '')
        setNotes(i.notes ?? '')
      } else {
        // New item, added on the go — default to today/now (clamped inside
        // the trip's own dates, in case it's added before departure or
        // after the trip has technically ended) and whatever type/currency
        // was used last time on this device.
        const today = todayDateString()
        setDate(t ? clampToTripRange(today, t.start_date, t.end_date) : today)
        setTime(nowTimeString())
        setType(getLastItineraryType())
        setCurrency(getLastItineraryCurrency())
      }
      setReady(true)
    }

    load()
    return () => {
      stale = true
    }
  }, [itemId, tripId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!type.trim() || !date) return
    setSaving(true)
    setError(false)
    try {
      if (isNew) {
        if (!tripId) return
        const created = await createItineraryItem({
          trip_id: tripId,
          type: type.trim(),
          date,
          time: time || null,
          venue: venue.trim() || null,
          reference: reference.trim() || null,
          cost: cost === '' ? null : Number(cost),
          currency: currency.trim() ? currency.trim().toUpperCase() : null,
          payment_status: paymentStatus,
          cancelled,
          extracted_details: extractedDetails.trim() || null,
          notes: notes.trim() || null,
        })
        setLastItineraryType(type.trim())
        if (currency.trim()) setLastItineraryCurrency(currency.trim().toUpperCase())
        navigate(`/trips/${tripId}?tab=itinerary&highlight=${created.id}`)
        return
      }

      if (!item) return
      const currencyChanged = currency.toUpperCase() !== (item.currency ?? '')
      const noLongerPaid = item.payment_status === 'paid' && paymentStatus !== 'paid'
      // Same reasoning as EditBooking - a locked FX rate only makes sense
      // for the currency/settled-state it was locked against.
      const shouldClearLock = item.fx_rate_to_gbp != null && (currencyChanged || noLongerPaid)

      await updateItineraryItem(item.id, {
        type: type.trim(),
        date,
        time: time || null,
        venue: venue.trim() || null,
        reference: reference.trim() || null,
        cost: cost === '' ? null : Number(cost),
        currency: currency.trim() ? currency.trim().toUpperCase() : null,
        payment_status: paymentStatus,
        cancelled,
        extracted_details: extractedDetails.trim() || null,
        notes: notes.trim() || null,
        ...(shouldClearLock ? { fx_rate_to_gbp: null, fx_rate_locked_at: null } : {}),
      })
      navigate(tripId ? `/trips/${tripId}?tab=itinerary&highlight=${item.id}` : '/')
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  if (!itemId && !tripId) {
    return <p className="p-4 text-sm text-stone-500">No trip specified.</p>
  }

  if (!ready) {
    return <LoadingSpinner label={isNew ? 'Loading trip…' : 'Loading itinerary item…'} />
  }

  if (!isNew && !item) {
    return <p className="p-4 text-sm text-stone-500">Itinerary item not found.</p>
  }

  const tripLocked = trip?.total_cost_locked_at != null

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-stone-800">
        {isNew ? 'Add Itinerary Item' : 'Edit Itinerary Item'}
      </h1>

      {tripLocked && (
        <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
          🔒 This trip's total cost is locked. {isNew ? 'Adding' : 'Changing'} cost, currency, or
          payment status here won't update it automatically — ask to have the trip re-locked once
          you're done editing.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Type</label>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="e.g. dining, transport, activity"
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Venue</label>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            autoFocus={isNew}
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-stone-600">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-sm font-medium text-stone-600">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Reference</label>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-stone-600">Cost</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
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
          <label className="mb-1 block text-sm font-medium text-stone-600">Payment status</label>
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5"
          >
            <option value="unpaid">Unpaid</option>
            <option value="partially_paid">Partially paid</option>
            <option value="paid">Paid</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-stone-600">
          <input
            type="checkbox"
            checked={cancelled}
            onChange={(e) => setCancelled(e.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500"
          />
          Cancelled
        </label>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">
            Extracted details <span className="text-stone-400">(from the confirmation)</span>
          </label>
          <textarea
            value={extractedDetails}
            onChange={(e) => setExtractedDetails(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Anything you want to remember about this"
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-500">Couldn't save — check your connection and try again.</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(tripId ? `/trips/${tripId}?tab=itinerary` : '/')}
            className="flex-1 rounded-xl bg-stone-100 py-2.5 font-medium text-stone-600 hover:bg-stone-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-teal-600 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
