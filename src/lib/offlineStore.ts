const DB_NAME = 'hp-offline'
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    dbPromise.catch(() => {
      dbPromise = null
    })
  }
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = op(db.transaction(STORE, mode).objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// Every helper swallows IndexedDB failures (private windows, blocked storage):
// the app then simply behaves as it did before offline caching existed.
export function idbGet<T>(key: string): Promise<T | undefined> {
  return run<T | undefined>('readonly', (s) => s.get(key)).catch(() => undefined)
}

export function idbSet(key: string, value: unknown): Promise<boolean> {
  return run('readwrite', (s) => s.put(value, key))
    .then(() => true)
    .catch(() => false)
}

export function idbDelete(key: string): Promise<void> {
  return run('readwrite', (s) => s.delete(key))
    .then(() => undefined)
    .catch(() => undefined)
}

export function idbKeys(): Promise<string[]> {
  return run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())
    .then((keys) => keys.map(String))
    .catch(() => [])
}
