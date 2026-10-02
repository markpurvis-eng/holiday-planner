import type { AddressPinState } from '../lib/useAddressPin'

const inputClass =
  'w-full rounded-xl border border-stone-200 px-3 py-2.5 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'

/**
 * Address + map pin fields for the booking, itinerary and new-trip screens.
 * All state lives in useAddressPin; the parent calls resolveForSave() on submit.
 * The wording defaults suit the edit screens; the new-trip screen overrides it.
 */
export function AddressField({
  pin,
  label = 'Address',
  hint = '(for the map pin)',
  placeholder = 'Full street address, town and country',
  saveLabel = 'Save',
}: {
  pin: AddressPinState
  label?: string
  hint?: string
  placeholder?: string
  /** Name of the submit button, quoted in the "press ... again" messages. */
  saveLabel?: string
}) {
  const { address, setAddress, coordsText, setCoordsText, status, check } = pin
  const checking = status.kind === 'checking'

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-stone-600">
        {label} <span className="text-stone-400">{hint}</span>
      </label>
      <textarea
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className={inputClass}
      />

      <div className="mt-1 flex items-start justify-between gap-2">
        <div className="min-h-[1.25rem] flex-1 text-sm" aria-live="polite">
          {status.kind === 'checking' && <span className="text-stone-500">Looking up address…</span>}
          {status.kind === 'matched' && (
            <span className="text-teal-700">📍 Found: {status.label}</span>
          )}
          {status.kind === 'approx' && (
            <span className="text-amber-700">
              ⚠️ Only a rough match: {status.label}. Press {saveLabel} again to keep this pin, or make the
              address more specific (or paste coordinates below).
            </span>
          )}
          {status.kind === 'notfound' && (
            <span className="text-amber-700">
              ⚠️ Couldn't find that address. Press {saveLabel} again to keep it without a pin, or make it
              more specific (or paste coordinates below).
            </span>
          )}
          {status.kind === 'lookup-failed' && (
            <span className="text-amber-700">
              ⚠️ The address lookup didn't respond (offline?). Press {saveLabel} again to keep it
              without a pin.
            </span>
          )}
          {status.kind === 'bad-coords' && (
            <span className="text-red-500">
              Couldn't read those coordinates. Use the form 36.5506, -4.6697.
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={check}
          disabled={checking || !address.trim()}
          className="shrink-0 rounded-lg bg-stone-100 px-2.5 py-1 text-sm font-medium text-stone-600 hover:bg-stone-200 disabled:opacity-50"
        >
          Check
        </button>
      </div>

      <details className="mt-2" open={coordsText !== '' && status.kind === 'bad-coords'}>
        <summary className="cursor-pointer text-sm text-stone-500">
          Pin coordinates{coordsText ? ` (${coordsText})` : ''}
        </summary>
        <div className="mt-2">
          <input
            value={coordsText}
            onChange={(e) => setCoordsText(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 36.5506, -4.6697"
            className={inputClass}
          />
          <p className="mt-1 text-xs text-stone-400">
            Optional. In Google Maps, right-click the place and tap the coordinates to copy them,
            then paste here. Coordinates you enter override the address lookup.
          </p>
        </div>
      </details>
    </div>
  )
}
