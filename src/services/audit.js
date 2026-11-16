import { supabase } from '../lib/supabase'
import { apiConfigured, apiPost } from './api'
import { addDays, safeTz, zonedToUtc } from '../lib/tz'

// Record something the browser did (logout, export, report download). The server decides who did it and from where.
export async function logEvent({ action, module, record_id = null, description = '', metadata = {} }) {
  try {
    if (apiConfigured) await apiPost('/audit/event', { action, module, record_id, description, metadata })
    else {
      const { error } = await supabase.rpc('log_event', { p_action: action, p_module: module, p_record: record_id, p_description: description, p_metadata: metadata })
      if (error) throw error
    }
  } catch (e) { console.warn('Could not record audit event', e) }
}

export const EMPTY_FILTERS = { userId: '', userText: '', fromDate: '', toDate: '', fromTime: '', toTime: '', module: '', action: '', status: '', ip: '', location: '', search: '' }
export const AUDIT_MODULES = ['auth', 'leads', 'organizations', 'contacts', 'deals', 'tasks', 'files', 'invoices', 'users', 'roles', 'settings', 'reports']
export const AUDIT_ACTIONS = [
  ['login', 'Login'], ['logout', 'Logout'], ['login_failed', 'Failed login'], ['create', 'Created'], ['update', 'Updated'], ['delete', 'Deleted'],
  ['export', 'Data export'], ['report_generated', 'Report generated'], ['report_downloaded', 'Report downloaded'], ['invoice_downloaded', 'Invoice downloaded'],
  ['email_sent', 'Email sent'], ['whatsapp_sent', 'WhatsApp sent'], ['purge', 'Audit purge'],
]
export const actionLabel = (a) => AUDIT_ACTIONS.find(([v]) => v === a)?.[1] || a

// Filters as the person entered them (dates and times in their own zone) -> the database's UTC parameters.
export function toParams(f, tz) {
  const zone = safeTz(tz); const n = (v) => (v && String(v).trim() ? String(v).trim() : null)
  const both = f.fromTime && f.toTime
  return {
    p_user_id: n(f.userId), p_user_text: n(f.userText),
    p_from: f.fromDate ? zonedToUtc(f.fromDate, '00:00', zone).toISOString() : null,
    p_to: f.toDate ? zonedToUtc(addDays(f.toDate, 1), '00:00', zone).toISOString() : null,        // end date is inclusive
    p_time_from: both ? f.fromTime : null, p_time_to: both ? f.toTime : null, p_tz: zone,
    p_module: n(f.module), p_action: n(f.action), p_status: n(f.status), p_ip: n(f.ip), p_location: n(f.location), p_search: n(f.search),
  }
}

export async function searchAudit(filters, tz, { sort = 'created_at', dir = 'desc', limit = 25, offset = 0 } = {}) {
  const { data, error } = await supabase.rpc('audit_search', { ...toParams(filters, tz), p_sort: sort, p_dir: dir, p_limit: limit, p_offset: offset })
  if (error) throw error
  return data
}
export async function auditSummary(filters, tz) {
  const { data, error } = await supabase.rpc('audit_summary', toParams(filters, tz))
  if (error) throw error
  return data
}
// Everything that matches, for downloads (pages of 1,000).
export async function fetchAllAudit(filters, tz, { cap = 20000, sort = 'created_at', dir = 'asc', onProgress } = {}) {
  const rows = []; let total = 0
  for (let offset = 0; offset < cap; offset += 1000) {
    const r = await searchAudit(filters, tz, { sort, dir, limit: Math.min(1000, cap - offset), offset })
    total = r.total; rows.push(...r.rows); onProgress?.(rows.length, Math.min(total, cap))
    if (rows.length >= total || !r.rows.length) break
  }
  return { rows, total, truncated: total > rows.length }
}

export async function getRetention() {
  const { data, error } = await supabase.from('workspaces').select('audit_retention_days').maybeSingle()
  if (error) throw error
  return data?.audit_retention_days ?? 365
}
export async function setRetention(days) { const { error } = await supabase.rpc('set_audit_retention', { p_days: days }); if (error) throw error }
export async function purgeAudit() { const { data, error } = await supabase.rpc('purge_audit_logs'); if (error) throw error; return Number(data) }
