// Sign-in, audit events and throttling, against a simulated Supabase.
import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ALLOWED_ORIGINS: 'http://localhost:5173' }
const UID = '11111111-1111-1111-1111-111111111111'

function mock({ password = 'right', failures = 0, active = true, upstream = null } = {}) {
  const audit = []; const geo = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); const body = init.body ? JSON.parse(init.body) : {}
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status })
    if (u.includes('/auth/v1/token')) return upstream ? ok({}, upstream) : body.password === password ? ok({ access_token: 'at', refresh_token: 'rt', user: { id: UID } }) : ok({ error: 'invalid_grant' }, 400)
    if (u.includes('/auth/v1/user')) return /Bearer good/.test(init.headers.Authorization) ? ok({ id: UID }) : ok({}, 401)
    if (u.includes('rpc/recent_failed_logins')) return ok(failures)
    if (u.includes('rpc/log_event_service')) { audit.push(body); return ok(null, 200) }
    if (u.includes('rpc/remember_ip_geo')) { geo.push(body); return ok(null, 200) }
    if (u.includes('/rest/v1/profiles')) return ok([{ full_name: 'Rita Rep', email: 'rita@x.com', is_active: active }])
    return ok({}, 404)
  }
  return { audit, geo }
}
const req = (path, body, { token, ip = '203.0.113.9', cf = { country: 'India', region: 'Uttar Pradesh', city: 'Varanasi', asOrganization: 'Example Telecom' } } = {}) => {
  const r = new Request(`https://api.test${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, 'User-Agent': 'TestAgent', Origin: 'http://localhost:5173', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) })
  Object.defineProperty(r, 'cf', { value: cf })
  return worker.fetch(r, env)
}

test('successful sign-in returns the session and records who, from where', async () => {
  const { audit } = mock()
  const res = await req('/auth/login', { email: 'Rita@X.com ', password: 'right' })
  assert.equal(res.status, 200); assert.equal((await res.json()).access_token, 'at')
  const a = audit[0]
  assert.deepEqual([a.p_action, a.p_user, a.p_username, a.p_status, a.p_ip, a.p_city, a.p_country, a.p_isp], ['login', UID, 'Rita Rep', 'success', '203.0.113.9', 'Varanasi', 'India', 'Example Telecom'])
  assert.ok(!JSON.stringify(audit).includes('right'), 'the password is never logged')
})

test('failed sign-in is recorded with the same answer whether or not the account exists', async () => {
  const { audit } = mock()
  const res = await req('/auth/login', { email: 'nobody@x.com', password: 'wrong' })
  assert.equal(res.status, 400); assert.equal((await res.json()).error, 'Email or password is incorrect.')
  assert.deepEqual([audit[0].p_action, audit[0].p_status, audit[0].p_username, audit[0].p_user], ['login_failed', 'failed', 'nobody@x.com', null])
  assert.ok(!JSON.stringify(audit).includes('wrong'))
})

test('repeated failures are throttled before the password is even checked', async () => {
  const { audit } = mock({ failures: 10 })
  const res = await req('/auth/login', { email: 'a@x.com', password: 'right' })
  assert.equal(res.status, 429); assert.equal(audit[0].p_metadata.reason, 'throttled')
})

test('an unavailable auth service is reported honestly and not logged as a failed password', async () => {
  const { audit } = mock({ upstream: 503 })
  assert.equal((await req('/auth/login', { email: 'a@x.com', password: 'right' })).status, 502); assert.equal(audit.length, 0)
})

test('app events: only known types, user comes from the token, location from Cloudflare', async () => {
  const { audit } = mock()
  assert.equal((await req('/audit/event', { action: 'export', module: 'leads' }, { token: 'bad' })).status, 401)
  assert.equal((await req('/audit/event', { action: 'login', module: 'auth' }, { token: 'good' })).status, 400)
  assert.equal((await req('/audit/event', { action: 'export', module: 'Leads;drop' }, { token: 'good' })).status, 400)
  assert.equal((await req('/audit/event', { action: 'export', module: 'leads', description: 'Exported 5 rows', user_id: 'forged', metadata: { rows: 5 } }, { token: 'good' })).status, 200)
  assert.deepEqual([audit[0].p_user, audit[0].p_username, audit[0].p_action, audit[0].p_ip], [UID, 'Rita Rep', 'export', '203.0.113.9'])
  mock({ active: false }); assert.equal((await req('/audit/event', { action: 'export', module: 'leads' }, { token: 'good' })).status, 403)
})

test('session ping remembers the address location; a bogus IP header is ignored', async () => {
  const { geo } = mock()
  assert.equal((await req('/audit/session', {}, { token: 'good' })).status, 200)
  assert.deepEqual([geo[0].p_ip, geo[0].p_city], ['203.0.113.9', 'Varanasi'])
  const m = mock(); await req('/audit/session', {}, { token: 'good', ip: 'not an ip' }); assert.equal(m.geo.length, 0)
})
