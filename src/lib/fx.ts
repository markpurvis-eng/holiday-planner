// Frankfurter (https://frankfurter.dev) — free, no API key, no meaningful
// rate limit at this app's volume. v2/rate/{base}/{quote} returns the
// latest rate for a single currency pair as { rate: number, ... }.
const FX_API_BASE = 'https://api.frankfurter.dev/v2/rate'

// Caches in-flight/completed requests per currency for the lifetime of the
// page, so rendering many cost lines in the same currency (e.g. several
// USD hotel nights) triggers one fetch, not one per line.
const rateCache = new Map<string, Promise<number>>()

// Fetches the current rate to convert 1 unit of `currency` into GBP.
// GBP itself is always 1 — no need to call the API for that case.
export function fetchGbpRate(currency: string): Promise<number> {
  const code = currency.toUpperCase()
  if (code === 'GBP') return Promise.resolve(1)

  const cached = rateCache.get(code)
  if (cached) return cached

  const promise = fetch(`${FX_API_BASE}/${code}/GBP`)
    .then((res) => {
      if (!res.ok) throw new Error(`FX rate fetch failed for ${code} -> GBP (${res.status})`)
      return res.json() as Promise<{ rate: number }>
    })
    .then((data) => data.rate)
    .catch((err) => {
      // Don't cache a failure — a transient network error shouldn't
      // permanently poison this currency for the rest of the session.
      rateCache.delete(code)
      throw err
    })

  rateCache.set(code, promise)
  return promise
}
