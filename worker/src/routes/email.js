import { HttpError, mustUuid } from '../lib/http.js'
import { adminClient, authenticate, myProfile, requirePermission } from '../lib/supabase.js'
import { decryptSecret } from '../lib/crypto.js'
import { refreshAccess } from '../lib/oauth.js'
import { base64url, buildMessage, cleanHeader, formatAddress, unb64 } from '../lib/mime.js'

const MAX_RECIPIENTS = 50
const MAX_ATTACH = 10 * 1024 * 1024
const HOURLY_LIMIT = 200
const EMAIL = /^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]+$/
const LINK_TABLES = { contact_id: 'contacts', lead_id: 'leads', organization_id: 'organizations', deal_id: 'deals', invoice_id: 'invoices', task_id: 'tasks' }
const enc = new TextEncoder()

function addresses(list, label) {
  const out = []; const seen = new Set()
  for (const raw of Array.isArray(list) ? list : []) {
    const a = String(raw || '').trim().toLowerCase()
    if (!a) continue
    if (a.length > 254 || !EMAIL.test(a)) throw new HttpError(400, `“${a}” isn't a valid email address (${label}).`)
    if (!seen.has(a)) { seen.add(a); out.push(a) }
  }
  return out
}
const fileName = (n) => cleanHeader(n).replace(/[\\/]/g, '-').slice(0, 200) || 'attachment'

// POST /email/send. The sender is always the signed-in person's own connected Gmail account; the request can't choose it.
export async function send(request, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'communications.create')
  const me = await myProfile(ctx)
  const b = await request.json().catch(() => ({}))

  const to = addresses(b.to, 'To'), cc = addresses(b.cc, 'Cc'), bcc = addresses(b.bcc, 'Bcc')
  if (!to.length) throw new HttpError(400, 'Add at least one recipient.')
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) throw new HttpError(400, `One email can go to at most ${MAX_RECIPIENTS} recipients.`)
  const subject = cleanHeader(b.subject)
  if (!subject || subject.length > 300) throw new HttpError(400, 'Add a subject of up to 300 characters.')
  const text = String(b.body_text ?? '').replace(/\r\n/g, '\n')
  if (!text.trim() || text.length > 100000) throw new HttpError(400, 'Write a message of up to 100,000 characters.')

  // Each linked record must be visible to the sender, checked with their own permissions.
  const links = {}
  for (const [col, table] of Object.entries(LINK_TABLES)) {
    const id = b.links?.[col]
    if (!id) continue
    mustUuid(id, 'record')
    const r = await ctx.sb(`${table}?id=eq.${id}&select=id`)
    const [row] = r.ok ? await r.json() : []
    if (!row) throw new HttpError(404, 'That record doesn’t exist or you can’t see it.')
    links[col] = id
  }
  if (b.template_id) mustUuid(b.template_id, 'template')

  // Attachments: files from the organization's Files (checked for access), and uploads such as an invoice PDF.
  const attachments = []; let total = 0
  for (const fid of (Array.isArray(b.file_ids) ? b.file_ids : []).slice(0, 10)) {
    mustUuid(fid, 'file')
    const r = await ctx.sb(`org_items?id=eq.${fid}&kind=eq.file&select=name,mime_type,storage_key,size_bytes`)
    const [f] = r.ok ? await r.json() : []
    if (!f) throw new HttpError(404, 'A file you picked is no longer available.')
    total += Number(f.size_bytes || 0)
    if (total > MAX_ATTACH) throw new HttpError(413, 'Attachments can be at most 10 MB in total.')
    attachments.push({ name: fileName(f.name), type: f.mime_type, key: f.storage_key })
  }
  for (const u of (Array.isArray(b.uploads) ? b.uploads : []).slice(0, 5)) {
    let bytes
    try { bytes = unb64(String(u.data_base64 || '')) } catch { throw new HttpError(400, 'An attachment could not be read.') }
    total += bytes.length
    if (total > MAX_ATTACH) throw new HttpError(413, 'Attachments can be at most 10 MB in total.')
    attachments.push({ name: fileName(u.name), type: u.type, bytes })
  }
  for (const a of attachments) if (a.key) {
    const obj = await env.BUCKET.get(a.key)
    if (!obj) throw new HttpError(404, 'A file you picked is no longer available.')
    a.bytes = new Uint8Array(await obj.arrayBuffer())
  }

  const rl = await ctx.sb('rpc/email_sent_last_hour', { method: 'POST', body: '{}' })
  if (!rl.ok || Number(await rl.json()) >= HOURLY_LIMIT) throw new HttpError(429, `You can send up to ${HOURLY_LIMIT} emails per hour. Try again later.`)

  const admin = adminClient(env)
  const ar = await admin.rest(`gmail_accounts?user_id=eq.${me.id}&select=email,refresh_token_enc,status`)
  const [acct] = ar.ok ? await ar.json() : []
  if (!acct) throw new HttpError(409, 'Connect your Gmail account in Settings before sending email.')
  if (acct.status !== 'connected') throw new HttpError(409, 'Your Gmail connection needs to be renewed. Reconnect in Settings.')

  // Record the email first (queued), so even a failed attempt leaves a trace on the records it concerns.
  const ins = await ctx.sb('email_messages', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
    workspace_id: me.workspace_id, sender_id: me.id, sender_email: acct.email, to_addresses: to, cc_addresses: cc, bcc_addresses: bcc,
    subject, body_text: text, status: 'queued', template_id: b.template_id || null,
    attachments: attachments.map((a) => ({ name: a.name, size: a.bytes ? a.bytes.length : 0, type: a.type, source: a.key ? 'file' : 'upload' })),
    contact_id: links.contact_id ?? null, lead_id: links.lead_id ?? null, organization_id: links.organization_id ?? null,
    deal_id: links.deal_id ?? null, invoice_id: links.invoice_id ?? null, task_id: links.task_id ?? null }) })
  if (!ins.ok) throw new HttpError(ins.status === 401 || ins.status === 403 ? 403 : 400, 'You can’t email these records.')
  const [msg] = await ins.json()
  const mark = (body) => ctx.sb(`email_messages?id=eq.${msg.id}`, { method: 'PATCH', body: JSON.stringify(body) })

  let token
  try { token = await refreshAccess(env, await decryptSecret(acct.refresh_token_enc, env.TOKEN_ENCRYPTION_KEY)) }
  catch (e) {
    await mark({ status: 'failed', error: e.message })
    if (e.revoked) await admin.rest(`gmail_accounts?user_id=eq.${me.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'needs_reconnect', last_error: 'Google access was revoked' }) })
    throw e
  }

  const from = formatAddress(me.full_name || acct.email, acct.email)
  const raw = base64url(enc.encode(buildMessage({ from, to, cc, bcc, subject, text, attachments })))
  const sent = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }),
  })
  const data = await sent.json().catch(() => ({}))
  if (!sent.ok) {
    const reason = data.error?.message || 'Gmail did not accept the message.'
    await mark({ status: 'failed', error: reason.slice(0, 500) })
    throw new HttpError(sent.status === 429 ? 429 : 502, `Gmail didn’t send it: ${reason}`)
  }
  await mark({ status: 'sent', sent_at: new Date().toISOString(), gmail_message_id: data.id || null, gmail_thread_id: data.threadId || null })
  return { id: msg.id, status: 'sent', gmail_message_id: data.id, sent_from: acct.email }
}
