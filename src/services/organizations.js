import { supabase } from '../lib/supabase'
import { clean, pageRange, searchFilter, cleanTerm, mustAffect } from '../lib/query'

const FIELDS = ['name', 'website', 'industry', 'company_size', 'country', 'state', 'city', 'address', 'linkedin_url', 'description']
export const ORG_FIELDS = FIELDS

export async function listOrganizations({ page, pageSize, search, filters, sort }) {
  let q = supabase.from('organizations').select('*', { count: 'exact' })
  if (search) q = q.or(searchFilter(search, ['name', 'industry', 'website', 'city']))
  if (filters.country) q = q.ilike('country', `%${cleanTerm(filters.country)}%`)
  if (filters.company_size) q = q.eq('company_size', filters.company_size)
  const [from, to] = pageRange(page, pageSize)
  const { data, error, count } = await q.order(sort.key, { ascending: sort.dir === 'asc' }).range(from, to)
  if (error) throw error
  return { rows: data, total: count ?? 0 }
}

export async function getOrganization(id) {
  const { data, error } = await supabase.from('organizations').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

export async function createOrganization(values, profile) {
  const { data, error } = await supabase.from('organizations')
    .insert({ ...clean(values), workspace_id: profile.workspace_id, created_by: profile.id }).select().single()
  if (error) throw error
  return data
}

export async function updateOrganization(id, values) {
  await mustAffect(supabase.from('organizations').update(clean(values)).eq('id', id))
}

// The database also blocks this with a trigger; the pre-check just gives a friendlier message.
export async function deleteOrganization(id) {
  const count = (t) => supabase.from(t).select('id', { count: 'exact', head: true }).eq('organization_id', id)
  const [c, l, d, f] = await Promise.all([count('contacts'), count('leads'), count('deals'), count('org_items')])
  const err = c.error || l.error || d.error || f.error
  if (err) throw err
  if (c.count + l.count + d.count + f.count > 0)
    throw new Error(`This organization still has ${c.count} contact(s), ${l.count} lead(s), ${d.count} deal(s) and ${f.count} file/folder(s). Remove or reassign them first.`)
  await mustAffect(supabase.from('organizations').delete().eq('id', id))
}
