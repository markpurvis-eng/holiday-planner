// One-off / re-runnable: geocodes booking.address and itinerary_item.address
// into pin_lat / pin_lng using OpenStreetMap Nominatim.
//
// Usage (from the repo root):
//   node scripts/geocode-pins.mjs            dry run: prints proposed pins, writes nothing
//   node scripts/geocode-pins.mjs --write    saves exact matches to Supabase
//   --include-fallback   also save rows that only matched after dropping the venue name
//   --force              re-geocode rows that already have a pin
//
// Reads these from .env (gitignored):
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY   already there for the app
//   GEOCODE_EMAIL, GEOCODE_PASSWORD             the household app login (RLS needs it)
//   NOMINATIM_CONTACT                           your email; Nominatim's policy requires
//                                               requests to identify a contact

import { createClient } from '@supabase/supabase-js'

try {
  process.loadEnvFile('.env')
} catch {
  console.error('No .env found. Run this from the repo root.')
  process.exit(1)
}

const args = new Set(process.argv.slice(2))
const WRITE = args.has('--write')
const FORCE = args.has('--force')
const INCLUDE_FALLBACK = args.has('--include-fallback')

const {
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_ANON_KEY: anonKey,
  GEOCODE_EMAIL: email,
  GEOCODE_PASSWORD: password,
  NOMINATIM_CONTACT: contact,
} = process.env

const missing = Object.entries({
  VITE_SUPABASE_URL: url,
  VITE_SUPABASE_ANON_KEY: anonKey,
  GEOCODE_EMAIL: email,
  GEOCODE_PASSWORD: password,
  NOMINATIM_CONTACT: contact,
})
  .filter(([, v]) => !v)
  .map(([k]) => k)
if (missing.length) {
  console.error(`Missing in .env: ${missing.join(', ')}`)
  process.exit(1)
}

const supabase = createClient(url, anonKey)
const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
if (authError) {
  console.error(`Sign-in failed: ${authError.message}`)
  process.exit(1)
}

const TABLES = [
  { table: 'booking', label: 'provider_name' },
  { table: 'itinerary_item', label: 'venue' },
]

const cache = new Map()
let lastRequest = 0

async function lookup(query) {
  const wait = 1100 - (Date.now() - lastRequest)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequest = Date.now()
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    { headers: { 'User-Agent': `HolidayPlannerPinGeocoder/1.0 (${contact})` } },
  )
  if (!res.ok) throw new Error(`Nominatim ${res.status} for "${query}"`)
  const [hit] = await res.json()
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), name: hit.display_name } : null
}

async function geocode(address) {
  if (cache.has(address)) return cache.get(address)
  let result = await lookup(address)
  if (result) result.kind = 'exact'
  if (!result && address.includes(',')) {
    const withoutVenue = address.split(',').slice(1).join(',').trim()
    result = await lookup(withoutVenue)
    if (result) result.kind = 'fallback'
  }
  cache.set(address, result)
  return result
}

const summary = { found: 0, fallback: 0, notFound: 0, written: 0 }

for (const { table, label } of TABLES) {
  let query = supabase
    .from(table)
    .select(`id, ${label}, address, pin_lat`)
    .not('address', 'is', null)
    .eq('cancelled', false)
  if (!FORCE) query = query.is('pin_lat', null)
  const { data: rows, error } = await query
  if (error) {
    console.error(`${table}: ${error.message}`)
    process.exit(1)
  }

  console.log(`\n== ${table} (${rows.length} rows) ==`)
  for (const row of rows) {
    const result = await geocode(row.address)
    const tag = `${row[label]}  [${row.address}]`
    if (!result) {
      summary.notFound++
      console.log(`NOT FOUND  ${tag}`)
      continue
    }
    const isFallback = result.kind === 'fallback'
    summary[isFallback ? 'fallback' : 'found']++
    console.log(
      `${isFallback ? 'FALLBACK ' : 'OK       '} ${tag}\n           ${result.lat}, ${result.lng}  ->  ${result.name}`,
    )
    if (WRITE && (!isFallback || INCLUDE_FALLBACK)) {
      const { data, error: updateError } = await supabase
        .from(table)
        .update({ pin_lat: result.lat, pin_lng: result.lng })
        .eq('id', row.id)
        .select('id')
      if (updateError || !data?.length) {
        console.error(`           write failed: ${updateError?.message ?? 'no row updated'}`)
      } else {
        summary.written++
      }
    }
  }
}

console.log(
  `\nExact: ${summary.found}  Fallback (venue name dropped): ${summary.fallback}  Not found: ${summary.notFound}`,
)
console.log(
  WRITE
    ? `Written: ${summary.written}`
    : 'Dry run only. Re-run with --write to save the exact matches.',
)
