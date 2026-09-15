import { jsPDF } from 'jspdf'
import type { Booking, ItineraryItem, Trip } from './types'
import { formatDate, formatDayAbbrev, formatTime, parseLocalDate } from './format'
import { uploadItineraryPdf, updateTrip } from './api'

type DayGroup = {
  date: string
  bookingLines: string[]
  itineraryLines: { time: string | null; type: string; venue: string }[]
}

// Groups non-cancelled bookings and itinerary items by calendar day, for a
// simple date-only shared itinerary. This is deliberately the date-only
// slice of the fuller merge-at-render idea for the live in-app Itinerary
// tab (Missing Features #5) — that one needs real time-of-day on bookings,
// which don't exist yet, but the share PDF only needs day grouping, so it
// doesn't have to wait on that schema change.
export function buildDayGroups(bookings: Booking[], itinerary: ItineraryItem[]): DayGroup[] {
  const groups = new Map<string, DayGroup>()

  function group(date: string): DayGroup {
    let g = groups.get(date)
    if (!g) {
      g = { date, bookingLines: [], itineraryLines: [] }
      groups.set(date, g)
    }
    return g
  }

  for (const b of bookings) {
    if (b.cancelled) continue
    const destination = b.destination_name ? ` - ${b.destination_name}` : ''
    if (b.start_date) {
      group(b.start_date).bookingLines.push(`${b.provider_name} begins${destination}`)
      if (b.end_date && b.end_date !== b.start_date) {
        group(b.end_date).bookingLines.push(`${b.provider_name} ends`)
      }
    } else if (b.end_date) {
      group(b.end_date).bookingLines.push(`${b.provider_name} ends${destination}`)
    }
  }

  for (const item of itinerary) {
    if (item.cancelled) continue
    group(item.date).itineraryLines.push({
      time: item.time,
      type: item.type,
      venue: item.venue ?? '',
    })
  }

  return Array.from(groups.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((g) => ({
      ...g,
      itineraryLines: [...g.itineraryLines].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    }))
}

const PAGE_MARGIN = 15
const LINE_HEIGHT = 6

// Fixed dd/mm/yyyy format for the PDF header, deliberately not using the
// locale-dependent formatDate() here — that follows the browser/OS locale,
// which could vary between devices, whereas this needs to always render
// the same way regardless of who opens it.
function formatDateDDMMYYYY(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  const day = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${d.getFullYear()}`
}

// jsPDF's built-in fonts (Helvetica etc.) only support WinAnsi/Latin-1
// characters. Anything outside that - most commonly arrows typed into
// transfer/flight-routing text ("Heathrow -> Gatwick") or curly
// quotes/ellipses - doesn't just render as a missing glyph: it appears to
// push jsPDF into a fallback rendering path that spaces every character
// in the line evenly, which is what "spaced out on some lines" actually
// was. Replacing the problem characters with plain ASCII equivalents
// before anything reaches doc.text() avoids that fallback entirely.
function sanitizeForPdf(text: string): string {
  return text
    .replace(/[\u2192\u21D2\u27A1\u2794]/g, '->') // rightwards arrows
    .replace(/[\u2190\u21D0]/g, '<-') // leftwards arrows
    .replace(/[\u2013\u2014]/g, '-') // en/em dash
    .replace(/[\u2018\u2019]/g, "'") // curly single quotes
    .replace(/[\u201C\u201D]/g, '"') // curly double quotes
    .replace(/\u2026/g, '...') // ellipsis
}

// Builds the shared itinerary as a PDF Blob. Deliberately excludes cost,
// currency, payment_status, reference/confirmation numbers, and
// booking.check_in_details (free text, could contain anything sensitive) —
// only date/time/type/venue for itinerary items and provider name/dates/
// destination for bookings are included. Cancelled itinerary items (and,
// for consistency, cancelled bookings) are omitted entirely rather than
// shown struck through.
export function generateItineraryPdf(trip: Trip, bookings: Booking[], itinerary: ItineraryItem[]): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let y = PAGE_MARGIN

  function ensureSpace(extra: number) {
    if (y + extra > pageHeight - PAGE_MARGIN) {
      doc.addPage()
      y = PAGE_MARGIN
    }
  }

  function writeLine(
    text: string,
    opts: { size?: number; style?: 'normal' | 'bold'; indent?: number } = {}
  ) {
    const { size = 11, style = 'normal', indent = 0 } = opts
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    const maxWidth = pageWidth - PAGE_MARGIN * 2 - indent
    const wrapped = doc.splitTextToSize(sanitizeForPdf(text), maxWidth) as string[]
    for (const wline of wrapped) {
      ensureSpace(LINE_HEIGHT)
      doc.text(wline, PAGE_MARGIN + indent, y)
      y += LINE_HEIGHT
    }
  }

  writeLine(trip.name, { size: 18, style: 'bold' })
  writeLine(`${formatDateDDMMYYYY(trip.start_date)} - ${formatDateDDMMYYYY(trip.end_date)}`, { size: 11 })
  y += 4

  const dayGroups = buildDayGroups(bookings, itinerary)

  if (dayGroups.length === 0) {
    writeLine('No itinerary items yet.', { size: 11 })
  }

  for (const day of dayGroups) {
    y += 2
    writeLine(`${formatDayAbbrev(day.date)} ${formatDate(day.date, { day: 'numeric', month: 'long' })}`, {
      size: 13,
      style: 'bold',
    })
    for (const line of day.bookingLines) {
      writeLine(line, { size: 10.5, indent: 4 })
    }
    for (const item of day.itineraryLines) {
      const timePrefix = item.time ? `${formatTime(item.time)} - ` : ''
      writeLine(`${timePrefix}${item.type}: ${item.venue}`, { size: 10.5, indent: 4 })
    }
  }

  return doc.output('blob')
}

// Builds the PDF, uploads/overwrites it at the trip's stable public path,
// and stamps public_itinerary_generated_at so the Share button knows the
// link is live. Returns the public URL — stable across regenerations, so
// any previously-shared link keeps working.
export async function generateAndPublishItinerary(
  trip: Trip,
  bookings: Booking[],
  itinerary: ItineraryItem[]
): Promise<{ url: string; generatedAt: string }> {
  const blob = generateItineraryPdf(trip, bookings, itinerary)
  const url = await uploadItineraryPdf(trip.id, blob)
  const updated = await updateTrip(trip.id, {
    public_itinerary_generated_at: new Date().toISOString(),
  })
  return { url, generatedAt: updated.public_itinerary_generated_at! }
}
