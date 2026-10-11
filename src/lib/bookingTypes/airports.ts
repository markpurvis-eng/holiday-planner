// Airports used by flight legs: IATA code -> display name and IANA timezone.
// The timezone is what lets a leg's departure/arrival (stored as local
// wall-clock time at that airport) show a home-time label such as "13:05 UK".
// Add a row here when a new airport turns up; an unknown code simply shows no
// name and no home-time label (it never breaks the card).
export type Airport = { name: string; tz: string }

export const AIRPORTS: Record<string, Airport> = {
  LHR: { name: 'London Heathrow', tz: 'Europe/London' },
  LGW: { name: 'London Gatwick', tz: 'Europe/London' },
  GLA: { name: 'Glasgow', tz: 'Europe/London' },
  AGP: { name: 'Málaga', tz: 'Europe/Madrid' },
  YOW: { name: 'Ottawa', tz: 'America/Toronto' },
  YUL: { name: 'Montréal', tz: 'America/Toronto' },
  BOS: { name: 'Boston Logan', tz: 'America/New_York' },
  SIN: { name: 'Singapore Changi', tz: 'Asia/Singapore' },
  HKG: { name: 'Hong Kong', tz: 'Asia/Hong_Kong' },
}

export function airportTimezone(code: string | null | undefined): string | null {
  if (!code) return null
  return AIRPORTS[code.toUpperCase()]?.tz ?? null
}

export function airportName(code: string | null | undefined): string | null {
  if (!code) return null
  return AIRPORTS[code.toUpperCase()]?.name ?? null
}
