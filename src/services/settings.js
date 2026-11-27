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
export const listUsers = async () => {
  const res = await supabase.from('profiles').select('id,full_name,email,role,is_active,created_at,avatar_url,job_title,department,phone,manager_id,is_permanent,allowed_modules,allowed_services,record_scope,export_allowed').order('created_at')
  if (res.error) {
    if (res.error.message?.includes('allowed_modules') || res.error.code === '42703' || res.error.message?.includes('does not exist')) {
      const fallback = await supabase.from('profiles').select('id,full_name,email,role,is_active,created_at,avatar_url,job_title,department,phone,manager_id,is_permanent').order('created_at')
      if (fallback.error) throw fallback.error
      return (fallback.data || []).map((u) => ({
        ...u,
        allowed_modules: null,
        record_scope: 'all',
        export_allowed: true,
      }))
    }
    throw res.error
  }
  return res.data
}
export const updateUser = (id, patch) => mustAffect(supabase.from('profiles').update(patch).eq('id', id))
export const createUser = (payload) => apiPost('/users/create', payload)
export const removeUser = (userId) => apiPost('/users/remove', { userId })

// ---- PBAC: User-level permission overrides ----
export const listUserPermissions = async (userId) => {
  const { data, error } = await supabase.from('user_permissions').select('permission,effect,created_at').eq('user_id', userId)
  if (error) {
    console.warn('user_permissions table not yet created or not accessible on remote database:', error.message)
    return []
  }
  return data || []
}

export async function saveUserPermissions(userId, overrides = [], grantedBy = null) {
  try {
    await supabase.from('user_permissions').delete().eq('user_id', userId).then(ok)
    if (overrides.length > 0) {
      const payload = overrides.map(({ permission, effect }) => ({
        user_id: userId,
        permission,
        effect,
        granted_by: grantedBy || undefined,
      }))
      await supabase.from('user_permissions').insert(payload).then(ok)
    }
  } catch (err) {
    if (err?.message?.includes('user_permissions') || err?.message?.includes('does not exist')) {
      console.warn('user_permissions table not yet created in Supabase SQL editor:', err.message)
      return
    }
    throw err
  }
}

// ---- ABAC: User access control policy ----
export async function updateUserAccessControl(userId, { role, manager_id, record_scope, allowed_modules, export_allowed, allowed_services }) {
  const patch = clean({
    role,
    manager_id: manager_id || null,
    record_scope: record_scope || 'all',
    allowed_modules: allowed_modules && allowed_modules.length > 0 ? allowed_modules : null,
    export_allowed: export_allowed !== false,
    allowed_services: allowed_services && allowed_services.length > 0 ? allowed_services : null,
  })
  try {
    return await updateUser(userId, patch)
  } catch (err) {
    if (err?.message?.includes('allowed_modules') || err?.message?.includes('does not exist')) {
      // If columns not yet created in remote database, fall back to updating standard fields
      return await updateUser(userId, clean({ role, manager_id: manager_id || null }))
    }
    throw err
  }
}

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
