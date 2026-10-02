import { useCallback, useRef, useState } from 'react'
import { formatCoordinates, geocodeAddress, parseCoordinates } from './geocode'
import type { GeocodeResult } from './geocode'

export type AddressStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'matched'; label: string }
  | { kind: 'approx'; label: string }
  | { kind: 'notfound' }
  | { kind: 'lookup-failed' }
  | { kind: 'bad-coords' }

export interface AddressFields {
  address: string | null
  pin_lat: number | null
  pin_lng: number | null
}

interface Initial {
  address: string | null
  pin_lat: number | null
  pin_lng: number | null
}

/**
 * State and save-time logic for the address + map pin fields shared by the
 * booking and itinerary edit screens.
 *
 * Rules, in order, when saving:
 *  1. Nothing entered -> clear address and pin.
 *  2. Coordinates edited by hand -> use them (they override any lookup).
 *  3. Address and pin both unchanged -> keep as they are, no lookup.
 *  4. Otherwise look the address up. An exact match is saved silently.
 *     A rough match, no match, or a failed lookup stops the save once and
 *     explains why; pressing Save again keeps it anyway (a rough pin, or an
 *     address with no pin).
 */
export function useAddressPin(initial: Initial | null) {
  const [address, setAddressState] = useState(initial?.address ?? '')
  const [coordsText, setCoordsTextState] = useState(formatCoordinates(initial?.pin_lat ?? null, initial?.pin_lng ?? null))
  const [status, setStatus] = useState<AddressStatus>({ kind: 'idle' })

  // What was loaded, so we can tell edited from untouched.
  const loaded = useRef({
    address: initial?.address ?? '',
    coords: formatCoordinates(initial?.pin_lat ?? null, initial?.pin_lng ?? null),
    lat: initial?.pin_lat ?? null,
    lng: initial?.pin_lng ?? null,
  })
  // Set once a blocking message has been shown, so the next Save goes through.
  const overridden = useRef(false)
  const lastLookup = useRef<{ address: string; result: GeocodeResult | null } | null>(null)

  const load = useCallback((i: Initial) => {
    const coords = formatCoordinates(i.pin_lat, i.pin_lng)
    loaded.current = { address: i.address ?? '', coords, lat: i.pin_lat, lng: i.pin_lng }
    setAddressState(i.address ?? '')
    setCoordsTextState(coords)
    setStatus({ kind: 'idle' })
    overridden.current = false
    lastLookup.current = null
  }, [])

  function setAddress(value: string) {
    setAddressState(value)
    setStatus({ kind: 'idle' })
    overridden.current = false
  }

  function setCoordsText(value: string) {
    setCoordsTextState(value)
    setStatus({ kind: 'idle' })
    overridden.current = false
  }

  async function lookup(addr: string): Promise<GeocodeResult | null> {
    if (lastLookup.current?.address === addr) return lastLookup.current.result
    const result = await geocodeAddress(addr)
    lastLookup.current = { address: addr, result }
    return result
  }

  /** "Check address" button: look it up and show what matched, without saving. */
  async function check() {
    const addr = address.trim()
    if (!addr) return
    setStatus({ kind: 'checking' })
    try {
      const result = await lookup(addr)
      if (!result) setStatus({ kind: 'notfound' })
      else setStatus(result.approximate ? { kind: 'approx', label: result.label } : { kind: 'matched', label: result.label })
    } catch {
      setStatus({ kind: 'lookup-failed' })
    }
  }

  /**
   * Called from the form's submit handler. Returns the fields to save, or
   * null if the save should stop (a message is then showing).
   */
  async function resolveForSave(): Promise<AddressFields | null> {
    const addr = address.trim()
    const coords = coordsText.trim()

    if (!addr && !coords) {
      return { address: null, pin_lat: null, pin_lng: null }
    }

    // Hand-entered coordinates win.
    if (coords && coords !== loaded.current.coords) {
      const parsed = parseCoordinates(coords)
      if (!parsed) {
        setStatus({ kind: 'bad-coords' })
        return null
      }
      return { address: addr || null, pin_lat: parsed.lat, pin_lng: parsed.lng }
    }

    const addressUnchanged = addr === loaded.current.address
    const havePin = loaded.current.lat != null && loaded.current.lng != null
    if (addressUnchanged && havePin) {
      return { address: addr || null, pin_lat: loaded.current.lat, pin_lng: loaded.current.lng }
    }

    // Coordinates only (no address text) and unchanged: keep them.
    if (!addr) {
      return { address: null, pin_lat: loaded.current.lat, pin_lng: loaded.current.lng }
    }

    setStatus({ kind: 'checking' })
    let result: GeocodeResult | null
    try {
      result = await lookup(addr)
    } catch {
      if (overridden.current) return { address: addr, pin_lat: null, pin_lng: null }
      overridden.current = true
      setStatus({ kind: 'lookup-failed' })
      return null
    }

    if (!result) {
      if (overridden.current) return { address: addr, pin_lat: null, pin_lng: null }
      overridden.current = true
      setStatus({ kind: 'notfound' })
      return null
    }

    if (result.approximate && !overridden.current) {
      overridden.current = true
      setStatus({ kind: 'approx', label: result.label })
      return null
    }

    setStatus(result.approximate ? { kind: 'approx', label: result.label } : { kind: 'matched', label: result.label })
    return { address: addr, pin_lat: result.lat, pin_lng: result.lng }
  }

  return { address, setAddress, coordsText, setCoordsText, status, check, resolveForSave, load }
}

export type AddressPinState = ReturnType<typeof useAddressPin>
