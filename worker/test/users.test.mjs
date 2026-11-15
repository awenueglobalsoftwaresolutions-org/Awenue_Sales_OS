// Worker tests with a simulated Supabase (no network). Run: node --test worker/test/
import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../src/index.js'

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ALLOWED_ORIGINS: 'http://localhost:5173' }
const ME = '11111111-1111-1111-1111-111111111111', TARGET = '22222222-2222-2222-2222-222222222222'

function mockSupabase({ perms = [], role = 'admin', profilePatch = 'ok', authCreate = 'ok', roleExists = true, target = { id: TARGET, role: 'sales_executive' } } = {}) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url); const method = init.method || 'GET'; calls.push(`${method} ${u.replace(env.SUPABASE_URL, '')}`)
    const ok = (b, status = 200) => new Response(JSON.stringify(b), { status })
    if (u.endsWith('/auth/v1/user')) return /Bearer good/.test(init.headers.Authorization) ? ok({ id: ME }) : ok({}, 401)
    if (u.includes('rpc/has_permission')) return ok(perms.includes(JSON.parse(init.body).p_key))
    if (u.includes('profiles?id=eq.' + ME)) return ok([{ id: ME, role, workspace_id: 'w', is_active: true }])
    if (u.includes('profiles?id=eq.' + TARGET) && method === 'GET') return ok(target ? [target] : [])
    if (u.includes('/roles?')) return ok(roleExists ? [{ id: 'r' }] : [])
    if (u.includes('auth/v1/admin/users') && method === 'POST') return authCreate === 'ok' ? ok({ id: TARGET }) : ok({ msg: 'User already registered' }, 422)
    if (u.includes('auth/v1/invite')) return ok({ id: TARGET })
    if (u.includes('profiles?id=eq.' + TARGET) && method === 'PATCH') return ok(profilePatch === 'ok' ? [{ id: TARGET }] : [])
    if (u.includes('auth/v1/admin/users/') && method === 'DELETE') return ok({})
    return ok({}, 404)
  }
  return calls
}
const call = (path, body, token = 'good') => worker.fetch(new Request(`https://api.test${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' }, body: JSON.stringify(body) }), env)
const valid = { email: 'new@x.com', full_name: 'New Person', role: 'sales_executive' }

test('rejects unauthenticated and unpermitted callers', async () => {
  mockSupabase(); assert.equal((await call('/users/create', valid, 'bad')).status, 401)
  mockSupabase({ perms: [] }); assert.equal((await call('/users/create', valid)).status, 403)
})
test('validates input before touching accounts', async () => {
  mockSupabase({ perms: ['users.create'] })
  assert.equal((await call('/users/create', { ...valid, email: 'nope' })).status, 400)
  assert.equal((await call('/users/create', { ...valid, password: 'short' })).status, 400)
})
test('role rules: assigning roles needs users.assign; only a Super Admin makes Super Admins', async () => {
  mockSupabase({ perms: ['users.create'] }); assert.equal((await call('/users/create', { ...valid, role: 'sales_manager' })).status, 403)
  mockSupabase({ perms: ['users.create', 'users.assign'], role: 'admin' }); assert.equal((await call('/users/create', { ...valid, role: 'super_admin' })).status, 403)
})
test('creates an account and activates the profile; invite mode when no password', async () => {
  const calls = mockSupabase({ perms: ['users.create'] })
  const res = await call('/users/create', valid); assert.equal(res.status, 201); assert.equal((await res.json()).invited, true)
  assert.ok(calls.some((c) => c.startsWith('POST /auth/v1/invite')) && calls.some((c) => c.startsWith('PATCH /rest/v1/profiles')))
  const calls2 = mockSupabase({ perms: ['users.create'] })
  assert.equal((await (await call('/users/create', { ...valid, password: 'a-long-password' })).json()).invited, false)
  assert.ok(calls2.some((c) => c.startsWith('POST /auth/v1/admin/users')))
})
test('duplicate emails give a clear error and a failed profile setup rolls the account back', async () => {
  mockSupabase({ perms: ['users.create'], authCreate: 'dup' }); assert.equal((await call('/users/create', { ...valid, password: 'a-long-password' })).status, 409)
  const calls = mockSupabase({ perms: ['users.create'], profilePatch: 'fail' })
  assert.equal((await call('/users/create', valid)).status, 500)
  assert.ok(calls.some((c) => c.startsWith('DELETE /auth/v1/admin/users/')), 'half-created account is deleted')
})
test('removing users: not yourself, not a Super Admin unless you are one', async () => {
  mockSupabase({ perms: ['users.delete'] }); assert.equal((await call('/users/remove', { userId: ME })).status, 400)
  mockSupabase({ perms: ['users.delete'], target: { id: TARGET, role: 'super_admin' }, role: 'admin' }); assert.equal((await call('/users/remove', { userId: TARGET })).status, 403)
  mockSupabase({ perms: ['users.delete'] }); assert.equal((await call('/users/remove', { userId: TARGET })).status, 200)
  mockSupabase({ perms: [] }); assert.equal((await call('/users/remove', { userId: TARGET })).status, 403)
})
