// Service for Admin Email Management: metrics, notification logs, and safe retry
import { supabase } from '../lib/supabase'
import { apiPost } from './api'

export async function getEmailNotificationStats(workspaceId) {
  try {
    const res = await apiPost('/email/notifications/stats', {})
    if (res && res.total !== undefined) return res
  } catch (err) {
    console.warn('Backend stats route failed, trying database RPC directly:', err.message)
  }

  // Fallback to Supabase RPC
  const { data, error } = await supabase.rpc('get_email_notification_stats', { p_workspace_id: workspaceId || null })
  if (error) {
    // If RPC fails, compute via query
    const { count: total } = await supabase.from('email_notification_logs').select('*', { count: 'exact', head: true })
    const { count: delivered } = await supabase.from('email_notification_logs').select('*', { count: 'exact', head: true }).eq('status', 'delivered')
    const { count: sent } = await supabase.from('email_notification_logs').select('*', { count: 'exact', head: true }).in('status', ['sent', 'delivered'])
    const { count: failed } = await supabase.from('email_notification_logs').select('*', { count: 'exact', head: true }).eq('status', 'failed')
    const { count: bounced } = await supabase.from('email_notification_logs').select('*', { count: 'exact', head: true }).eq('status', 'bounced')
    const { count: supportCount } = await supabase.from('email_notification_logs').select('*', { count: 'exact', head: true }).eq('sender_type', 'support')
    const { count: billingCount } = await supabase.from('email_notification_logs').select('*', { count: 'exact', head: true }).eq('sender_type', 'billing')

    return {
      total: total || 0,
      sent: sent || 0,
      delivered: delivered || 0,
      failed: failed || 0,
      bounced: bounced || 0,
      support_count: supportCount || 0,
      billing_count: billingCount || 0,
    }
  }
  return data
}

export async function listEmailNotificationLogs({
  status = '',
  senderType = '',
  search = '',
  page = 1,
  limit = 25,
}) {
  const from = (page - 1) * limit
  const to = from + limit - 1

  let q = supabase
    .from('email_notification_logs')
    .select(`
      id,
      event_type,
      sender_type,
      sender_email,
      recipient_email,
      recipient_name,
      subject,
      related_ticket_id,
      related_invoice_id,
      resend_email_id,
      idempotency_key,
      status,
      attempt_count,
      last_error,
      sent_at,
      delivered_at,
      created_at,
      ticket:support_tickets(id,ticket_number,subject),
      invoice:invoices(id,invoice_number,total,currency)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) q = q.eq('status', status)
  if (senderType) q = q.eq('sender_type', senderType)
  if (search) {
    q = q.or(`recipient_email.ilike.%${search}%,subject.ilike.%${search}%,resend_email_id.ilike.%${search}%`)
  }

  const { data, count, error } = await q
  if (error) throw error
  return { logs: data || [], total: count || 0, page, limit }
}

export async function retryEmailNotification(logId) {
  return await apiPost('/email/notifications/retry', { log_id: logId })
}
