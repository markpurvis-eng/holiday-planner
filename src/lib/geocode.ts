// Address -> map pin lookup, used by the booking / itinerary edit screens.
//
// Uses OpenStreetMap's Nominatim from the browser. This is a single
// user-initiated request per save (well inside the 1 request/second usage
// policy). The batch script in scripts/geocode-pins.mjs uses the same
// approach, including the "drop the first segment" fallback.

export interface GeocodeResult {
  lat: number
  lng: number
  /** Nominatim's own description of what it matched, shown so the user can sanity-check it. */
  label: string
  /** True when only a looser version of the address matched (first comma segment dropped). */
  approximate: boolean
}

interface NominatimHit {
  lat: string
  lon: string
  display_name: string
}

async function search(query: string): Promise<NominatimHit | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Geocoder returned ${res.status}`)
  const hits: NominatimHit[] = await res.json()
  return hits[0] ?? null
}

/**
 * Looks an address up. Returns null if nothing matched (a genuine "not
 * found"); throws if the lookup itself failed (offline, rate limited), so
 * callers can tell the two apart.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const full = address.trim()
  if (!full) return null

  const exact = await search(full)
  if (exact) {
    return { lat: Number(exact.lat), lng: Number(exact.lon), label: exact.display_name, approximate: false }
  }

  // Venue names often confuse Nominatim: retry without the first comma segment.
  const parts = full.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 2) {
    const loose = await search(parts.slice(1).join(', '))
    if (loose) {
      return { lat: Number(loose.lat), lng: Number(loose.lon), label: loose.display_name, approximate: true }
    }
  }
  return null
}

/**
 * Parses "lat, lng" as copied from Google Maps (right-click -> coordinates).
 * Returns null unless both numbers are in range.
 */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

export function formatCoordinates(lat: number | null, lng: number | null): string {
  return lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : ''
}
