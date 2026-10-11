import type { Booking } from '../types'
import { formatTime } from '../format'
import { airportTimezone } from './airports'
import type { SegmentEntry } from './segment'

// Flight details, stored in booking.details (see Holiday_App_Booking_Types_Design.md,
// decisions 1, 3, 4, 15). One booking per flight purchase; the legs live here.
// Times are local wall-clock time at the airport concerned, each with its own
// date, so an overnight arrival is just an arr_date one day after dep_date.

export type FlightSeat = {
  /** null when the confirmation lists seats without saying whose they are. */
  passenger: string | null
  seat: string
}

export type FlightLeg = {
  /** Stable within the booking ("l1", "l2", ...). Never reuse an id after a leg is removed. */
  id: string
  airline: string | null
  flight_number: string | null
  operated_by: string | null
  /** IATA codes. */
  from: string
  to: string
  from_terminal: string | null
  to_terminal: string | null
  dep_date: string
  /** HH:MM, local to the departure airport; null when not known yet. */
  dep_time: string | null
  arr_date: string | null
  /** HH:MM, local to the arrival airport. */
  arr_time: string | null
  seats: FlightSeat[]
  cabin: string | null
  baggage: string | null
  aircraft: string | null
  duration: string | null
}

export type FlightPassenger = {
  name: string
  eticket: string | null
}

export type FlightDetails = {
  v: 1
  legs: FlightLeg[]
  passengers: FlightPassenger[]
}

function str(x: unknown): string | null {
  return typeof x === 'string' && x.trim() !== '' ? x : null
}

// Reads booking.details defensively: the column is free-form JSON that Claude
// (and later the edit screens) write, so anything malformed returns null and
// the booking falls back to the generic card instead of crashing the page.
export function parseFlightDetails(raw: unknown): FlightDetails | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.v !== 1 || !Array.isArray(r.legs) || r.legs.length === 0) return null

  const legs: FlightLeg[] = []
  for (const l of r.legs) {
    if (!l || typeof l !== 'object') return null
    const o = l as Record<string, unknown>
    const id = str(o.id)
    const from = str(o.from)
    const to = str(o.to)
    const depDate = str(o.dep_date)
    if (!id || !from || !to || !depDate) return null
    const seats: FlightSeat[] = Array.isArray(o.seats)
      ? o.seats.flatMap((s) => {
          if (!s || typeof s !== 'object') return []
          const so = s as Record<string, unknown>
          const seat = str(so.seat)
          return seat ? [{ passenger: str(so.passenger), seat }] : []
        })
      : []
    legs.push({
      id,
      airline: str(o.airline),
      flight_number: str(o.flight_number),
      operated_by: str(o.operated_by),
      from: from.toUpperCase(),
      to: to.toUpperCase(),
      from_terminal: str(o.from_terminal),
      to_terminal: str(o.to_terminal),
      dep_date: depDate,
      dep_time: str(o.dep_time),
      arr_date: str(o.arr_date),
      arr_time: str(o.arr_time),
      seats,
      cabin: str(o.cabin),
      baggage: str(o.baggage),
      aircraft: str(o.aircraft),
      duration: str(o.duration),
    })
  }

  const passengers: FlightPassenger[] = Array.isArray(r.passengers)
    ? r.passengers.flatMap((p) => {
        if (!p || typeof p !== 'object') return []
        const po = p as Record<string, unknown>
        const name = str(po.name)
        return name ? [{ name, eticket: str(po.eticket) }] : []
      })
    : []

  return { v: 1, legs, passengers }
}

// One-line card headline. A single leg reads like
// "LHR 10:15 → YOW 12:40 · BA99 · seats 24A/24B"; several legs show the route
// chain instead ("LHR → YOW → YUL · AC889, AC8018"), because the per-leg
// detail is in the sub-cards underneath.
export function flightHeadline(d: FlightDetails): string {
  if (d.legs.length === 1) {
    const l = d.legs[0]
    const dep = `${l.from}${l.dep_time ? ` ${formatTime(l.dep_time)}` : ''}`
    const arr = `${l.to}${l.arr_time ? ` ${formatTime(l.arr_time)}` : ''}`
    const parts = [`${dep} → ${arr}`]
    if (l.flight_number) parts.push(l.flight_number)
    if (l.seats.length > 0) parts.push(`seats ${l.seats.map((s) => s.seat).join('/')}`)
    return parts.join(' · ')
  }

  // Chain legs that continue from where the last one landed; a break starts a
  // new group (e.g. an open-jaw trip).
  const groups: string[][] = []
  for (const l of d.legs) {
    const last = groups[groups.length - 1]
    if (last && last[last.length - 1] === l.from) last.push(l.to)
    else groups.push([l.from, l.to])
  }
  const route = groups.map((g) => g.join(' → ')).join(' · ')
  const numbers = d.legs.map((l) => l.flight_number).filter((n): n is string => n != null)
  return numbers.length > 0 ? `${route} · ${numbers.join(', ')}` : route
}

// Core booking columns derived from the legs (design decision 15): first leg
// departure to last leg arrival, as local wall-clock values. Used on save once
// the edit screens write `details` (phase 4); built and tested now so the rule
// lives in one place.
export function deriveFlightCore(d: FlightDetails): {
  start_date: string
  start_time: string | null
  end_date: string | null
  end_time: string | null
} {
  const first = d.legs[0]
  const last = d.legs[d.legs.length - 1]
  return {
    start_date: first.dep_date,
    start_time: first.dep_time,
    end_date: last.arr_date ?? last.dep_date,
    end_time: last.arr_time,
  }
}

export function flightSegments(b: Booking, d: FlightDetails): SegmentEntry[] {
  return d.legs.map((l) => ({
    date: l.dep_date,
    time: l.dep_time,
    segment: {
      id: `${b.id}-${l.id}`,
      kindLabel: 'Flight',
      title: `${l.from} → ${l.to}`,
      subtitle: l.flight_number ?? l.airline ?? '',
      detail: l.arr_time ? `Arrives ${formatTime(l.arr_time)}` : '',
      icon: '✈️',
      tz: airportTimezone(l.from),
    },
  }))
}

// True when there is something to show behind the "Show details" toggle that
// the headline and leg cards don't already show.
export function flightHasExtras(d: FlightDetails): boolean {
  return (
    d.passengers.some((p) => p.eticket) ||
    d.legs.some((l) => l.operated_by || l.baggage || l.aircraft || l.duration)
  )
}
