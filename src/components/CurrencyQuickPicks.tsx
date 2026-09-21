// Small quick-pick row for the three currencies Mark uses most, sitting
// above the existing free-text currency input on every cost form. Missing
// Features #47 — deliberately not a replacement for the text input: typing
// any other 3-letter code still works exactly as before, this is just a
// shortcut for the common case.
const QUICK_CURRENCIES = ['GBP', 'USD', 'EUR'] as const

export function CurrencyQuickPicks({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="mb-1.5 flex gap-1.5">
      {QUICK_CURRENCIES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
            value === c ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  )
}
