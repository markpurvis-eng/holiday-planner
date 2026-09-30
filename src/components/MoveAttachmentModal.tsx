import { useEffect, useState } from 'react'
import type { Booking, ItineraryItem } from '../lib/types'
import { AttachModePicker } from './AttachModePicker'
import type { AttachMode } from './AttachModePicker'

// Missing Features #55: re-points a Document or Link at a different
// booking/itinerary item (or the whole trip) without re-uploading/
// recreating it. Descoped from the original long-press-delete build
// (Fixed #54) to ship delete first; this is the fast-follow. A small
// modal rather than a full page — reachable from a "Move to…" long-press
// action wherever a document/link card already offers Delete/Rename, and
// always within the same trip (its bookings/itinerary items are already
// on hand wherever this opens), so there's no Trip picker here at all,
// unlike Upload/AddLink/AddExpense's version of this control.
export function MoveAttachmentModal({
  open,
  itemLabel,
  bookings,
  itineraryItems,
  currentBookingId,
  currentItineraryItemId,
  onCancel,
  onConfirm,
}: {
  open: boolean
  itemLabel: string
  bookings: Booking[]
  itineraryItems: ItineraryItem[]
  currentBookingId: string | null
  currentItineraryItemId: string | null
  onCancel: () => void
  onConfirm: (updates: { booking_id: string | null; itinerary_item_id: string | null }) => Promise<void>
}) {
  const [mode, setMode] = useState<AttachMode>(
    currentBookingId ? 'booking' : currentItineraryItemId ? 'itinerary' : 'trip'
  )
  const [bookingId, setBookingId] = useState(currentBookingId ?? '')
  const [itineraryItemId, setItineraryItemId] = useState(currentItineraryItemId ?? '')
  const [saving, setSaving] = useState(false)

  // Re-sync whenever a different item is opened for moving, rather than
  // carrying over whatever was left selected from the previous one.
  useEffect(() => {
    if (!open) return
    setMode(currentBookingId ? 'booking' : currentItineraryItemId ? 'itinerary' : 'trip')
    setBookingId(currentBookingId ?? '')
    setItineraryItemId(currentItineraryItemId ?? '')
  }, [open, currentBookingId, currentItineraryItemId])

  if (!open) return null

  async function handleConfirm() {
    setSaving(true)
    try {
      await onConfirm({
        booking_id: mode === 'booking' ? bookingId || null : null,
        itinerary_item_id: mode === 'itinerary' ? itineraryItemId || null : null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="mb-10 w-[90%] max-w-sm rounded-2xl bg-white p-4 shadow-lg sm:mb-0"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 truncate font-medium text-stone-800">Move "{itemLabel}"</h3>
        <AttachModePicker
          mode={mode}
          onModeChange={setMode}
          bookings={bookings}
          itineraryItems={itineraryItems}
          bookingId={bookingId}
          onBookingIdChange={setBookingId}
          itineraryItemId={itineraryItemId}
          onItineraryItemIdChange={setItineraryItemId}
          currentBookingId={currentBookingId}
          currentItineraryItemId={currentItineraryItemId}
        />
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-xl bg-stone-100 py-2.5 font-medium text-stone-600 hover:bg-stone-200 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 rounded-xl bg-teal-600 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? 'Moving…' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  )
}
