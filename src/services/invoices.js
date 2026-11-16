import { supabase } from '../lib/supabase'
import { searchFilter } from '../lib/query'

const run = async (q) => { const { data, error } = await q; if (error) throw error; return data }

const BASE = `*, organization:organizations(id,name), contact:contacts(id,first_name,last_name)`

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
  const { data, error } = await supabase.from('invoices').select(`${BASE}, items:invoice_items(*), events:invoice_events(id,event_type,description,created_at,user_id), sends:invoice_sends(id,channel,recipient,sent_at), payments:invoice_payments(*)`).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export const getInvoiceSettings = () => run(supabase.from('invoice_settings').select('*').maybeSingle())
export async function upsertInvoiceSettings(values, workspaceId) {
  const { error } = await supabase.from('invoice_settings').update(values).eq('workspace_id', workspaceId)
  if (error) throw error
}

export const saveInvoice = (invoice, items) => supabase.rpc('save_invoice', { p_invoice: invoice, p_items: items }).then(({ data, error }) => { if (error) throw error; return data })
export const duplicateInvoice = (id) => supabase.rpc('duplicate_invoice', { p_id: id }).then(({ data, error }) => { if (error) throw error; return data })
export const recordSend = (id, channel, recipient, note) => supabase.rpc('record_invoice_send', { p_id: id, p_channel: channel, p_recipient: recipient, p_note: note }).then(({ error }) => { if (error) throw error })
export const addPayment = (payload) => supabase.from('invoice_payments').insert(payload).then(({ error }) => { if (error) throw error })
export const removePayment = (id) => supabase.from('invoice_payments').delete().eq('id', id).then(({ error }) => { if (error) throw error })
export const cancelInvoice = (id, reason) => supabase.from('invoices').update({ status: 'cancelled', cancelled_reason: reason }).eq('id', id).then(({ error }) => { if (error) throw error })
export const deleteInvoice = (id) => supabase.from('invoices').delete().eq('id', id).then(({ error }) => { if (error) throw error })
export const getSummary = () => supabase.rpc('invoice_summary', { p_today: new Date().toISOString().slice(0, 10), p_month_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10) }).then(({ data, error }) => { if (error) throw error; return data })
