import { supabase } from '../lib/supabase'
import { format, startOfMonth } from 'date-fns'
import { OPEN_TASK_STATUSES } from '../constants/options'

export async function getDashboardStats() {
  const { data, error } = await supabase.rpc('dashboard_stats', {
    p_today: format(new Date(), 'yyyy-MM-dd'), p_month_start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
  })
  if (error) throw error
  return data
}

export async function listRecentLeads() {
  const { data, error } = await supabase.from('leads').select('id,lead_number,first_name,last_name,status,created_at').order('created_at', { ascending: false }).limit(6)
  if (error) throw error
  return data
}

export async function listUpcomingTasks() {
  const { data, error } = await supabase.from('tasks').select('id,title,due_date,due_time,priority,status')
    .in('status', OPEN_TASK_STATUSES).not('due_date', 'is', null).order('due_date', { ascending: true }).order('due_time', { ascending: true, nullsFirst: false }).limit(6)
  if (error) throw error
  return data
}

export async function listRecentActivities() {
  const { data, error } = await supabase.from('activities').select('*, user:profiles(full_name)').order('created_at', { ascending: false }).limit(8)
  if (error) throw error
  return data
}

export async function getLeadSourceBreakdown() {
  const { data, error } = await supabase.from('leads').select('source, status')
  if (error) throw error
  const rows = data || []
  const sourceCounts = {}
  const statusCounts = {}
  for (const r of rows) {
    const src = r.source || 'other'
    sourceCounts[src] = (sourceCounts[src] || 0) + 1
    if (r.status) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1
  }
  const bySource = Object.entries(sourceCounts)
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
  return { total: rows.length, bySource, byStatus: statusCounts }
}
