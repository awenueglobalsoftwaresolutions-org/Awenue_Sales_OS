import { supabase } from '../lib/supabase'
import { apiPost } from './api'
import { mustAffect } from '../lib/query'

// Only the columns the browser may read (the token column is not granted to it at all).
export async function getMyGmail(userId) {
  const { data, error } = await supabase.from('gmail_accounts').select('id,email,status,last_error,connected_at').eq('user_id', userId).maybeSingle()
  if (error) throw error
  return data
}
export async function connectGmail() {
  const { url } = await apiPost('/gmail/connect', {})
  window.location.href = url
}
export const disconnectGmail = () => apiPost('/gmail/disconnect', {})

export async function listTemplates() {
  const { data, error } = await supabase.from('email_templates').select('id,name,subject,body,shared,created_by').order('name')
  if (error) throw error
  return data
}
export async function saveTemplate(values, profile, id) {
  const row = { name: values.name.trim(), subject: values.subject.trim(), body: values.body, shared: Boolean(values.shared) }
  if (id) return mustAffect(supabase.from('email_templates').update(row).eq('id', id))
  const { error } = await supabase.from('email_templates').insert({ ...row, workspace_id: profile.workspace_id, created_by: profile.id })
  if (error) throw error
}
export const deleteTemplate = (id) => mustAffect(supabase.from('email_templates').delete().eq('id', id))

export async function listMessagesFor(column, id) {
  const { data, error } = await supabase.from('email_messages').select('*, sender:profiles(full_name)').eq(column, id).order('created_at', { ascending: false }).limit(100)
  if (error) throw error
  return data
}
export const sendEmail = (payload) => apiPost('/email/send', payload)

export async function listOrgFiles(orgId) {
  const { data, error } = await supabase.from('org_items').select('id,name,mime_type,size_bytes').eq('organization_id', orgId).eq('kind', 'file').order('name').limit(200)
  if (error) throw error
  return data
}
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = () => reject(new Error('Could not read an attachment.'))
    r.readAsDataURL(blob)
  })
}
