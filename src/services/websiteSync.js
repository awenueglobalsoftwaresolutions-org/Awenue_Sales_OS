import { supabase } from '../lib/supabase'
import { syncWebsiteData, WEB_TO_CRM_STATUS } from './website'

/**
 * Fetches website enquiries and contact messages from the main website API,
 * and directly stores and updates them in the Supabase database (`leads`,
 * `website_enquiries`, and `website_contact_messages`).
 */
export async function syncAndPersistWebsiteData(profile, { type = 'all', limit = 200 } = {}) {
  // 1. Fetch live data from Main Website API
  const websiteData = await syncWebsiteData({ type, limit })
  const enquiries = websiteData?.projectEnquiries || []
  const contacts = websiteData?.contactMessages || []
  const workspaceId = profile?.workspace_id

  if (!workspaceId) return websiteData

  const stats = {
    syncedAt: new Date().toISOString(),
    enquiriesCount: enquiries.length,
    contactsCount: contacts.length,
    leadsCreated: 0,
    leadsUpdated: 0,
    messagesStored: 0,
  }

  // 2. Persist Project Enquiries directly into Supabase `leads` & `website_enquiries`
  for (const e of enquiries) {
    if (!e.email && !e.fullName) continue
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
      e.internalNotes ? `Internal Notes: ${e.internalNotes}` : null,
    ].filter(Boolean).join('\n\n')

    let leadId = null

    // Check if lead already exists in CRM leads table
    let existingLead = null
    if (email) {
      const { data } = await supabase
        .from('leads')
        .select('id, notes, status, phone, website')
        .eq('workspace_id', workspaceId)
        .ilike('email', email)
        .maybeSingle()
      existingLead = data
    }

    if (existingLead) {
      leadId = existingLead.id
      const updatePayload = {
        phone: existingLead.phone || fullPhone || null,
        website: existingLead.website || e.websiteUrl || null,
        updated_at: new Date().toISOString(),
      }
      if (primaryService) updatePayload.interested_service = primaryService

      // Append new enquiry details if not already present
      if (noteLines && (!existingLead.notes || !existingLead.notes.includes(e.enquiryNumber || 'Website Project Enquiry'))) {
        updatePayload.notes = existingLead.notes ? `${existingLead.notes}\n\n---\n${noteLines}` : noteLines
      }

      await supabase.from('leads').update(updatePayload).eq('id', existingLead.id)
      stats.leadsUpdated++
    } else {
      // Insert new lead into CRM leads table
      const insertPayload = {
        workspace_id: workspaceId,
        first_name: firstName,
        last_name: lastName,
        email: email,
        phone: fullPhone || null,
        website: e.websiteUrl || null,
        source: 'website',
        interested_service: primaryService || null,
        notes: noteLines,
        status: WEB_TO_CRM_STATUS[e.status] || 'new',
        priority: 'medium',
        created_by: profile?.id || null,
        created_at: e.createdAt || new Date().toISOString(),
      }
      const { data: created, error } = await supabase.from('leads').insert(insertPayload).select('id').maybeSingle()
      if (!error && created) {
        leadId = created.id
        stats.leadsCreated++
      }
    }

    // Also persist structured record into `website_enquiries` table if available
    try {
      await supabase.from('website_enquiries').upsert({
        workspace_id: workspaceId,
        external_id: String(e.id),
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
        assigned_to: e.assignedTo || null,
        internal_notes: e.internalNotes || null,
        lead_id: leadId,
        raw_data: e,
        created_at: e.createdAt || new Date().toISOString(),
        updated_at: e.updatedAt || new Date().toISOString(),
      }, { onConflict: 'workspace_id, external_id' })
    } catch {
      // Handled silently if website_enquiries table is not yet migrated
    }
  }

  // 3. Persist Contact Messages directly into `leads` & `website_contact_messages`
  for (const m of contacts) {
    if (!m.email && !m.fullName) continue
    const email = m.email?.trim()?.toLowerCase() || null
    const nameParts = (m.fullName || 'Website Contact').trim().split(/\s+/)
    const firstName = nameParts[0] || 'Website'
    const lastName = nameParts.slice(1).join(' ') || ''
    const fullPhone = [m.countryCode, m.phone].filter(Boolean).join(' ')

    const msgNotes = [
      m.messageNumber ? `[Website Contact Query #${m.messageNumber}]` : '[Website Contact Message]',
      m.subject ? `Subject: ${m.subject}` : null,
      m.message ? `Message:\n${m.message}` : null,
      m.internalNotes ? `Internal Notes: ${m.internalNotes}` : null,
    ].filter(Boolean).join('\n\n')

    let leadId = null

    // Ensure it exists in CRM leads table so sales team has immediate access
    if (email) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id, notes')
        .eq('workspace_id', workspaceId)
        .ilike('email', email)
        .maybeSingle()

      if (existingLead) {
        leadId = existingLead.id
        if (msgNotes && (!existingLead.notes || !existingLead.notes.includes(m.messageNumber || 'Website Contact Query'))) {
          await supabase.from('leads').update({
            notes: existingLead.notes ? `${existingLead.notes}\n\n---\n${msgNotes}` : msgNotes,
            updated_at: new Date().toISOString(),
          }).eq('id', existingLead.id)
          stats.leadsUpdated++
        }
      } else {
        const { data: created, error } = await supabase.from('leads').insert({
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
          created_by: profile?.id || null,
          created_at: m.createdAt || new Date().toISOString(),
        }).select('id').maybeSingle()

        if (!error && created) {
          leadId = created.id
          stats.leadsCreated++
        }
      }
    }

    // Also persist structured record into `website_contact_messages` table if available
    try {
      await supabase.from('website_contact_messages').upsert({
        workspace_id: workspaceId,
        external_id: String(m.id),
        message_number: m.messageNumber || null,
        full_name: m.fullName || 'Website Contact',
        email: email,
        phone: fullPhone || null,
        country_code: m.countryCode || null,
        subject: m.subject || null,
        message: m.message || null,
        status: m.status || 'NEW',
        assigned_to: m.assignedTo || null,
        internal_notes: m.internalNotes || null,
        lead_id: leadId,
        raw_data: m,
        created_at: m.createdAt || new Date().toISOString(),
        updated_at: m.updatedAt || new Date().toISOString(),
      }, { onConflict: 'workspace_id, external_id' })
      stats.messagesStored++
    } catch {
      // Handled silently if table not yet migrated
    }
  }

  return { ...websiteData, stats }
}
