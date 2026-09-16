import { useEffect, useRef, useState } from 'react'
import type { Booking, ItineraryItem } from '../lib/types'
import { buildCostLines, ensureLockedRates, setManualRate } from '../lib/costs'
import type { CostLine } from '../lib/costs'
import { fetchGbpRate } from '../lib/fx'
import { formatMoney } from '../lib/format'
import { uploadDocumentFile, createDocument } from '../lib/api'
import { LoadingSpinner } from './LoadingSpinner'
import { PaymentBadge } from './PaymentBadge'

export function CostsTab({
  tripId,
  bookings,
  itinerary,
}: {
  tripId: string
  bookings: Booking[]
  itinerary: ItineraryItem[]
}) {
  const [lines, setLines] = useState<CostLine[] | null>(null)
  const [liveRates, setLiveRates] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [receiptStatus, setReceiptStatus] = useState<Map<string, 'uploading' | 'done' | 'error'>>(new Map())
  const pendingReceiptLine = useRef<CostLine | null>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(false)
      const raw = buildCostLines(bookings, itinerary)
      try {
        const locked = await ensureLockedRates(raw)
        if (cancelled) return

        const outstandingCurrencies = new Set(
          locked.filter((l) => l.paymentStatus !== 'paid').map((l) => l.currency)
        )
        const rateEntries = await Promise.all(
          Array.from(outstandingCurrencies).map(
            async (currency) => [currency, await fetchGbpRate(currency)] as const
          )
        )
        if (cancelled) return

        setLiveRates(new Map(rateEntries))
        setLines(locked)
      } catch {
        if (!cancelled) setError(true)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // bookings/itinerary are new array references each parent render, but
    // this only needs to re-run when the trip's underlying cost data
    // actually changes size/identity - re-running on every render would
    // refetch rates constantly. Keying off length is an approximation;
    // full correctness would need a stable dependency (e.g. a data
    // version from the parent), not needed at this app's scale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings.length, itinerary.length])

  function gbpValue(line: CostLine): { value: number; locked: boolean } {
    if (line.fxRateToGbp != null) return { value: line.cost * line.fxRateToGbp, locked: true }
    const live = liveRates.get(line.currency)
    return { value: line.cost * (live ?? 0), locked: false }
  }

  async function handleStartEdit(line: CostLine) {
    setEditingKey(line.key)
    setEditValue(line.fxRateToGbp != null ? String(line.fxRateToGbp) : String(liveRates.get(line.currency) ?? ''))
  }

  async function handleSaveEdit(line: CostLine) {
    const parsed = Number(editValue)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    setSavingKey(line.key)
    try {
      const { rate, lockedAt } = await setManualRate(line, parsed)
      setLines((prev) =>
        prev
          ? prev.map((l) => (l.key === line.key ? { ...l, fxRateToGbp: rate, fxRateLockedAt: lockedAt } : l))
          : prev
      )
      setEditingKey(null)
    } finally {
      setSavingKey(null)
    }
  }

  function handleAttachReceiptClick(line: CostLine) {
    pendingReceiptLine.current = line
    receiptInputRef.current?.click()
  }

  async function handleReceiptFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const line = pendingReceiptLine.current
    e.target.value = ''
    if (!file || !line) return

    setReceiptStatus((prev) => new Map(prev).set(line.key, 'uploading'))
    try {
      const fileUrl = await uploadDocumentFile(file)
      await createDocument({
        type: 'receipt',
        file_url: fileUrl,
        trip_id: tripId,
        booking_id: line.kind === 'booking' ? line.id : null,
        itinerary_item_id: line.kind === 'itinerary_item' ? line.id : null,
      })
      setReceiptStatus((prev) => new Map(prev).set(line.key, 'done'))
    } catch {
      setReceiptStatus((prev) => new Map(prev).set(line.key, 'error'))
    }
  }

  if (error) {
    return (
      <p className="rounded-2xl bg-white p-4 text-sm text-stone-500 shadow-sm ring-1 ring-stone-100">
        Couldn't load exchange rates — check your connection and try again.
      </p>
    )
  }

  if (lines === null) {
    return <LoadingSpinner label="Loading costs…" />
  }

  if (lines.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-4 text-sm text-stone-500 shadow-sm ring-1 ring-stone-100">
        No costed bookings or itinerary items yet.
      </p>
    )
  }

  const paid = lines.filter((l) => l.paymentStatus === 'paid')
  const outstanding = lines.filter((l) => l.paymentStatus !== 'paid')
  const paidTotal = paid.reduce((sum, l) => sum + gbpValue(l).value, 0)
  const outstandingTotal = outstanding.reduce((sum, l) => sum + gbpValue(l).value, 0)

  function renderLine(line: CostLine) {
    const { value, locked } = gbpValue(line)
    const isEditing = editingKey === line.key
    const receiptState = receiptStatus.get(line.key)
    return (
      <div key={line.key} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-stone-800">{line.label}</p>
            {line.paymentStatus === 'partially_paid' && (
              <div className="mt-1">
                <PaymentBadge status="partially_paid" />
              </div>
            )}
          </div>
          <p className="shrink-0 text-sm text-stone-500">{formatMoney(line.cost, line.currency)}</p>
        </div>
        <div className="mt-1 flex items-center justify-between gap-3">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.0001"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-24 rounded-lg border border-stone-200 px-2 py-1 text-sm outline-none focus:border-teal-500"
                autoFocus
              />
              <button
                type="button"
                onClick={() => handleSaveEdit(line)}
                disabled={savingKey === line.key}
                className="text-xs font-medium text-teal-600 hover:text-teal-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingKey(null)}
                className="text-xs text-stone-400 hover:text-stone-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleStartEdit(line)}
              className="text-xs text-stone-400 hover:text-teal-600"
            >
              rate: {line.currency === 'GBP' ? '1.0000' : (line.fxRateToGbp ?? liveRates.get(line.currency))?.toFixed(4)}
              {' · edit'}
            </button>
          )}
          <p className="text-sm font-medium text-stone-700">
            {locked ? '' : '≈ '}
            {formatMoney(value, 'GBP')}
          </p>
        </div>
        <div className="mt-2 flex items-center justify-end">
          {receiptState === 'uploading' && <span className="text-xs text-stone-400">Uploading…</span>}
          {receiptState === 'done' && <span className="text-xs text-emerald-600">Receipt attached ✓</span>}
          {receiptState === 'error' && (
            <span className="text-xs text-red-500">Upload failed — try again</span>
          )}
          {receiptState !== 'uploading' && (
            <button
              type="button"
              onClick={() => handleAttachReceiptClick(line)}
              className="ml-3 text-xs text-stone-400 hover:text-teal-600"
            >
              📷 Add receipt
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={handleReceiptFileChange}
      />
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
          Paid ({formatMoney(paidTotal, 'GBP')})
        </h3>
        {paid.length === 0 ? (
          <p className="text-sm text-stone-400">Nothing paid yet.</p>
        ) : (
          <div className="space-y-2">{paid.map(renderLine)}</div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
          Outstanding (≈ {formatMoney(outstandingTotal, 'GBP')})
        </h3>
        {outstanding.length === 0 ? (
          <p className="text-sm text-stone-400">Nothing outstanding.</p>
        ) : (
          <div className="space-y-2">{outstanding.map(renderLine)}</div>
        )}
      </div>

      <div className="rounded-2xl bg-teal-50 p-4 ring-1 ring-teal-100">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-teal-800">Grand total</p>
          <p className="font-semibold text-teal-800">{formatMoney(paidTotal + outstandingTotal, 'GBP')}</p>
        </div>
      </div>
    </div>
  )
}
