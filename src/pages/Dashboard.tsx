import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTrips } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Trip } from '../lib/types'
import { TripCard } from '../components/TripCard'
import { LoadingSpinner } from '../components/LoadingSpinner'

export default function Dashboard() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [showPast, setShowPast] = useState(false)
  const { signOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    getTrips()
      .then(setTrips)
      .finally(() => setLoading(false))
  }, [])

  const active = trips.filter((t) => t.status === 'active' || t.status === 'upcoming')
  const past = trips.filter((t) => t.status === 'past' || t.status === 'cancelled')

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-24 pt-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">My Trips</h1>
        <button onClick={handleSignOut} className="text-sm text-stone-400 hover:text-stone-600">
          Sign out
        </button>
      </div>

      {loading ? (
        <LoadingSpinner label="Loading trips…" />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
              Active &amp; Upcoming
            </h2>
            {active.length === 0 ? (
              <p className="rounded-2xl bg-white p-6 text-center text-sm text-stone-400 ring-1 ring-stone-100">
                No upcoming trips yet. Add one in Settings once trip types are set up, or via
                Supabase.
              </p>
            ) : (
              active.map((trip) => <TripCard key={trip.id} trip={trip} />)
            )}
          </section>

          {past.length > 0 && (
            <section className="mt-8">
              <button
                onClick={() => setShowPast((s) => !s)}
                className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-wide text-stone-400"
              >
                Past Trips ({past.length})
                <span>{showPast ? '▲' : '▼'}</span>
              </button>
              {showPast && (
                <div className="mt-3 space-y-3 opacity-80">
                  {past.map((trip) => (
                    <TripCard key={trip.id} trip={trip} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
