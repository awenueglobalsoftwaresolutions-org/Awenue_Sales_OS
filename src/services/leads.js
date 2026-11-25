import { supabase } from '../lib/supabase'
import { clean, pageRange, searchFilter, cleanTerm, mustAffect } from '../lib/query'
import { createActivity } from './activities'
import { LEAD_STATUSES, labelOf } from '../constants/options'

export const LEAD_FIELDS = ['first_name', 'last_name', 'job_title', 'email', 'phone', 'organization_id', 'website', 'industry', 'country', 'state', 'city',
  'source', 'interested_service', 'status', 'priority', 'assigned_to', 'estimated_budget', 'notes']
const SELECT = '*, organization:organizations(id,name), assignee:profiles!leads_assigned_to_fkey(id,full_name)'

export async function listLeads({ page, pageSize, search, filters, sort }) {
  let q = supabase.from('leads').select(SELECT, { count: 'exact' })
  if (search) q = q.or(searchFilter(search, ['first_name', 'last_name', 'email', 'phone', 'job_title']))
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.source) q = q.eq('source', filters.source)
  if (filters.interested_service) q = q.eq('interested_service', filters.interested_service)
  if (filters.country) q = q.ilike('country', `%${cleanTerm(filters.country)}%`)
  const [from, to] = pageRange(page, pageSize)
  const { data, error, count } = await q.order(sort.key, { ascending: sort.dir === 'asc' }).order('created_at', { ascending: false }).range(from, to)
  if (error) throw error
  return { rows: data, total: count ?? 0 }
}

export async function getLead(id) {
  const { data, error } = await supabase.from('leads').select(SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function listLeadsByOrganization(orgId) {
  const { data, error } = await supabase.from('leads').select('id,lead_number,first_name,last_name,status').eq('organization_id', orgId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function listDealsByOrganization(orgId) {
  const { data, error } = await supabase.from('deals').select('id,title,stage,value,currency').eq('organization_id', orgId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createLead(values, profile) {
  const { data, error } = await supabase.from('leads')
    .insert({ ...clean(values), workspace_id: profile.workspace_id, created_by: profile.id }).select().single()
  if (error) throw error
  return data
}

const statusLabel = (v) => labelOf(LEAD_STATUSES, v)

export async function logStatusChange(lead, newStatus, profile) {
  await createActivity({
    activity_type: 'status_update', title: `Status changed to ${statusLabel(newStatus)}`,
    description: `Previously ${statusLabel(lead.status)}.`,
  }, 'lead_id', lead.id, profile)
}

export async function updateLead(lead, values, profile) {
  await mustAffect(supabase.from('leads').update(clean({ ...values, estimated_budget: values.estimated_budget ?? null })).eq('id', lead.id))
  if (values.status && values.status !== lead.status) await logStatusChange(lead, values.status, profile)
}

export async function deleteLead(id) {
  await mustAffect(supabase.from('leads').delete().eq('id', id))
}

export async function convertLead({ leadId, title, value, currency }) {
  const { data, error } = await supabase.rpc('convert_lead', {
    p_lead_id: leadId, p_deal_title: title, p_deal_value: value === '' || value == null ? null : Number(value), p_currency: currency,
  })
  if (error) throw error
  return data
}

export async function getLeadMetrics() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const [total, newMonth, qualified, converted, followups] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }),
    supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'qualified'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'converted'),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']).not('lead_id', 'is', null),
  ])
  return {
    total: total.count ?? 0,
    newMonth: newMonth.count ?? 0,
    qualified: qualified.count ?? 0,
    converted: converted.count ?? 0,
    followups: followups.count ?? 0,
  }
}
