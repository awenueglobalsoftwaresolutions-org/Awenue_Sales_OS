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
  if (!apiConfigured) throw new Error('The server API isn’t connected. Set VITE_API_URL (see the README).')
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST', headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed. Please try again.')
  return data
}

// For calls made before anyone is signed in (the audited sign-in).
export async function apiPublicPost(path, body) {
  const res = await fetch(`${API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed. Please try again.'), { status: res.status })
  return data
}
