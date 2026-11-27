import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { apiConfigured, apiPost, apiPublicPost } from '../services/api'
import { logEvent } from '../services/audit'

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
    // Once per browser session, remember where this connection is so later activity can show an approximate location.
    try { if (data && apiConfigured && !sessionStorage.getItem('awenue.geo')) { sessionStorage.setItem('awenue.geo', '1'); apiPost('/audit/session', {}).catch(() => {}) } } catch { /* storage unavailable */ }
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
    // Signing in through the server records every attempt (with IP and device) and throttles repeated failures.
    // If the server can't be reached at all, fall back to a direct sign-in so people aren't locked out.
    signIn: async (email, password) => {
      if (!apiConfigured) return supabase.auth.signInWithPassword({ email, password })
      try {
        const s = await apiPublicPost('/auth/login', { email, password })
        const { error } = await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token })
        return { error }
      } catch (e) {
        if (e.status) return { error: { message: e.message } }
        return supabase.auth.signInWithPassword({ email, password })
      }
    },
    signInWithGoogle: async (redirectTo) => {
      return supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo || window.location.origin },
      })
    },
    signOut: async () => {
      await Promise.race([logEvent({ action: 'logout', module: 'auth', description: 'Signed out' }), new Promise((r) => setTimeout(r, 1500))])
      return supabase.auth.signOut()
    },
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
