import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'
import { db, type Profile } from './db'

interface AuthState {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setLoading(false) })
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    return () => subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  const refreshProfile = async () => {
    if (!userId) { setProfile(null); return }
    const { data } = await db.from('profiles').select('id, display_name, phone').eq('id', userId).maybeSingle()
    setProfile(data as Profile | null)
  }
  useEffect(() => { void refreshProfile() }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo<AuthState>(() => ({
    session, user: session?.user ?? null, profile, loading, refreshProfile,
    signOut: async () => { await supabase.auth.signOut() },
  }), [session, profile, loading]) // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fora do AuthProvider')
  return c
}
