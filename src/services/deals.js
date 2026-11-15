import { supabase } from '../lib/supabase'
import { clean, pageRange, searchFilter, mustAffect } from '../lib/query'
import { addDays, endOfMonth, format, startOfMonth } from 'date-fns'
import { stageProbability } from '../constants/options'

export const DEAL_FIELDS = ['title', 'organization_id', 'contact_id', 'lead_id', 'interested_service', 'value', 'currency', 'expected_close_date',
  'stage', 'assigned_to', 'probability', 'description', 'notes', 'lost_reason']
const SELECT = '*, organization:organizations(id,name), contact:contacts(id,first_name,last_name), assignee:profiles!deals_assigned_to_fkey(id,full_name)'
// leads <-> deals have two foreign keys, so the embed needs an explicit hint
const DETAIL_SELECT = `${SELECT}, lead:leads!deals_lead_id_fkey(id,lead_number,first_name,last_name)`
const ymd = (d) => format(d, 'yyyy-MM-dd')

function applyFilters(q, f = {}) {
  if (f.stage) q = q.eq('stage', f.stage)
  if (f.assigned_to) q = q.eq('assigned_to', f.assigned_to)
  if (f.interested_service) q = q.eq('interested_service', f.interested_service)
  const now = new Date(); const today = ymd(now)
  if (f.closing === 'overdue') q = q.lt('expected_close_date', today).not('stage', 'in', '(won,lost)')
  else if (f.closing === 'month') q = q.gte('expected_close_date', ymd(startOfMonth(now))).lte('expected_close_date', ymd(endOfMonth(now)))
  else if (f.closing === '30d') q = q.gte('expected_close_date', today).lte('expected_close_date', ymd(addDays(now, 30)))
  else if (f.closing === '90d') q = q.gte('expected_close_date', today).lte('expected_close_date', ymd(addDays(now, 90)))
  else if (f.closing === 'none') q = q.is('expected_close_date', null)
  return q
}

export async function listDeals({ page, pageSize, search, filters, sort }) {
  let q = supabase.from('deals').select(SELECT, { count: 'exact' })
  if (search) q = q.or(searchFilter(search, ['title']))
  q = applyFilters(q, filters)
  const [from, to] = pageRange(page, pageSize)
  const { data, error, count } = await q.order(sort.key, { ascending: sort.dir === 'asc', nullsFirst: false }).order('created_at', { ascending: false }).range(from, to)
  if (error) throw error
  return { rows: data, total: count ?? 0 }
}

export async function listDealsForPipeline(filters) {
  const { data, error } = await applyFilters(supabase.from('deals').select(SELECT), filters).order('updated_at', { ascending: false }).limit(1000)
  if (error) throw error
  return data
}

export async function getDeal(id) {
  const { data, error } = await supabase.from('deals').select(DETAIL_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

const payload = (values) => clean({ ...values, value: values.value ?? 0, lost_reason: values.stage === 'lost' ? values.lost_reason : null })

export async function createDeal(values, profile) {
  const { data, error } = await supabase.from('deals').insert({ ...payload(values), workspace_id: profile.workspace_id, created_by: profile.id }).select().single()
  if (error) throw error
  return data
}

export async function updateDeal(id, values) {
  await mustAffect(supabase.from('deals').update(payload(values)).eq('id', id))
}

// Used by the pipeline and the deal page. Dates and history entries are handled by database triggers.
export async function moveDeal(deal, stage, lostReason) {
  await mustAffect(supabase.from('deals')
    .update({ stage, probability: stageProbability(stage), lost_reason: stage === 'lost' ? lostReason : null }).eq('id', deal.id))
}

export async function deleteDeal(id) {
  await mustAffect(supabase.from('deals').delete().eq('id', id))
}
