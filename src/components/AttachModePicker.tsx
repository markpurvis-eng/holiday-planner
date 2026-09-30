import type { Booking, ItineraryItem } from '../lib/types'
import { formatDate } from '../lib/format'

export type AttachMode = 'trip' | 'booking' | 'itinerary'

function formatItineraryLabel(item: ItineraryItem) {
  const date = formatDate(item.date, { day: 'numeric', month: 'short' })
  return `${date} · ${item.venue ?? item.type}`
}

// Shared "Attach to" control — Trip/Booking/Itinerary-item toggle plus a
// dependent dropdown. Previously duplicated near-identically in Upload,
// AddLink and AddExpense (and about to be needed again for Edit Expense and
// the Document/Link "Move to…" repoint, Missing Features #55), so pulled
// out once here rather than a fourth/fifth copy drifting apart.
//
// Cancelled bookings/itinerary items are excluded from both dropdowns: a
// cancelled booking/itinerary item never gets its own card on the Costs
// tab (buildCostLines excludes cancelled lines outright, not just via the
// "hide cancelled" display toggle), so attaching a new ad hoc expense to
// one would silently vanish with nothing to nest under and no fix
// available (the zero-cost-backfill trick only helps a null cost, not a
// cancelled one). This was a latent bug in all three forms before this
// component existed — none of them filtered cancelled targets — fixed here
// by construction rather than patched three times over.
// `currentBookingId`/`currentItineraryItemId` (the value already selected
// when editing something already attached to an item that's *since* been
// cancelled) are kept in their list regardless, labelled "(cancelled)", so
// an existing selection never silently disappears out from under the
// person mid-edit.
export function AttachModePicker({
  mode,
  onModeChange,
  bookings,
  itineraryItems,
  bookingId,
  onBookingIdChange,
  itineraryItemId,
  onItineraryItemIdChange,
  currentBookingId,
  currentItineraryItemId,
  tripLabel = 'Whole trip',
}: {
  mode: AttachMode
  onModeChange: (mode: AttachMode) => void
  bookings: Booking[]
  itineraryItems: ItineraryItem[]
  bookingId: string
  onBookingIdChange: (id: string) => void
  itineraryItemId: string
  onItineraryItemIdChange: (id: string) => void
  currentBookingId?: string | null
  currentItineraryItemId?: string | null
  tripLabel?: string
}) {
  const bookingOptions = bookings.filter((b) => !b.cancelled || b.id === currentBookingId)
  const itineraryOptions = itineraryItems.filter((i) => !i.cancelled || i.id === currentItineraryItemId)

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-stone-600">Attach to</label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onModeChange('trip')}
          className={`flex-1 rounded-xl px-2 py-2 text-sm font-medium ${
            mode === 'trip' ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600'
          }`}
        >
          {tripLabel}
        </button>
        <button
          type="button"
          onClick={() => onModeChange('booking')}
          disabled={bookingOptions.length === 0}
          className={`flex-1 rounded-xl px-2 py-2 text-sm font-medium disabled:opacity-40 ${
            mode === 'booking' ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600'
          }`}
        >
          A booking
        </button>
        <button
          type="button"
          onClick={() => onModeChange('itinerary')}
          disabled={itineraryOptions.length === 0}
          className={`flex-1 rounded-xl px-2 py-2 text-sm font-medium disabled:opacity-40 ${
            mode === 'itinerary' ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600'
          }`}
        >
          An itinerary item
        </button>
      </div>

      {mode === 'booking' && (
        <select
          value={bookingId}
          onChange={(e) => onBookingIdChange(e.target.value)}
          className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5"
        >
          <option value="">Choose a booking…</option>
          {bookingOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.provider_name}
              {b.cancelled ? ' (cancelled)' : ''}
            </option>
          ))}
        </select>
      )}

      {mode === 'itinerary' && (
        <select
          value={itineraryItemId}
          onChange={(e) => onItineraryItemIdChange(e.target.value)}
          className="mt-2 w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5"
        >
          <option value="">Choose an itinerary item…</option>
          {itineraryOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {formatItineraryLabel(item)}
              {item.cancelled ? ' (cancelled)' : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
