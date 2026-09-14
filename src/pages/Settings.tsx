import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getTripTypes, createTripType } from '../lib/api'
import type { TripType } from '../lib/types'
import { APP_VERSION } from '../lib/version'

const EMOJI_OPTIONS = ['🚢', '🏖️', '🎒', '🧳', '✈️', '🏔️', '🏕️', '🎡', '🚗', '🏙️']

export default function Settings() {
  const [tripTypes, setTripTypes] = useState<TripType[]>([])
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(EMOJI_OPTIONS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getTripTypes().then(setTripTypes)
  }, [])

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
