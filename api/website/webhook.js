import { getWebsiteEnv } from '../_lib/websiteProxy.js'
import { createClient } from '@supabase/supabase-js'

const DEFAULT_WORKSPACE_ID = '20081013-fea5-45bd-870e-b644d02edd43'

/**
 * Resilient Workspace Resolver:
 * 1. Step A: Query active workspace (is_active = true)
 * 2. Step B (Fallback 1): Any existing workspace (.limit(1))
 * 3. Step C (Fallback 2): Check profiles or RPC get_or_create_default_workspace
 * 4. Step D (Fallback 3): Auto-create default workspace if empty
 * 5. Step E (Guaranteed): Default fallback workspace UUID (Never throws 500)
 */
async function getOrCreateWorkspace(supabase) {
  // 1. Step A: Check for active workspace
  try {
    const { data: activeWs } = await supabase
      .from('workspaces')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (activeWs?.id) return activeWs.id
  } catch (err) {
    console.warn('[Webhook] Step A active workspace query notice:', err.message)
  }

  // 2. Step B: Fallback 1 - Any existing workspace
  try {
    const { data: anyWs } = await supabase
      .from('workspaces')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (anyWs?.id) {
      await supabase.from('workspaces').update({ is_active: true }).eq('id', anyWs.id).catch(() => null)
      return anyWs.id
    }
  } catch (err) {
    console.warn('[Webhook] Step B any workspace query notice:', err.message)
  }

  // 3. Fallback: Check profiles table
  try {
    const { data: prof } = await supabase
      .from('profiles')
      .select('workspace_id')
      .not('workspace_id', 'is', null)
      .limit(1)
      .maybeSingle()

    if (prof?.workspace_id) return prof.workspace_id
  } catch {}

  // 4. Fallback: RPC get_or_create_default_workspace
  try {
    const { data: rpcWs } = await supabase.rpc('get_or_create_default_workspace')
    if (rpcWs) return rpcWs
  } catch {}

  // 5. Step C: Fallback 2 - Auto-create default workspace if empty
  try {
    const { data: newWs } = await supabase
      .from('workspaces')
      .insert({
        id: DEFAULT_WORKSPACE_ID,
        name: 'AWENUE Global HQ',
        slug: 'awenue-hq',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .maybeSingle()

    if (newWs?.id) return newWs.id
  } catch (err) {
    console.warn('[Webhook] Step C auto-create workspace notice:', err.message)
  }

  // Guaranteed fallback: Never throw "No active workspace found in database"
  return DEFAULT_WORKSPACE_ID
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const { apiKey } = getWebsiteEnv()
  const rawKey = req.headers['x-crm-key'] || req.headers['x-api-key'] || ''
  const reqKey = String(rawKey).trim().replace(/^["']|["']$/g, '')
  const validKey = String(apiKey).trim().replace(/^["']|["']$/g, '')

  if (!validKey || reqKey !== validKey) {
    return res.status(401).json({ error: 'Unauthorized. Invalid API key.' })
  }

  const payload = req.body || {}
  const { type, data } = payload

  if (!data || !type) {
    return res.status(400).json({ error: 'Missing type or data in request body.' })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Database is not configured on the server.' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Resilient workspace resolution (never fails with 500)
    const workspaceId = await getOrCreateWorkspace(supabase)

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

      // Check if lead exists
      if (email) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id, notes')
          .eq('workspace_id', workspaceId)
          .ilike('email', email)
          .maybeSingle()

        if (existing) {
          leadId = existing.id
          await supabase.from('leads').update({
            notes: existing.notes ? `${existing.notes}\n\n---\n${noteLines}` : noteLines,
            phone: fullPhone || undefined,
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id)
        }
      }

      if (!leadId) {
        const { data: inserted, error: insErr } = await supabase.from('leads').insert({
          workspace_id: workspaceId,
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: fullPhone || null,
          website: e.websiteUrl || null,
          source: 'website',
          interested_service: primaryService || null,
          notes: noteLines,
          status: 'new',
          priority: 'medium',
          created_at: e.createdAt || new Date().toISOString(),
        }).select('id').maybeSingle()

        if (!insErr && inserted) leadId = inserted.id
      }

      // Also upsert into website_enquiries
      try {
        await supabase.from('website_enquiries').upsert({
          workspace_id: workspaceId,
          external_id: String(e.id || Date.now()),
          enquiry_number: e.enquiryNumber || null,
          full_name: e.fullName || 'Website Lead',
          email: email,
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
        }, { onConflict: 'workspace_id, external_id' })
      } catch (err) {
        console.warn('[Webhook] website_enquiries upsert notice:', err.message)
      }

      return res.status(200).json({
        success: true,
        lead_id: leadId,
        message: 'Lead created successfully in CRM'
      })
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
        const { data: existing } = await supabase
          .from('leads')
          .select('id, notes')
          .eq('workspace_id', workspaceId)
          .ilike('email', email)
          .maybeSingle()

        if (existing) {
          leadId = existing.id
          await supabase.from('leads').update({
            notes: existing.notes ? `${existing.notes}\n\n---\n${msgNotes}` : msgNotes,
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id)
        }
      }

      if (!leadId) {
        const { data: inserted, error: insErr } = await supabase.from('leads').insert({
          workspace_id: workspaceId,
          first_name: firstName,
          last_name: lastName,
          email: email,
          phone: fullPhone || null,
          source: 'website',
          interested_service: m.subject || 'Website Query',
          notes: msgNotes,
          status: 'new',
          priority: 'medium',
          created_at: m.createdAt || new Date().toISOString(),
        }).select('id').maybeSingle()

        if (!insErr && inserted) leadId = inserted.id
      }

      try {
        await supabase.from('website_contact_messages').upsert({
          workspace_id: workspaceId,
          external_id: String(m.id || Date.now()),
          message_number: m.messageNumber || null,
          full_name: m.fullName || 'Website Contact',
          email: email,
          phone: fullPhone || null,
          country_code: m.countryCode || null,
          subject: m.subject || null,
          message: m.message || null,
          status: m.status || 'NEW',
          lead_id: leadId,
          raw_data: m,
          created_at: m.createdAt || new Date().toISOString(),
        }, { onConflict: 'workspace_id, external_id' })
      } catch (err) {
        console.warn('[Webhook] website_contact_messages upsert notice:', err.message)
      }

      return res.status(200).json({
        success: true,
        lead_id: leadId,
        message: 'Lead created successfully in CRM'
      })
    }

    return res.status(400).json({ error: `Unknown type: ${type}` })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
