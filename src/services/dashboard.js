import { supabase } from '../lib/supabase'
import { format, startOfMonth } from 'date-fns'
import { OPEN_TASK_STATUSES } from '../constants/options'
import { WEB_TO_CRM_STATUS, normalizeWebsiteEnquiry, syncWebsiteData } from './website'

async function fetchWebsiteEnquiriesSafe() {
  try {
    const res = await syncWebsiteData({ type: 'enquiries', limit: 200 })
    return res?.projectEnquiries || []
  } catch {
    return []
  }
}

export async function getDashboardStats() {
  const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd')
  const [{ data, error }, webEnquiries] = await Promise.all([
    supabase.rpc('dashboard_stats', { p_today: format(new Date(), 'yyyy-MM-dd'), p_month_start: monthStart }),
    fetchWebsiteEnquiriesSafe(),
  ])
  if (error) throw error
  if (!webEnquiries.length) return data

  const monthStartIso = startOfMonth(new Date()).toISOString()
  const webNewMonth = webEnquiries.filter((e) => (e.createdAt || '') >= monthStartIso).length
  const webQualified = webEnquiries.filter((e) => (WEB_TO_CRM_STATUS[e.status] || 'new') === 'qualified').length
  return {
    ...data,
    total_leads: (data?.total_leads ?? 0) + webEnquiries.length,
    new_leads_month: (data?.new_leads_month ?? 0) + webNewMonth,
    qualified_leads: (data?.qualified_leads ?? 0) + webQualified,
  }
}

export async function listRecentLeads() {
  const [{ data, error }, webEnquiries] = await Promise.all([
    supabase.from('leads').select('id,lead_number,first_name,last_name,status,created_at').order('created_at', { ascending: false }).limit(6),
    fetchWebsiteEnquiriesSafe(),
  ])
  if (error) throw error
  const combined = [...(data || []), ...webEnquiries.map(normalizeWebsiteEnquiry)]
  combined.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
  return combined.slice(0, 6)
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
  // Counted in the database (lead_breakdown, migration 0012). Reading every lead would be silently capped at 1,000 rows.
  const [{ data, error }, webEnquiries] = await Promise.all([
    supabase.rpc('lead_breakdown'),
    fetchWebsiteEnquiriesSafe(),
  ])
  if (error) throw error
  const byStatus = { ...(data?.by_status || {}) }
  const sourceMap = new Map((data?.by_source || []).map((x) => [x.source, x.count]))

  if (webEnquiries.length) {
    sourceMap.set('website', (sourceMap.get('website') || 0) + webEnquiries.length)
    for (const e of webEnquiries) {
      const st = WEB_TO_CRM_STATUS[e.status] || 'new'
      byStatus[st] = (byStatus[st] || 0) + 1
    }
  }

  const bySource = [...sourceMap.entries()].map(([source, count]) => ({ source, count }))
  const total = Object.values(byStatus).reduce((n, v) => n + v, 0)
  return { total, bySource, byStatus }
}
