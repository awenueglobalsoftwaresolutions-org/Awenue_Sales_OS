// Runs every migration on an in-process Postgres and checks the security model end to end.
//   npm run test:db
import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb, as } from './harness.mjs'

const U = { root: '00000000-0000-0000-0000-000000000001', mgr: '00000000-0000-0000-0000-000000000002', rep1: '00000000-0000-0000-0000-000000000003',
  rep2: '00000000-0000-0000-0000-000000000004', stranger: '00000000-0000-0000-0000-000000000005', lead: '00000000-0000-0000-0000-000000000006',
  admin: '00000000-0000-0000-0000-000000000007' }
let db, ws
const q = (uid, sql, p) => as(db, uid, sql, p)
const rejects = (promise, re) => assert.rejects(promise, (e) => re.test(e.message), `expected an error matching ${re}`)
const count = async (uid, table) => Number((await q(uid, `select count(*)::int c from ${table}`)).rows[0].c)

test.before(async () => {
  db = await createDb()
  for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, `${k}@x.com`, k === 'stranger' ? '{"role":"super_admin"}' : '{}'])
  ws = (await db.query(`select id from workspaces`)).rows[0].id
  // service role provisions the team
  await db.exec(`update profiles set is_active = true, role = 'sales_manager' where id = '${U.mgr}';
                 update profiles set is_active = true where id in ('${U.rep1}','${U.rep2}','${U.lead}','${U.admin}');
                 update profiles set role = 'admin' where id = '${U.admin}'`)
})

test('first user is Super Admin; later sign-ups start inactive and ignore client-supplied roles', async () => {
  const p = (await db.query(`select id, role, is_active from profiles`)).rows
  assert.equal(p.find((x) => x.id === U.root).role, 'super_admin')
  assert.equal(p.find((x) => x.id === U.root).is_active, true)
  const s = p.find((x) => x.id === U.stranger)
  assert.equal(s.role, 'sales_executive'); assert.equal(s.is_active, false)
  assert.equal(await count(U.stranger, 'profiles'), 0, 'an inactive user must see no data')
  assert.equal(await count(U.stranger, 'organizations'), 0)
})

test('permission lists match the role defaults', async () => {
  const perms = async (u) => (await q(u, `select my_permissions() p`)).rows[0].p
  assert.ok((await perms(U.root)).includes('roles.manage'))
  const rep = await perms(U.rep1)
  assert.ok(rep.includes('leads.view') && !rep.includes('leads.manage') && !rep.includes('users.view'))
  const admin = await perms(U.admin)
  assert.ok(admin.includes('users.create') && !admin.includes('roles.manage') && !admin.includes('users.delete'))
})

test('representatives only see and assign their own leads; managers see all', async () => {
  await q(U.rep1, `insert into leads (workspace_id, first_name, created_by, assigned_to) values ($1, 'R1 lead', $2, $2)`, [ws, U.rep1])
  await q(U.rep2, `insert into leads (workspace_id, first_name, created_by, assigned_to) values ($1, 'R2 lead', $2, $2)`, [ws, U.rep2])
  assert.equal(await count(U.rep1, 'leads'), 1)
  assert.equal(await count(U.rep2, 'leads'), 1)
  assert.equal(await count(U.mgr, 'leads'), 2)
  assert.equal(await count(U.root, 'leads'), 2)
  await rejects(q(U.rep1, `insert into leads (workspace_id, first_name, created_by) values ($1, 'x', $2)`, [ws, U.rep2]), /row-level security/)
  await rejects(q(U.rep1, `insert into leads (workspace_id, first_name, created_by, assigned_to) values ($1, 'x', $2, $3)`, [ws, U.rep1, U.rep2]), /permission to assign/)
  await rejects(q(U.rep1, `update leads set assigned_to = $1`, [U.rep2]), /permission to reassign/)
  const touched = await q(U.rep1, `update leads set notes = 'hi' where first_name = 'R2 lead' returning id`)
  assert.equal(touched.rows.length, 0, 'cannot edit someone else\'s lead')
  await q(U.mgr, `update leads set assigned_to = $1 where first_name = 'R1 lead'`, [U.rep2])           // managers can assign
  assert.equal(await count(U.rep2, 'leads'), 2)
  await q(U.mgr, `update leads set assigned_to = $1 where first_name = 'R1 lead'`, [U.rep1])
})

test('organizations: reps can add but not delete; duplicates and linked deletes are blocked', async () => {
  await q(U.rep1, `insert into organizations (workspace_id, name, created_by) values ($1, 'Acme', $2)`, [ws, U.rep1])
  await rejects(q(U.rep2, `insert into organizations (workspace_id, name) values ($1, 'ACME')`, [ws]), /organizations_name_uq/)
  const del = await q(U.rep1, `delete from organizations where name = 'Acme' returning id`)
  assert.equal(del.rows.length, 0)
  await q(U.rep1, `insert into contacts (workspace_id, first_name, organization_id, created_by) select $1, 'C', id, $2 from organizations`, [ws, U.rep1])
  await rejects(q(U.mgr, `delete from organizations where name = 'Acme'`), /still has 1 contact/)
})

test('profile guards: no self promotion, no email change, no self-deactivation', async () => {
  await q(U.rep1, `update profiles set full_name = 'Rep One', job_title = 'AE', department = 'Sales', timezone = 'Asia/Kolkata' where id = $1`, [U.rep1])
  await rejects(q(U.rep1, `update profiles set role = 'super_admin' where id = $1`, [U.rep1]), /permission to change roles/)
  await rejects(q(U.rep1, `update profiles set email = 'x@y.com' where id = $1`, [U.rep1]), /can't be changed/)
  await rejects(q(U.rep1, `update profiles set is_active = false where id = $1`, [U.rep1]), /permission to activate/)
  const other = await q(U.rep1, `update profiles set full_name = 'hacked' where id = $1 returning id`, [U.rep2])
  assert.equal(other.rows.length, 0)
  await rejects(q(U.root, `update profiles set is_active = false where id = $1`, [U.root]), /deactivate your own/)
})

test('role management: admins can\'t mint Super Admins, only roles.manage edits roles', async () => {
  await rejects(q(U.admin, `update profiles set role = 'super_admin' where id = $1`, [U.rep2]), /Only a Super Admin/)
  await q(U.admin, `update profiles set role = 'sales_manager' where id = $1`, [U.rep2])
  await q(U.admin, `update profiles set role = 'sales_executive' where id = $1`, [U.rep2])
  assert.equal((await q(U.rep1, `update profiles set role = 'admin' where id = $1 returning id`, [U.rep2])).rows.length, 0, 'a rep can\'t touch another profile at all')
  await rejects(q(U.admin, `update profiles set full_name = 'x' where id = $1`, [U.root]), /Only a Super Admin/)
  await rejects(q(U.root, `update profiles set role = 'admin' where id = $1`, [U.root]), /can't change your own role|at least one active Super Admin/)
  const r = await q(U.admin, `insert into roles (workspace_id, key, name) values ($1, 'x_role', 'X') returning id`, [ws]).catch((e) => e)
  assert.ok(r instanceof Error, 'admin has no roles.manage')
  await rejects(q(U.root, `delete from roles where key = 'admin'`), /Built-in roles/)
  await rejects(q(U.root, `delete from role_permissions where role_id = (select id from roles where key = 'super_admin') and permission = 'leads.view'`), /always has every permission/)
})

test('custom roles and team scope', async () => {
  const role = (await q(U.root, `insert into roles (workspace_id, key, name) values ($1, 'team_lead', 'Team Lead') returning id`, [ws])).rows[0].id
  await q(U.root, `insert into role_permissions (role_id, permission) values ($1,'leads.view'), ($1,'dashboard.view')`, [role])
  await q(U.root, `update profiles set role = 'team_lead' where id = $1`, [U.lead])
  assert.equal(await count(U.lead, 'leads'), 0, 'no team yet')
  await q(U.root, `update profiles set manager_id = $1 where id = $2`, [U.lead, U.rep1])
  assert.equal(await count(U.lead, 'leads'), 1, 'sees only their team member\'s lead')
  await rejects(q(U.lead, `insert into leads (workspace_id, first_name, created_by) values ($1, 'x', $2)`, [ws, U.lead]), /row-level security/)
  await rejects(q(U.root, `delete from roles where key = 'team_lead'`), /violates foreign key/)
})

test('lead conversion is atomic and cannot run twice', async () => {
  await q(U.rep1, `update leads set status = 'qualified', email = 'buyer@x.com' where first_name = 'R1 lead'`)
  const id = (await q(U.rep1, `select id from leads where first_name = 'R1 lead'`)).rows[0].id
  const res = (await q(U.rep1, `select convert_lead($1, 'Big deal', 5000, 'USD') r`, [id])).rows[0].r
  assert.ok(res.deal_id && res.contact_id)
  await rejects(q(U.rep1, `select convert_lead($1, 'again', 1, 'USD')`, [id]), /already been converted/)
  const deal = (await q(U.rep1, `select stage, value, assigned_to from deals where id = $1`, [res.deal_id])).rows[0]
  assert.equal(deal.stage, 'new_lead'); assert.equal(Number(deal.value), 5000); assert.equal(deal.assigned_to, U.rep1)
  global.dealId = res.deal_id
})

test('deal stage rules: lost needs a reason, dates and history are automatic', async () => {
  const d = global.dealId
  await rejects(q(U.rep1, `update deals set stage = 'lost' where id = $1`, [d]), /deals_check|check constraint/)
  await q(U.rep1, `update deals set stage = 'lost', lost_reason = 'Budget' where id = $1`, [d])
  let row = (await q(U.rep1, `select lost_at, won_at, lost_reason from deals where id = $1`, [d])).rows[0]
  assert.ok(row.lost_at && !row.won_at && row.lost_reason === 'Budget')
  await q(U.rep1, `update deals set stage = 'won' where id = $1`, [d])
  row = (await q(U.rep1, `select lost_at, won_at, lost_reason from deals where id = $1`, [d])).rows[0]
  assert.ok(row.won_at && !row.lost_at && row.lost_reason === null)
  const acts = (await q(U.rep1, `select title from activities where deal_id = $1 order by created_at, id`, [d])).rows.map((r) => r.title)
  assert.ok(acts.includes('Stage changed to Lost') && acts.includes('Stage changed to Won'))
})

test('task completion stamps the time and logs history', async () => {
  const t = (await q(U.rep1, `insert into tasks (workspace_id, title, deal_id, created_by, assigned_to) values ($1, 'Call', $2, $3, $3) returning id`, [ws, global.dealId, U.rep1])).rows[0].id
  await q(U.rep1, `update tasks set status = 'completed' where id = $1`, [t])
  const row = (await q(U.rep1, `select completed_at from tasks where id = $1`, [t])).rows[0]
  assert.ok(row.completed_at)
  const a = await q(U.rep1, `select 1 from activities where activity_type = 'task_completion' and deal_id = $1`, [global.dealId])
  assert.equal(a.rows.length, 1)
  await q(U.rep1, `update tasks set status = 'pending' where id = $1`, [t])
  assert.equal((await q(U.rep1, `select completed_at from tasks where id = $1`, [t])).rows[0].completed_at, null)
})

test('files: duplicate names rejected, only creators or managers delete', async () => {
  const org = (await q(U.rep1, `select id from organizations limit 1`)).rows[0].id
  await q(U.rep1, `insert into org_items (workspace_id, organization_id, kind, name, created_by) values ($1, $2, 'folder', 'Contracts', $3)`, [ws, org, U.rep1])
  await rejects(q(U.rep2, `insert into org_items (workspace_id, organization_id, kind, name, created_by) values ($1, $2, 'folder', 'contracts', $3)`, [ws, org, U.rep2]), /org_items_name_uq/)
  assert.equal((await q(U.rep2, `delete from org_items where name = 'Contracts' returning id`)).rows.length, 0)
  assert.equal((await q(U.mgr, `delete from org_items where name = 'Contracts' returning id`)).rows.length, 1)
})

test('dashboard numbers respect row level security', async () => {
  const rep = (await q(U.rep2, `select dashboard_stats(current_date, date_trunc('month', current_date)::date) s`)).rows[0].s
  const mgr = (await q(U.mgr, `select dashboard_stats(current_date, date_trunc('month', current_date)::date) s`)).rows[0].s
  assert.equal(rep.total_leads, 1); assert.equal(mgr.total_leads, 2)
  assert.equal(mgr.leads_by_month.length, 6)
})

test('avatars: users can only write inside their own folder', async () => {
  await q(U.rep1, `insert into storage.objects (bucket_id, name) values ('avatars', '${U.rep1}/a.png')`)
  await rejects(q(U.rep1, `insert into storage.objects (bucket_id, name) values ('avatars', '${U.rep2}/a.png')`), /row-level security/)
})

test('the last Super Admin cannot be removed', async () => {
  await rejects(db.query(`delete from profiles where id = '${U.root}'`), /at least one active Super Admin/)
  await rejects(db.query(`update profiles set role = 'admin' where id = '${U.root}'`), /at least one active Super Admin/)
})
