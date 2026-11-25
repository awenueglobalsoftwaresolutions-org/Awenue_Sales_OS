import { getWebsiteEnv } from '../_lib/websiteProxy.js'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' })
  }

  const { apiKey } = getWebsiteEnv()
  const reqKey = req.headers['x-crm-key'] || req.headers['x-api-key'] || ''

  if (!apiKey || reqKey !== apiKey) {
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
    // Lookup the primary workspace
    const { data: workspaces } = await supabase.from('workspaces').select('id').limit(1)
    const workspaceId = workspaces?.[0]?.id

    if (!workspaceId) {
      return res.status(500).json({ error: 'No active workspace found in database.' })
    }

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
      }, { onConflict: 'workspace_id, external_id' }).catch(() => null)

      return res.status(200).json({ success: true, lead_id: leadId })
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
      }, { onConflict: 'workspace_id, external_id' }).catch(() => null)

      return res.status(200).json({ success: true, lead_id: leadId })
    }

    return res.status(400).json({ error: `Unknown type: ${type}` })
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal error' })
  }
}
