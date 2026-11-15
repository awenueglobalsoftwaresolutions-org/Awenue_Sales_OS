import { supabase } from '../lib/supabase'
import { clean, mustAffect } from '../lib/query'

import { API_URL as API, accessToken, apiConfigured, apiPost } from './api'

export const filesConfigured = apiConfigured
export const MAX_UPLOAD_MB = 50

export async function listItems(orgId, parentId) {
  let q = supabase.from('org_items').select('*, uploader:profiles(full_name)').eq('organization_id', orgId)
  q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null)
  const { data, error } = await q
  if (error) throw error
  // folders first, then A–Z
  return data.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.kind === 'folder' ? -1 : 1))
}

export async function createFolder({ orgId, parentId, name }, profile) {
  const { error } = await supabase.from('org_items').insert({
    ...clean({ name }), kind: 'folder', organization_id: orgId, parent_id: parentId || null, workspace_id: profile.workspace_id, created_by: profile.id,
  })
  if (error) throw error
}

export async function renameItem(id, name) {
  await mustAffect(supabase.from('org_items').update(clean({ name })).eq('id', id))
}

// XHR (not fetch) so we can report upload progress.
export async function uploadFile(file, { orgId, parentId }, onProgress) {
  if (file.size > MAX_UPLOAD_MB * 1048576) throw new Error(`“${file.name}” is larger than ${MAX_UPLOAD_MB} MB.`)
  if (file.size === 0) throw new Error(`“${file.name}” is empty.`)
  const token = await accessToken()
  const qs = new URLSearchParams({ org: orgId, name: file.name })
  if (parentId) qs.set('parent', parentId)
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API}/files/upload?${qs}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100))
    xhr.onerror = () => reject(new Error('Could not reach the file server. Check your connection and try again.'))
    xhr.onload = () => {
      let data = {}
      try { data = JSON.parse(xhr.responseText) } catch { /* non-JSON error */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data.error || `Upload failed (${xhr.status}).`))
    }
    xhr.send(file)
  })
}

export const getFileUrl = async (itemId, download) => (await apiPost('/files/sign', { itemId, download })).url
export const deleteItem = (itemId) => apiPost('/files/delete', { itemId })
