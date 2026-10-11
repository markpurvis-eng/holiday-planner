import { useEffect, useState } from 'react'
import type { Booking } from '../lib/types'
import { fetchGbpRate } from '../lib/fx'
import { formatMoney } from '../lib/format'

// "Excursions: £X total" (or "Excursions & stays" when a child is not an
// excursion, such as a hotel night on a port day) on a parent booking's card (Missing Features #83,
// design decision 9). Display only: each child keeps its own Costs line and is
// never rolled into the parent's cost, so nothing is double-counted. Cancelled
// children and children without a cost are left out. A line's locked rate is
// used when it has one; otherwise today's rate is looked up (the total then
// shows "~"). A line whose rate cannot be fetched is listed in its own
// currency instead of being guessed.
export function ExcursionsTotal({ excursions }: { excursions: Booking[] }) {
  const lines = excursions.filter((e) => !e.cancelled && e.cost != null && e.currency)
  const needed = Array.from(
    new Set(lines.filter((l) => l.fx_rate_to_gbp == null && l.currency !== 'GBP').map((l) => l.currency as string))
  ).sort()
  const neededKey = needed.join(',')
  const [rates, setRates] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (!neededKey) return
    let cancelled = false
    Promise.all(
      neededKey.split(',').map(async (c) => {
        try {
          return [c, await fetchGbpRate(c, { allowStale: true })] as const
        } catch {
          return null
        }
      })
    ).then((results) => {
      if (cancelled) return
      setRates(new Map(results.flatMap((r) => (r ? [r] : []))))
    })
    return () => {
      cancelled = true
    }
  }, [neededKey])

  if (lines.length === 0) return null

  let total = 0
  let approximate = false
  const unconverted: string[] = []
  for (const l of lines) {
    const cost = l.cost as number
    const currency = l.currency as string
    if (currency === 'GBP') {
      total += cost
    } else if (l.fx_rate_to_gbp != null) {
      total += cost * l.fx_rate_to_gbp
    } else if (rates.has(currency)) {
      total += cost * (rates.get(currency) as number)
      approximate = true
    } else {
      unconverted.push(formatMoney(cost, currency))
    }
  }

  return (
    <p className="mt-1 text-sm text-stone-500">
      {excursions.every((e) => e.type === 'excursion') ? 'Excursions' : 'Excursions & stays'}: {total > 0 || unconverted.length === 0 ? `${approximate ? '~' : ''}${formatMoney(total, 'GBP')}` : ''}
      {unconverted.length > 0 && `${total > 0 ? ' + ' : ''}${unconverted.join(' + ')}`} total
      <span className="text-stone-400">
        {' '}
        ({lines.length} {lines.length === 1 ? 'booking' : 'bookings'}, counted separately in Costs)
      </span>
    </p>
  )
}
