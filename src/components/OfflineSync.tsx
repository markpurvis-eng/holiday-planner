import { useEffect } from 'react'
import { useAuth } from '../lib/auth'
import { syncOfflineCache } from '../lib/offlineCache'

export function OfflineSync() {
  const { session } = useAuth()
  const signedIn = !!session

  useEffect(() => {
    if (!signedIn) return
    const run = () => {
      if (document.visibilityState === 'visible') void syncOfflineCache()
    }
    run()
    document.addEventListener('visibilitychange', run)
    window.addEventListener('online', run)
    return () => {
      document.removeEventListener('visibilitychange', run)
      window.removeEventListener('online', run)
    }
  }, [signedIn])

  return null
}
