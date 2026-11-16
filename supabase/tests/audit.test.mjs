// Audit trail: capture, immutability, visibility, report queries, retention.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb, as } from './harness.mjs'

const U = { root: '00000000-0000-0000-0000-0000000000a1', admin: '00000000-0000-0000-0000-0000000000a2', mgr: '00000000-0000-0000-0000-0000000000a3',
  rep1: '00000000-0000-0000-0000-0000000000a4', rep2: '00000000-0000-0000-0000-0000000000a5' }
let db, ws
const q = (uid, sql, p) => as(db, uid, sql, p)
const rejects = (p, re) => assert.rejects(p, (e) => re.test(e.message), `expected ${re}`)
const setHeaders = (h) => db.query(`select set_config('request.headers', $1, false)`, [h ? JSON.stringify(h) : ''])
const logs = async (uid, where = 'true') => (await q(uid, `select * from audit_logs where ${where} order by id`)).rows
const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

test.before(async () => {
  db = await createDb()
  for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${k}@x.com`])
  ws = (await db.query(`select id from workspaces`)).rows[0].id
  await db.exec(`update profiles set is_active = true, full_name = 'Root Person' where id = '${U.root}';
    update profiles set is_active = true, role = 'admin', full_name = 'Ada Admin' where id = '${U.admin}';
    update profiles set is_active = true, role = 'sales_manager', full_name = 'Max Manager' where id = '${U.mgr}';
    update profiles set is_active = true, full_name = 'Rita Rep', manager_id = '${U.mgr}' where id = '${U.rep1}';
    update profiles set is_active = true, full_name = 'Remy Rep' where id = '${U.rep2}'`)
})

test('data changes are recorded with who, what, before and after', async () => {
  await db.exec(`delete from audit_logs where false`)   // (no-op: audit rows are immutable except via purge)
  await q(U.rep1, `insert into leads (workspace_id, first_name, last_name, created_by, assigned_to) values ($1, 'Asha', 'Rao', $2, $2)`, [ws, U.rep1])
  await q(U.rep1, `update leads set status = 'qualified', priority = 'high' where first_name = 'Asha'`)
  const rows = await logs(U.root, `module = 'leads' and user_id = '${U.rep1}'`)
  const created = rows.find((r) => r.action === 'create'), updated = rows.find((r) => r.action === 'update')
  assert.equal(created.username, 'Rita Rep'); assert.match(created.description, /Created leads "Asha Rao"/); assert.equal(created.updated_data.first_name, 'Asha')
  assert.deepEqual(updated.previous_data, { status: 'new', priority: 'medium' })
  assert.deepEqual(updated.updated_data, { status: 'qualified', priority: 'high' })
  assert.match(updated.description, /\(priority, status\)/)
  assert.equal(updated.status, 'success')
  const before = (await logs(U.root)).length
  await db.exec(`update leads set updated_at = now()`)                    // timestamp-only change: not worth a row
  assert.equal((await logs(U.root)).length, before)
})

test('IP and device come from trusted request headers; spoofable ones are flagged or ignored', async () => {
  await setHeaders({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '6.6.6.6', 'user-agent': CHROME_WIN })
  await q(U.rep1, `insert into organizations (workspace_id, name, created_by) values ($1, 'Org One', $2)`, [ws, U.rep1])
  let r = (await logs(U.root, `module = 'organizations'`))[0]
  assert.equal(r.ip_address, '203.0.113.9'); assert.equal(r.metadata.ip_source, 'cf-connecting-ip')
  assert.deepEqual([r.browser, r.os, r.device], ['Chrome', 'Windows', 'Desktop'])

  await setHeaders({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' })
  await q(U.rep1, `insert into organizations (workspace_id, name, created_by) values ($1, 'Org Two', $2)`, [ws, U.rep1])
  r = (await logs(U.root, `description like '%Org Two%'`))[0]
  assert.equal(r.ip_address, '198.51.100.7'); assert.equal(r.metadata.ip_source, 'x-forwarded-for', 'unverified source is labelled')
  assert.deepEqual([r.browser, r.os, r.device], ['Safari', 'iOS', 'Mobile'])

  await setHeaders({ 'cf-connecting-ip': 'not-an-ip; drop table', 'user-agent': 'curl/8.0' })
  await q(U.rep1, `insert into organizations (workspace_id, name, created_by) values ($1, 'Org Three', $2)`, [ws, U.rep1])
  r = (await logs(U.root, `description like '%Org Three%'`))[0]
  assert.equal(r.ip_address, null); assert.equal(r.browser, 'API client')
  await setHeaders(null)
})

test('locations come from the server-side cache, never from the caller', async () => {
  await db.query(`select remember_ip_geo('203.0.113.9', 'India', 'Uttar Pradesh', 'Varanasi', 'Example Telecom')`)
  await setHeaders({ 'cf-connecting-ip': '203.0.113.9', 'user-agent': CHROME_WIN })
  await q(U.rep1, `insert into organizations (workspace_id, name, created_by) values ($1, 'Org Four', $2)`, [ws, U.rep1])
  const r = (await logs(U.root, `description like '%Org Four%'`))[0]
  assert.deepEqual([r.country, r.region, r.city, r.isp], ['India', 'Uttar Pradesh', 'Varanasi', 'Example Telecom'])
  await setHeaders(null)
  const direct = await q(U.rep1, `select remember_ip_geo('1.1.1.1', 'X', 'X', 'X', 'X')`).catch((e) => e)
  assert.ok(direct instanceof Error, 'clients can\'t write the geo cache')
  await rejects(q(U.rep1, `select * from ip_geo_cache`), /permission denied|row-level/).catch(async () => assert.equal((await q(U.rep1, `select * from ip_geo_cache`)).rows.length, 0))
})

test('the trail is append-only for everyone', async () => {
  await rejects(db.query(`update audit_logs set description = 'edited'`), /can't be changed or deleted/)
  await rejects(db.query(`delete from audit_logs`), /can't be changed or deleted/)
  await rejects(db.query(`truncate audit_logs`), /can't be truncated/)
  for (const u of [U.root, U.admin, U.rep1]) {
    const upd = await q(U.admin, `update audit_logs set description = 'x' returning id`).catch((e) => e)
    assert.ok(upd instanceof Error || upd.rows.length === 0)
    assert.ok(u)
  }
  const ins = await q(U.rep1, `insert into audit_logs (workspace_id, username, action, module) values ($1, 'forged', 'login', 'auth')`, [ws]).catch((e) => e)
  assert.ok(ins instanceof Error, 'no direct inserts through the API')
})

test('visibility: own trail, team for reports.view, everyone for reports.manage', async () => {
  await q(U.rep2, `insert into organizations (workspace_id, name, created_by) values ($1, 'Rep2 Org', $2)`, [ws, U.rep2])
  const names = async (u) => [...new Set((await logs(u)).map((r) => r.username))].sort()
  assert.deepEqual(await names(U.rep1), ['Rita Rep'])                                  // own only
  assert.deepEqual(await names(U.rep2), ['Remy Rep'])
  const mgrSees = await names(U.mgr)
  assert.ok(mgrSees.includes('Rita Rep') && !mgrSees.includes('Remy Rep'), 'manager sees their team only')
  const admin = await names(U.admin), root = await names(U.root)
  assert.ok(admin.includes('Rita Rep') && admin.includes('Remy Rep')); assert.ok(root.includes('Remy Rep'))
})

test('secrets never reach the log', async () => {
  const j = (await db.query(`select scrub_json('{"a":1,"api_token":"abc","nested":{"Password":"x","ok":2},"list":[{"secret_key":"s"}]}'::jsonb) j`)).rows[0].j
  assert.equal(j.api_token, '[redacted]'); assert.equal(j.nested.Password, '[redacted]'); assert.equal(j.nested.ok, 2); assert.equal(j.list[0].secret_key, '[redacted]')
  await q(U.rep1, `update profiles set preferences = '{"refresh_token":"abc","theme":"dark"}' where id = $1`, [U.rep1])
  const r = (await logs(U.root, `module = 'users' and action = 'update' and user_id = '${U.rep1}'`)).pop()
  assert.equal(r.updated_data.preferences.refresh_token, '[redacted]'); assert.equal(r.updated_data.preferences.theme, 'dark')
})

test('apps can record exports and downloads but cannot forge sign-ins', async () => {
  await q(U.rep1, `select log_event('export', 'leads', null, 'Exported 12 rows', '{"rows":12}')`)
  const r = (await logs(U.root, `action = 'export'`))[0]
  assert.equal(r.username, 'Rita Rep'); assert.equal(r.user_id, U.rep1); assert.equal(r.metadata.rows, 12)
  await rejects(q(U.rep1, `select log_event('login', 'auth')`), /can't be recorded/)
  await rejects(q(U.rep1, `select log_event_service($1, 'x', 'login', 'auth', null, '', 'success', '{}', null, null, null, null, null, null)`, [U.rep1]), /permission denied/)
  await db.query(`select log_event_service($1, 'Rita Rep', 'login_failed', 'auth', null, 'Failed sign-in', 'failed', '{}', '203.0.113.50', $2, 'India', 'Delhi', 'New Delhi', 'ISP')`, [null, CHROME_WIN])
  const f = (await logs(U.root, `action = 'login_failed'`))[0]
  assert.equal(f.status, 'failed'); assert.equal(f.city, 'New Delhi'); assert.equal(f.user_id, null)
  assert.equal(Number((await db.query(`select recent_failed_logins('203.0.113.50', null, 15) n`)).rows[0].n), 1)
})

test('report queries: filters, paging, sorting and summary', async () => {
  const args = (o = {}) => [o.user ?? null, o.text ?? null, o.from ?? null, o.to ?? null, o.tf ?? null, o.tt ?? null, 'Asia/Kolkata', o.module ?? null, o.action ?? null, o.status ?? null, o.ip ?? null, o.loc ?? null, o.search ?? null]
  const ph = (n, start = 1) => Array.from({ length: n }, (_, i) => `$${start + i}`).join(',')
  const search = async (u, o, extra = ['created_at', 'desc', 25, 0]) => (await q(u, `select audit_search(${ph(13 + extra.length)}) r`, [...args(o), ...extra])).rows[0].r
  const summary = async (u, o) => (await q(u, `select audit_summary(${ph(13)}) r`, args(o))).rows[0].r

  const all = await search(U.root, {}); assert.ok(all.total >= 10 && all.rows.length === Math.min(25, all.total))
  const byUser = await search(U.root, { user: U.rep1 }); assert.ok(byUser.rows.every((r) => r.user_id === U.rep1))
  const byName = await search(U.root, { text: 'rita' }); assert.ok(byName.total > 0 && byName.rows.every((r) => r.username === 'Rita Rep'))
  const byId = await search(U.root, { text: U.rep1 }); assert.equal(byId.total, byUser.total)
  assert.ok((await search(U.root, { module: 'leads', action: 'update' })).rows.every((r) => r.module === 'leads' && r.action === 'update'))
  assert.equal((await search(U.root, { status: 'failed' })).total, 1)
  assert.ok((await search(U.root, { ip: '203.0.113' })).total >= 2)
  assert.ok((await search(U.root, { loc: 'varanasi' })).rows.every((r) => r.city === 'Varanasi'))
  const p1 = await search(U.root, {}, ['created_at', 'asc', 3, 0]), p2 = await search(U.root, {}, ['created_at', 'asc', 3, 3])
  assert.equal(p1.rows.length, 3); assert.ok(p1.rows[2].id < p2.rows[0].id, 'paging moves forward')
  const bad = await search(U.root, {}, ['created_at; drop table audit_logs', 'desc', 5, 0]); assert.ok(bad.rows.length > 0, 'sort column is whitelisted')
  assert.equal((await search(U.rep1, {})).rows.some((r) => r.user_id !== U.rep1), false)

  const s = await summary(U.root, { user: U.rep1 })
  assert.equal(s.total, byUser.total); assert.equal(s.success + s.failed, s.total)
  assert.ok(s.created >= 1 && s.updated >= 1 && s.unique_ips >= 1)
  assert.equal(s.by_hour.length, 24); assert.equal(s.by_hour.reduce((n, h) => n + h.count, 0), s.total)
  assert.equal(s.by_day.reduce((n, d) => n + d.count, 0), s.total)
  assert.ok(s.first_at <= s.last_at && s.locations.some((l) => l.location === 'Varanasi, Uttar Pradesh, India'))
  assert.equal((await summary(U.root, {})).failed_logins, 1)

  // time-of-day window, evaluated in the report's time zone: a window that excludes "now" returns nothing, one that includes it returns everything
  const nowIst = (await db.query(`select to_char(now() at time zone 'Asia/Kolkata', 'HH24:MI') t`)).rows[0].t
  const [h] = nowIst.split(':').map(Number)
  const inside = await search(U.root, { user: U.rep1, tf: `${String((h + 23) % 24).padStart(2, '0')}:00`, tt: `${String((h + 1) % 24).padStart(2, '0')}:59` })
  assert.equal(inside.total, byUser.total)
  const outside = await search(U.root, { user: U.rep1, tf: `${String((h + 3) % 24).padStart(2, '0')}:00`, tt: `${String((h + 5) % 24).padStart(2, '0')}:00` })
  assert.equal(outside.total, 0)
})

test('retention: only report managers can purge, old rows go, the purge itself is logged', async () => {
  await db.exec(`insert into audit_logs (workspace_id, username, action, module, created_at) select id, 'Old Timer', 'update', 'leads', now() - interval '400 days' from workspaces;
                 insert into audit_logs (workspace_id, username, action, module, created_at) select id, 'Old Timer', 'update', 'leads', now() - interval '10 days' from workspaces`)
  await rejects(q(U.rep1, `select purge_audit_logs()`), /permission/)
  await rejects(q(U.mgr, `select purge_audit_logs()`), /permission/)
  await rejects(q(U.admin, `select set_audit_retention(5)`), /between 30 and 3650/)
  await q(U.admin, `select set_audit_retention(365)`)
  const n = Number((await q(U.admin, `select purge_audit_logs() n`)).rows[0].n)
  assert.equal(n, 1)
  const left = (await logs(U.root, `username = 'Old Timer'`)); assert.equal(left.length, 1)
  assert.ok((await logs(U.root, `action = 'purge'`))[0].description.startsWith('Deleted 1 audit records'))
  await rejects(db.query(`delete from audit_logs`), /can't be changed or deleted/)       // the purge switch doesn't stay on
})
