const TIMEOUT_MS = 15000
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/

export function getWebsiteEnv(env = process.env) {
  const baseUrl = (env.AWENUE_WEBSITE_API_URL || '').replace(/^["']|["']$/g, '').replace(/\/$/, '')
  const apiKey = (env.AWENUE_WEBSITE_API_KEY || env.ADMIN_API_KEY || '').replace(/^["']|["']$/g, '').trim()
  const syncEndpoint = (env.AWENUE_CRM_SYNC_ENDPOINT || (baseUrl ? `${baseUrl}/api/crm/sync` : '')).replace(/^["']|["']$/g, '').replace(/\/$/, '')
  const enquiriesEndpoint = (env.AWENUE_PROJECT_ENQUIRIES_ENDPOINT || (baseUrl ? `${baseUrl}/api/project-enquiries` : '')).replace(/^["']|["']$/g, '').replace(/\/$/, '')
  const contactsEndpoint = (env.AWENUE_CONTACT_MESSAGES_ENDPOINT || (baseUrl ? `${baseUrl}/api/contact-messages` : '')).replace(/^["']|["']$/g, '').replace(/\/$/, '')
  return { baseUrl, apiKey, syncEndpoint, enquiriesEndpoint, contactsEndpoint }
}

export async function verifySupabaseAuth(authHeader, env = process.env, requiredPerm = null) {
  const token = (authHeader || '').startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) return { ok: false, status: 401, error: 'Please sign in again.' }

  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '')
  const supabaseAnon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''
  if (!supabaseUrl || !supabaseAnon) {
    return { ok: false, status: 500, error: 'Authentication is not configured on the server.' }
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnon, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { ok: false, status: 401, error: 'Your session has expired. Please sign in again.' }

    if (requiredPerm) {
      const permRes = await fetch(`${supabaseUrl}/rest/v1/rpc/has_permission`, {
        method: 'POST',
        headers: { apikey: supabaseAnon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_key: requiredPerm }),
        signal: AbortSignal.timeout(8000),
      })
      if (!permRes.ok || (await permRes.json().catch(() => false)) !== true) {
        return { ok: false, status: 403, error: 'You do not have permission to do that.' }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, status: 502, error: 'Could not verify session.' }
  }
}

export async function forwardWebsiteRequest(targetUrl, { method = 'GET', apiKey, body }) {
  if (!targetUrl || !apiKey) {
    return { status: 500, data: { error: 'Website API integration is not configured on the server.' } }
  }
  try {
    const res = await fetch(targetUrl, {
      method,
      headers: { 'x-crm-key': apiKey, 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return {
        status: res.status,
        data: { error: data?.message || data?.error || `Website API returned status ${res.status}.` },
      }
    }
    return { status: 200, data: data ?? { success: true } }
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { status: 504, data: { error: 'Main website API timed out. Please try again.' } }
    }
    return { status: 502, data: { error: 'Could not reach the main website API.' } }
  }
}

export function sanitizeId(id) {
  return SAFE_ID.test(id || '') ? id : null
}

export function pickPatchBody(raw) {
  const payload = {}
  if (raw?.status !== undefined) payload.status = String(raw.status)
  if (raw?.assignedTo !== undefined) payload.assignedTo = raw.assignedTo === null ? null : String(raw.assignedTo)
  if (raw?.internalNotes !== undefined) payload.internalNotes = raw.internalNotes === null ? null : String(raw.internalNotes)
  return payload
}
