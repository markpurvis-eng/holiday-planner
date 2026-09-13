// Weather forecasts via Open-Meteo (https://open-meteo.com) — free, no API
// key, no rate limit at this app's volume, same "free keyless API" pattern
// already used for FX rates (see Frankfurter in the Costs tab design).
// Non-commercial use requires attribution (CC BY 4.0) — see the credit line
// rendered alongside the forecast in WeatherForecast.tsx.

import type { Booking } from './types'

export type DailyForecast = {
  date: string // "YYYY-MM-DD", local to the forecast location
  weatherCode: number
  tempMax: number
  tempMin: number
  precipitationChance: number | null
}

export async function getForecast(
  lat: number,
  lng: number,
  days = 10
): Promise<DailyForecast[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=${days}`

  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Weather forecast request failed (${res.status})`)
  }
  const data = await res.json()
  const daily = data.daily

  return (daily.time as string[]).map((date, i) => ({
    date,
    weatherCode: daily.weather_code[i],
    tempMax: daily.temperature_2m_max[i],
    tempMin: daily.temperature_2m_min[i],
    precipitationChance: daily.precipitation_probability_max?.[i] ?? null,
  }))
}

// Maps a WMO weather code (as returned by Open-Meteo's weather_code field)
// to a representative emoji. Ranges follow the WMO code table in Open-Meteo's
// docs (https://open-meteo.com/en/docs) — 0 clear, 1-3 cloud, 45/48 fog,
// 51-57 drizzle, 61-67 rain, 71-77 snow, 80-82 rain showers, 85/86 snow
// showers, 95+ thunderstorm.
export function weatherEmoji(code: number): string {
  if (code === 0) return '☀️'
  if (code === 1 || code === 2) return '🌤️'
  if (code === 3) return '☁️'
  if (code === 45 || code === 48) return '🌫️'
  if (code >= 51 && code <= 57) return '🌦️'
  if (code >= 61 && code <= 67) return '🌧️'
  if (code >= 71 && code <= 77) return '🌨️'
  if (code >= 80 && code <= 82) return '🌧️'
  if (code === 85 || code === 86) return '🌨️'
  if (code >= 95) return '⛈️'
  return '🌡️'
}

export type ResolvedLocation = {
  lat: number
  lng: number
  name: string | null
}

// Finds the booking whose date range covers `dateStr` and has coordinates
// set, so "today's weather" can follow wherever you're actually staying
// once a trip is under way (e.g. Boston partway through the Canada & New
// England trip, rather than the trip's single pre-trip anchor point).
// Deliberately not backfilled for moving-location bookings like a cruise
// ship — a single point for a multi-port cruise would be misleading, so
// those are left uncoordinated and fall through to the trip-level anchor.
// If more than one coordinated booking covers the same date (shouldn't
// normally happen — flights/car hire/tours are deliberately left
// uncoordinated to avoid this), the first match wins; a known
// simplification, worth revisiting if it ever produces a wrong result.
export function findLocationForDate(bookings: Booking[], dateStr: string): ResolvedLocation | null {
  const match = bookings.find(
    (b) =>
      b.destination_lat != null &&
      b.destination_lng != null &&
      b.start_date != null &&
      b.end_date != null &&
      b.start_date <= dateStr &&
      dateStr <= b.end_date
  )
  if (!match) return null
  return {
    lat: match.destination_lat as number,
    lng: match.destination_lng as number,
    name: match.destination_name,
  }
}
