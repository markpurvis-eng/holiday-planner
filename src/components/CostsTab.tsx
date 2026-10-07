import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Booking, Document, ItineraryItem } from '../lib/types'
import {
  buildCostLines,
  buildExpenseCostLines,
  ensureLockedRates,
  setManualFx,
  deleteExpenseLine,
  groupCostLines,
} from '../lib/costs'
import type { CostLine, CostRow } from '../lib/costs'
import { fetchGbpRate } from '../lib/fx'
import { formatMoney } from '../lib/format'
import {
  uploadDocumentFile,
  createDocument,
  getExpenses,
  getDocuments,
  deleteDocument,
  updateDocument,
} from '../lib/api'
import { LoadingSpinner } from './LoadingSpinner'
import { PaymentBadge } from './PaymentBadge'
import { AttachedItems } from './AttachedItems'
import { LongPressMenu } from './LongPressMenu'

// FX editor (Missing Features — Halifax card statements only show the
// foreign amount and the GBP amount actually charged, never the rate
// itself, so forcing "rate" as the one editable field didn't cover that
// case). The foreign-currency amount is fixed — it's whatever Mark
// actually paid, never in doubt — so only rate and GBP are editable, each
// recalculating the other: rate x foreign = GBP, GBP / foreign = rate.
type FxEditState = { rate: string; gbp: string }

function computeFxFromRate(rate: string, foreign: number): string {
  const parsed = Number(rate)
  return Number.isFinite(parsed) && parsed > 0 ? (foreign * parsed).toFixed(2) : ''
}

function computeRateFromGbp(gbp: string, foreign: number): string {
  const parsed = Number(gbp)
  return Number.isFinite(parsed) && foreign > 0 ? (parsed / foreign).toFixed(4) : ''
}

export function CostsTab({
  tripId,
  bookings,
  itinerary,
  locked = false,
  highlightKey = null,
}: {
  tripId: string
  bookings: Booking[]
  itinerary: ItineraryItem[]
  locked?: boolean
  // A CostRow key (a booking/itinerary_item line's own key, or the
  // trip-level bundle's key — never an individual nested expense's key,
  // since Search.tsx always targets the containing card) to scroll to and
  // highlight once this tab's own data has loaded. Captured once into
  // `activeHighlight` below rather than tracked live: TripDetail clears
  // its own `?highlight=` URL param ~2.5s after *it* mounts (see its
  // scrollToItem effect), which would otherwise null this prop out before
  // CostsTab's own async load (getExpenses/ensureLockedRates/live FX
  // rates) has even finished.
  highlightKey?: string | null
}) {
  const navigate = useNavigate()
  const [lines, setLines] = useState<CostLine[] | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [liveRates, setLiveRates] = useState<Map<string, number>>(new Map())
  const [error, setError] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [fx, setFx] = useState<FxEditState>({ rate: '', gbp: '' })
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [receiptStatus, setReceiptStatus] = useState<Map<string, 'uploading' | 'done' | 'error'>>(new Map())
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [activeHighlight, setActiveHighlight] = useState<string | null>(() => highlightKey)
  const [hasScrolledToHighlight, setHasScrolledToHighlight] = useState(false)
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

  // Scroll to and highlight a card arriving from Search (or any future
  // caller passing highlightKey). The target card — a booking/itinerary
  // line's own top-level card, or the trip-level "Ad hoc expenses" bundle
  // card — is always rendered regardless of collapse state (only the
  // content *inside* a group is conditionally rendered), so this doesn't
  // need the two-pass "expand, wait a render, then scroll" dance: expanding
  // whatever group contains the actual match and finding the target's own
  // id can happen in the same effect run. Runs once lines have loaded, and
  // again if expandedKeys changes for some unrelated reason, but bails
  // immediately via hasScrolledToHighlight once it's done its job.
  useEffect(() => {
    if (!lines || !activeHighlight || hasScrolledToHighlight) return
    const rows = groupCostLines(lines)
    const matchedRow = rows.find((row) =>
      row.kind === 'expenseBundle' ? row.key === activeHighlight : row.line.key === activeHighlight
    )
    if (matchedRow) {
      if (matchedRow.kind === 'expenseBundle') {
        setExpandedKeys((prev) => new Set(prev).add(matchedRow.key))
      } else if (matchedRow.nested.length > 0) {
        setExpandedKeys((prev) => new Set(prev).add(`${matchedRow.line.key}-adhoc`))
      }
    }
    const el = document.getElementById(`item-${activeHighlight}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHasScrolledToHighlight(true)
    }
  }, [lines, activeHighlight, hasScrolledToHighlight])

  // Fades the highlight ring a couple of seconds after it's actually been
  // scrolled to (not from mount — this tab's own data can take a moment to
  // load), matching the ~2.5s the Bookings/Itinerary tabs' highlight uses.
  useEffect(() => {
    if (!hasScrolledToHighlight) return
    const timeout = setTimeout(() => setActiveHighlight(null), 2500)
    return () => clearTimeout(timeout)
  }, [hasScrolledToHighlight])

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
            async (currency) => [currency, await fetchGbpRate(currency, { allowStale: true })] as const
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

  function handleStartEdit(line: CostLine) {
    setEditingKey(line.key)
    const rate = line.currency === 'GBP' ? 1 : (line.fxRateToGbp ?? liveRates.get(line.currency) ?? null)
    setFx({
      rate: rate != null ? String(rate) : '',
      gbp: rate != null ? (line.cost * rate).toFixed(2) : '',
    })
  }

  function handleRateChange(line: CostLine, value: string) {
    setFx({ rate: value, gbp: computeFxFromRate(value, line.cost) })
  }

  function handleGbpChange(line: CostLine, value: string) {
    setFx({ rate: computeRateFromGbp(value, line.cost), gbp: value })
  }

  async function handleSaveEdit(line: CostLine) {
    const rate = Number(fx.rate)
    if (!Number.isFinite(rate) || rate <= 0) return
    setSavingKey(line.key)
    try {
      const result = await setManualFx(line, { cost: line.cost, rate })
      setLines((prev) =>
        prev
          ? prev.map((l) =>
              l.key === line.key ? { ...l, fxRateToGbp: result.rate, fxRateLockedAt: result.lockedAt } : l
            )
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

  // Missing Features #6.
  async function handleDeleteDocument(doc: Document) {
    if (!window.confirm(`Delete "${doc.title ?? 'this document'}"? This can't be undone.`)) return
    await deleteDocument(doc)
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
  }

  // Missing Features #54.
  async function handleRenameDocument(doc: Document) {
    const next = window.prompt('Rename document', doc.title ?? '')
    if (next === null) return
    const title = next.trim()
    const updated = await updateDocument(doc.id, { title: title || null })
    setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
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
        // "Receipt" rather than the camera's own filename (a long numeric
        // string like IMG_20260928_...jpg) - this is always a fresh photo
        // taken via the phone camera (input has capture="environment"),
        // never a file picked from an existing library, so there's no
        // pre-existing meaningful name to preserve.
        title: 'Receipt',
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
    const isHighlighted = variant === 'card' && line.key === activeHighlight
    const outerClass =
      variant === 'card'
        ? `rounded-2xl bg-white p-4 shadow-sm transition-shadow ${
            isHighlighted ? 'ring-2 ring-teal-400' : 'ring-1 ring-stone-100'
          }`
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
    const card = (
      <div key={line.key} id={variant === 'card' ? `item-${line.key}` : undefined} className={outerClass}>
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
        {isEditing ? (
          <div className="mt-1 rounded-lg bg-stone-50 p-2.5">
            <p className="mb-1.5 text-[11px] text-stone-400">
              Enter the rate or the GBP amount charged — the other fills in automatically (handy
              when a card statement shows the amount charged but not the rate)
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase text-stone-400">{line.currency}</span>
                <p className="rounded-lg border border-transparent px-2 py-1 text-sm text-stone-500">
                  {line.cost}
                </p>
              </div>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase text-stone-400">Rate</span>
                <input
                  type="number"
                  step="0.0001"
                  value={fx.rate}
                  onChange={(e) => handleRateChange(line, e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-2 py-1 text-sm outline-none focus:border-teal-500"
                  autoFocus
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase text-stone-400">GBP</span>
                <input
                  type="number"
                  step="0.01"
                  value={fx.gbp}
                  onChange={(e) => handleGbpChange(line, e.target.value)}
                  className="w-full rounded-lg border border-stone-200 px-2 py-1 text-sm outline-none focus:border-teal-500"
                />
              </label>
            </div>
            <div className="mt-2 flex justify-end gap-3">
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
          </div>
        ) : (
          <div className="mt-1 flex items-center justify-between gap-3">
            {locked ? (
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
        )}
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
        </div>
        <AttachedItems
          documents={attachedDocs}
          links={[]}
          onDeleteDocument={handleDeleteDocument}
          onRenameDocument={handleRenameDocument}
        />
        {extra}
      </div>
    )

    // Missing Features #6/#55: ad hoc expense lines are the only Costs-tab
    // rows that can be deleted or edited at all (bookings/itinerary items
    // are deliberately excluded, see the roadmap) - long-press the whole
    // card instead of permanently-visible buttons. Edit opens the same
    // form as "+ Add an ad hoc expense" (AddExpense.tsx doubles as Edit
    // Expense via ?id=), covering both field corrections and re-pointing
    // this expense at a different booking/itinerary item/whole trip.
    return line.kind === 'expense' && !locked ? (
      <LongPressMenu
        key={line.key}
        actions={[
          { label: 'Edit', onSelect: () => navigate(`/add-expense?id=${line.id}&trip=${tripId}`) },
          { label: 'Delete', destructive: true, onSelect: () => handleDeleteExpense(line) },
        ]}
      >
        {card}
      </LongPressMenu>
    ) : (
      card
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
    const isHighlighted = key === activeHighlight
    return (
      <div
        key={key}
        id={`item-${key}`}
        className={`rounded-2xl bg-white p-4 shadow-sm transition-shadow ${
          isHighlighted ? 'ring-2 ring-teal-400' : 'ring-1 ring-stone-100'
        }`}
      >
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
