import { CurrencyQuickPicks } from './CurrencyQuickPicks'
import { currencyInvalid, emptyExtra } from '../lib/bookingTypes/typeForm'
import type { ExtraForm, FlatFormState, TypeFormSpec } from '../lib/bookingTypes/typeForm'

const inputClass =
  'w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
const labelClass = 'mb-1 block text-xs font-medium text-stone-500'

/**
 * The type-specific fields of a hotel, car hire (and later cruise, excursion
 * and transfer) booking, drawn from the type's field list in
 * lib/bookingTypes/typeForm.ts. The parent owns the state and turns it into
 * `details` on save.
 */
export function TypeFieldsForm({
  title,
  spec,
  state,
  onChange,
}: {
  title: string
  spec: TypeFormSpec
  state: FlatFormState
  onChange: (s: FlatFormState) => void
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200">
      <p className="text-sm font-semibold text-stone-700">{title} details</p>
      {spec.fields.map((f) => {
        if (f.kind === 'text') {
          const value = state.values[f.key] ?? ''
          const set = (v: string) => onChange({ ...state, values: { ...state.values, [f.key]: v } })
          return (
            <div key={f.key}>
              <label className={labelClass}>
                {f.label}
                {f.hint && <span className="text-stone-400"> ({f.hint})</span>}
              </label>
              {f.multiline ? (
                <textarea value={value} onChange={(e) => set(e.target.value)} rows={3} className={inputClass} />
              ) : (
                <input value={value} onChange={(e) => set(e.target.value)} placeholder={f.placeholder} className={inputClass} />
              )}
            </div>
          )
        }
        if (f.kind === 'extras') {
          const extras = state.extras[f.key] ?? []
          const setExtras = (next: ExtraForm[]) => onChange({ ...state, extras: { ...state.extras, [f.key]: next } })
          const patch = (i: number, p: Partial<ExtraForm>) => setExtras(extras.map((x, xi) => (xi === i ? { ...x, ...p } : x)))
          return (
            <div key={f.key} className="space-y-2">
              <p className={labelClass}>
                {f.label}
                {f.hint && <span className="text-stone-400"> ({f.hint})</span>}
              </p>
              {extras.map((x, i) => (
                <div key={x.key} className="space-y-2 rounded-xl bg-white p-2.5 ring-1 ring-stone-200">
                  <div className="flex gap-2">
                    <input
                      value={x.name}
                      placeholder="Name"
                      onChange={(e) => patch(i, { name: e.target.value })}
                      className={`${inputClass} flex-1`}
                    />
                    <button
                      type="button"
                      aria-label={`Remove extra ${i + 1}`}
                      onClick={() => setExtras(extras.filter((_, xi) => xi !== i))}
                      className="rounded-lg px-2 text-stone-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="min-w-0">
                      <label className={labelClass}>Amount (optional)</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={x.cost}
                        placeholder="120.00"
                        onChange={(e) => patch(i, { cost: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div className="min-w-0">
                      <label className={labelClass}>Currency</label>
                      <input
                        value={x.currency}
                        placeholder="GBP"
                        maxLength={3}
                        onChange={(e) => patch(i, { currency: e.target.value.toUpperCase() })}
                        className={`${inputClass} uppercase${currencyInvalid(x.currency) ? ' border-red-400 bg-red-50' : ''}`}
                      />
                    </div>
                  </div>
                  <CurrencyQuickPicks value={x.currency} onChange={(c) => patch(i, { currency: c })} />
                  {currencyInvalid(x.currency) && <p className="text-xs text-red-600">Currency is a 3-letter code, such as GBP.</p>}
                  <label className="flex items-center gap-1.5 text-sm text-stone-600">
                    <input
                      type="checkbox"
                      checked={x.paid}
                      onChange={(e) => patch(i, { paid: e.target.checked })}
                      className="h-4 w-4 rounded border-stone-300 text-teal-600 focus:ring-teal-500"
                    />
                    Paid
                  </label>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setExtras([...extras, emptyExtra()])}
                className="text-sm font-medium text-teal-700 hover:text-teal-800"
              >
                {f.addLabel}
              </button>
            </div>
          )
        }
        const items = state.lists[f.key] ?? []
        const setItems = (next: string[]) => onChange({ ...state, lists: { ...state.lists, [f.key]: next } })
        return (
          <div key={f.key} className="space-y-2">
            <p className={labelClass}>{f.label}</p>
            {items.map((item, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={item}
                  onChange={(e) => setItems(items.map((x, xi) => (xi === i ? e.target.value : x)))}
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  aria-label={`Remove ${f.label.toLowerCase()} ${i + 1}`}
                  onClick={() => setItems(items.filter((_, xi) => xi !== i))}
                  className="rounded-lg px-2 text-stone-400 hover:text-red-600"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItems([...items, ''])}
              className="text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              {f.addLabel}
            </button>
          </div>
        )
      })}
    </div>
  )
}
