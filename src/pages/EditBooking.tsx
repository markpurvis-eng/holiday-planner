import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getBooking, getChildBookings, getTrip, updateBooking } from '../lib/api'
import type { Booking, PaymentStatus } from '../lib/types'
import { formatDate, formatMoney, formatTime } from '../lib/format'
import { PaymentBadge } from '../components/PaymentBadge'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { CurrencyQuickPicks } from '../components/CurrencyQuickPicks'
import { AddressField } from '../components/AddressField'
import { useAddressPin } from '../lib/useAddressPin'
import { FlightLegsEditor } from '../components/FlightLegsEditor'
import { buildFlightDetails, flightFormFromDetails } from '../lib/bookingTypes/flightForm'
import type { FlightForm } from '../lib/bookingTypes/flightForm'

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
  // Flight bookings edit their legs here; the core dates are derived from them on save.
  const [flightForm, setFlightForm] = useState<FlightForm | null>(null)
  // Set by a failed save: from then on the missing fields are shown live, all at once.
  const [flightTried, setFlightTried] = useState(false)
  // Set when cancelling a booking that has children: the save waits for the choice below.
  const [pendingChildren, setPendingChildren] = useState<Booking[] | null>(null)
  const pin = useAddressPin(null)
  const loadPin = pin.load

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
      setFlightForm(b.type === 'flight' ? flightFormFromDetails(b.details) : null)
      loadPin({ address: b.address, pin_lat: b.pin_lat, pin_lng: b.pin_lng })
    })
    if (tripId) {
      getTrip(tripId).then((t) => setTripLocked(t?.total_cost_locked_at != null))
    }
  }, [bookingId, tripId, loadPin])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!booking || !providerName.trim()) return
    if (flightForm) {
      if (buildFlightDetails(flightForm).errors.length > 0) {
        setFlightTried(true)
        return
      }
    }
    // Cancelling a parent (a cruise with excursions) asks what to do with its
    // children instead of cascading silently: an independent operator's
    // excursion may still be refundable (Missing Features #83, decision 10).
    if (cancelled && !booking.cancelled) {
      setSaving(true)
      setError(false)
      try {
        const kids = (await getChildBookings(booking.id)).filter((k) => !k.cancelled)
        if (kids.length > 0) {
          setPendingChildren(kids)
          setSaving(false)
          return
        }
      } catch {
        setError(true)
        setSaving(false)
        return
      }
    }
    await save([])
  }

  // Saves the booking, and also marks `alsoCancel` (children) as cancelled.
  async function save(alsoCancel: Booking[]) {
    if (!booking) return
    setPendingChildren(null)
    setSaving(true)
    setError(false)
    try {
      const addressFields = await pin.resolveForSave()
      if (!addressFields) return
      // A flight's details come from the leg editor, and its core dates and times
      // are derived from the legs (design decision 15) so sorting, Next Up,
      // Search, the share PDF and Costs keep working unchanged.
      const flight = flightForm ? buildFlightDetails(flightForm) : null
      if (flight && flight.errors.length > 0) {
        setFlightTried(true)
        return
      }
      const flightFields = flight?.details && flight.core ? { details: flight.details, ...flight.core } : null
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
        ...(flightFields ?? {}),
        cost: cost === '' ? null : Number(cost),
        currency: currency.trim() ? currency.trim().toUpperCase() : null,
        payment_status: paymentStatus,
        cancelled,
        extracted_details: extractedDetails.trim() || null,
        notes: notes.trim() || null,
        ...addressFields,
        ...(shouldClearLock ? { fx_rate_to_gbp: null, fx_rate_locked_at: null } : {}),
      })
      for (const kid of alsoCancel) {
        await updateBooking(kid.id, { cancelled: true })
      }
      navigate(tripId ? `/trips/${tripId}?tab=bookings&highlight=${booking.id}` : '/')
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  // While a flight has legs in the editor, its dates and times come from them.
  const flightPreview = flightForm && flightForm.legs.length > 0 ? buildFlightDetails(flightForm) : null
  const flightErrors = flightTried && flightForm ? buildFlightDetails(flightForm).errors : []
  const legsDrive = flightForm != null && flightForm.legs.length > 0
  const derivedDatesText = (() => {
    const c = flightPreview?.core
    if (!c) return 'will be set when the legs are complete'
    const a = `${formatDate(c.start_date)}${c.start_time ? ` ${formatTime(c.start_time)}` : ''}`
    const e = c.end_date ? `${formatDate(c.end_date)}${c.end_time ? ` ${formatTime(c.end_time)}` : ''}` : ''
    return e && e !== a ? `${a} – ${e}` : a
  })()

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

        <AddressField pin={pin} />

        {flightForm && (
          <FlightLegsEditor
            form={flightForm}
            onChange={setFlightForm}
            showMissing={flightTried}
          />
        )}

        {legsDrive ? (
          <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-600">
            <span className="text-stone-400">Booking dates (from the legs)</span>{' '}
            {derivedDatesText}
          </p>
        ) : (
          <>
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
          </>
        )}

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

        {pendingChildren && (
          <div className="space-y-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-sm font-medium text-amber-800">
              This booking has {pendingChildren.length === 1 ? 'a linked booking' : `${pendingChildren.length} linked bookings`}{' '}
              under it (an excursion or a stay). What should happen to {pendingChildren.length === 1 ? 'it' : 'them'}?
            </p>
            <ul className="space-y-1.5">
              {pendingChildren.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-2 text-sm text-stone-700">
                  <span className="min-w-0 flex-1">
                    {k.provider_name}
                    {k.cost != null && <span className="text-stone-500"> · {formatMoney(k.cost, k.currency)}</span>}
                  </span>
                  <PaymentBadge status={k.payment_status} />
                </li>
              ))}
            </ul>
            <p className="text-xs text-amber-700">
              An excursion or stay booked separately may still be refundable, so check before cancelling it.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void save([])}
                className="rounded-xl bg-white py-2 text-sm font-medium text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50"
              >
                Cancel this booking only
              </button>
              <button
                type="button"
                onClick={() => void save(pendingChildren)}
                className="rounded-xl bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700"
              >
                Cancel it and {pendingChildren.length === 1 ? 'this booking' : 'these bookings'}
              </button>
              <button
                type="button"
                onClick={() => setPendingChildren(null)}
                className="py-1 text-sm font-medium text-stone-500 hover:text-stone-700"
              >
                Back to editing
              </button>
            </div>
          </div>
        )}

        {flightErrors.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {flightErrors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}

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
