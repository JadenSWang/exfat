import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

import { supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  isLoading: boolean
  /** Dev-only: enter the app without real auth (e.g. to preview the UI in Expo Go). */
  devSignIn: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

// A throwaway session used only when the __DEV__ "skip sign-in" button is tapped.
// It is never created in production builds (the button is __DEV__-gated) and is
// cleared the moment a real session appears or the user signs out.
const DEV_SESSION = {
  access_token: 'dev',
  refresh_token: 'dev',
  token_type: 'bearer',
  expires_in: 3600,
  user: {
    id: 'dev-user',
    email: 'dev@local.test',
    aud: 'authenticated',
    app_metadata: {},
    user_metadata: {},
    created_at: '',
  },
} as unknown as Session

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [devSession, setDevSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setIsLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      // Real auth always wins over the dev bypass; signing out clears it too.
      if (nextSession || event === 'SIGNED_OUT') setDevSession(null)
      setIsLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const effectiveSession = session ?? devSession

  return (
    <AuthContext.Provider
      value={{
        session: effectiveSession,
        user: effectiveSession?.user ?? null,
        isLoading,
        devSignIn: () => setDevSession(DEV_SESSION),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
