import { useState } from 'react'
import {
  addLeg,
  emptyPassenger,
  flightWarnings,
  missingLegFields,
  moveLeg,
  removeLeg,
  updateLeg,
} from '../lib/bookingTypes/flightForm'
import type { FlightForm, LegForm } from '../lib/bookingTypes/flightForm'

const inputClass =
  'w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
const labelClass = 'mb-1 block text-xs font-medium text-stone-500'

function Field({
  label,
  value,
  onChange,
  type = 'text',
  upper = false,
  maxLength,
  placeholder,
  invalid = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'date' | 'time'
  upper?: boolean
  maxLength?: number
  placeholder?: string
  invalid?: boolean
}) {
  return (
    <div className="min-w-0">
      <label className={labelClass}>{label}</label>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        className={`${inputClass}${upper ? ' uppercase' : ''}${invalid ? ' border-red-400 bg-red-50' : ''}`}
      />
    </div>
  )
}

/**
 * Edits a flight booking's legs and passengers (Missing Features #83, phase 4).
 * Legs can be added, removed and moved up or down; each keeps its stable id.
 * The parent owns the state and turns it into `details` on save.
 */
export function FlightLegsEditor({
  form,
  onChange,
  showMissing = false,
}: {
  form: FlightForm
  onChange: (f: FlightForm) => void
  /** After a failed save: outline every required field that is still empty, in all legs at once. */
  showMissing?: boolean
}) {
  // Which leg is waiting for a second tap on Remove.
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const warnings = flightWarnings(form)

  function patch(i: number, p: Partial<LegForm>) {
    onChange(updateLeg(form, i, p))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-stone-600">Flight legs</p>

      {form.legs.length === 0 && (
        <p className="rounded-xl bg-stone-50 p-3 text-sm text-stone-500">
          No legs yet. This booking shows the generic card until you add one.
        </p>
      )}

      {form.legs.map((leg, i) => {
        const missing = showMissing ? missingLegFields(leg) : []
        return (
        <div key={leg.key} className="space-y-3 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-stone-700">
              Leg {i + 1}
              {leg.from.trim() && leg.to.trim() ? ` · ${leg.from.trim().toUpperCase()} → ${leg.to.trim().toUpperCase()}` : ''}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Move leg ${i + 1} up`}
                disabled={i === 0}
                onClick={() => onChange(moveLeg(form, i, -1))}
                className="rounded-lg bg-white px-2.5 py-1 text-sm text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={`Move leg ${i + 1} down`}
                disabled={i === form.legs.length - 1}
                onClick={() => onChange(moveLeg(form, i, 1))}
                className="rounded-lg bg-white px-2.5 py-1 text-sm text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100 disabled:opacity-30"
              >
                ↓
              </button>
              {confirmKey === leg.key ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmKey(null)
                      onChange(removeLeg(form, i))
                    }}
                    className="rounded-lg bg-red-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Remove?
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmKey(null)}
                    className="rounded-lg px-2 py-1 text-sm text-stone-500 hover:text-stone-700"
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmKey(leg.key)}
                  className="rounded-lg bg-white px-2.5 py-1 text-sm text-red-600 ring-1 ring-stone-200 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="From (airport code)" value={leg.from} onChange={(v) => patch(i, { from: v })} upper maxLength={3} placeholder="LHR" invalid={missing.includes('from')} />
            <Field label="To (airport code)" value={leg.to} onChange={(v) => patch(i, { to: v })} upper maxLength={3} placeholder="YOW" invalid={missing.includes('to')} />
            <Field label="From terminal" value={leg.from_terminal} onChange={(v) => patch(i, { from_terminal: v })} />
            <Field label="To terminal" value={leg.to_terminal} onChange={(v) => patch(i, { to_terminal: v })} />
            <Field label="Departs (date)" type="date" value={leg.dep_date} onChange={(v) => patch(i, { dep_date: v })} invalid={missing.includes('dep_date')} />
            <Field label="Departs (local time)" type="time" value={leg.dep_time} onChange={(v) => patch(i, { dep_time: v })} />
            <Field label="Arrives (date)" type="date" value={leg.arr_date} onChange={(v) => patch(i, { arr_date: v })} />
            <Field label="Arrives (local time)" type="time" value={leg.arr_time} onChange={(v) => patch(i, { arr_time: v })} />
            <Field label="Airline" value={leg.airline} onChange={(v) => patch(i, { airline: v })} />
            <Field label="Flight number" value={leg.flight_number} onChange={(v) => patch(i, { flight_number: v })} upper />
            <Field label="Operated by" value={leg.operated_by} onChange={(v) => patch(i, { operated_by: v })} />
            <Field label="Cabin" value={leg.cabin} onChange={(v) => patch(i, { cabin: v })} />
            <Field label="Baggage" value={leg.baggage} onChange={(v) => patch(i, { baggage: v })} />
            <Field label="Aircraft" value={leg.aircraft} onChange={(v) => patch(i, { aircraft: v })} />
            <Field label="Duration" value={leg.duration} onChange={(v) => patch(i, { duration: v })} placeholder="7h 25m" />
          </div>

          <div className="space-y-2">
            <p className={labelClass}>Seats</p>
            {leg.seats.map((s, si) => (
              <div key={si} className="flex gap-2">
                <input
                  value={s.passenger}
                  placeholder="Passenger (optional)"
                  onChange={(e) =>
                    patch(i, { seats: leg.seats.map((x, xi) => (xi === si ? { ...x, passenger: e.target.value } : x)) })
                  }
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <input
                  value={s.seat}
                  placeholder="24A"
                  onChange={(e) =>
                    patch(i, {
                      seats: leg.seats.map((x, xi) => (xi === si ? { ...x, seat: e.target.value.toUpperCase() } : x)),
                    })
                  }
                  className={`${inputClass.replace('w-full', 'w-24 shrink-0')} uppercase`}
                />
                <button
                  type="button"
                  aria-label="Remove seat"
                  onClick={() => patch(i, { seats: leg.seats.filter((_, xi) => xi !== si) })}
                  className="rounded-lg px-2 text-stone-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => patch(i, { seats: [...leg.seats, { passenger: '', seat: '' }] })}
              className="text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              + Add seat
            </button>
          </div>
        </div>
        )
      })}

      <button
        type="button"
        onClick={() => onChange(addLeg(form))}
        className="w-full rounded-xl bg-white py-2.5 text-sm font-medium text-teal-700 ring-1 ring-teal-200 hover:bg-teal-50"
      >
        + Add leg
      </button>

      <div className="space-y-2 pt-1">
        <p className="text-sm font-medium text-stone-600">
          Passengers <span className="text-stone-400">(names and e-ticket numbers)</span>
        </p>
        {form.passengers.map((p, pi) => (
          <div key={p.key} className="flex gap-2">
            <input
              value={p.name}
              placeholder="Name"
              onChange={(e) =>
                onChange({ ...form, passengers: form.passengers.map((x, xi) => (xi === pi ? { ...x, name: e.target.value } : x)) })
              }
              className={`${inputClass} flex-1`}
            />
            <input
              value={p.eticket}
              placeholder="E-ticket"
              onChange={(e) =>
                onChange({ ...form, passengers: form.passengers.map((x, xi) => (xi === pi ? { ...x, eticket: e.target.value } : x)) })
              }
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              aria-label="Remove passenger"
              onClick={() => onChange({ ...form, passengers: form.passengers.filter((_, xi) => xi !== pi) })}
              className="rounded-lg px-2 text-stone-400 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ ...form, passengers: [...form.passengers, emptyPassenger()] })}
          className="text-sm font-medium text-teal-700 hover:text-teal-800"
        >
          + Add passenger
        </button>
      </div>

      {warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
