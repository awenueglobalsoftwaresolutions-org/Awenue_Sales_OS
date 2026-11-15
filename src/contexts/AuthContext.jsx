import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState(() => new Set())
  const [profileReady, setProfileReady] = useState(false)
  const lastUser = useRef(null)

  const loadProfile = useCallback(async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*, workspace:workspaces(id,name)').eq('id', userId).maybeSingle()
    if (error) console.error('Failed to load profile', error)
    setProfile(data ?? null)
    if (data) {
      const { data: perms, error: permError } = await supabase.rpc('my_permissions')
      if (permError) console.error('Failed to load permissions', permError)
      setPermissions(new Set(perms || []))
    } else setPermissions(new Set())
    setProfileReady(true)
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) { lastUser.current = data.session.user.id; await loadProfile(data.session.user.id) }
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next) {
        if (next.user.id !== lastUser.current) { lastUser.current = next.user.id; setProfileReady(false) }
        setTimeout(() => loadProfile(next.user.id), 0) // avoid deadlock inside the auth callback
      } else { lastUser.current = null; setProfile(null); setPermissions(new Set()); setProfileReady(false) }
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [loadProfile])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    loading,
    profileReady,
    permissions,
    // 'leads.view' is granted by that exact permission, or by 'leads.manage' (everything in the module). The database enforces the same rule.
    can: (key) => permissions.has(key) || permissions.has(`${key.split('.')[0]}.manage`),
    has: (key) => permissions.has(key),
    isSuperAdmin: profile?.role === 'super_admin',
    isAdmin: permissions.has('settings.manage'),
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
    sendPasswordReset: (email) =>
      supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }),
    updatePassword: (password) => supabase.auth.updateUser({ password }),
    refreshProfile: () => session && loadProfile(session.user.id),
  }), [session, profile, permissions, loading, profileReady, loadProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
