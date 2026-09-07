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
