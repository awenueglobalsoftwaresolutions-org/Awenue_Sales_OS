import { supabase } from '../lib/supabase'
import { clean, pageRange, searchFilter } from '../lib/query'

export async function listActivities(column, id) {
  const { data, error } = await supabase.from('activities')
    .select('*, user:profiles(full_name)').eq(column, id).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data
}

// column is the related record's FK column, e.g. 'lead_id'.
export async function createActivity({ activity_type, title, description }, column, id, profile) {
  const { error } = await supabase.from('activities').insert({
    ...clean({ title, description }), activity_type, [column]: id, workspace_id: profile.workspace_id, user_id: profile.id,
  })
  if (error) throw error
}

const ALL_SELECT = '*, user:profiles(full_name), lead:leads(id,first_name,last_name), contact:contacts(id,first_name,last_name), organization:organizations(id,name), deal:deals(id,title)'

export async function listAllActivities({ page, pageSize, search, filters, sort }) {
  let q = supabase.from('activities').select(ALL_SELECT, { count: 'exact' })
  if (search) q = q.or(searchFilter(search, ['title', 'description']))
  if (filters.activity_type) q = q.eq('activity_type', filters.activity_type)
  if (filters.user_id) q = q.eq('user_id', filters.user_id)
  const [from, to] = pageRange(page, pageSize)
  const { data, error, count } = await q.order(sort.key, { ascending: sort.dir === 'asc' }).range(from, to)
  if (error) throw error
  return { rows: data, total: count ?? 0 }
}
