import { supabase } from '../lib/supabase'
import { clean, mustAffect } from '../lib/query'
import { apiPost } from './api'

const ok = ({ error }) => { if (error) throw error }
const rows = async (q) => { const { data, error } = await q; if (error) throw error; return data }

// ---- own profile ----
export const PROFILE_FIELDS = ['full_name', 'phone', 'job_title', 'department', 'bio', 'timezone']
export const updateOwnProfile = (id, values) => mustAffect(supabase.from('profiles').update(clean(values)).eq('id', id))
export const updateWorkspaceName = (id, name) => mustAffect(supabase.from('workspaces').update(clean({ name })).eq('id', id))

const AVATAR_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
export async function uploadAvatar(file, userId) {
  if (!AVATAR_TYPES[file.type]) throw new Error('Use a PNG, JPEG or WebP picture.')
  if (file.size > 2 * 1048576) throw new Error('Pictures can be at most 2 MB.')
  const bucket = supabase.storage.from('avatars')
  const path = `${userId}/${Date.now()}.${AVATAR_TYPES[file.type]}`
  const up = await bucket.upload(path, file, { contentType: file.type, cacheControl: '31536000' })
  if (up.error) throw up.error
  const url = bucket.getPublicUrl(path).data.publicUrl
  await mustAffect(supabase.from('profiles').update({ avatar_url: url }).eq('id', userId))
  const { data: old } = await bucket.list(userId)                       // tidy up earlier pictures (best effort)
  const stale = (old || []).map((o) => `${userId}/${o.name}`).filter((n) => n !== path)
  if (stale.length) await bucket.remove(stale)
}
export const removeAvatar = (userId) => mustAffect(supabase.from('profiles').update({ avatar_url: null }).eq('id', userId))

// ---- services ----
export const listAllServices = () => rows(supabase.from('services').select('*').order('sort_order').order('name'))
export const addService = (name, sortOrder, profile) =>
  supabase.from('services').insert({ ...clean({ name }), sort_order: sortOrder, workspace_id: profile.workspace_id }).then(ok)
export const updateService = (id, patch) => mustAffect(supabase.from('services').update(patch).eq('id', id))
export const setServiceActive = (id, is_active) => mustAffect(supabase.from('services').update({ is_active }).eq('id', id))

// ---- users ----
export const listUsers = () => rows(supabase.from('profiles').select('id,full_name,email,role,is_active,created_at,avatar_url,job_title,department,phone,manager_id').order('created_at'))
export const updateUser = (id, patch) => mustAffect(supabase.from('profiles').update(patch).eq('id', id))
export const createUser = (payload) => apiPost('/users/create', payload)
export const removeUser = (userId) => apiPost('/users/remove', { userId })

// ---- roles & permissions ----
export const listRoles = () => rows(supabase.from('roles').select('*').order('created_at'))
export const listPermissions = () => rows(supabase.from('permissions').select('key,module,action').order('module').order('action'))
export const listRolePermissions = async (roleId) => (await rows(supabase.from('role_permissions').select('permission').eq('role_id', roleId))).map((r) => r.permission)

export async function saveRolePermissions(roleId, add, remove) {
  if (remove.length) await supabase.from('role_permissions').delete().eq('role_id', roleId).in('permission', remove).then(ok)
  if (add.length) await supabase.from('role_permissions').insert(add.map((permission) => ({ role_id: roleId, permission }))).then(ok)
}
const slug = (s) => { const k = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40); return /^[a-z]/.test(k) ? k : `r_${k}` }
export async function createRole({ name, description }, profile) {
  const { data, error } = await supabase.from('roles').insert({ workspace_id: profile.workspace_id, key: slug(name), name: name.trim(), description: (description || '').trim() }).select().single()
  if (error) throw error
  return data
}
export const deleteRole = (id) => mustAffect(supabase.from('roles').delete().eq('id', id))
