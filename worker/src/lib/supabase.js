import { HttpError } from './http.js'

// Caller identity. Every query made through `sb` carries the user's own JWT, so Postgres row level security decides what they can touch.
export async function authenticate(request, env) {
  const h = request.headers.get('Authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7) : ''
  if (!token) throw new HttpError(401, 'Please sign in again.')
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  const user = await r.json()
  const sb = (path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init, headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  return { user, sb, token }
}

// Service-role access (bypasses row level security). Only used for things a browser must never do, after the caller's permission has been verified.
export function adminClient(env) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError(500, 'The server is missing SUPABASE_SERVICE_ROLE_KEY. See the README.')
  const headers = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
  return {
    auth: (path, init = {}) => fetch(`${env.SUPABASE_URL}/auth/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } }),
    rest: (path, init = {}) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } }),
  }
}

// Ask the database (as the caller) whether they hold a permission.
export async function requirePermission(ctx, key) {
  const r = await ctx.sb('rpc/has_permission', { method: 'POST', body: JSON.stringify({ p_key: key }) })
  if (!r.ok || (await r.json()) !== true) throw new HttpError(403, 'You do not have permission to do that.')
}

export async function myProfile(ctx) {
  const r = await ctx.sb(`profiles?id=eq.${ctx.user.id}&select=id,role,workspace_id,is_active,full_name,email`)
  const [p] = r.ok ? await r.json() : []
  if (!p || !p.is_active) throw new HttpError(403, 'Your account is not active.')
  return p
}
