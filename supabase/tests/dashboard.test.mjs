import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb, as } from './harness.mjs'

const U = { root: '00000000-0000-0000-0000-0000000000e0', rep: '00000000-0000-0000-0000-0000000000e1', rep2: '00000000-0000-0000-0000-0000000000e2' }
let db, ws
const q = (uid, sql, p) => as(db, uid, sql, p)

test.before(async () => {
  db = await createDb()
  for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${k}@x.com`])
  ws = (await db.query(`select id from workspaces`)).rows[0].id
  await db.exec(`update profiles set is_active = true where id in ('${U.root}', '${U.rep}', '${U.rep2}')`)   // the first user is always the Super Admin
})

test('lead breakdown counts stages and sources, and each person sees only their own records', async () => {
  await q(U.rep, `insert into leads (workspace_id, first_name, created_by, assigned_to, status, source) values ($1,'A',$2,$2,'new','website'), ($1,'B',$2,$2,'qualified','linkedin'), ($1,'C',$2,$2,'new',null)`, [ws, U.rep])
  await q(U.rep2, `insert into leads (workspace_id, first_name, created_by, assigned_to, status, source) values ($1,'D',$2,$2,'converted','referral')`, [ws, U.rep2])
  const mine = (await q(U.rep, `select lead_breakdown() b`)).rows[0].b
  assert.equal(mine.by_status.new, 2); assert.equal(mine.by_status.qualified, 1); assert.equal(mine.by_status.converted, undefined)
  assert.ok(mine.by_source.some((s) => s.source === 'other' && s.count === 1), 'missing source is grouped as other')
  assert.equal(mine.by_status.converted, undefined, 'another person\'s converted lead is not counted')
  const all = (await db.query(`select count(*)::int n from leads where status = 'converted'`)).rows[0].n
  assert.equal(all, 1)
})

test('high-priority work due today is counted, and completed work is not', async () => {
  await q(U.rep, `insert into tasks (workspace_id, title, priority, due_date, created_by, assigned_to) values ($1,'Urgent',  'high', current_date, $2, $2), ($1,'Done', 'high', current_date, $2, $2)`, [ws, U.rep])
  await q(U.rep, `update tasks set status = 'completed' where title = 'Done'`)
  assert.equal((await q(U.rep, `select lead_breakdown() b`)).rows[0].b.high_priority_due, 1)
})
