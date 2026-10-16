import { useCallback, useEffect, useState } from 'react'
import { getOfflineSummary, syncOfflineCacheNow } from '../lib/offlineCache'
import type { OfflineSummary, SyncResult } from '../lib/offlineCache'
import { formatDate } from '../lib/format'

function syncedLabel(at: number): string {
  const when = new Date(at)
  const time = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (when.toDateString() === new Date().toDateString()) return `today ${time}`
  const date = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${date} ${time}`
}

const NOTICES: Record<SyncResult, string> = {
  ok: 'Synced.',
  offline: 'No signal, so nothing was synced. The saved copy is unchanged.',
  failed: 'The sync did not finish. The previous saved copy is unchanged; try again.',
}

// Settings > Offline: what is saved on this device for use with no signal, when
// it was last refreshed, and a button to refresh it now.
export function OfflineStatusCard() {
  const [summary, setSummary] = useState<OfflineSummary | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setSummary(await getOfflineSummary())
    } catch {
      setSummary(null)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleSync() {
    setSyncing(true)
    setNotice(null)
    const result = await syncOfflineCacheNow()
    setNotice(NOTICES[result])
    await refresh()
    setSyncing(false)
  }

  const trips = summary?.trips ?? []

  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-100">
      {summary === null ? (
        <p className="text-sm text-stone-500">Checking the saved copy…</p>
      ) : trips.length === 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-stone-700">Nothing saved offline right now</p>
          <p className="text-xs text-stone-400">
            A trip is saved from the day before it starts until the day after it ends.
            {summary.next
              ? ` ${summary.next.name} will be saved from ${formatDate(summary.next.savedFrom)}, the next time the app is opened with a signal.`
              : ' No upcoming trips.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {trips.map((t) => (
            <div key={t.id}>
              <p className="text-sm font-medium text-stone-700">Saved offline: {t.name}</p>
              <p className="text-xs text-stone-400">
                {formatDate(t.startDate)} to {formatDate(t.endDate)}
                {t.documents > 0
                  ? ` · ${t.documentsCached} of ${t.documents} document files on this device`
                  : ' · no document files'}
              </p>
              {t.documents > t.documentsCached && (
                <p className="text-xs text-amber-700">
                  Some files are not saved yet. Press Sync now with a signal (files over 15 MB are never saved).
                </p>
              )}
            </div>
          ))}
          <p className="text-xs text-stone-400">
            {summary.syncedAt ? `Last synced ${syncedLabel(summary.syncedAt)}` : 'Not synced yet'}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing}
          className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-50"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
        {notice && <span className="text-xs text-stone-400">{notice}</span>}
      </div>
    </div>
  )
}
