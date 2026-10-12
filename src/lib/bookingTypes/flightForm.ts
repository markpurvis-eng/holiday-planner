import { airportTimezone } from './airports'
import { deriveFlightCore, parseFlightDetails } from './flight'

// Edit-form state for a flight booking's `details` (Missing Features #83, phase 4).
// The form works on plain strings so a half-typed leg never crashes anything;
// buildFlightDetails() turns it back into the stored JSON and checks that the
// result will still parse (so the card never silently falls back to the generic
// layout because of an edit). Anything in the stored JSON the form does not know
// about (extra keys on the booking, a leg, a passenger) is kept as it was.

export type SeatForm = { passenger: string; seat: string }

export type LegForm = {
  /** React key only; never stored. */
  key: string
  /** Stable within the booking ("l1", "l2", ...); never changed or reused. */
  id: string
  airline: string
  flight_number: string
  operated_by: string
  from: string
  to: string
  from_terminal: string
  to_terminal: string
  dep_date: string
  dep_time: string
  arr_date: string
  arr_time: string
  cabin: string
  baggage: string
  aircraft: string
  duration: string
  seats: SeatForm[]
  /** The leg as stored, so keys the form does not edit survive a save. */
  raw: Record<string, unknown>
}

export type PassengerForm = {
  key: string
  name: string
  eticket: string
  raw: Record<string, unknown>
}

export type FlightForm = {
  legs: LegForm[]
  passengers: PassengerForm[]
  /** Highest leg number ever handed out (stored as details.leg_seq). */
  legSeq: number
  /** True when the booking already had a `details` object (so zero legs is a removal, not an empty start). */
  hadDetails: boolean
  raw: Record<string, unknown>
}

const LEG_ID = /^l(\d+)$/

let keyCounter = 0
function nextKey(): string {
  keyCounter += 1
  return `k${keyCounter}`
}

function text(x: unknown): string {
  return typeof x === 'string' ? x : ''
}

function obj(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

/** Reads stored details leniently into form state. Never throws; junk becomes an empty form. */
export function flightFormFromDetails(raw: unknown): FlightForm {
  const r = obj(raw)
  const isV1 = r.v === 1
  const base = isV1 ? r : {}
  const legsRaw = Array.isArray(base.legs) ? base.legs : []
  const legs: LegForm[] = legsRaw.flatMap((l) => {
    if (!l || typeof l !== 'object' || Array.isArray(l)) return []
    const o = l as Record<string, unknown>
    const seats: SeatForm[] = Array.isArray(o.seats)
      ? o.seats.flatMap((s) => {
          const so = obj(s)
          return text(so.seat) ? [{ passenger: text(so.passenger), seat: text(so.seat) }] : []
        })
      : []
    return [
      {
        key: nextKey(),
        id: text(o.id),
        airline: text(o.airline),
        flight_number: text(o.flight_number),
        operated_by: text(o.operated_by),
        from: text(o.from),
        to: text(o.to),
        from_terminal: text(o.from_terminal),
        to_terminal: text(o.to_terminal),
        dep_date: text(o.dep_date),
        dep_time: text(o.dep_time),
        arr_date: text(o.arr_date),
        arr_time: text(o.arr_time),
        cabin: text(o.cabin),
        baggage: text(o.baggage),
        aircraft: text(o.aircraft),
        duration: text(o.duration),
        seats,
        raw: o,
      },
    ]
  })
  const passengers: PassengerForm[] = Array.isArray(base.passengers)
    ? base.passengers.flatMap((p) => {
        if (!p || typeof p !== 'object' || Array.isArray(p)) return []
        const po = p as Record<string, unknown>
        return text(po.name) ? [{ key: nextKey(), name: text(po.name), eticket: text(po.eticket), raw: po }] : []
      })
    : []

  // The counter never goes backwards: the stored leg_seq, or the highest l<n>
  // id in use, whichever is larger.
  let legSeq = typeof base.leg_seq === 'number' && Number.isInteger(base.leg_seq) && base.leg_seq > 0 ? base.leg_seq : 0
  for (const l of legs) {
    const m = LEG_ID.exec(l.id)
    if (m) legSeq = Math.max(legSeq, Number(m[1]))
  }
  // Legs stored without an id get one now, so they can be saved and parsed.
  for (const l of legs) {
    if (!l.id) {
      legSeq += 1
      l.id = `l${legSeq}`
    }
  }

  return { legs, passengers, legSeq, hadDetails: isV1, raw: base }
}

export function emptyLeg(id: string): LegForm {
  return {
    key: nextKey(),
    id,
    airline: '',
    flight_number: '',
    operated_by: '',
    from: '',
    to: '',
    from_terminal: '',
    to_terminal: '',
    dep_date: '',
    dep_time: '',
    arr_date: '',
    arr_time: '',
    cabin: '',
    baggage: '',
    aircraft: '',
    duration: '',
    seats: [],
    raw: {},
  }
}

export function emptyPassenger(): PassengerForm {
  return { key: nextKey(), name: '', eticket: '', raw: {} }
}

/** Adds a leg with the next never-used id. Optionally continues from the previous leg's destination. */
export function addLeg(form: FlightForm): FlightForm {
  const legSeq = form.legSeq + 1
  const leg = emptyLeg(`l${legSeq}`)
  const prev = form.legs[form.legs.length - 1]
  if (prev) leg.from = prev.to.toUpperCase()
  return { ...form, legSeq, legs: [...form.legs, leg] }
}

export function moveLeg(form: FlightForm, index: number, delta: -1 | 1): FlightForm {
  const to = index + delta
  if (to < 0 || to >= form.legs.length) return form
  const legs = form.legs.slice()
  const [moved] = legs.splice(index, 1)
  legs.splice(to, 0, moved)
  return { ...form, legs }
}

export function removeLeg(form: FlightForm, index: number): FlightForm {
  return { ...form, legs: form.legs.filter((_, i) => i !== index) }
}

export function updateLeg(form: FlightForm, index: number, patch: Partial<LegForm>): FlightForm {
  return { ...form, legs: form.legs.map((l, i) => (i === index ? { ...l, ...patch } : l)) }
}

function orNull(s: string): string | null {
  const t = s.trim()
  return t === '' ? null : t
}

export type FlightBuild = {
  /** Problems that stop the save (the stored JSON would not parse, or a leg was removed to nothing). */
  errors: string[]
  /** Things worth a second look; they never stop a save. */
  warnings: string[]
  /** The JSON to store, or null when there are errors or nothing to write. */
  details: Record<string, unknown> | null
  /** Core booking columns derived from the legs (decision 15); null when details is null. */
  core: { start_date: string; start_time: string | null; end_date: string | null; end_time: string | null } | null
}

export type RequiredLegField = 'from' | 'to' | 'dep_date'

const LEG_FIELD_LABEL: Record<RequiredLegField, string> = {
  from: 'From',
  to: 'To',
  dep_date: 'Departure date',
}

/** The required fields (the ones the card cannot be read without) that a leg has not got yet. */
export function missingLegFields(l: LegForm): RequiredLegField[] {
  const out: RequiredLegField[] = []
  if (!l.from.trim()) out.push('from')
  if (!l.to.trim()) out.push('to')
  if (!l.dep_date) out.push('dep_date')
  return out
}

function legName(l: LegForm, i: number): string {
  const route = l.from.trim() && l.to.trim() ? ` (${l.from.trim().toUpperCase()} → ${l.to.trim().toUpperCase()})` : ''
  return `Leg ${i + 1}${route}`
}

/** Warnings only: shown live in the editor. Dates are compared, not times, because the times are local to different airports. */
export function flightWarnings(form: FlightForm): string[] {
  const out: string[] = []
  form.legs.forEach((l, i) => {
    const name = legName(l, i)
    if (l.arr_date && l.dep_date && l.arr_date < l.dep_date) out.push(`${name}: arrives before it departs.`)
    for (const [label, code] of [
      ['from', l.from],
      ['to', l.to],
    ] as const) {
      const c = code.trim()
      if (c && !/^[A-Za-z]{3}$/.test(c)) out.push(`${name}: "${c}" is not a 3-letter airport code.`)
      else if (c && !airportTimezone(c)) out.push(`${name}: no home-time label for ${c.toUpperCase()} (${label}); add it to airports.ts if wanted.`)
    }
    const prev = form.legs[i - 1]
    if (prev && prev.dep_date && l.dep_date && l.dep_date < prev.dep_date) out.push(`${name}: departs before the leg above it.`)
  })
  return out
}

/** Turns the form back into stored JSON plus the derived core columns, or explains why it cannot. */
export function buildFlightDetails(form: FlightForm): FlightBuild {
  const errors: string[] = []
  const warnings = flightWarnings(form)

  if (form.legs.length === 0) {
    if (form.hadDetails) errors.push('A flight needs at least one leg. Add one, or Cancel to keep the old ones.')
    return { errors, warnings, details: null, core: null }
  }

  form.legs.forEach((l, i) => {
    for (const field of missingLegFields(l)) errors.push(`${legName(l, i)}: ${LEG_FIELD_LABEL[field]} is needed.`)
  })
  if (errors.length > 0) return { errors, warnings, details: null, core: null }

  const legs = form.legs.map((l) => {
    const seats = l.seats
      .filter((s) => s.seat.trim())
      .map((s) => ({ passenger: orNull(s.passenger), seat: s.seat.trim() }))
    return {
      ...l.raw,
      id: l.id,
      airline: orNull(l.airline),
      flight_number: orNull(l.flight_number),
      operated_by: orNull(l.operated_by),
      from: l.from.trim().toUpperCase(),
      to: l.to.trim().toUpperCase(),
      from_terminal: orNull(l.from_terminal),
      to_terminal: orNull(l.to_terminal),
      dep_date: l.dep_date,
      dep_time: orNull(l.dep_time),
      arr_date: orNull(l.arr_date),
      arr_time: orNull(l.arr_time),
      seats,
      cabin: orNull(l.cabin),
      baggage: orNull(l.baggage),
      aircraft: orNull(l.aircraft),
      duration: orNull(l.duration),
    }
  })

  const ids = new Set(legs.map((l) => l.id))
  if (ids.size !== legs.length) errors.push('Two legs share an id; reload the page and try again.')

  const passengers = form.passengers
    .filter((p) => p.name.trim())
    .map((p) => ({ ...p.raw, name: p.name.trim(), eticket: orNull(p.eticket) }))

  const details: Record<string, unknown> = {
    ...form.raw,
    v: 1,
    legs,
    passengers,
    leg_seq: form.legSeq,
  }

  // The card reads this through the same parser; if it would not parse, do not store it.
  const parsed = parseFlightDetails(details)
  if (!parsed) {
    errors.push('These legs could not be read back; check the airport codes and dates.')
    return { errors, warnings, details: null, core: null }
  }
  if (errors.length > 0) return { errors, warnings, details: null, core: null }

  return { errors, warnings, details, core: deriveFlightCore(parsed) }
}
