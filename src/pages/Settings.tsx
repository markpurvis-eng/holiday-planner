import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getTripTypes, createTripType, getTrips, getBookings, getItinerary, getItineraryPdfUrl } from '../lib/api'
import type { TripType, Trip } from '../lib/types'
import { APP_VERSION } from '../lib/version'
import { getHideCancelledItems, setHideCancelledItems } from '../lib/settings'
import { generateAndPublishItinerary } from '../lib/shareItinerary'

const EMOJI_OPTIONS = ['🚢', '🏖️', '🎒', '🧳', '✈️', '🏔️', '🏕️', '🎡', '🚗', '🏙️']

export default function Settings() {
  const [tripTypes, setTripTypes] = useState<TripType[]>([])
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(EMOJI_OPTIONS[0])
  const [saving, setSaving] = useState(false)
  const [hideCancelled, setHideCancelled] = useState(() => getHideCancelledItems())
  const [trips, setTrips] = useState<Trip[]>([])
  const [selectedTripId, setSelectedTripId] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareNotice, setShareNotice] = useState<string | null>(null)

  useEffect(() => {
    getTripTypes().then(setTripTypes)
    getTrips().then((loaded) => {
      setTrips(loaded)
      setSelectedTripId((prev) => prev || loaded[0]?.id || '')
    })
  }, [])

  const selectedTrip = trips.find((t) => t.id === selectedTripId)

  async function handleGenerateItinerary() {
    if (!selectedTrip) return
    setSharing(true)
    setShareNotice(null)
    try {
      const [bookings, itinerary] = await Promise.all([
        getBookings(selectedTrip.id),
        getItinerary(selectedTrip.id),
      ])
      const { generatedAt } = await generateAndPublishItinerary(selectedTrip, bookings, itinerary)
      setTrips((prev) =>
        prev.map((t) => (t.id === selectedTrip.id ? { ...t, public_itinerary_generated_at: generatedAt } : t))
      )
      setShareNotice('Itinerary PDF generated.')
    } catch {
      setShareNotice('Something went wrong generating the PDF — try again.')
    } finally {
      setSharing(false)
    }
  }

  // Web Share API needs a direct user gesture, so this is only ever called
  // from the button's onClick. Falls back to copying the link, since Web
  // Share support on desktop browsers is patchy.
  async function handleShareItinerary() {
    if (!selectedTrip) return
    const url = getItineraryPdfUrl(selectedTrip.id)
    const intro = `Here is Mark and Andi's itinerary for their ${selectedTrip.name} trip.`
    const signature = `Sent from Mark's Holiday Planner app (powered by Claude)`
    if (navigator.share) {
      try {
        // `url` is passed as its own field (not folded into `text`) —
        // some Android share targets, Gmail included, appear to key off
        // it being present to register as a target at all. Most apps
        // that combine text+url do so as text, then a blank line, then
        // the url, which is why the message text ends without the link.
        await navigator.share({ title: `${selectedTrip.name} itinerary`, text: `${intro}\n\n${signature}`, url })
      } catch {
        // AbortError (user cancelled the share sheet) — nothing to do.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(`${intro}\n\n${url}\n\n${signature}`)
      setShareNotice('Message copied to clipboard.')
    } catch {
      setShareNotice(`${intro}\n\n${url}\n\n${signature}`)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const created = await createTripType(name.trim(), icon)
      setTripTypes((prev) => [...prev, created])
      setName('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <h1 className="mb-6 text-2xl font-bold text-stone-800">Settings</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">
          Display
        </h2>
        <label className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
          <span className="text-sm font-medium text-stone-700">
            Hide cancelled items on Bookings/Itinerary
          </span>
          <input
            type="checkbox"
            checked={hideCancelled}
            onChange={(e) => {
              setHideCancelled(e.target.checked)
              setHideCancelledItems(e.target.checked)
            }}
            className="h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500"
          />
        </label>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">
          Share Itinerary
        </h2>
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
          <select
            value={selectedTripId}
            onChange={(e) => {
              setSelectedTripId(e.target.value)
              setShareNotice(null)
            }}
            className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
          >
            {trips.length === 0 && <option value="">No trips yet</option>}
            {trips.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {selectedTrip && (
            <p className="text-xs text-stone-400">
              {selectedTrip.public_itinerary_generated_at
                ? `Last generated ${new Date(selectedTrip.public_itinerary_generated_at).toLocaleString()}`
                : 'No public PDF generated yet for this trip.'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateItinerary}
              disabled={sharing || !selectedTrip}
              className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-200 disabled:opacity-50"
            >
              {sharing
                ? 'Generating…'
                : selectedTrip?.public_itinerary_generated_at
                  ? 'Regenerate itinerary PDF'
                  : 'Generate itinerary PDF'}
            </button>
            {selectedTrip?.public_itinerary_generated_at && (
              <button
                type="button"
                onClick={handleShareItinerary}
                className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100"
              >
                Share
              </button>
            )}
          </div>
          {shareNotice && <p className="text-xs text-stone-400">{shareNotice}</p>}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">
          Trip Types
        </h2>
        <div className="space-y-2">
          {tripTypes.map((tt) => (
            <div
              key={tt.id}
              className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-100"
            >
              <span className="text-2xl">{tt.icon}</span>
              <span className="font-medium text-stone-700">{tt.name}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-400">
          Add Trip Type
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-600">Icon</label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setIcon(e)}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl text-2xl ${
                    icon === e ? 'bg-teal-100 ring-2 ring-teal-500' : 'bg-stone-100'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-stone-600">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. City break"
              className="w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-teal-600 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Add trip type'}
          </button>
        </form>
      </section>

      <p className="mt-10 text-center text-xs text-stone-300">{APP_VERSION}</p>
    </div>
  )
}
