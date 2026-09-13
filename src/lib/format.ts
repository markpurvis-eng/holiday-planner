const SYMBOLS: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  CAD: 'CA$',
  HKD: 'HK$',
  SGD: 'S$',
  AUD: 'A$',
}

// Currencies where a symbol prefix would look wrong/ambiguous — shown as
// "1,234 VND" instead of "VND1,234".
const SUFFIX_CODES = new Set(['VND', 'JPY'])

export function formatMoney(amount: number, currency?: string | null): string {
  const code = currency || 'GBP'
  const formattedNumber = amount.toLocaleString(undefined, {
    minimumFractionDigits: SUFFIX_CODES.has(code) ? 0 : 2,
    maximumFractionDigits: SUFFIX_CODES.has(code) ? 0 : 2,
  })

  if (SUFFIX_CODES.has(code)) {
    return `${formattedNumber} ${code}`
  }

  const symbol = SYMBOLS[code]
  if (symbol) {
    return `${symbol}${formattedNumber}`
  }

  // Unknown currency code — show the code rather than silently assuming GBP.
  return `${formattedNumber} ${code}`
}

// Trims a Postgres `time` value ("14:30:00") down to HH:MM for display.
export function formatTime(time?: string | null): string {
  if (!time) return ''
  return time.slice(0, 5)
}

// 3-letter weekday abbreviation for itinerary cards ("Mon", "Tue", ...).
export function formatDayAbbrev(dateStr: string): string {
  const day = new Date(dateStr).toLocaleDateString(undefined, { weekday: 'short' })
  return day.slice(0, 3)
}
