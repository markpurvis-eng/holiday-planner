import { useEffect, useState } from 'react'
import { getForecast, weatherEmoji } from '../lib/weather'
import type { DailyForecast } from '../lib/weather'
import { formatDayAbbrev } from '../lib/format'

export function WeatherForecast({
  lat,
  lng,
  destinationName,
}: {
  lat: number
  lng: number
  destinationName: string | null
}) {
  const [forecast, setForecast] = useState<DailyForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  // Collapsed by default — this card sits inside TripDetail's sticky
  // header, where the full 10-day strip eats too much of a phone's
  // limited screen height, leaving little room for the scrollable list
  // below it. A one-line summary stays visible either way.
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    getForecast(lat, lng)
      .then((data) => {
        if (!cancelled) setForecast(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [lat, lng])

  // Fail quietly — a missing forecast isn't worth interrupting the trip
  // page for, and there's no useful retry action for the person to take.
  if (loading || error || forecast.length === 0) return null

  const today = forecast[0]

  return (
    <div className="mb-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
          Weather{destinationName ? ` in ${destinationName}` : ''}
        </h2>
        <span className="flex items-center gap-2">
          {!expanded && (
            <span className="flex items-center gap-1 text-sm">
              <span className="text-lg">{weatherEmoji(today.weatherCode)}</span>
              <span className="font-semibold text-stone-700">{Math.round(today.tempMax)}°</span>
              <span className="text-stone-400">{Math.round(today.tempMin)}°</span>
            </span>
          )}
          <span className="text-xs text-stone-400">{expanded ? '▲' : '▼'}</span>
        </span>
      </button>

      {expanded && (
        <>
          <div className="mt-3 flex gap-4 overflow-x-auto pb-1">
            {forecast.map((day) => (
              <div key={day.date} className="flex shrink-0 flex-col items-center gap-1">
                <div className="text-xs font-medium text-stone-500">{formatDayAbbrev(day.date)}</div>
                <div className="text-2xl">{weatherEmoji(day.weatherCode)}</div>
                <div className="whitespace-nowrap text-xs text-stone-700">
                  <span className="font-semibold">{Math.round(day.tempMax)}°</span>{' '}
                  <span className="text-stone-400">{Math.round(day.tempMin)}°</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-right text-[10px] text-stone-300">Weather data by Open-Meteo.com</p>
        </>
      )}
    </div>
  )
}
