import { HttpError } from '../lib/http.js'
import { authenticate, requirePermission } from '../lib/supabase.js'

const TIMEOUT_MS = 15000
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/

function mustWebsiteConfig(env) {
  const baseUrl = (env.AWENUE_WEBSITE_API_URL || '').replace(/\/$/, '')
  const apiKey = env.AWENUE_WEBSITE_API_KEY || ''
  if (!baseUrl || !apiKey) {
    throw new HttpError(500, 'Website API integration is not configured on the server.')
  }
  return { baseUrl, apiKey }
}

async function proxyWebsite(targetUrl, { method = 'GET', apiKey, body }) {
  let res
  try {
    res = await fetch(targetUrl, {
      method,
      headers: {
        'x-crm-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new HttpError(504, 'Main website API timed out. Please try again.')
    }
    throw new HttpError(502, 'Could not reach the main website API.')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = data?.message || data?.error || `Website API returned status ${res.status}.`
    throw new HttpError(res.status >= 400 && res.status < 600 ? res.status : 502, msg)
  }
  return data ?? { success: true }
}

function pickPatchBody(raw) {
  const payload = {}
  if (raw?.status !== undefined) payload.status = String(raw.status)
  if (raw?.assignedTo !== undefined) payload.assignedTo = raw.assignedTo === null ? null : String(raw.assignedTo)
  if (raw?.internalNotes !== undefined) payload.internalNotes = raw.internalNotes === null ? null : String(raw.internalNotes)
  return payload
}

// GET /website/sync
export async function sync(request, url, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'leads.view')
  const { baseUrl, apiKey } = mustWebsiteConfig(env)

  const syncBase = (env.AWENUE_CRM_SYNC_ENDPOINT || `${baseUrl}/api/crm/sync`).replace(/\/$/, '')
  const target = new URL(syncBase)
  for (const key of ['type', 'enquiryStatus', 'contactStatus', 'search', 'since', 'limit']) {
    const val = url.searchParams.get(key)
    if (val) target.searchParams.set(key, val)
  }

  return await proxyWebsite(target.toString(), { method: 'GET', apiKey })
}

// PATCH /website/project-enquiries/:id
export async function updateEnquiry(request, id, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'leads.edit')
  if (!SAFE_ID.test(id || '')) throw new HttpError(400, 'Invalid enquiry ID.')
  const { baseUrl, apiKey } = mustWebsiteConfig(env)

  const raw = await request.json().catch(() => ({}))
  const endpointBase = (env.AWENUE_PROJECT_ENQUIRIES_ENDPOINT || `${baseUrl}/api/project-enquiries`).replace(/\/$/, '')
  return await proxyWebsite(`${endpointBase}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    apiKey,
    body: pickPatchBody(raw),
  })
}

// PATCH /website/contact-messages/:id
export async function updateContact(request, id, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'leads.edit')
  if (!SAFE_ID.test(id || '')) throw new HttpError(400, 'Invalid message ID.')
  const { baseUrl, apiKey } = mustWebsiteConfig(env)

  const raw = await request.json().catch(() => ({}))
  const endpointBase = (env.AWENUE_CONTACT_MESSAGES_ENDPOINT || `${baseUrl}/api/contact-messages`).replace(/\/$/, '')
  return await proxyWebsite(`${endpointBase}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    apiKey,
    body: pickPatchBody(raw),
  })
}
