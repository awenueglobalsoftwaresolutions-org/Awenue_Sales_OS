import { supabase } from '../lib/supabase'
import { syncWebsiteData, updateWebsiteEnquiry, updateWebsiteContactMessage, WEB_TO_CRM_STATUS } from './website'
import { createActivity } from './activities'

export const CRM_TO_WEB_STATUS = {
  new: 'NEW',
  contacted: 'CONTACTED',
  qualified: 'IN_REVIEW',
  converted: 'CONVERTED',
  unqualified: 'ARCHIVED',
  lost: 'CLOSED',
}

export const CRM_TO_MSG_STATUS = {
  new: 'NEW',
  contacted: 'IN_PROGRESS',
  qualified: 'IN_PROGRESS',
  converted: 'RESOLVED',
  unqualified: 'ARCHIVED',
  lost: 'ARCHIVED',
}

/**
 * Detects if an enquiry or message is a test/dummy case so it never pollutes the CRM.
 */
export function isTestRecord(item) {
  if (!item) return false
  const email = (item.email || '').toLowerCase().trim()
  const name = (item.fullName || item.full_name || `${item.first_name || ''} ${item.last_name || ''}`).toLowerCase().trim()
  const subject = (item.subject || '').toLowerCase()
  const message = (item.message || item.projectScope || item.project_scope || item.projectDescription || '').toLowerCase()

  return (
    email.endsWith('@example.com') ||
    email.includes('test.client') ||
    email.includes('test.project') ||
    email.includes('test.contact') ||
    email.startsWith('test.') ||
    email.startsWith('livetest@') ||
    email.includes('antigravity') ||
    name.includes('test lead') ||
    name.includes('test client') ||
    name.includes('test contact') ||
    name.includes('antigravity test') ||
    name.includes('live test') ||
    subject.includes('testing webhook') ||
    message.includes('testing live contact form') ||
    message.includes('testing webhook')
  )
}

/**
 * Reads website enquiries and contact messages directly from the Supabase database.
 */
export async function loadWebsiteQueriesFromDatabase(workspaceId) {
  if (!workspaceId) return { contactMessages: [], projectEnquiries: [], syncedAt: new Date().toISOString() }
  try {
    const [cRes, eRes] = await Promise.all([
      supabase.from('website_contact_messages').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabase.from('website_enquiries').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
    ])

    const contactMessages = (cRes.data || [])
      .filter((r) => !isTestRecord(r))
      .map((r) => ({
      id: r.external_id || r.id,
      db_id: r.id,
      messageNumber: r.message_number,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      countryCode: r.country_code,
      subject: r.subject,
      message: r.message,
      status: r.status,
      assignedTo: r.assigned_to,
      internalNotes: r.internal_notes,
      lead_id: r.lead_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))

    const projectEnquiries = (eRes.data || [])
      .filter((r) => !isTestRecord(r))
      .map((r) => ({
      id: r.external_id || r.id,
      db_id: r.id,
      enquiryNumber: r.enquiry_number,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      countryCode: r.country_code,
      companyName: r.company_name,
      websiteUrl: r.website_url,
      projectScope: r.project_scope,
      selectedServices: r.selected_services || [],
      selectedSubServices: r.selected_sub_services || [],
      budgetRange: r.budget_range,
      timeline: r.timeline,
      referenceUrl: r.reference_url,
      status: r.status,
      assignedTo: r.assigned_to,
      internalNotes: r.internal_notes,
      lead_id: r.lead_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))

    return { contactMessages, projectEnquiries, syncedAt: new Date().toISOString() }
  } catch (err) {
    console.warn('loadWebsiteQueriesFromDatabase notice:', err?.message)
    return { contactMessages: [], projectEnquiries: [], syncedAt: new Date().toISOString() }
  }
}

/**
 * Fetches website enquiries and contact messages from the main website API,
 * stores and updates them in the Supabase database (`leads`, `website_enquiries`,
 * and `website_contact_messages`), and falls back to Supabase if API is offline.
 */
export async function syncAndPersistWebsiteData(profile, { type = 'all', limit = 200 } = {}) {
  const workspaceId = profile?.workspace_id

  // 1. Fetch live data from Main Website API (with graceful fallback to local DB)
  let websiteData = null
  let apiFailed = false
  try {
    websiteData = await syncWebsiteData({ type, limit })
  } catch (err) {
    apiFailed = true
    console.warn('Main website API sync warning, falling back to database:', err.message)
  }

  // If API failed or workspace available, load current state from Supabase database
  const dbData = workspaceId ? await loadWebsiteQueriesFromDatabase(workspaceId) : { contactMessages: [], projectEnquiries: [] }

  if (apiFailed || !websiteData) {
    return {
      contactMessages: dbData.contactMessages,
      projectEnquiries: dbData.projectEnquiries,
      syncedAt: dbData.syncedAt,
      fromDatabase: true,
      stats: {
        syncedAt: dbData.syncedAt,
        enquiriesCount: dbData.projectEnquiries.length,
        contactsCount: dbData.contactMessages.length,
      },
    }
  }

  const enquiries = (websiteData?.projectEnquiries || []).filter((e) => !isTestRecord(e))
  const contacts = (websiteData?.contactMessages || []).filter((m) => !isTestRecord(m))

  if (!workspaceId) return { ...websiteData, projectEnquiries: enquiries, contactMessages: contacts }

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
    if (isTestRecord(e)) continue
    const email = e.email?.trim()?.toLowerCase() || null
    const nameParts = (e.fullName || 'Website Lead').trim().split(/\s+/)
    const firstName = nameParts[0] || 'Website'
    const lastName = nameParts.slice(1).join(' ') || ''
    const fullPhone = [e.countryCode, e.phone].filter(Boolean).join(' ')
    const primaryService = Array.isArray(e.selectedServices) ? e.selectedServices[0] : (e.selectedServices || '')

    const noteLines = [
      e.enquiryNumber ? `[Website Enquiry #${e.enquiryNumber}] [External-ID: ${e.id}]` : `[Website Project Enquiry] [External-ID: ${e.id}]`,
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
    if (isTestRecord(m)) continue
    const email = m.email?.trim()?.toLowerCase() || null
    const nameParts = (m.fullName || 'Website Contact').trim().split(/\s+/)
    const firstName = nameParts[0] || 'Website'
    const lastName = nameParts.slice(1).join(' ') || ''
    const fullPhone = [m.countryCode, m.phone].filter(Boolean).join(' ')

    const msgNotes = [
      m.messageNumber ? `[Website Contact Query #${m.messageNumber}] [External-ID: ${m.id}]` : `[Website Contact Message] [External-ID: ${m.id}]`,
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

/**
 * Directly updates status in Supabase database (`leads` + `website_enquiries` / `website_contact_messages`)
 * and also synchronizes back with the Main Website API via the PATCH proxy.
 */
export async function updateWebsiteQueryDirectly({ type = 'contacts', item, status, assignedTo, internalNotes }, profile) {
  if (!item) return { success: false }
  const workspaceId = profile?.workspace_id
  const email = item.email?.trim()?.toLowerCase()
  const crmStatus = type === 'contacts'
    ? (status === 'RESOLVED' ? 'converted' : status === 'IN_PROGRESS' ? 'contacted' : status === 'ARCHIVED' ? 'unqualified' : 'new')
    : (WEB_TO_CRM_STATUS[status] || 'contacted')

  let updatedLead = null

  // 1. Direct Supabase update to `public.leads`
  if (workspaceId && (item.lead_id || email)) {
    try {
      let leadQuery = supabase.from('leads').select('id, status, notes, first_name, last_name').eq('workspace_id', workspaceId)
      if (item.lead_id) {
        leadQuery = leadQuery.eq('id', item.lead_id)
      } else {
        leadQuery = leadQuery.ilike('email', email)
      }
      const { data: matchedLead } = await leadQuery.maybeSingle()

      if (matchedLead) {
        const updateData = {
          status: crmStatus,
          updated_at: new Date().toISOString(),
        }
        if (internalNotes) {
          updateData.notes = matchedLead.notes
            ? `${matchedLead.notes}\n\n[Status Update (${status})]: ${internalNotes}`
            : `[Status Update (${status})]: ${internalNotes}`
        }
        const { data: leadSaved } = await supabase.from('leads').update(updateData).eq('id', matchedLead.id).select().maybeSingle()
        updatedLead = leadSaved || matchedLead

        if (profile) {
          await createActivity({
            activity_type: 'status_update',
            title: `Website query status set to ${status}`,
            description: `CRM lead status set to ${crmStatus}. ${internalNotes ? `Notes: ${internalNotes}` : ''}`.trim(),
          }, 'lead_id', matchedLead.id, profile).catch(() => {})
        }
      }
    } catch (err) {
      console.warn('Direct leads update notice:', err?.message)
    }
  }

  // 2. Direct Supabase update to `website_contact_messages` or `website_enquiries` table if present
  try {
    const table = type === 'contacts' ? 'website_contact_messages' : 'website_enquiries'
    await supabase.from(table)
      .update({
        status,
        assigned_to: assignedTo || null,
        internal_notes: internalNotes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('external_id', String(item.id))
  } catch {
    // Ignore if table not created
  }

  // 3. Best-effort update to Main Website API
  let apiRes = null
  try {
    if (type === 'contacts') {
      apiRes = await updateWebsiteContactMessage(item.id, {
        status,
        assignedTo: assignedTo || null,
        internalNotes: internalNotes || null,
      })
    } else {
      apiRes = await updateWebsiteEnquiry(item.id, {
        status,
        assignedTo: assignedTo || null,
        internalNotes: internalNotes || null,
      })
    }
  } catch (err) {
    console.warn('Website API proxy update notice:', err?.message)
  }

  return { success: true, crmStatus, updatedLead, apiRes }
}

/**
 * Propagate a CRM lead status change back to the Main Website API
 * and to the local website tables if external ID is known.
 */
export async function syncLeadStatusToWebsite(lead, newStatus) {
  if (!lead || lead.source !== 'website') return

  const isContact = lead.notes?.includes('[Website Contact')
  const extMatch = lead.notes?.match(/\[External-ID:\s*([^\]]+)\]/)
  const externalId = extMatch ? extMatch[1].trim() : null

  const targetStatus = isContact
    ? (CRM_TO_MSG_STATUS[newStatus] || 'IN_PROGRESS')
    : (CRM_TO_WEB_STATUS[newStatus] || 'CONTACTED')

  // Direct DB update to website table if externalId exists
  if (externalId) {
    try {
      const table = isContact ? 'website_contact_messages' : 'website_enquiries'
      await supabase.from(table).update({ status: targetStatus, updated_at: new Date().toISOString() }).eq('external_id', externalId)
    } catch {}

    // Call API proxy
    try {
      if (isContact) {
        await updateWebsiteContactMessage(externalId, { status: targetStatus })
      } else {
        await updateWebsiteEnquiry(externalId, { status: targetStatus })
      }
    } catch (err) {
      console.warn('Background sync to website API failed:', err?.message)
    }
  }
}

/**
 * Creates a new Website Query directly in Supabase (`leads` + `website_enquiries` or `website_contact_messages`).
 */
export async function createWebsiteQueryDirectly({ type = 'contacts', data }, profile) {
  const workspaceId = profile?.workspace_id
  if (!workspaceId) throw new Error('Workspace not found')

  const now = new Date().toISOString()
  const externalId = `manual-${Date.now()}`
  const email = data.email?.trim()?.toLowerCase() || null
  const nameParts = (data.fullName || 'Website Inquiry').trim().split(/\s+/)
  const firstName = nameParts[0] || 'Website'
  const lastName = nameParts.slice(1).join(' ') || ''
  const fullPhone = [data.countryCode, data.phone].filter(Boolean).join(' ')

  let leadId = null

  // Insert lead into CRM leads table
  const { data: createdLead } = await supabase.from('leads').insert({
    workspace_id: workspaceId,
    first_name: firstName,
    last_name: lastName,
    email,
    phone: fullPhone || null,
    website: data.websiteUrl || null,
    source: 'website',
    interested_service: data.selectedServices?.[0] || data.subject || 'Website Inquiry',
    notes: data.projectScope || data.message || '',
    status: 'new',
    priority: 'medium',
    created_by: profile?.id || null,
    created_at: now,
  }).select('id').maybeSingle()

  if (createdLead?.id) leadId = createdLead.id

  if (type === 'contacts') {
    const { data: insertedContact, error: cErr } = await supabase.from('website_contact_messages').insert({
      workspace_id: workspaceId,
      external_id: externalId,
      message_number: `MSG-${Date.now().toString().slice(-4)}`,
      full_name: data.fullName,
      email,
      phone: fullPhone || null,
      country_code: data.countryCode || '+91',
      subject: data.subject || 'General Enquiry',
      message: data.message || '',
      status: 'NEW',
      assigned_to: data.assignedTo || null,
      internal_notes: data.internalNotes || null,
      lead_id: leadId,
      created_at: now,
      updated_at: now,
    }).select().maybeSingle()

    if (cErr) throw new Error(cErr.message)
    return {
      type: 'contacts',
      id: externalId,
      ...insertedContact,
      lead_id: leadId,
      fullName: data.fullName,
      email,
      phone: fullPhone,
      messageNumber: insertedContact?.message_number || `MSG-${Date.now().toString().slice(-4)}`,
      createdAt: now,
    }
  } else {
    const { data: insertedEnquiry, error: eErr } = await supabase.from('website_enquiries').insert({
      workspace_id: workspaceId,
      external_id: externalId,
      enquiry_number: `ENQ-${Date.now().toString().slice(-4)}`,
      full_name: data.fullName,
      email,
      phone: fullPhone || null,
      country_code: data.countryCode || '+91',
      company_name: data.companyName || null,
      website_url: data.websiteUrl || null,
      project_scope: data.projectScope || null,
      selected_services: Array.isArray(data.selectedServices) ? data.selectedServices : [],
      selected_sub_services: Array.isArray(data.selectedSubServices) ? data.selectedSubServices : [],
      budget_range: data.budgetRange || null,
      timeline: data.timeline || null,
      reference_url: data.referenceUrl || null,
      status: 'NEW',
      assigned_to: data.assignedTo || null,
      internal_notes: data.internalNotes || null,
      lead_id: leadId,
      created_at: now,
      updated_at: now,
    }).select().maybeSingle()

    if (eErr) throw new Error(eErr.message)
    return {
      type: 'enquiries',
      id: externalId,
      ...insertedEnquiry,
      lead_id: leadId,
      fullName: data.fullName,
      email,
      phone: fullPhone,
      companyName: data.companyName,
      enquiryNumber: insertedEnquiry?.enquiry_number || `ENQ-${Date.now().toString().slice(-4)}`,
      createdAt: now,
    }
  }
}

/**
 * Deletes a Website Query from the Supabase database.
 */
export async function deleteWebsiteQueryDirectly({ type = 'contacts', item }, profile) {
  if (!item) return { success: false }
  const workspaceId = profile?.workspace_id
  const table = type === 'contacts' ? 'website_contact_messages' : 'website_enquiries'

  if (workspaceId) {
    const extId = String(item.id || item.external_id)
    await supabase
      .from(table)
      .delete()
      .eq('workspace_id', workspaceId)
      .or(`external_id.eq.${extId},id.eq.${extId}`)

    // Also remove or clean up linked lead if it was unconverted
    if (item.lead_id) {
      try {
        const { data: lead } = await supabase.from('leads').select('id, status').eq('id', item.lead_id).maybeSingle()
        if (lead && lead.status !== 'converted') {
          await supabase.from('leads').delete().eq('id', item.lead_id)
        }
      } catch {}
    }
  }

  if (profile) {
    await createActivity({
      activity_type: 'status_update',
      title: `Deleted website ${type === 'contacts' ? 'contact query' : 'project enquiry'}`,
      description: `Removed inquiry for ${item.fullName || item.email} from CRM database.`,
    }, null, null, profile).catch(() => {})
  }

  return { success: true }
}

