import { idbDelete, idbGet, idbKeys, idbSet } from './offlineStore'

export type Snapshot<T> = { value: T; savedAt: number }
export type CacheMeta = { tripIds: string[]; syncedAt: number }

const META_KEY = 'meta'
const TRIPS_KEY = 'getTrips'
const SLOW_MS = 8000

export function snapshotKey(fn: string, id?: string | null): string {
  return id ? `${fn}:${id}` : fn
}

let metaCache: CacheMeta | null = null

export async function readMeta(): Promise<CacheMeta> {
  if (!metaCache) metaCache = (await idbGet<CacheMeta>(META_KEY)) ?? { tripIds: [], syncedAt: 0 }
  return metaCache
}

export async function writeMeta(meta: CacheMeta): Promise<void> {
  metaCache = meta
  await idbSet(META_KEY, meta)
}

export function readSnapshot<T>(key: string): Promise<Snapshot<T> | undefined> {
  return idbGet<Snapshot<T>>(key)
}

export async function writeSnapshot<T>(key: string, value: T, savedAt = Date.now()): Promise<void> {
  await idbSet(key, { value, savedAt } satisfies Snapshot<T>)
}

// Deletes every per-trip snapshot (key "<fn>:<tripId>") whose trip isn't kept.
// The trip list and the meta record have no trip id and stay.
export async function purgeSnapshots(keepTripIds: string[]): Promise<void> {
  const keep = new Set(keepTripIds)
  for (const key of await idbKeys()) {
    if (key === META_KEY || key === TRIPS_KEY) continue
    const colon = key.indexOf(':')
    if (colon === -1) continue
    if (!keep.has(key.slice(colon + 1))) await idbDelete(key)
  }
}

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message =
    e instanceof Error
      ? e.message
      : typeof e === 'object' && e !== null && 'message' in e
        ? String((e as { message: unknown }).message)
        : String(e)
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(message)
}

// What the "showing a saved copy" banner reads. A new object is only created
// when something changed, so useSyncExternalStore sees a stable value.
export type OfflineStatus = { savedAt: number; slow: boolean } | null

let status: OfflineStatus = null
const listeners = new Set<() => void>()

export function getOfflineStatus(): OfflineStatus {
  return status
}

export function subscribeOfflineStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setStatus(next: OfflineStatus) {
  const same =
    next === null ? status === null : status !== null && status.savedAt === next.savedAt && status.slow === next.slow
  if (same) return
  status = next
  listeners.forEach((l) => l())
}

async function persist<T>(key: string, tripId: string | null, value: T, onWritten?: () => void) {
  const meta = await readMeta()
  if (tripId !== null && !meta.tripIds.includes(tripId)) return
  await writeSnapshot(key, value)
  onWritten?.()
}

// Network first. If the request fails (or takes longer than SLOW_MS) and a
// saved copy exists, that copy is returned instead. Successful reads refresh
// the saved copy of a trip that is already being kept offline, so edits made
// in the app are in the copy by the time the signal drops.
export async function withSnapshot<T>(
  key: string,
  tripId: string | null,
  fetcher: () => Promise<T>,
  onWritten?: () => void,
): Promise<T> {
  const savedPromise = readSnapshot<T>(key)
  const attempt = fetcher()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const raced = await Promise.race([
      attempt.then((value) => ({ done: true as const, value })),
      new Promise<{ done: false }>((resolve) => {
        timer = setTimeout(() => resolve({ done: false }), SLOW_MS)
      }),
    ])
    if (raced.done) {
      setStatus(null)
      persist(key, tripId, raced.value, onWritten).catch(() => {})
      return raced.value
    }
    const saved = await savedPromise
    if (!saved) return await attempt
    attempt.catch(() => {})
    setStatus({ savedAt: saved.savedAt, slow: true })
    return saved.value
  } catch (e) {
    if (isNetworkError(e)) {
      const saved = await savedPromise
      if (saved) {
        setStatus({ savedAt: saved.savedAt, slow: false })
        return saved.value
      }
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}
