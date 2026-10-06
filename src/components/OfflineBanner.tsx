import { useSyncExternalStore } from 'react'
import { getOfflineStatus, subscribeOfflineStatus } from '../lib/offlineSnapshots'

function savedLabel(savedAt: number): string {
  const when = new Date(savedAt)
  const time = when.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (when.toDateString() === new Date().toDateString()) return time
  const date = when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${date} ${time}`
}

export function OfflineBanner() {
  const status = useSyncExternalStore(subscribeOfflineStatus, getOfflineStatus)
  if (!status) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-[900] bg-amber-100 px-3 py-1 text-center text-xs font-medium text-amber-900"
    >
      {status.slow ? 'Slow connection' : 'Offline'} · showing saved copy from {savedLabel(status.savedAt)}
    </div>
  )
}
