import { HttpError, mustUuid } from '../lib/http.js'
import { authenticate } from '../lib/supabase.js'

const INLINE_OK = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf)$/i   // everything else downloads
const enc = new TextEncoder()

const cleanName = (raw) => {
  const n = String(raw || '').replace(/[\\/]/g, '-').trim()
  if (!n) throw new HttpError(400, 'A file name is required.')
  return n.slice(0, 200)
}
async function hmac(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
const safeEqual = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0 }

// POST /files/upload?org=<uuid>&parent=<uuid?>&name=<file name>  (raw file body)
export async function upload(request, url, env) {
  const { user, sb } = await authenticate(request, env)
  const orgId = mustUuid(url.searchParams.get('org'), 'organization')
  const parentId = url.searchParams.get('parent') ? mustUuid(url.searchParams.get('parent'), 'folder') : null
  const name = cleanName(url.searchParams.get('name'))

  const size = Number(request.headers.get('Content-Length'))
  const max = Number(env.MAX_UPLOAD_BYTES) || 52428800
  if (!Number.isFinite(size) || size <= 0) throw new HttpError(400, 'Empty or unsized upload.')
  if (size > max) throw new HttpError(413, `Files can be at most ${Math.floor(max / 1048576)} MB.`)

  const orgRes = await sb(`organizations?id=eq.${orgId}&select=id,workspace_id`)
  const [org] = orgRes.ok ? await orgRes.json() : []
  if (!org) throw new HttpError(404, 'Organization not found, or you do not have access to it.')
  if (parentId) {
    const pr = await sb(`org_items?id=eq.${parentId}&organization_id=eq.${orgId}&kind=eq.folder&select=id`)
    const [p] = pr.ok ? await pr.json() : []
    if (!p) throw new HttpError(404, 'Folder not found.')
  }

  const key = `${org.workspace_id}/${orgId}/${crypto.randomUUID()}`   // user-supplied names never touch the storage key
  const mime = request.headers.get('Content-Type') || 'application/octet-stream'
  await env.BUCKET.put(key, request.body, { httpMetadata: { contentType: mime } })

  const ins = await sb('org_items', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ workspace_id: org.workspace_id, organization_id: orgId, parent_id: parentId, kind: 'file', name, storage_key: key, mime_type: mime, size_bytes: size, created_by: user.id }),
  })
  if (!ins.ok) {
    await env.BUCKET.delete(key)   // don't leave an orphan object behind
    if (ins.status === 409) throw new HttpError(409, 'A file or folder with that name already exists here.')
    throw new HttpError(403, 'You are not allowed to add files here.')
  }
  const [row] = await ins.json()
  return row
}

// POST /files/sign {itemId, download} -> short-lived signed link
export async function signUrl(request, url, env) {
  const { sb } = await authenticate(request, env)
  const body = await request.json().catch(() => ({}))
  const itemId = mustUuid(body.itemId, 'file')
  const r = await sb(`org_items?id=eq.${itemId}&kind=eq.file&select=storage_key,name`)
  const [item] = r.ok ? await r.json() : []
  if (!item) throw new HttpError(404, 'File not found, or you do not have access to it.')
  const exp = Math.floor(Date.now() / 1000) + 300
  const dl = body.download ? '1' : '0'
  const sig = await hmac(env.FILE_SIGNING_SECRET, `${item.storage_key}|${item.name}|${exp}|${dl}`)
  const q = new URLSearchParams({ k: item.storage_key, n: item.name, e: String(exp), d: dl, s: sig })
  return { url: `${url.origin}/file?${q}` }
}

// GET /file?k&n&e&d&s  (verified signed link; no auth header so it works in a new tab)
export async function serveFile(url, env) {
  const p = url.searchParams
  const [k, n, e, d, s] = ['k', 'n', 'e', 'd', 's'].map((x) => p.get(x) || '')
  if (!k || !s || Number(e) < Date.now() / 1000) throw new HttpError(403, 'This link has expired. Open the file again from the app.')
  if (!safeEqual(await hmac(env.FILE_SIGNING_SECRET, `${k}|${n}|${e}|${d}`), s)) throw new HttpError(403, 'Invalid link.')
  const obj = await env.BUCKET.get(k)
  if (!obj) throw new HttpError(404, 'File not found.')
  const type = obj.httpMetadata?.contentType || 'application/octet-stream'
  const inline = d !== '1' && INLINE_OK.test(type)
  return new Response(obj.body, { headers: {
    'Content-Type': inline ? type : 'application/octet-stream',
    'Content-Length': String(obj.size),
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(n)}`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=0',
  } })
}

// POST /files/delete {itemId}: a file, or a folder with everything inside
export async function remove(request, env) {
  const { sb } = await authenticate(request, env)
  const { itemId } = await request.json().catch(() => ({}))
  mustUuid(itemId, 'item')

  const seen = await sb(`org_items?id=eq.${itemId}&select=id`)
  const [exists] = seen.ok ? await seen.json() : []
  if (!exists) throw new HttpError(404, 'Item not found.')

  const kr = await sb('rpc/org_item_file_keys', { method: 'POST', body: JSON.stringify({ p_item_id: itemId }) })
  if (!kr.ok) throw new HttpError(500, 'Could not read the folder contents.')
  const keys = await kr.json()

  // Database rows first: RLS silently filters rows the caller may not delete.
  const del = await sb(`org_items?id=eq.${itemId}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
  const gone = del.ok ? await del.json() : []
  if (!gone.length) throw new HttpError(403, 'You are not allowed to delete this.')

  for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000))
  return { deleted: keys.length }
}
