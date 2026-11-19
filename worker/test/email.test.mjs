// Gmail connection and sending, against a simulated Supabase, Google and Gmail.
import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'
import { encryptSecret, decryptSecret } from '../src/lib/crypto.js'
import { buildMessage, htmlFromText, b64, unb64 } from '../src/lib/mime.js'
import { signState, verifyState } from '../src/lib/oauth.js'

const ME = '11111111-1111-1111-1111-111111111111', WS = '22222222-2222-2222-2222-222222222222'
const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ALLOWED_ORIGINS: 'http://localhost:5173',
  FILE_SIGNING_SECRET: 'sign-secret', TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32), GOOGLE_CLIENT_ID: 'cid.apps', GOOGLE_CLIENT_SECRET: 'csec',
  GOOGLE_REDIRECT_URI: 'https://api.test/gmail/callback', APP_URL: 'https://app.test' }
const acctRow = async (extra = {}) => ({ email: 'rita@gmail.com', refresh_token_enc: await encryptSecret('REFRESH-SECRET', env.TOKEN_ENCRYPTION_KEY), status: 'connected', ...extra })
const parse = (b) => { if (typeof b !== 'string') return b; try { return JSON.parse(b) } catch { return b } }

function mock(o = {}) {
  const calls = []
  const perms = o.perms ?? ['communications.create']
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || 'GET', body = parse(init.body)
    calls.push({ u, m, body })
    const ok = (b, s = 200) => (s === 204 ? new Response(null, { status: 204 }) : new Response(b === undefined ? '' : JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } }))
    if (u.endsWith('/auth/v1/user')) return /Bearer good/.test(init.headers?.Authorization || '') ? ok({ id: ME }) : ok({}, 401)
    if (u.includes('/rpc/has_permission')) return ok(perms.includes(body.p_key))
    if (u.includes('/rpc/email_sent_last_hour')) return ok(o.sentLastHour ?? 0)
    if (u.includes(`/rest/v1/profiles?id=eq.${ME}`)) return ok([{ id: ME, role: 'sales_executive', workspace_id: WS, is_active: true, full_name: 'Rita Rep', email: 'rita@crm.test' }])
    if (u.includes('/rest/v1/gmail_accounts')) return m === 'GET' ? ok(o.acct ? [o.acct] : []) : ok([])
    if (u.includes('/rest/v1/email_messages')) return m === 'POST' ? ok([{ id: 'm1' }], 201) : ok(undefined, 204)
    if (/\/rest\/v1\/(contacts|leads|organizations|deals|invoices|tasks)\?id=eq\./.test(u)) return ok(o.visible === false ? [] : [{ id: 'x' }])
    if (u.includes('/rest/v1/org_items?id=eq.')) return ok(o.file ? [o.file] : [])
    if (u.includes('oauth2.googleapis.com/token')) {
      if (String(init.body).includes('authorization_code')) return ok({ access_token: 'at-1', refresh_token: 'REFRESH-SECRET' })
      if (o.refresh === 'revoked') return ok({ error: 'invalid_grant' }, 400)
      return ok({ access_token: 'at-2' })
    }
    if (u.includes('openidconnect.googleapis.com')) return ok({ email: 'Rita@Gmail.com', email_verified: true })
    if (u.includes('gmail.googleapis.com/gmail/v1/users/me/messages/send')) return o.gmailStatus ? ok({ error: { message: 'Login Required' } }, o.gmailStatus) : ok({ id: 'g1', threadId: 't1' })
    if (u.includes('oauth2.googleapis.com/revoke')) return ok({})
    return ok({}, 404)
  }
  return calls
}
const sendReq = (body, extraEnv = {}) => worker.fetch(new Request('https://api.test/email/send', { method: 'POST',
  headers: { Authorization: 'Bearer good', 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) }), { ...env, ...extraEnv })
const rawOf = (calls) => {
  const c = calls.find((x) => x.u.includes('messages/send'))
  const s = c.body.raw.replace(/-/g, '+').replace(/_/g, '/')
  return new TextDecoder().decode(unb64(s + '='.repeat((4 - (s.length % 4)) % 4)))
}
const find = (calls, pred) => calls.find(pred)

test('sending needs the communications.create permission', async () => {
  mock({ perms: [], acct: await acctRow() })
  assert.equal((await sendReq({ to: ['a@b.co'], subject: 'Hi', body_text: 'x' })).status, 403)
})

test('sending asks the person to connect Gmail first, and to reconnect a revoked account', async () => {
  mock({ acct: null })
  assert.equal((await sendReq({ to: ['a@b.co'], subject: 'Hi', body_text: 'x' })).status, 409)
  mock({ acct: await acctRow({ status: 'needs_reconnect' }) })
  assert.equal((await sendReq({ to: ['a@b.co'], subject: 'Hi', body_text: 'x' })).status, 409)
})

test('mail is sent from the signed-in person\'s own Gmail account, whatever sender the request claims', async () => {
  const calls = mock({ acct: await acctRow() })
  const res = await sendReq({ to: ['client@acme.com'], subject: 'Follow-up', body_text: 'Hi', sender_email: 'evil@x.com', links: { contact_id: '66666666-6666-6666-6666-666666666666' } })
  assert.equal(res.status, 200); assert.equal((await res.json()).status, 'sent')
  const ins = find(calls, (c) => c.u.includes('/rest/v1/email_messages') && c.m === 'POST').body
  assert.equal(ins.sender_email, 'rita@gmail.com'); assert.equal(ins.sender_id, ME); assert.equal(ins.status, 'queued'); assert.equal(ins.contact_id, '66666666-6666-6666-6666-666666666666')
  const raw = rawOf(calls)
  assert.match(raw, /^From: Rita Rep <rita@gmail\.com>\r?$/m); assert.ok(!/evil@x\.com/.test(raw))
  const patch = find(calls, (c) => c.u.includes('email_messages?id=eq.m1') && c.m === 'PATCH').body
  assert.equal(patch.status, 'sent'); assert.equal(patch.gmail_message_id, 'g1')
})

test('bad recipients and too many recipients are refused', async () => {
  mock({ acct: await acctRow() })
  assert.equal((await sendReq({ to: ['not an email'], subject: 'Hi', body_text: 'x' })).status, 400)
  assert.equal((await sendReq({ to: [], subject: 'Hi', body_text: 'x' })).status, 400)
  const many = Array.from({ length: 51 }, (_, i) => `p${i}@x.co`)
  assert.equal((await sendReq({ to: many, subject: 'Hi', body_text: 'x' })).status, 400)
})

test('line breaks in the subject can\'t inject extra headers', async () => {
  const calls = mock({ acct: await acctRow() })
  const res = await sendReq({ to: ['a@b.co'], subject: 'Hi\r\nBcc: spy@evil.com', body_text: 'x' })
  assert.equal(res.status, 200)
  const raw = rawOf(calls)
  assert.ok(!/^Bcc:/m.test(raw), 'no injected Bcc header')
  assert.ok(!/\r\nBcc:/.test(raw))
})

test('a record the sender can\'t see can\'t be linked', async () => {
  mock({ acct: await acctRow(), visible: false })
  assert.equal((await sendReq({ to: ['a@b.co'], subject: 'Hi', body_text: 'x', links: { deal_id: '33333333-3333-3333-3333-333333333333' } })).status, 404)
})

test('attachments from Files are capped at 10 MB in total', async () => {
  mock({ acct: await acctRow(), file: { name: 'huge.pdf', mime_type: 'application/pdf', storage_key: 'k', size_bytes: 11 * 1024 * 1024 } })
  const res = await sendReq({ to: ['a@b.co'], subject: 'Hi', body_text: 'x', file_ids: ['44444444-4444-4444-4444-444444444444'] }, { BUCKET: { get: async () => null } })
  assert.equal(res.status, 413)
})

test('the hourly limit stops runaway sending', async () => {
  mock({ acct: await acctRow(), sentLastHour: 200 })
  assert.equal((await sendReq({ to: ['a@b.co'], subject: 'Hi', body_text: 'x' })).status, 429)
})

test('a rejected Gmail send is recorded as failed, with the reason', async () => {
  const calls = mock({ acct: await acctRow(), gmailStatus: 401 })
  const res = await sendReq({ to: ['a@b.co'], subject: 'Hi', body_text: 'x' })
  assert.equal(res.status, 502)
  const patch = find(calls, (c) => c.u.includes('email_messages?id=eq.m1') && c.m === 'PATCH').body
  assert.equal(patch.status, 'failed'); assert.match(patch.error, /Login Required/)
})

test('a revoked Google grant is recorded and the account is flagged for reconnection', async () => {
  const calls = mock({ acct: await acctRow(), refresh: 'revoked' })
  const res = await sendReq({ to: ['a@b.co'], subject: 'Hi', body_text: 'x' })
  assert.equal(res.status, 409)
  assert.ok(find(calls, (c) => c.u.includes('gmail_accounts') && c.m === 'PATCH' && c.body.status === 'needs_reconnect'))
  assert.equal(find(calls, (c) => c.u.includes('email_messages?id=eq.m1') && c.m === 'PATCH').body.status, 'failed')
})

test('files from Files are attached as real attachments', async () => {
  const calls = mock({ acct: await acctRow(), file: { name: 'Quote & Co.pdf', mime_type: 'application/pdf', storage_key: 'k1', size_bytes: 5 } })
  const bucket = { get: async () => ({ arrayBuffer: async () => new TextEncoder().encode('hello').buffer }) }
  const res = await sendReq({ to: ['a@b.co'], subject: 'Hi', body_text: 'See attached', file_ids: ['55555555-5555-5555-5555-555555555555'] }, { BUCKET: bucket })
  assert.equal(res.status, 200)
  const raw = rawOf(calls)
  assert.match(raw, /Content-Disposition: attachment; filename\*=UTF-8''Quote%20%26%20Co\.pdf/)
  assert.ok(raw.includes(b64(new TextEncoder().encode('hello'))))
})

test('connecting returns a Google link with a signed state, offline access and Gmail send scope', async () => {
  mock()
  const r = await worker.fetch(new Request('https://api.test/gmail/connect', { method: 'POST', headers: { Authorization: 'Bearer good', Origin: 'http://localhost:5173' }, body: '{}' }), env)
  const u = new URL((await r.json()).url)
  assert.ok(u.searchParams.get('scope').includes('https://www.googleapis.com/auth/gmail.send'))
  assert.equal(u.searchParams.get('access_type'), 'offline'); assert.equal(u.searchParams.get('prompt'), 'consent')
  assert.equal((await verifyState(u.searchParams.get('state'), env.FILE_SIGNING_SECRET)).u, ME)
})

test('the Google callback stores the refresh token sealed, never in plain text', async () => {
  const state = await signState({ u: ME, n: 'n1', exp: Math.floor(Date.now() / 1000) + 600 }, env.FILE_SIGNING_SECRET)
  const calls = mock()
  const r = await worker.fetch(new Request(`https://api.test/gmail/callback?code=abc&state=${encodeURIComponent(state)}`), env)
  assert.equal(r.status, 302)
  assert.equal(new URL(r.headers.get('Location')).searchParams.get('gmail'), 'connected')
  const up = find(calls, (c) => c.u.includes('gmail_accounts?on_conflict=user_id'))
  assert.equal(up.body.email, 'rita@gmail.com'); assert.ok(!JSON.stringify(up.body).includes('REFRESH-SECRET'))
  assert.equal(await decryptSecret(up.body.refresh_token_enc, env.TOKEN_ENCRYPTION_KEY), 'REFRESH-SECRET')
})

test('a forged or expired sign-in state is refused', async () => {
  mock()
  const forged = await worker.fetch(new Request('https://api.test/gmail/callback?code=abc&state=bad.sig'), env)
  assert.equal(new URL(forged.headers.get('Location')).searchParams.get('gmail'), 'error')
  const old = await signState({ u: ME, n: 'n', exp: 1 }, env.FILE_SIGNING_SECRET)
  const expired = await worker.fetch(new Request(`https://api.test/gmail/callback?code=abc&state=${encodeURIComponent(old)}`), env)
  assert.equal(new URL(expired.headers.get('Location')).searchParams.get('gmail'), 'error')
})

test('disconnecting removes the stored token', async () => {
  const calls = mock({ acct: await acctRow() })
  const r = await worker.fetch(new Request('https://api.test/gmail/disconnect', { method: 'POST', headers: { Authorization: 'Bearer good', Origin: 'http://localhost:5173' }, body: '{}' }), env)
  assert.equal(r.status, 200)
  assert.ok(find(calls, (c) => c.u.includes('gmail_accounts?user_id=eq.') && c.m === 'DELETE'))
})

test('stored tokens are encrypted: round trip works; tampering and a wrong key fail', async () => {
  const sealed = await encryptSecret('REFRESH-SECRET', env.TOKEN_ENCRYPTION_KEY)
  assert.ok(!sealed.includes('REFRESH')); assert.equal(await decryptSecret(sealed, env.TOKEN_ENCRYPTION_KEY), 'REFRESH-SECRET')
  await assert.rejects(decryptSecret(sealed, 'cd'.repeat(32)))
  const i = Math.floor(sealed.length / 2)
  const bad = sealed.slice(0, i) + (sealed[i] === 'A' ? 'B' : 'A') + sealed.slice(i + 1)
  await assert.rejects(decryptSecret(bad, env.TOKEN_ENCRYPTION_KEY))
})

test('MIME: encoded subject and filenames, RFC line limits, attachments, Bcc, escaped HTML', () => {
  const msg = buildMessage({ from: 'Rita <rita@gmail.com>', to: ['a@b.co'], cc: ['c@d.co'], bcc: ['e@f.co'], subject: 'Café – offer',
    text: 'Line <b>one</b>\nLine two', attachments: [{ name: 'Offer €.pdf', type: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) }] })
  const enc = msg.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m)
  assert.ok(enc); assert.equal(new TextDecoder().decode(unb64(enc[1])), 'Café – offer')
  assert.match(msg, /^Bcc: e@f\.co$/m); assert.match(msg, /multipart\/mixed/)
  assert.match(msg, /filename\*=UTF-8''Offer%20%E2%82%AC\.pdf/)
  for (const line of msg.split('\r\n')) assert.ok(line.length <= 998, 'no line over the RFC limit')
  const b64Lines = msg.split('\r\n').filter((l) => /^[A-Za-z0-9+/=]{20,}$/.test(l))
  assert.ok(b64Lines.length > 0 && b64Lines.every((l) => l.length <= 76))
  assert.ok(htmlFromText('<script>x</script>').includes('&lt;script&gt;'))
  assert.equal(new TextDecoder().decode(unb64(b64(new TextEncoder().encode('ok')))), 'ok')
})
