import { supabase } from '../lib/supabase'
import { clean, pageRange, searchFilter, mustAffect } from '../lib/query'

export const CONTACT_FIELDS = ['first_name', 'last_name', 'designation', 'email', 'phone', 'linkedin_url', 'organization_id', 'country', 'notes']
const SELECT = '*, organization:organizations(id,name)'

export async function listContacts({ page, pageSize, search, filters, sort }) {
  let q = supabase.from('contacts').select(SELECT, { count: 'exact' })
  if (search) q = q.or(searchFilter(search, ['first_name', 'last_name', 'email', 'phone']))
  if (filters.organization_id) q = q.eq('organization_id', filters.organization_id)
  const [from, to] = pageRange(page, pageSize)
  const { data, error, count } = await q.order(sort.key, { ascending: sort.dir === 'asc' }).range(from, to)
  if (error) throw error
  return { rows: data, total: count ?? 0 }
}

export async function getContact(id) {
  const { data, error } = await supabase.from('contacts').select(SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function listContactsByOrganization(orgId) {
  const { data, error } = await supabase.from('contacts').select('id,first_name,last_name,designation,email').eq('organization_id', orgId).order('first_name')
  if (error) throw error
  return data
}

export async function createContact(values, profile) {
  const { data, error } = await supabase.from('contacts')
    .insert({ ...clean(values), workspace_id: profile.workspace_id, created_by: profile.id }).select().single()
  if (error) throw error
  return data
}

export async function updateContact(id, values) {
  await mustAffect(supabase.from('contacts').update(clean(values)).eq('id', id))
}

export async function deleteContact(id) {
  await mustAffect(supabase.from('contacts').delete().eq('id', id))
}

export async function listDealsByContact(contactId) {
  const { data, error } = await supabase.from('deals').select('id,title,stage,value,currency').eq('contact_id', contactId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}
