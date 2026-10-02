import { useEffect, useState } from 'react'
import { deleteTrip, getTripContents } from '../lib/api'
import type { TripContents } from '../lib/api'
import type { Trip } from '../lib/types'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

// What would be lost, as a readable list ("6 bookings, 12 itinerary items").
export function describeContents(c: TripContents): string[] {
  const parts: string[] = []
  if (c.bookings) parts.push(plural(c.bookings, 'booking'))
  if (c.itinerary) parts.push(plural(c.itinerary, 'itinerary item'))
  if (c.expenses) parts.push(plural(c.expenses, 'expense'))
  if (c.documents) parts.push(plural(c.documents, 'document'))
  if (c.todos) parts.push(plural(c.todos, 'to-do'))
  if (c.links) parts.push(plural(c.links, 'link'))
  return parts
}

/**
 * Confirm-and-delete for a whole trip. An empty trip (only the auto-added
 * photos link) gets a plain confirm; one with real content lists what will
 * be lost and needs the trip's name typed, since the delete cascades to
 * everything under the trip and can't be undone.
 */
export function DeleteTripDialog({
  trip,
  onClose,
  onDeleted,
}: {
  trip: Trip
  onClose: () => void
  onDeleted: () => void
}) {
  const [contents, setContents] = useState<TripContents | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let stale = false
    getTripContents(trip.id)
      .then((c) => !stale && setContents(c))
      .catch(() => !stale && setLoadFailed(true))
    return () => {
      stale = true
    }
  }, [trip.id])

  const parts = contents ? describeContents(contents) : []
  const hasContent = parts.length > 0
  // If the contents can't be checked, play safe and require the name.
  const needsName = loadFailed || hasContent
  const nameMatches = typed.trim().toLowerCase() === trip.name.trim().toLowerCase()
  const canDelete = (contents !== null || loadFailed) && (!needsName || nameMatches) && !deleting

  async function handleDelete() {
    if (!canDelete) return
    setDeleting(true)
    setError(false)
    try {
      await deleteTrip(trip.id)
      onDeleted()
    } catch {
      setError(true)
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={() => !deleting && onClose()}
    >
      <div
        className="mb-10 w-[90%] max-w-sm rounded-2xl bg-white p-5 shadow-lg sm:mb-0"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Delete trip"
      >
        <h2 className="text-lg font-bold text-stone-800">Delete “{trip.name}”?</h2>

        {contents === null && !loadFailed && (
          <p className="mt-2 text-sm text-stone-500">Checking what's in this trip…</p>
        )}
        {loadFailed && (
          <p className="mt-2 text-sm text-amber-700">
            Couldn't check what's in this trip. Deleting removes everything in it.
          </p>
        )}
        {contents && !hasContent && (
          <p className="mt-2 text-sm text-stone-600">This trip is empty. This can't be undone.</p>
        )}
        {contents && hasContent && (
          <p className="mt-2 text-sm text-stone-600">
            This will also permanently delete <strong>{parts.join(', ')}</strong>. This can't be
            undone.
          </p>
        )}

        {needsName && (
          <div className="mt-3">
            <label className="mb-1 block text-sm font-medium text-stone-600">
              Type the trip name to confirm
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={trip.name}
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400"
            />
          </div>
        )}

        {error && (
          <p className="mt-3 text-sm text-red-500">Couldn't delete — check your connection and try again.</p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 rounded-xl bg-stone-100 py-2.5 font-medium text-stone-600 hover:bg-stone-200"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
            // Inline colours so the button can never render white-on-nothing if a
            // cached stylesheet from before this component existed is still in use.
            style={{ backgroundColor: '#dc2626', color: '#ffffff' }}
            className="flex-1 rounded-xl py-2.5 font-medium disabled:opacity-40"
          >
            {deleting ? 'Deleting…' : 'Delete trip'}
          </button>
        </div>
      </div>
    </div>
  )
}
