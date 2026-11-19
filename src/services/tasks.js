import { supabase } from '../lib/supabase'
import { clean, pageRange, searchFilter, mustAffect } from '../lib/query'
import { addDays, format } from 'date-fns'
import { OPEN_TASK_STATUSES } from '../constants/options'

export const TASK_FIELDS = ['title', 'description', 'task_type', 'priority', 'status', 'due_date', 'due_time', 'assigned_to', 'lead_id', 'organization_id', 'contact_id', 'deal_id']
const SELECT = '*, lead:leads(id,lead_number,first_name,last_name,email), organization:organizations(id,name), contact:contacts(id,first_name,last_name,email), deal:deals(id,title), assignee:profiles!tasks_assigned_to_fkey(id,full_name)'
const ymd = (d) => format(d, 'yyyy-MM-dd')

function applyFilters(q, f = {}) {
  if (f.status === 'open') q = q.in('status', OPEN_TASK_STATUSES)
  else if (f.status) q = q.eq('status', f.status)
  if (f.priority) q = q.eq('priority', f.priority)
  if (f.assigned_to) q = q.eq('assigned_to', f.assigned_to)
  const now = new Date(); const today = ymd(now)
  if (f.due === 'overdue') q = q.in('status', OPEN_TASK_STATUSES).lt('due_date', today)
  else if (f.due === 'today') q = q.in('status', OPEN_TASK_STATUSES).eq('due_date', today)
  else if (f.due === 'week') q = q.in('status', OPEN_TASK_STATUSES).gte('due_date', today).lte('due_date', ymd(addDays(now, 7)))
  else if (f.due === 'none') q = q.is('due_date', null)
  return q
}

export async function listTasks({ page, pageSize, search, filters, sort }) {
  let q = supabase.from('tasks').select(SELECT, { count: 'exact' })
  if (search) q = q.or(searchFilter(search, ['title']))
  q = applyFilters(q, filters)
  const [from, to] = pageRange(page, pageSize)
  const { data, error, count } = await q.order(sort.key, { ascending: sort.dir === 'asc', nullsFirst: false }).order('due_time', { ascending: true, nullsFirst: false }).range(from, to)
  if (error) throw error
  return { rows: data, total: count ?? 0 }
}

export async function getTaskCounts() {
  const now = new Date(); const today = ymd(now)
  const base = () => supabase.from('tasks').select('id', { count: 'exact', head: true }).in('status', OPEN_TASK_STATUSES)
  const [overdue, dueToday, week, open] = await Promise.all([
    base().lt('due_date', today), base().eq('due_date', today), base().gte('due_date', today).lte('due_date', ymd(addDays(now, 7))), base(),
  ])
  const err = overdue.error || dueToday.error || week.error || open.error
  if (err) throw err
  return { overdue: overdue.count, today: dueToday.count, week: week.count, open: open.count }
}

export async function listTasksByRecord(column, id) {
  const { data, error } = await supabase.from('tasks')
    .select('*, assignee:profiles!tasks_assigned_to_fkey(full_name)').eq(column, id).order('due_date', { ascending: true, nullsFirst: false }).limit(50)
  if (error) throw error
  const open = (t) => (OPEN_TASK_STATUSES.includes(t.status) ? 0 : 1)
  return data.sort((a, b) => open(a) - open(b))
}

export async function createTask(values, profile) {
  const { error } = await supabase.from('tasks').insert({ ...clean(values), workspace_id: profile.workspace_id, created_by: profile.id })
  if (error) throw error
}
export async function updateTask(id, values) {
  await mustAffect(supabase.from('tasks').update(clean(values)).eq('id', id))
}
export async function setTaskStatus(id, status) {
  await mustAffect(supabase.from('tasks').update({ status }).eq('id', id))
}
export async function deleteTask(id) {
  await mustAffect(supabase.from('tasks').delete().eq('id', id))
}
