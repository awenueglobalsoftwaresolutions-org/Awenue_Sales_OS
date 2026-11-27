import { supabase } from '../lib/supabase'
import { clean, mustAffect, pageRange, searchFilter } from '../lib/query'
import { apiPost } from './api'

const run = async (q) => { const { data, error } = await q; if (error) throw error; return data }
const PROJECT_SELECT = '*, organization:organizations(id,name), assignee:profiles!projects_assigned_to_fkey(id,full_name)'

export const PROJECT_STATUSES = [
  { value: 'not_started', label: 'Not started' }, { value: 'in_progress', label: 'In progress' }, { value: 'on_hold', label: 'On hold' },
  { value: 'pending_client_approval', label: 'Pending client approval' }, { value: 'under_review', label: 'Under review' },
  { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
]
export const PRIORITY_OPTIONS = [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]
export const TICKET_STATUSES = [
  { value: 'open', label: 'Open' }, { value: 'assigned', label: 'Assigned' }, { value: 'in_progress', label: 'In progress' },
  { value: 'waiting_client', label: 'Waiting for client' }, { value: 'under_review', label: 'Under review' },
  { value: 'resolved', label: 'Resolved' }, { value: 'closed', label: 'Closed' },
]
export const TICKET_CATEGORIES = [
  { value: 'bug_report', label: 'Bug report' }, { value: 'technical_issue', label: 'Technical issue' }, { value: 'feature_request', label: 'Feature request' },
  { value: 'enhancement_request', label: 'Enhancement request' }, { value: 'ui_ux_issue', label: 'UI/UX issue' }, { value: 'general_query', label: 'General query' }, { value: 'other', label: 'Other' },
]

// ---- projects
export async function listProjects({ page, pageSize, search, filters, sort }) {
  let q = supabase.from('projects').select(PROJECT_SELECT, { count: 'exact' })
  if (search) q = q.or(searchFilter(search, ['name']))
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.priority) q = q.eq('priority', filters.priority)
  if (filters.organization_id) q = q.eq('organization_id', filters.organization_id)
  if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to)
  const [from, to] = pageRange(page, pageSize)
  const { data, error, count } = await q.order(sort.key, { ascending: sort.dir === 'asc', nullsFirst: false }).range(from, to)
  if (error) throw error
  return { rows: data, total: count ?? 0 }
}
export async function listProjectsForOrg(orgId) {
  return run(supabase.from('projects').select('id,project_number,name,status,progress,priority,expected_end_date').eq('organization_id', orgId).order('created_at', { ascending: false }))
}
export const getProject = (id) => run(supabase.from('projects').select(PROJECT_SELECT).eq('id', id).maybeSingle())
export async function createProject(values) {
  const { data, error } = await supabase.rpc('create_project', { p: clean(values) })
  if (error) throw error
  return data
}
export const updateProject = (id, values) => mustAffect(supabase.from('projects').update(clean(values)).eq('id', id))
export const deleteProject = (id) => mustAffect(supabase.from('projects').delete().eq('id', id))
export const getProjectSummary = () => run(supabase.rpc('project_summary')).then((r) => r)

// ---- stages
export const listStages = (projectId) => run(supabase.from('project_stages').select('*').eq('project_id', projectId).order('position'))
export const updateStage = (id, patch) => mustAffect(supabase.from('project_stages').update(clean(patch)).eq('id', id))
export async function addStage(projectId, workspaceId, name, existing) {
  const pos = Math.max(0, ...existing.map((s) => s.position)) + 1
  const { error } = await supabase.from('project_stages').insert({ workspace_id: workspaceId, project_id: projectId, position: pos, name: name.trim() })
  if (error) throw error
}

// ---- updates (append-only)
export const listUpdates = (projectId) => run(supabase.from('project_updates').select('*, author:profiles(full_name)').eq('project_id', projectId).order('created_at', { ascending: false }).limit(200))
export async function addUpdate({ projectId, workspaceId, userId, kind = 'update', body, stageId = null }) {
  const { error } = await supabase.from('project_updates').insert({ project_id: projectId, workspace_id: workspaceId, created_by: userId, kind, body: body.trim(), stage_id: stageId })
  if (error) throw error
}

// ---- reminders
export const listReminders = (projectId) => run(supabase.from('project_reminders').select('*, assignee:profiles!project_reminders_assigned_to_fkey(full_name)').eq('project_id', projectId).order('is_done').order('due_date', { nullsFirst: false }))
export async function addReminder(values, { projectId, workspaceId, userId }) {
  const { error } = await supabase.from('project_reminders').insert({ ...clean(values), project_id: projectId, workspace_id: workspaceId, created_by: userId })
  if (error) throw error
}
export const setReminderDone = (id, done, userId) => mustAffect(supabase.from('project_reminders').update({ is_done: done, done_at: done ? new Date().toISOString() : null, done_by: done ? userId : null }).eq('id', id))
export const deleteReminder = (id) => mustAffect(supabase.from('project_reminders').delete().eq('id', id))

// ---- stage templates (the workflow every new project starts from)
export const listStageTemplates = () => run(supabase.from('project_stage_templates').select('*').order('position'))
export async function addStageTemplate(name, workspaceId, existing) {
  const pos = Math.max(0, ...existing.map((s) => s.position)) + 1
  const { error } = await supabase.from('project_stage_templates').insert({ workspace_id: workspaceId, name: name.trim(), position: pos })
  if (error) throw error
}
export const setStageTemplateActive = (id, active) => mustAffect(supabase.from('project_stage_templates').update({ is_active: active }).eq('id', id))

// ---- tickets
const TICKET_SELECT = '*, project:projects(id,name,project_number), organization:organizations(id,name), assignee:profiles!support_tickets_assigned_to_fkey(id,full_name), creator:profiles!support_tickets_created_by_fkey(full_name)'
export async function listTickets({ page, pageSize, search, filters, sort }) {
  let q = supabase.from('support_tickets').select(TICKET_SELECT, { count: 'exact' })
  if (search) q = q.or(searchFilter(search, ['subject']))
  if (filters.status) q = q.eq('status', filters.status)
  if (filters.priority) q = q.eq('priority', filters.priority)
  if (filters.category) q = q.eq('category', filters.category)
  if (filters.project_id) q = q.eq('project_id', filters.project_id)
  if (filters.organization_id) q = q.eq('organization_id', filters.organization_id)
  if (filters.assigned_to) q = q.eq('assigned_to', filters.assigned_to)
  const [from, to] = pageRange(page, pageSize)
  const { data, error, count } = await q.order(sort.key, { ascending: sort.dir === 'asc', nullsFirst: false }).range(from, to)
  if (error) throw error
  return { rows: data, total: count ?? 0 }
}
export const listTicketsForProject = (projectId) => run(supabase.from('support_tickets').select('id,ticket_number,subject,status,priority,category,created_at').eq('project_id', projectId).order('created_at', { ascending: false }))
export const listTicketsForOrg = (orgId) => run(supabase.from('support_tickets').select('id,ticket_number,subject,status,priority,project:projects(name)').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(100))
export const getTicket = (id) => run(supabase.from('support_tickets').select(TICKET_SELECT).eq('id', id).maybeSingle())
export const listTicketEvents = (ticketId) => run(supabase.from('ticket_events').select('*, actor:profiles(full_name)').eq('ticket_id', ticketId).order('created_at'))
export async function createTicket(values, { workspaceId, userId }) {
  const { data, error } = await supabase.from('support_tickets').insert({ ...clean(values), workspace_id: workspaceId, created_by: userId }).select('id').single()
  if (error) throw error
  if (data?.id) {
    apiPost('/email/notifications/ticket-created', { ticket_id: data.id }).catch((e) => console.warn('[EmailTrigger] ticket-created:', e.message))
  }
  return data
}
export const updateTicket = async (id, patch) => {
  const res = await mustAffect(supabase.from('support_tickets').update(clean(patch)).eq('id', id))
  if (patch.status || patch.resolution) {
    apiPost('/email/notifications/ticket-status', { ticket_id: id, new_status: patch.status, note: patch.resolution }).catch((e) => console.warn('[EmailTrigger] ticket-status:', e.message))
  }
  return res
}
export const deleteTicket = (id) => mustAffect(supabase.from('support_tickets').delete().eq('id', id))

// ---- ticket remarks (append-only) and deal conversion
export const listTicketComments = (ticketId) => run(supabase.from('ticket_comments').select('id,body,created_at,author:profiles(full_name)').eq('ticket_id', ticketId).order('created_at'))
export async function addTicketComment({ ticketId, workspaceId, userId, body }) {
  const { data, error } = await supabase.from('ticket_comments').insert({ ticket_id: ticketId, workspace_id: workspaceId, author_id: userId, body: body.trim() }).select('id').single()
  if (error) throw error
  if (data?.id && ticketId) {
    apiPost('/email/notifications/ticket-reply', { ticket_id: ticketId, comment_id: data.id, body }).catch((e) => console.warn('[EmailTrigger] ticket-reply:', e.message))
  }
  return data
}
export async function convertDealToProject(dealId, values = {}) {
  const { data, error } = await supabase.rpc('convert_deal_to_project', { p_deal: dealId, p: clean(values) })
  if (error) throw error
  return data
}
export const getProjectForDeal = (dealId) => run(supabase.from('projects').select('id,project_number,name,status').eq('deal_id', dealId).maybeSingle())
export const listOpenTickets = (limit = 6) => run(supabase.rpc('open_tickets_feed').select('id,ticket_number,subject,status,priority,organization_id,project_id,assigned_to,created_at, organization:organizations(name), assignee:profiles!support_tickets_assigned_to_fkey(full_name)').limit(limit))
export const listActiveProjects = (limit = 6) => run(supabase.from('projects').select('id,project_number,name,status,progress,expected_end_date,organization:organizations(name)').in('status', ['in_progress', 'under_review', 'pending_client_approval', 'on_hold']).order('expected_end_date', { nullsFirst: false }).limit(limit))
