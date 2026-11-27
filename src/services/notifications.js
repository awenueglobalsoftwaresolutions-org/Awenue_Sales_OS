import { supabase } from '../lib/supabase'

export const NOTIFICATION_TYPES = [
  ['ticket_assigned', 'Ticket assigned to me'], ['ticket_remark', 'Remarks on my tickets or assigned tickets'], ['ticket_status', 'Ticket status changes'],
  ['ticket_resolved', 'Tickets resolved'], ['ticket_closed', 'Tickets closed'], ['project_assigned', 'Project assigned to me'],
  ['reminder_assigned', 'Reminder assigned to me'], ['task_assigned', 'Task assigned to me'], ['deal_assigned', 'Deal assigned to me'], ['general', 'Other updates'],
]

export async function listNotifications({ userId, unreadOnly = false, limit = 30, before = null }) {
  let q = supabase.from('notifications').select('id,type,title,body,link,read_at,created_at,actor:profiles!notifications_actor_id_fkey(full_name)').eq('user_id', userId)
  if (unreadOnly) q = q.is('read_at', null)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return data
}
export async function unreadCount(userId) {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null)
  if (error) throw error
  return count ?? 0
}
export async function setRead(ids, read) {
  if (!ids.length) return
  const { error } = await supabase.from('notifications').update({ read_at: read ? new Date().toISOString() : null }).in('id', ids)
  if (error) throw error
}
export async function markAllRead(userId) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null)
  if (error) throw error
}
export async function getPreferences(userId) {
  const { data, error } = await supabase.from('notification_preferences').select('type,enabled').eq('user_id', userId)
  if (error) throw error
  return Object.fromEntries((data || []).map((r) => [r.type, r.enabled]))
}
export async function setPreference(userId, type, enabled) {
  const { error } = await supabase.from('notification_preferences').upsert({ user_id: userId, type, enabled }, { onConflict: 'user_id,type' })
  if (error) throw error
}

// Live delivery: each new notification for this person arrives as it's created.
export function subscribeToNotifications(userId, onInsert) {
  const channel = supabase.channel(`notifications:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, (payload) => onInsert(payload.new))
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}

// Browser notifications (shown even when the CRM tab is in the background, while it's open).
export const browserNotificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window
export async function enableBrowserNotifications() {
  if (!browserNotificationsSupported()) return 'unsupported'
  return Notification.requestPermission()
}
export function showBrowserNotification(n) {
  if (!browserNotificationsSupported() || Notification.permission !== 'granted') return
  try {
    const note = new Notification(n.title, { body: n.body || '', tag: n.id })
    note.onclick = () => { window.focus(); if (n.link) window.location.assign(n.link) }
  } catch { /* some browsers only allow notifications from a service worker */ }
}
