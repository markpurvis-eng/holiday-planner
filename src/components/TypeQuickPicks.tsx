// Small quick-pick row for the three itinerary types Mark's household
// actually uses (transport/activity/dining, by real usage), sitting above
// the existing free-text type input on the itinerary item form. Missing
// Features #53, mirroring CurrencyQuickPicks (Fixed #48) — deliberately not
// a replacement for the text input: typing any other value still works
// exactly as before, this is just a shortcut for the common case.
const QUICK_TYPES = ['transport', 'activity', 'dining'] as const

export function TypeQuickPicks({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="mb-1.5 flex gap-1.5">
      {QUICK_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
            value === t ? 'bg-teal-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
