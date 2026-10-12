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

export type TypeFormSpec = { fields: FieldSpec[] }

const CANCEL_BY_HINT = 'a date (YYYY-MM-DD) or text'

const SPECS: Record<string, TypeFormSpec> = {
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

export type FlatFormState = {
  values: Record<string, string>
  lists: Record<string, string[]>
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
  for (const f of spec.fields) {
    if (f.kind === 'text') values[f.key] = asText(raw[f.key])
    else lists[f.key] = Array.isArray(raw[f.key]) ? (raw[f.key] as unknown[]).map(asText).filter((s) => s.trim() !== '') : []
  }
  return { values, lists, raw }
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
    } else {
      const items = (state.lists[f.key] ?? []).map((s) => s.trim()).filter((s) => s !== '')
      if (items.length === 0) delete out[f.key]
      else out[f.key] = items
    }
  }
  return out
}
