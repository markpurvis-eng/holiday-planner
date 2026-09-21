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

// Parses a date-only string ("2026-09-14") as a LOCAL calendar date.
// `new Date("2026-09-14")` parses it as UTC midnight, and toLocaleDateString()
// then renders that in the browser's local timezone — for anyone west of UTC
// (e.g. Canada, US) that shifts the displayed date back by one day. Building
// the Date from y/m/d components instead uses local time throughout, so the
// calendar date shown always matches the date stored, regardless of timezone.
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Formats a date-only string via parseLocalDate, avoiding the UTC-shift bug.
export function formatDate(dateStr: string, opts?: Intl.DateTimeFormatOptions): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, opts)
}

// Trims a Postgres `time` value ("14:30:00") down to HH:MM for display.
export function formatTime(time?: string | null): string {
  if (!time) return ''
  return time.slice(0, 5)
}

// 3-letter weekday abbreviation for itinerary cards ("Mon", "Tue", ...).
export function formatDayAbbrev(dateStr: string): string {
  const day = parseLocalDate(dateStr).toLocaleDateString(undefined, { weekday: 'short' })
  return day.slice(0, 3)
}

// Whole days between today (local) and a date-only string. Uses
// parseLocalDate so it isn't affected by the UTC-midnight parsing bug —
// see parseLocalDate above.
export function daysUntil(dateStr: string): number {
  const target = parseLocalDate(dateStr)
  target.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((target.getTime() - today.getTime()) / msPerDay)
}

// Calendar year of a date-only string, using parseLocalDate so it isn't
// affected by the UTC-midnight parsing bug — see parseLocalDate above.
export function getYear(dateStr: string): number {
  return parseLocalDate(dateStr).getFullYear()
}

// Today's date as a local "YYYY-MM-DD" string, for comparing against the
// date-only columns Supabase returns (e.g. finding which booking covers
// today). Built from local y/m/d parts, not toISOString(), which would
// convert through UTC and risk the same day-shift bug parseLocalDate exists
// to avoid.
export function todayDateString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Current local time as "HH:MM", rounded to the nearest 5 minutes — a nicer
// default to land in a <input type="time"> than an exact-to-the-second
// "14:37". Used to pre-fill a new itinerary item's time with "now".
export function nowTimeString(): string {
  const now = new Date()
  let hours = now.getHours()
  let minutes = Math.round(now.getMinutes() / 5) * 5
  if (minutes === 60) {
    minutes = 0
    hours = (hours + 1) % 24
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

// Clamps a YYYY-MM-DD date string into an inclusive [start, end] range of
// other date-only strings. Plain string comparison is safe since all three
// are YYYY-MM-DD. Used to keep a new itinerary item's default date sensible
// if it's being added before a trip starts or after it's technically ended
// (today would otherwise fall outside the trip it's being attached to).
export function clampToTripRange(dateStr: string, start: string, end: string): string {
  if (dateStr < start) return start
  if (dateStr > end) return end
  return dateStr
}
