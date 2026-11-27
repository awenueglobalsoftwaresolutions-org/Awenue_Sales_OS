import { supabase } from '../lib/supabase'
import { apiPost } from './api'
import { searchFilter } from '../lib/query'

const run = async (q) => { const { data, error } = await q; if (error) throw error; return data }

const BASE = `*, organization:organizations(id,name), contact:contacts(id,first_name,last_name,email,phone)`

export async function listInvoices({ page, pageSize, search, filters, sort }) {
  let q = supabase.from('invoices').select(BASE, { count: 'exact' })
  if (search) q = q.or(searchFilter(search, ['bill_to_name', 'invoice_number']))
  if (filters.status) {
    if (filters.status === 'overdue') q = q.in('status', ['sent', 'partially_paid']).lt('due_date', new Date().toISOString().slice(0, 10))
    else q = q.eq('status', filters.status)
  }
  if (filters.created_by) q = q.eq('created_by', filters.created_by)
  const from = (page - 1) * pageSize, to = page * pageSize - 1
  const { data, error, count } = await q.order(sort.key, { ascending: sort.dir === 'asc', nullsFirst: false }).range(from, to)
  if (error) throw error
  return { rows: data, total: count ?? 0 }
}

export async function getInvoice(id) {
  const { data, error } = await supabase.from('invoices').select(`${BASE}, lead:leads(id,lead_number,first_name,last_name), deal:deals(id,title), items:invoice_items(*), events:invoice_events(id,event_type,description,created_at,user_id), sends:invoice_sends(id,channel,recipient,sent_at), payments:invoice_payments(*)`).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null

  // Ensure custom issuer details and defaults are merged from the database settings
  try {
    const { data: s } = await supabase.from('invoice_settings').select('*').maybeSingle()
    if (s) {
      data.issuer = {
        company_name: s.company_name || data.issuer?.company_name || 'AWENUE Global Software Solutions',
        address: s.address || data.issuer?.address || '',
        email: s.email || data.issuer?.email || 'billing@awenueglobalsoftwaresolutions.in',
        phone: s.phone || data.issuer?.phone || '',
        website: s.website || data.issuer?.website || 'www.awenueglobalsoftwaresolutions.in',
        tax_id: s.tax_id || data.issuer?.tax_id || '',
        logo_url: s.logo_url || data.issuer?.logo_url || null,
        signature_url: s.signature_url || data.issuer?.signature_url || null,
      }
      if (!data.payment_instructions && s.payment_instructions) {
        data.payment_instructions = s.payment_instructions
      }
      if (!data.terms && s.terms) {
        data.terms = s.terms
      }
    }
  } catch {
    // Keep original data if settings lookup fails
  }

  return data
}

export const getInvoiceSettings = () => run(supabase.from('invoice_settings').select('*').maybeSingle())
export async function upsertInvoiceSettings(values, workspaceId) {
  let wsId = workspaceId
  if (!wsId) {
    const { data: currentWs } = await supabase.rpc('current_workspace_id').catch(() => ({}))
    wsId = currentWs
  }
  if (!wsId) {
    const existing = await supabase.from('invoice_settings').select('workspace_id').limit(1).maybeSingle()
    wsId = existing.data?.workspace_id
  }
  if (!wsId) {
    const { data: ws } = await supabase.from('workspaces').select('id').limit(1).maybeSingle()
    wsId = ws?.id
  }

  const payload = {
    ...values,
    workspace_id: wsId,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('invoice_settings')
    .upsert(payload, { onConflict: 'workspace_id' })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export const saveInvoice = (invoice, items) => supabase.rpc('save_invoice', { p_invoice: invoice, p_items: items }).then(({ data, error }) => { if (error) throw error; return data })
export const duplicateInvoice = (id) => supabase.rpc('duplicate_invoice', { p_id: id }).then(({ data, error }) => { if (error) throw error; return data })
export const recordSend = (id, channel, recipient, note) => supabase.rpc('record_invoice_send', { p_id: id, p_channel: channel, p_recipient: recipient, p_note: note }).then(({ error }) => { if (error) throw error })
export async function sendInvoiceByEmail(invoiceId, { recipientEmail = null, pdfBase64 = null, items = null, force = true } = {}) {
  const payload = {
    invoice_id: invoiceId,
    recipient_email: recipientEmail,
    pdf_base64: pdfBase64,
    items,
    resend: force,
  }

  let res = null
  try {
    res = await apiPost(`/api/invoices/${invoiceId}/send-email`, payload)
  } catch (err) {
    if (err.message === 'Not found' || (err.message && err.message.includes('404'))) {
      res = await apiPost('/email/notifications/invoice', payload).catch(async () => {
        // Fallback directly to local dev server / Vercel serverless function
        const { data: sessionData } = await supabase.auth.getSession().catch(() => ({}))
        const token = sessionData?.session?.access_token
        const headers = { 'Content-Type': 'application/json' }
        if (token) headers.Authorization = `Bearer ${token}`
        const r = await fetch(`/api/invoices/${invoiceId}/send-email`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'Request failed. Please try again.')
        return d
      })
    } else {
      throw err
    }
  }

  if (recipientEmail) {
    await recordSend(invoiceId, 'email', recipientEmail, 'Emailed via Resend Billing Automation').catch(() => {})
  }
  return res
}

export async function getInvoiceEmailDeliveryStatus(invoiceId) {
  if (!invoiceId) return null
  try {
    const { data, error } = await supabase
      .from('email_notification_logs')
      .select('id, status, recipient_email, recipient_name, resend_email_id, sent_at, delivered_at, last_error, attempt_count, created_at, updated_at')
      .eq('related_invoice_id', invoiceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      return null
    }
    return data || null
  } catch {
    return null
  }
}
export const addPayment = async (payload) => {
  const { data, error } = await supabase.from('invoice_payments').insert(payload).select('id').single()
  if (error) throw error
  if (data?.id && payload.invoice_id) {
    apiPost('/email/notifications/payment', { invoice_id: payload.invoice_id, payment_id: data.id }).catch((e) => console.warn('[EmailTrigger] payment-confirmation:', e.message))
  }
  return data
}
export const removePayment = (id) => supabase.from('invoice_payments').delete().eq('id', id).then(({ error }) => { if (error) throw error })
export const cancelInvoice = (id, reason) => supabase.from('invoices').update({ status: 'cancelled', cancelled_reason: reason }).eq('id', id).then(({ error }) => { if (error) throw error })
export const deleteInvoice = (id) => supabase.from('invoices').delete().eq('id', id).then(({ error }) => { if (error) throw error })
export const getSummary = () => supabase.rpc('invoice_summary', { p_today: new Date().toISOString().slice(0, 10), p_month_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10) }).then(({ data, error }) => { if (error) throw error; return data })

// ---- connections to the rest of the CRM ----
export async function listServicesWithPrices() {
  const { data, error } = await supabase.from('services').select('id,name,default_price,default_tax_rate').eq('is_active', true).order('sort_order')
  if (error) throw error
  return data
}
export async function suggestLines(q) {
  const { data, error } = await supabase.rpc('suggest_invoice_lines', { p_q: q })
  if (error) throw error
  return data
}
export async function listInvoicesForRecord(column, id) {
  const { data, error } = await supabase.from('invoices').select('id,invoice_number,status,issue_date,due_date,total,balance,currency,bill_to_name').eq(column, id).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data
}
export async function getRecordTotals(column, id) {
  const { data, error } = await supabase.rpc('record_invoice_totals', { p_column: column, p_id: id })
  if (error) throw error
  return data
}

const place = (o) => [o?.address, [o?.city, o?.state].filter(Boolean).join(', '), o?.country].filter(Boolean).join('\n')
const fullName = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ')
const ORG_COLS = 'id,name,address,city,state,country,industry'

// Type-ahead for "Bill to": people and companies you already have, so details are never retyped.
export async function searchCustomers(term) {
  const t = term.trim().replace(/[,()*%\\]/g, ' ')
  if (t.length < 2) return []
  const like = (cols) => cols.map((c) => `${c}.ilike.*${t}*`).join(',')
  const [contacts, orgs, leads] = await Promise.all([
    supabase.from('contacts').select(`id,first_name,last_name,email,phone,designation,organization:organizations(${ORG_COLS})`).or(like(['first_name', 'last_name', 'email'])).limit(5),
    supabase.from('organizations').select(ORG_COLS).or(like(['name'])).limit(5),
    supabase.from('leads').select(`id,lead_number,first_name,last_name,email,phone,organization:organizations(${ORG_COLS})`).or(like(['first_name', 'last_name', 'email'])).limit(4),
  ])
  const err = contacts.error || orgs.error || leads.error
  if (err) throw err
  return [
    ...orgs.data.map((o) => ({ kind: 'Organization', key: `o${o.id}`, title: o.name, subtitle: [o.industry, o.city].filter(Boolean).join(' · '), org: o })),
    ...contacts.data.map((c) => ({ kind: 'Contact', key: `c${c.id}`, title: fullName(c), subtitle: [c.designation, c.organization?.name, c.email].filter(Boolean).join(' · '), contact: c })),
    ...leads.data.map((l) => ({ kind: 'Lead', key: `l${l.id}`, title: fullName(l), subtitle: [`LD-${String(l.lead_number).padStart(4, '0')}`, l.organization?.name, l.email].filter(Boolean).join(' · '), lead: l })),
  ]
}

// What to copy onto the invoice when someone is chosen from the suggestions.
export async function customerToInvoice(s) {
  if (s.org) {
    const { data } = await supabase.from('contacts').select('id,first_name,last_name,email,phone').eq('organization_id', s.org.id).order('created_at').limit(1)
    const c = data?.[0]
    return { bill_to_name: s.org.name, bill_to_address: place(s.org), bill_to_email: c?.email || '', bill_to_phone: c?.phone || '', organization_id: s.org.id, contact_id: c?.id || '', lead_id: '' }
  }
  if (s.contact) {
    const c = s.contact
    return { bill_to_name: fullName(c), bill_to_address: place(c.organization), bill_to_email: c.email || '', bill_to_phone: c.phone || '', organization_id: c.organization?.id || '', contact_id: c.id, lead_id: '' }
  }
  const l = s.lead
  return { bill_to_name: fullName(l), bill_to_address: place(l.organization), bill_to_email: l.email || '', bill_to_phone: l.phone || '', organization_id: l.organization?.id || '', contact_id: '', lead_id: l.id, _lead_label: `LD-${String(l.lead_number).padStart(4, '0')} · ${fullName(l)}` }
}
