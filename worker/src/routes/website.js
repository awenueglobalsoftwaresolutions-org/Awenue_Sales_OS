import { HttpError } from '../lib/http.js'
import { authenticate, requirePermission } from '../lib/supabase.js'

const TIMEOUT_MS = 15000
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/

function mustWebsiteConfig(env) {
  const baseUrl = (env.AWENUE_WEBSITE_API_URL || '').replace(/\/$/, '')
  const apiKey = env.AWENUE_WEBSITE_API_KEY || env.ADMIN_API_KEY || ''
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

const DEFAULT_WORKSPACE_ID = '20081013-fea5-45bd-870e-b644d02edd43'

async function resolveWorkspace(admin) {
  try {
    const res = await admin.rest('workspaces?is_active=eq.true&select=id&limit=1')
    const [ws] = res.ok ? await res.json() : []
    if (ws?.id) return ws.id
  } catch {}

  try {
    const res = await admin.rest('workspaces?select=id&limit=1')
    const [ws] = res.ok ? await res.json() : []
    if (ws?.id) return ws.id
  } catch {}

  try {
    const res = await admin.rest('profiles?select=workspace_id&limit=1')
    const [p] = res.ok ? await res.json() : []
    if (p?.workspace_id) return p.workspace_id
  } catch {}

  return DEFAULT_WORKSPACE_ID
}

// POST /website/webhook and POST /api/website/webhook
export async function webhook(request, env) {
  const expectedKey = String(env.AWENUE_WEBSITE_API_KEY || env.ADMIN_API_KEY || '').trim().replace(/^["']|["']$/g, '')
  const reqKey = String(request.headers.get('x-crm-key') || request.headers.get('x-api-key') || '').trim().replace(/^["']|["']$/g, '')

  if (!expectedKey || reqKey !== expectedKey) {
    throw new HttpError(401, 'Unauthorized. Invalid API key.')
  }

  const payload = await request.json().catch(() => ({}))
  const { type, data } = payload
  if (!data || !type) {
    throw new HttpError(400, 'Missing type or data in request body.')
  }

  const { adminClient } = await import('../lib/supabase.js')
  const admin = adminClient(env)
  const workspaceId = await resolveWorkspace(admin)

  if (type === 'project_enquiry' || type === 'enquiry') {
    const e = data
    const email = e.email?.trim()?.toLowerCase() || null
    const nameParts = (e.fullName || 'Website Lead').trim().split(/\s+/)
    const firstName = nameParts[0] || 'Website'
    const lastName = nameParts.slice(1).join(' ') || ''
    const fullPhone = [e.countryCode, e.phone].filter(Boolean).join(' ')
    const primaryService = Array.isArray(e.selectedServices) ? e.selectedServices[0] : (e.selectedServices || '')

    const noteLines = [
      e.enquiryNumber ? `[Website Enquiry #${e.enquiryNumber}]` : '[Website Project Enquiry]',
      e.companyName ? `Company: ${e.companyName}` : null,
      e.websiteUrl ? `Website: ${e.websiteUrl}` : null,
      Array.isArray(e.selectedServices) && e.selectedServices.length ? `Selected Services: ${e.selectedServices.join(', ')}` : null,
      Array.isArray(e.selectedSubServices) && e.selectedSubServices.length ? `Sub-services: ${e.selectedSubServices.join(', ')}` : null,
      e.budgetRange ? `Budget: ${e.budgetRange}` : null,
      e.timeline ? `Timeline: ${e.timeline}` : null,
      e.referenceUrl ? `Reference: ${e.referenceUrl}` : null,
      e.projectScope ? `Project Scope:\n${e.projectScope}` : null,
    ].filter(Boolean).join('\n\n')

    let leadId = null

    if (email) {
      const searchRes = await admin.rest(`leads?workspace_id=eq.${workspaceId}&email=ilike.${encodeURIComponent(email)}&select=id,notes&limit=1`)
      const [existing] = searchRes.ok ? await searchRes.json() : []
      if (existing?.id) {
        leadId = existing.id
        await admin.rest(`leads?id=eq.${existing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            notes: existing.notes ? `${existing.notes}\n\n---\n${noteLines}` : noteLines,
            phone: fullPhone || undefined,
            updated_at: new Date().toISOString(),
          }),
        })
      }
    }

    if (!leadId) {
      const insRes = await admin.rest('leads', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone: fullPhone || null,
          website: e.websiteUrl || null,
          source: 'website',
          interested_service: primaryService || null,
          notes: noteLines,
          status: 'new',
          priority: 'medium',
          created_at: e.createdAt || new Date().toISOString(),
        }),
      })
      const [inserted] = insRes.ok ? await insRes.json() : []
      if (inserted?.id) leadId = inserted.id
    }

    try {
      await admin.rest('website_enquiries', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          external_id: String(e.id || Date.now()),
          enquiry_number: e.enquiryNumber || null,
          full_name: e.fullName || 'Website Lead',
          email,
          phone: fullPhone || null,
          country_code: e.countryCode || null,
          company_name: e.companyName || null,
          website_url: e.websiteUrl || null,
          project_scope: e.projectScope || null,
          selected_services: Array.isArray(e.selectedServices) ? e.selectedServices : [],
          selected_sub_services: Array.isArray(e.selectedSubServices) ? e.selectedSubServices : [],
          budget_range: e.budgetRange || null,
          timeline: e.timeline || null,
          reference_url: e.referenceUrl || null,
          status: e.status || 'NEW',
          lead_id: leadId,
          raw_data: e,
          created_at: e.createdAt || new Date().toISOString(),
        }),
      })
    } catch {}

    return {
      success: true,
      lead_id: leadId,
      message: 'Lead created successfully in CRM',
    }
  }

  if (type === 'contact_message' || type === 'contact') {
    const m = data
    const email = m.email?.trim()?.toLowerCase() || null
    const nameParts = (m.fullName || 'Website Contact').trim().split(/\s+/)
    const firstName = nameParts[0] || 'Website'
    const lastName = nameParts.slice(1).join(' ') || ''
    const fullPhone = [m.countryCode, m.phone].filter(Boolean).join(' ')

    const msgNotes = [
      m.messageNumber ? `[Website Contact Query #${m.messageNumber}]` : '[Website Contact Message]',
      m.subject ? `Subject: ${m.subject}` : null,
      m.message ? `Message:\n${m.message}` : null,
    ].filter(Boolean).join('\n\n')

    let leadId = null

    if (email) {
      const searchRes = await admin.rest(`leads?workspace_id=eq.${workspaceId}&email=ilike.${encodeURIComponent(email)}&select=id,notes&limit=1`)
      const [existing] = searchRes.ok ? await searchRes.json() : []
      if (existing?.id) {
        leadId = existing.id
        await admin.rest(`leads?id=eq.${existing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            notes: existing.notes ? `${existing.notes}\n\n---\n${msgNotes}` : msgNotes,
            updated_at: new Date().toISOString(),
          }),
        })
      }
    }

    if (!leadId) {
      const insRes = await admin.rest('leads', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone: fullPhone || null,
          source: 'website',
          interested_service: m.subject || 'Website Query',
          notes: msgNotes,
          status: 'new',
          priority: 'medium',
          created_at: m.createdAt || new Date().toISOString(),
        }),
      })
      const [inserted] = insRes.ok ? await insRes.json() : []
      if (inserted?.id) leadId = inserted.id
    }

    try {
      await admin.rest('website_contact_messages', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          external_id: String(m.id || Date.now()),
          message_number: m.messageNumber || null,
          full_name: m.fullName || 'Website Contact',
          email,
          phone: fullPhone || null,
          country_code: m.countryCode || null,
          subject: m.subject || null,
          message: m.message || null,
          status: m.status || 'NEW',
          lead_id: leadId,
          raw_data: m,
          created_at: m.createdAt || new Date().toISOString(),
        }),
      })
    } catch {}

    return {
      success: true,
      lead_id: leadId,
      message: 'Lead created successfully in CRM',
    }
  }

  throw new HttpError(400, `Unknown type: ${type}`)
}
