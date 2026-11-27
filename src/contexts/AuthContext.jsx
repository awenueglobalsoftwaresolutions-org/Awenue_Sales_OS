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
  const [authError, setAuthError] = useState('')
  const lastUser = useRef(null)

  const loadProfile = useCallback(async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*, workspace:workspaces(id,name)').eq('id', userId).maybeSingle()
    if (error) console.error('Failed to load profile', error)

    // Strict Database Whitelist Check:
    // Only users who exist in the database and have is_active === true are permitted.
    if (!data || data.is_active === false) {
      console.warn('Unauthorized login attempt: account is not active or not in database.')
      await supabase.auth.signOut()
      setSession(null)
      setProfile(null)
      setPermissions(new Set())
      setProfileReady(true)
      setAuthError('Access restricted: This account is not authorized in Awenue Sales OS. Please contact an administrator.')
      return
    }

    setAuthError('')
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
    authError,
    setAuthError,
    permissions,
    // Enhanced RBAC, PBAC & ABAC evaluation:
    // 1. Super Admin is omnipotent: always has full system clearance.
    // 2. ABAC: Module restriction: if profile.allowed_modules is configured, module MUST be allowed.
    // 3. ABAC: Export restriction: if action is export and profile.export_allowed is false, blocked.
    // 4. PBAC & RBAC: checks effective permissions loaded from the database engine.
    can: (key) => {
      if (profile?.role === 'super_admin') return true
      const [module, action] = key.split('.')
      if (profile?.allowed_modules && Array.isArray(profile.allowed_modules) && profile.allowed_modules.length > 0) {
        if (!profile.allowed_modules.includes(module)) return false
      }
      if (action === 'export' && profile?.export_allowed === false) return false
      return permissions.has(key) || permissions.has(`${module}.manage`)
    },
    has: (key) => {
      if (profile?.role === 'super_admin') return true
      const [module, action] = key.split('.')
      if (profile?.allowed_modules && Array.isArray(profile.allowed_modules) && profile.allowed_modules.length > 0) {
        if (!profile.allowed_modules.includes(module)) return false
      }
      if (action === 'export' && profile?.export_allowed === false) return false
      return permissions.has(key)
    },
    canAccessModule: (module) => {
      if (profile?.role === 'super_admin') return true
      if (profile?.allowed_modules && Array.isArray(profile.allowed_modules) && profile.allowed_modules.length > 0) {
        if (!profile.allowed_modules.includes(module)) return false
      }
      return permissions.has(`${module}.view`) || permissions.has(`${module}.manage`)
    },
    canExport: (module) => {
      if (profile?.role === 'super_admin') return true
      if (profile?.export_allowed === false) return false
      if (profile?.allowed_modules && Array.isArray(profile.allowed_modules) && profile.allowed_modules.length > 0) {
        if (!profile.allowed_modules.includes(module)) return false
      }
      return permissions.has(`${module}.export`) || permissions.has(`${module}.manage`)
    },
    recordScope: profile?.record_scope || 'all',
    isSuperAdmin: profile?.role === 'super_admin',
    isAdmin: profile?.role === 'super_admin' || permissions.has('settings.manage'),
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
