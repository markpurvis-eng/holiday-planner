import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js'
import { Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'

type AuthContextValue = {
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

// With no signal, supabase-js can't refresh an expired access token and reports
// no session, which would bounce the app to the login screen mid-trip. The
// stored session is still there, so use it for the UI; data comes from the
// offline copy, and the real session refreshes itself once a signal returns.
function readStoredSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue
      const parsed = JSON.parse(localStorage.getItem(key) ?? 'null')
      if (parsed?.access_token && parsed?.user) return parsed as Session
    }
  } catch {
    return null
  }
  return null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      const noSignal = !data.session && (!navigator.onLine || (!!error && isAuthRetryableFetchError(error)))
      setSession(noSignal ? readStoredSession() : data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'INITIAL_SESSION' && !newSession) return
      setSession(newSession)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? error.message : null }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-teal-700">
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
