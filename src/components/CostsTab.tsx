import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Booking, Document, ItineraryItem } from '../lib/types'
import {
  buildCostLines,
  buildExpenseCostLines,
  ensureLockedRates,
  setManualRate,
  deleteExpenseLine,
  groupCostLines,
} from '../lib/costs'
import type { CostLine, CostRow } from '../lib/costs'
import { fetchGbpRate } from '../lib/fx'
import { formatMoney } from '../lib/format'
import { uploadDocumentFile, createDocument, getExpenses, getDocuments } from '../lib/api'
import { LoadingSpinner } from './LoadingSpinner'
import { PaymentBadge } from './PaymentBadge'
import { AttachedItems } from './AttachedItems'

export function CostsTab({
  tripId,
  bookings,
  itinerary,
  locked = false,
}: {
  tripId: string
  bookings: Booking[]
  itinerary: ItineraryItem[]
  locked?: boolean
}) {
  const [lines, setLines] = useState<CostLine[] | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [liveRates, setLiveRates] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [receiptStatus, setReceiptStatus] = useState<Map<string, 'uploading' | 'done' | 'error'>>(new Map())
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const pendingReceiptLine = useRef<CostLine | null>(null)
  const receiptInputRef = useRef<HTMLInputElement>(null)

  function toggleExpanded(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setError(false)
      try {
        const [expenses, docs] = await Promise.all([getExpenses(tripId), getDocuments(tripId)])
        setDocuments(docs)
        const raw = [...buildCostLines(bookings, itinerary), ...buildExpenseCostLines(expenses)]
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
    // version from the parent), not needed at this app's scale. Doesn't
    // include a similar guard for expenses, since there's no cheap
    // "has it changed" signal available here — refetched every time this
    // effect runs, which only happens when bookings/itinerary length
    // changes or tripId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, bookings.length, itinerary.length])

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

  async function handleDeleteExpense(line: CostLine) {
    if (!window.confirm(`Delete "${line.label}"? This can't be undone.`)) return
    await deleteExpenseLine(line)
    setLines((prev) => (prev ? prev.filter((l) => l.key !== line.key) : prev))
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
      const bookingId =
        line.kind === 'booking' ? line.id : line.kind === 'expense' ? line.attachedBookingId ?? null : null
      const itineraryItemId =
        line.kind === 'itinerary_item'
          ? line.id
          : line.kind === 'expense'
            ? line.attachedItineraryItemId ?? null
            : null
      const newDoc = await createDocument({
        type: 'receipt',
        file_url: fileUrl,
        title: file.name,
        trip_id: tripId,
        booking_id: bookingId,
        itinerary_item_id: itineraryItemId,
        // Keeps booking_id/itinerary_item_id set to the expense's own
        // parent too (not just expense_id) so the Documents tab's
        // attachment grouping - which only knows about booking/itinerary
        // attachment, not expenses - still surfaces it under the right
        // booking/itinerary group. expense_id is what lets CostsTab show
        // it specifically on this expense's own row, not just generically
        // on the parent's.
        expense_id: line.kind === 'expense' ? line.id : null,
      })
      setDocuments((prev) => [newDoc, ...prev])
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
      <div className="space-y-3">
        <p className="rounded-2xl bg-white p-4 text-sm text-stone-500 shadow-sm ring-1 ring-stone-100">
          No costed bookings, itinerary items, or expenses yet.
        </p>
        {!locked && (
          <Link
            to={`/add-expense?trip=${tripId}`}
            className="block rounded-2xl bg-teal-50 p-3 text-center text-sm font-medium text-teal-700 hover:bg-teal-100"
          >
            + Add an ad hoc expense
          </Link>
        )}
      </div>
    )
  }

  const paid = lines.filter((l) => l.paymentStatus === 'paid')
  const outstanding = lines.filter((l) => l.paymentStatus !== 'paid')
  const paidTotal = paid.reduce((sum, l) => sum + gbpValue(l).value, 0)
  const outstandingTotal = outstanding.reduce((sum, l) => sum + gbpValue(l).value, 0)

  // Grouping is purely a display transform on top of the same flat
  // `lines` — it doesn't change paidTotal/outstandingTotal above, which
  // are still summed over every individual line regardless of how this
  // bundles them for rendering. An expense bundle is always "paid" (every
  // expense in it is), so it only ever appears in the Paid section.
  const rows = groupCostLines(lines)
  const paidRows = rows.filter((r) => r.kind === 'expenseBundle' || r.line.paymentStatus === 'paid')
  const outstandingRows = rows.filter((r) => r.kind === 'line' && r.line.paymentStatus !== 'paid')

  function renderLine(line: CostLine, opts: { variant?: 'card' | 'plain'; extra?: React.ReactNode } = {}) {
    const { variant = 'card', extra } = opts
    const { value, locked: rateLocked } = gbpValue(line)
    const isEditing = editingKey === line.key
    const receiptState = receiptStatus.get(line.key)
    // A booking/itinerary line's own AttachedItems excludes documents tied
    // to a specific child expense (expense_id set) - those show on the
    // expense's own row instead, via the branch below, so the same photo
    // doesn't appear twice and it's clear which ad hoc item it belongs to.
    // An expense line shows only documents linked to it specifically.
    const attachedDocs =
      line.kind === 'booking'
        ? documents.filter((d) => d.booking_id === line.id && !d.expense_id)
        : line.kind === 'itinerary_item'
          ? documents.filter((d) => d.itinerary_item_id === line.id && !d.expense_id)
          : line.kind === 'expense'
            ? documents.filter((d) => d.expense_id === line.id)
            : []
    const outerClass =
      variant === 'card'
        ? 'rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100'
        : 'border-t border-stone-100 pt-3 first:border-t-0 first:pt-0'
    // "+" pre-filled ad hoc expense (Missing Features #43): only on a
    // booking/itinerary line's own top-level card, not the plain/nested
    // rows inside an "Ad hoc items" group or the trip-level bundle — an
    // ad hoc line isn't itself a sensible attach target, and the bundle
    // card has no single parent to pre-fill. Hidden on a locked trip,
    // matching "+ Add an ad hoc expense" below. Pre-fills the trip, the
    // booking/itinerary item itself, and the card's own date; the Add
    // Expense form keeps its normal attach-mode picker, pre-selected but
    // still editable, in case the target needs correcting.
    const addExpenseHref =
      !locked && variant === 'card' && (line.kind === 'booking' || line.kind === 'itinerary_item')
        ? (() => {
            const params = new URLSearchParams({ trip: tripId })
            params.set(line.kind === 'booking' ? 'booking' : 'itinerary', line.id)
            if (line.date) params.set('date', line.date)
            return `/add-expense?${params.toString()}`
          })()
        : null
    return (
      <div key={line.key} className={outerClass}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-stone-800">{line.label}</p>
            {(line.kind === 'expense' || line.paymentStatus === 'partially_paid') && (
              <div className="mt-1 flex gap-1.5">
                {line.kind === 'expense' && (
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
                    Ad hoc
                  </span>
                )}
                {line.paymentStatus === 'partially_paid' && <PaymentBadge status="partially_paid" />}
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
          ) : locked ? (
            <span className="text-xs text-stone-400">
              rate: {line.currency === 'GBP' ? '1.0000' : (line.fxRateToGbp ?? liveRates.get(line.currency))?.toFixed(4)}
            </span>
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
            {rateLocked ? '' : '≈ '}
            {formatMoney(value, 'GBP')}
          </p>
        </div>
        <div className="mt-2 flex items-center justify-end gap-3">
          {addExpenseHref && (
            <Link to={addExpenseHref} className="text-xs text-stone-400 hover:text-teal-600">
              + Add expense
            </Link>
          )}
          {receiptState === 'uploading' && <span className="text-xs text-stone-400">Uploading…</span>}
          {receiptState === 'done' && <span className="text-xs text-emerald-600">Receipt attached ✓</span>}
          {receiptState === 'error' && (
            <span className="text-xs text-red-500">Upload failed — try again</span>
          )}
          {receiptState !== 'uploading' && (
            <button
              type="button"
              onClick={() => handleAttachReceiptClick(line)}
              className="text-xs text-stone-400 hover:text-teal-600"
            >
              📷 Add receipt
            </button>
          )}
          {line.kind === 'expense' && !locked && (
            <button
              type="button"
              onClick={() => handleDeleteExpense(line)}
              className="text-xs text-stone-400 hover:text-red-500"
            >
              Delete
            </button>
          )}
        </div>
        <AttachedItems documents={attachedDocs} links={[]} />
        {extra}
      </div>
    )
  }

  function renderNestedGroup(key: string, label: string, nestedLines: CostLine[]) {
    const total = nestedLines.reduce((sum, l) => sum + gbpValue(l).value, 0)
    const isOpen = expandedKeys.has(key)
    return (
      <div key={key} className="mt-3 border-t border-stone-100 pt-3">
        <button
          type="button"
          onClick={() => toggleExpanded(key)}
          className="flex w-full items-center justify-between text-xs text-stone-500 hover:text-teal-600"
        >
          <span>
            {isOpen ? '▲' : '▼'} {label} ({nestedLines.length})
          </span>
          <span>{formatMoney(total, 'GBP')}</span>
        </button>
        {isOpen && (
          <div className="mt-2 space-y-2 pl-3">
            {nestedLines.map((l) => renderLine(l, { variant: 'plain' }))}
          </div>
        )}
      </div>
    )
  }

  function renderBundleCard(key: string, label: string, bundleLines: CostLine[]) {
    const total = bundleLines.reduce((sum, l) => sum + gbpValue(l).value, 0)
    const isOpen = expandedKeys.has(key)
    return (
      <div key={key} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
        <button
          type="button"
          onClick={() => toggleExpanded(key)}
          className="flex w-full items-center justify-between"
        >
          <span className="font-medium text-stone-800">
            🧾 {label} ({bundleLines.length})
          </span>
          <span className="flex items-center gap-2 text-sm font-medium text-stone-700">
            {formatMoney(total, 'GBP')}
            <span className="text-stone-400">{isOpen ? '▲' : '▼'}</span>
          </span>
        </button>
        {isOpen && (
          <div className="mt-3 space-y-2 border-t border-stone-100 pt-3">
            {bundleLines.map((l) => renderLine(l, { variant: 'plain' }))}
          </div>
        )}
      </div>
    )
  }

  function renderRow(row: CostRow) {
    if (row.kind === 'expenseBundle') {
      return renderBundleCard(row.key, row.label, row.lines)
    }
    const extra =
      row.nested.length > 0
        ? renderNestedGroup(`${row.line.key}-adhoc`, 'Ad hoc items', row.nested)
        : undefined
    return renderLine(row.line, { extra })
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
      {locked ? (
        <p className="rounded-2xl bg-stone-100 p-3 text-center text-sm text-stone-500">
          🔒 This trip's total is locked in — costs are read-only.
        </p>
      ) : (
        <Link
          to={`/add-expense?trip=${tripId}`}
          className="block rounded-2xl bg-teal-50 p-3 text-center text-sm font-medium text-teal-700 hover:bg-teal-100"
        >
          + Add an ad hoc expense
        </Link>
      )}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
          Paid ({formatMoney(paidTotal, 'GBP')})
        </h3>
        {paidRows.length === 0 ? (
          <p className="text-sm text-stone-400">Nothing paid yet.</p>
        ) : (
          <div className="space-y-2">{paidRows.map(renderRow)}</div>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
          Outstanding (≈ {formatMoney(outstandingTotal, 'GBP')})
        </h3>
        {outstandingRows.length === 0 ? (
          <p className="text-sm text-stone-400">Nothing outstanding.</p>
        ) : (
          <div className="space-y-2">{outstandingRows.map(renderRow)}</div>
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
