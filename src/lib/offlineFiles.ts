import type { Document } from './types'
import { readMeta, readSnapshot, snapshotKey } from './offlineSnapshots'

// Must match the cacheName of the runtime-caching rule in vite.config.ts, which
// is what lets the service worker serve these files to <img> tags offline.
export const FILE_CACHE = 'trip-files-v1'
const MAX_FILE_BYTES = 15 * 1024 * 1024

const normalise = (url: string) => new URL(url, location.href).href

function dataSaverOn(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return connection?.saveData === true
}

async function download(cache: Cache, url: string): Promise<void> {
  try {
    const res = await fetch(url)
    if (!res.ok) return
    if (Number(res.headers.get('content-length') ?? 0) > MAX_FILE_BYTES) {
      void res.body?.cancel()
      return
    }
    await cache.put(url, res)
  } catch {
    return
  }
}

async function doReconcile(): Promise<void> {
  if (typeof caches === 'undefined') return
  const meta = await readMeta()
  const wanted = new Map<string, string>()
  for (const tripId of meta.tripIds) {
    const snap = await readSnapshot<Document[]>(snapshotKey('getDocuments', tripId))
    for (const doc of snap?.value ?? []) {
      if (doc.file_url) wanted.set(normalise(doc.file_url), doc.file_url)
    }
  }
  const cache = await caches.open(FILE_CACHE)
  const have = new Set<string>()
  for (const req of await cache.keys()) {
    if (wanted.has(req.url)) have.add(req.url)
    else await cache.delete(req)
  }
  if (!navigator.onLine || dataSaverOn()) return
  for (const [href, url] of wanted) {
    if (!have.has(href)) await download(cache, url)
  }
}

let running: Promise<void> = Promise.resolve()
let again = false

// Makes the file cache match the documents of the trips being kept offline:
// downloads what is missing, deletes what isn't wanted. Calls are queued so two
// never run at once; a call made while one is running triggers one more pass.
export function reconcileFiles(): Promise<void> {
  if (again) return running
  again = true
  running = running
    .catch(() => {})
    .then(() => {
      again = false
      return doReconcile()
    })
    .catch(() => {})
  return running
}

// A whole file as bytes, for pdf.js, which would otherwise issue range
// requests that Cache Storage can't answer. Null when the file isn't cached.
export async function getCachedFile(url: string): Promise<ArrayBuffer | null> {
  try {
    if (typeof caches === 'undefined') return null
    const res = await caches.match(url, { cacheName: FILE_CACHE })
    return res ? await res.arrayBuffer() : null
  } catch {
    return null
  }
}
