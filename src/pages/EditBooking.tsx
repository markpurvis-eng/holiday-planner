import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getBooking, getTrip, updateBooking } from '../lib/api'
import type { Booking, PaymentStatus } from '../lib/types'
import { LoadingSpinner } from '../components/LoadingSpinner'

export default function EditBooking() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const bookingId = searchParams.get('id')
  const tripId = searchParams.get('trip')

  const [booking, setBooking] = useState<Booking | null>(null)
  const [tripLocked, setTripLocked] = useState(false)
  const [providerName, setProviderName] = useState('')
  const [confirmationRef, setConfirmationRef] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [cost, setCost] = useState('')
  const [currency, setCurrency] = useState('')
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('unpaid')
  const [cancelled, setCancelled] = useState(false)
  const [extractedDetails, setExtractedDetails] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!bookingId) return
    getBooking(bookingId).then((b) => {
      if (!b) return
      setBooking(b)
      setProviderName(b.provider_name)
      setConfirmationRef(b.confirmation_ref ?? '')
      setStartDate(b.start_date ?? '')
      setEndDate(b.end_date ?? '')
      setStartTime(b.start_time ?? '')
      setEndTime(b.end_time ?? '')
      setCost(b.cost != null ? String(b.cost) : '')
      setCurrency(b.currency ?? '')
      setPaymentStatus(b.payment_status)
      setCancelled(b.cancelled)
      setExtractedDetails(b.extracted_details ?? '')
      setNotes(b.notes ?? '')
    })
    if (tripId) {
      getTrip(tripId).then((t) => setTripLocked(t?.total_cost_locked_at != null))
    }
  }, [bookingId, tripId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!booking || !providerName.trim()) return
    setSaving(true)
    setError(false)
    try {
      const currencyChanged = currency.toUpperCase() !== (booking.currency ?? '')
      const noLongerPaid = booking.payment_status === 'paid' && paymentStatus !== 'paid'
      // A previously-locked FX rate only makes sense for the currency it
      // was locked against, and only while the line is actually settled.
      // If either changes here, clear the lock rather than leaving a
      // stale rate silently misapplied - the Costs tab will fetch and
      // lock a fresh one next time it notices this line is paid.
      const shouldClearLock = booking.fx_rate_to_gbp != null && (currencyChanged || noLongerPaid)

      await updateBooking(booking.id, {
        provider_name: providerName.trim(),
        confirmation_ref: confirmationRef.trim() || null,
        start_date: startDate || null,
        end_date: endDate || null,
        start_time: startTime || null,
        end_time: endTime || null,
        cost: cost === '' ? null : Number(cost),
        currency: currency.trim() ? currency.trim().toUpperCase() : null,
        payment_status: paymentStatus,
        cancelled,
        extracted_details: extractedDetails.trim() || null,
        notes: notes.trim() || null,
        ...(shouldClearLock ? { fx_rate_to_gbp: null, fx_rate_locked_at: null } : {}),
      })
      navigate(tripId ? `/trips/${tripId}?tab=bookings&highlight=${booking.id}` : '/')
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  if (!bookingId) {
    return <p className="p-4 text-sm text-stone-500">No booking specified.</p>
  }

  if (!booking) {
    return <LoadingSpinner label="Loading booking…" />
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-stone-800">Edit Booking</h1>

      {tripLocked && (
        <p className="mb-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
          🔒 This trip's total cost is locked. Changing cost, currency, or payment status here won't
          update it automatically — ask to have the trip re-locked once you're done editing.
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Provider name</label>
          <input
            value={providerName}
            onChange={(e) => setProviderName(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-stone-600">Confirmation reference</label>
          <input
            value={confirmationRef}
            onChange={(e) => setConfirmationRef(e.target.value)}
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-stone-600">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-sm font-medium text-stone-600">Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-stone-600">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <div className="w-32">
            <label className="mb-1 block text-sm font-medium text-stone-600">Time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
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
            placeholder="Anything you want to remember about this booking"
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          />
        </div>

        {error && (
          <p className="text-sm text-red-500">Couldn't save — check your connection and try again.</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate(tripId ? `/trips/${tripId}?tab=bookings` : '/')}
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
