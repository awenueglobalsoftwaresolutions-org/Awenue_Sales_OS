import { supabase } from '../lib/supabase'

// The Cloudflare Worker (files, user management and, later, integrations). VITE_FILES_API_URL still works for older .env files.
export const API_URL = (import.meta.env.VITE_API_URL || import.meta.env.VITE_FILES_API_URL || '').replace(/\/$/, '')
export const apiConfigured = Boolean(API_URL)

export async function accessToken() {
  const { data } = await supabase.auth.getSession()
  if (!data.session) throw new Error('Your session has expired. Please sign in again.')
  return data.session.access_token
}

export async function apiPost(path, body) {
  const token = await accessToken()
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  let res = null
  let data = null

  if (apiConfigured) {
    try {
      res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      data = await res.json().catch(() => ({}))
    } catch {
      // Remote worker network unreachable, proceed to fallback
    }
  }

  // If remote worker returned 404 (route not yet deployed to Cloudflare) or was unreachable,
  // gracefully fallback to same-origin / local Vite dev server / Vercel API
  if (!res || res.status === 404) {
    try {
      const localRes = await fetch(path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (localRes && localRes.ok) {
        return await localRes.json().catch(() => ({}))
      }
      if (localRes && !localRes.ok && localRes.status !== 404) {
        const localData = await localRes.json().catch(() => ({}))
        throw new Error(localData.error || 'Request failed. Please try again.')
      }
    } catch (e) {
      if (e.message && e.message !== 'Request failed. Please try again.') throw e
    }
  }

  if (!res || !res.ok) throw new Error(data?.error || 'Request failed. Please try again.')
  return data
}

// For calls made before anyone is signed in (the audited sign-in).
export async function apiPublicPost(path, body) {
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed. Please try again.'), { status: res.status })
  return data
}
