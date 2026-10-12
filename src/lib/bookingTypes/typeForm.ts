// Edit-form definitions for the flat booking types (Missing Features #83,
// phase 4): hotel and car hire now, then cruise, excursion and transfer. Each
// type lists its fields once here; the form is drawn from that list
// (components/TypeFieldsForm.tsx) and saved back as `details` with "v": 1.
// Field keys must match the type's parser in this folder (hotel.ts, carHire.ts,
// ...). Anything in the stored JSON the form does not edit is kept on save, and
// an empty field is left out of the JSON rather than stored as an empty string.

export type FieldSpec =
  | { kind: 'text'; key: string; label: string; hint?: string; placeholder?: string; multiline?: boolean }
  | { kind: 'list'; key: string; label: string; hint?: string; addLabel: string }
  /** The cruise extras: a list of { name, paid, cost, currency }. */
  | { kind: 'extras'; key: string; label: string; hint?: string; addLabel: string }

export type TypeFormSpec = { fields: FieldSpec[] }

const CANCEL_BY_HINT = 'a date (YYYY-MM-DD) or text'

const TIME_HINT = 'display only; the Itinerary uses the booking dates and times above'

const SPECS: Record<string, TypeFormSpec> = {
  cruise: {
    fields: [
      { kind: 'text', key: 'cruise_line', label: 'Cruise line' },
      { kind: 'text', key: 'ship', label: 'Ship' },
      { kind: 'text', key: 'voyage', label: 'Voyage' },
      { kind: 'text', key: 'cabin', label: 'Cabin' },
      { kind: 'text', key: 'category', label: 'Category' },
      { kind: 'text', key: 'deck', label: 'Deck' },
      { kind: 'text', key: 'dining', label: 'Dining' },
      { kind: 'text', key: 'embark_port', label: 'Embark port' },
      { kind: 'text', key: 'embark_terminal', label: 'Embark terminal' },
      { kind: 'text', key: 'embark_time', label: 'Boarding time', hint: TIME_HINT, placeholder: '11:00' },
      { kind: 'text', key: 'departure_time', label: 'Ship departs', hint: TIME_HINT, placeholder: '19:00' },
      { kind: 'text', key: 'disembark_port', label: 'Disembark port' },
      { kind: 'text', key: 'disembark_terminal', label: 'Disembark terminal' },
      { kind: 'text', key: 'disembark_time', label: 'Disembark time', hint: TIME_HINT, placeholder: '07:00' },
      { kind: 'text', key: 'muster', label: 'Muster station' },
      { kind: 'extras', key: 'extras', label: 'Extras', hint: 'drinks package, wifi, specialty dining...', addLabel: '+ Add extra' },
    ],
  },
  excursion: {
    fields: [
      { kind: 'text', key: 'operator', label: 'Operator' },
      { kind: 'text', key: 'meeting_point', label: 'Meeting point', multiline: true },
      { kind: 'text', key: 'duration', label: 'Duration' },
      { kind: 'text', key: 'tickets', label: 'Tickets' },
      { kind: 'text', key: 'guide_contact', label: 'Guide contact' },
      { kind: 'text', key: 'bring', label: 'What to bring', multiline: true },
      { kind: 'text', key: 'cancel_by', label: 'Free cancellation until', hint: CANCEL_BY_HINT },
    ],
  },
  transfer: {
    fields: [
      { kind: 'text', key: 'from', label: 'From' },
      { kind: 'text', key: 'to', label: 'To' },
      { kind: 'text', key: 'pickup_point', label: 'Pick-up point' },
      { kind: 'text', key: 'flight_to_track', label: 'Flight to track' },
      { kind: 'text', key: 'vehicle', label: 'Vehicle' },
      { kind: 'text', key: 'driver_contact', label: 'Driver contact' },
      { kind: 'text', key: 'cancel_by', label: 'Free cancellation until', hint: CANCEL_BY_HINT },
    ],
  },
  hotel: {
    fields: [
      { kind: 'text', key: 'room_type', label: 'Room type' },
      { kind: 'text', key: 'board_basis', label: 'Board basis', placeholder: 'Room only, Bed & breakfast...' },
      { kind: 'text', key: 'guests', label: 'Guests', placeholder: '2 adults' },
      { kind: 'text', key: 'phone', label: 'Phone' },
      { kind: 'text', key: 'parking', label: 'Parking' },
      { kind: 'text', key: 'cancel_by', label: 'Free cancellation until', hint: CANCEL_BY_HINT },
      { kind: 'text', key: 'cancellation', label: 'Cancellation terms', multiline: true },
    ],
  },
  car_hire: {
    fields: [
      { kind: 'text', key: 'supplier', label: 'Supplier' },
      { kind: 'text', key: 'car_class', label: 'Car class' },
      { kind: 'text', key: 'pickup_location', label: 'Pick-up location' },
      { kind: 'text', key: 'return_location', label: 'Return location' },
      { kind: 'text', key: 'excess', label: 'Excess' },
      { kind: 'text', key: 'insurance', label: 'Insurance', hint: 'no policy numbers here' },
      { kind: 'text', key: 'fuel_policy', label: 'Fuel policy' },
      { kind: 'text', key: 'mileage', label: 'Mileage' },
      { kind: 'text', key: 'registration', label: 'Registration' },
      { kind: 'text', key: 'phone', label: 'Phone' },
      { kind: 'text', key: 'cancel_by', label: 'Free cancellation until', hint: CANCEL_BY_HINT },
      { kind: 'list', key: 'drivers', label: 'Named drivers', addLabel: '+ Add driver' },
    ],
  },
}

/** The form for a type, or null when the type has no edit form (flights have their own editor). */
export function typeFormSpec(type: string | null | undefined): TypeFormSpec | null {
  return type ? (SPECS[type] ?? null) : null
}

export type ExtraForm = {
  /** React key only; never stored. */
  key: string
  name: string
  paid: boolean
  cost: string
  currency: string
  raw: Record<string, unknown>
}

let extraKey = 0
export function emptyExtra(): ExtraForm {
  extraKey += 1
  return { key: `x${extraKey}`, name: '', paid: false, cost: '', currency: '', raw: {} }
}

export type FlatFormState = {
  values: Record<string, string>
  lists: Record<string, string[]>
  extras: Record<string, ExtraForm[]>
  /** The stored object, so keys the form does not edit survive a save. */
  raw: Record<string, unknown>
}

function asText(x: unknown): string {
  if (typeof x === 'string') return x
  if (typeof x === 'number' && Number.isFinite(x)) return String(x)
  return ''
}

/** Reads stored details leniently into form state. Never throws; junk becomes an empty form. */
export function flatFormFromDetails(spec: TypeFormSpec, details: unknown): FlatFormState {
  const raw =
    details && typeof details === 'object' && !Array.isArray(details) && (details as Record<string, unknown>).v === 1
      ? (details as Record<string, unknown>)
      : {}
  const values: Record<string, string> = {}
  const lists: Record<string, string[]> = {}
  const extras: Record<string, ExtraForm[]> = {}
  for (const f of spec.fields) {
    if (f.kind === 'text') values[f.key] = asText(raw[f.key])
    else if (f.kind === 'list')
      lists[f.key] = Array.isArray(raw[f.key]) ? (raw[f.key] as unknown[]).map(asText).filter((s) => s.trim() !== '') : []
    else
      extras[f.key] = Array.isArray(raw[f.key])
        ? (raw[f.key] as unknown[]).flatMap((e) => {
            if (!e || typeof e !== 'object' || Array.isArray(e)) return []
            const eo = e as Record<string, unknown>
            if (asText(eo.name).trim() === '') return []
            return [{ ...emptyExtra(), name: asText(eo.name), paid: eo.paid === true, cost: asText(eo.cost), currency: asText(eo.currency), raw: eo }]
          })
        : []
  }
  return { values, lists, extras, raw }
}

const CURRENCY = /^[A-Za-z]{3}$/

/** True when a currency box holds something that is not a 3-letter code (empty is fine). */
export function currencyInvalid(currency: string): boolean {
  const c = currency.trim()
  return c !== '' && !CURRENCY.test(c)
}

/** Problems that stop a save: an extra whose currency is not a 3-letter code, or whose amount is not a number. */
export function flatFormErrors(spec: TypeFormSpec, state: FlatFormState): string[] {
  const out: string[] = []
  for (const f of spec.fields) {
    if (f.kind !== 'extras') continue
    ;(state.extras[f.key] ?? []).forEach((e, i) => {
      if (e.name.trim() === '') return
      const label = `Extra ${i + 1} (${e.name.trim()})`
      if (currencyInvalid(e.currency)) out.push(`${label}: currency must be a 3-letter code such as GBP.`)
      if (e.cost.trim() !== '' && !Number.isFinite(Number(e.cost))) out.push(`${label}: amount must be a number.`)
    })
  }
  return out
}

/** Turns the form back into the JSON to store. Empty fields are left out. */
export function buildFlatDetails(spec: TypeFormSpec, state: FlatFormState): Record<string, unknown> {
  const out: Record<string, unknown> = { ...state.raw, v: 1 }
  for (const f of spec.fields) {
    if (f.kind === 'text') {
      const t = (state.values[f.key] ?? '').trim()
      const was = state.raw[f.key]
      if (t === '') delete out[f.key]
      // A number that was stored as a number stays one if it was not edited.
      else out[f.key] = typeof was === 'number' && String(was) === t ? was : t
    } else if (f.kind === 'list') {
      const items = (state.lists[f.key] ?? []).map((s) => s.trim()).filter((s) => s !== '')
      if (items.length === 0) delete out[f.key]
      else out[f.key] = items
    } else {
      const items = (state.extras[f.key] ?? [])
        .filter((e) => e.name.trim() !== '')
        .map((e) => {
          const o: Record<string, unknown> = { ...e.raw, name: e.name.trim(), paid: e.paid }
          const cost = e.cost.trim() === '' ? NaN : Number(e.cost)
          if (Number.isFinite(cost)) o.cost = cost
          else delete o.cost
          const cur = e.currency.trim().toUpperCase()
          if (cur) o.currency = cur
          else delete o.currency
          return o
        })
      if (items.length === 0) delete out[f.key]
      else out[f.key] = items
    }
  }
  return out
}
