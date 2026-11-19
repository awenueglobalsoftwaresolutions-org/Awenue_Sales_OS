// Email: Gmail account privacy, templates, record-based visibility, status rules, timelines and rate input.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb, as } from './harness.mjs'

const U = { root: '00000000-0000-0000-0000-0000000000d1', rep1: '00000000-0000-0000-0000-0000000000d2', rep2: '00000000-0000-0000-0000-0000000000d3' }
let db, ws
const q = (uid, sql, p) => as(db, uid, sql, p)
const denied = (p) => assert.rejects(p, (e) => /permission denied|row-level security|violates/.test(e.message))

test.before(async () => {
  db = await createDb()
  for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${k}@x.com`])
  ws = (await db.query(`select id from workspaces`)).rows[0].id
  await db.exec(`update profiles set is_active = true, full_name = 'Root Person' where id = '${U.root}';
    update profiles set is_active = true, full_name = 'Rita Rep' where id = '${U.rep1}';
    update profiles set is_active = true, full_name = 'Remy Rep' where id = '${U.rep2}';`)
})

test('Gmail accounts: each person sees only their own, and the stored token is unreadable from the browser', async () => {
  await db.query(`insert into gmail_accounts (workspace_id, user_id, email, refresh_token_enc) values ($1, $2, 'rita@gmail.com', 'SEALED-TOKEN')`, [ws, U.rep1])
  const own = await q(U.rep1, `select id, email, status from gmail_accounts`)
  assert.equal(own.rows.length, 1); assert.equal(own.rows[0].email, 'rita@gmail.com')
  assert.equal((await q(U.rep2, `select id from gmail_accounts`)).rows.length, 0, 'another person sees nothing')
  await denied(q(U.rep1, `select refresh_token_enc from gmail_accounts`))
  await denied(q(U.rep1, `select * from gmail_accounts`))
  await denied(q(U.rep1, `update gmail_accounts set email = 'hacked@x.com'`))
  await denied(q(U.rep2, `insert into gmail_accounts (workspace_id, user_id, email, refresh_token_enc) values ($1, $2, 'x@y.com', 'x')`, [ws, U.rep2]))
})

test('templates: shared ones are workspace-wide, private ones stay with their author', async () => {
  await q(U.rep1, `insert into email_templates (workspace_id, name, subject, body, shared, created_by) values ($1, 'Intro', 'Hello {{contact.first_name}}', 'Hi there', true, $2)`, [ws, U.rep1])
  const priv = (await q(U.rep1, `insert into email_templates (workspace_id, name, subject, body, shared, created_by) values ($1, 'Private', 'Secret', 'x', false, $2) returning id`, [ws, U.rep1])).rows[0].id
  assert.deepEqual((await q(U.rep2, `select name from email_templates order by name`)).rows.map((r) => r.name), ['Intro'])
  assert.equal((await q(U.root, `select count(*)::int n from email_templates`)).rows[0].n, 2, 'Super Admin manages every template')
  assert.equal((await q(U.rep2, `update email_templates set subject = 'x' where id = $1 returning id`, [priv])).rows.length, 0)
  await denied(q(U.rep2, `insert into email_templates (workspace_id, name, subject, body, created_by) values ($1, 'Spoof', 's', 'b', $2)`, [ws, U.rep1]))
  assert.equal((await q(U.rep1, `select email_signature from profiles where id = $1`, [U.rep1])).rows[0].email_signature, null)
})

test('an email is visible to anyone who can see the record it is attached to, and to nobody else', async () => {
  const contact = (await q(U.rep1, `insert into contacts (workspace_id, first_name, created_by) values ($1, 'Asha', $2) returning id`, [ws, U.rep1])).rows[0].id
  const deal = (await q(U.rep1, `insert into deals (workspace_id, title, created_by, assigned_to) values ($1, 'Secret deal', $2, $2) returning id`, [ws, U.rep1])).rows[0].id
  await q(U.rep1, `insert into email_messages (workspace_id, sender_id, sender_email, to_addresses, subject, body_text, contact_id) values ($1, $2, 'rita@gmail.com', $3, 'Intro', 'Hello', $4)`, [ws, U.rep1, ['asha@x.com'], contact])
  await q(U.rep1, `insert into email_messages (workspace_id, sender_id, sender_email, to_addresses, subject, body_text, deal_id) values ($1, $2, 'rita@gmail.com', $3, 'Deal', 'Pricing', $4)`, [ws, U.rep1, ['asha@x.com'], deal])
  await q(U.rep1, `insert into email_messages (workspace_id, sender_id, sender_email, to_addresses, subject, body_text) values ($1, $2, 'rita@gmail.com', $3, 'General', 'Hi')`, [ws, U.rep1, ['x@y.com']])
  const subjects = async (u) => (await q(u, `select subject from email_messages order by subject`)).rows.map((r) => r.subject)
  assert.deepEqual(await subjects(U.rep1), ['Deal', 'General', 'Intro'])
  assert.deepEqual(await subjects(U.rep2), ['Intro'], 'contacts are shared, so the contact email is too; the private deal and general mail are not')
  assert.deepEqual(await subjects(U.root), ['Deal', 'General', 'Intro'])
  await denied(q(U.rep2, `insert into email_messages (workspace_id, sender_id, sender_email, to_addresses, subject, body_text, deal_id) values ($1, $2, 'remy@gmail.com', $3, 'Sneaky', 'x', $4)`, [ws, U.rep2, ['a@b.co'], deal]))
  await denied(q(U.rep2, `insert into email_messages (workspace_id, sender_id, sender_email, to_addresses, subject, body_text) values ($1, $2, 'rita@gmail.com', $3, 'Impersonate', 'x')`, [ws, U.rep1, ['a@b.co']]))
})

test('a message moves from queued to sent once; only its sender can change it, and sent history is final', async () => {
  const id = (await q(U.rep1, `insert into email_messages (workspace_id, sender_id, sender_email, to_addresses, subject, body_text) values ($1, $2, 'rita@gmail.com', $3, 'Status test', 'x') returning id`, [ws, U.rep1, ['a@b.co']])).rows[0].id
  assert.equal((await q(U.rep2, `update email_messages set status = 'sent' where id = $1 returning id`, [id])).rows.length, 0, 'not the sender')
  assert.equal((await q(U.rep1, `update email_messages set status = 'sent', gmail_message_id = 'g1', sent_at = now() where id = $1 returning id`, [id])).rows.length, 1)
  assert.equal((await q(U.rep1, `update email_messages set status = 'failed' where id = $1 returning id`, [id])).rows.length, 0, 'sent is final')
  assert.equal((await q(U.rep1, `delete from email_messages where id = $1 returning id`, [id])).rows.length, 0, 'history can\'t be deleted')
})

test('a sent email lands in the contact timeline and on the invoice history; an unsent one does not', async () => {
  const contact = (await q(U.rep1, `insert into contacts (workspace_id, first_name, created_by) values ($1, 'Asha', $2) returning id`, [ws, U.rep1])).rows[0].id
  const inv = (await q(U.rep1, `select save_invoice($1::jsonb, $2::jsonb) id`, [JSON.stringify({ bill_to_name: 'Asha Ltd', contact_id: contact }), JSON.stringify([{ description: 'Design', quantity: 1, unit_price: 500, tax_rate: 0 }])])).rows[0].id
  const msg = (await q(U.rep1, `insert into email_messages (workspace_id, sender_id, sender_email, to_addresses, subject, body_text, contact_id, invoice_id) values ($1, $2, 'rita@gmail.com', $3, 'Invoice INV', 'Attached', $4, $5) returning id`, [ws, U.rep1, ['asha@x.com'], contact, inv])).rows[0].id
  assert.equal((await db.query(`select count(*)::int n from activities where contact_id = $1 and activity_type = 'email'`, [contact])).rows[0].n, 0, 'nothing logged until the email is sent')
  await q(U.rep1, `update email_messages set status = 'sent' where id = $1`, [msg])
  const act = (await db.query(`select title, user_id from activities where contact_id = $1 and activity_type = 'email'`, [contact])).rows
  assert.equal(act.length, 1); assert.match(act[0].title, /^Email sent: Invoice INV/); assert.equal(act[0].user_id, U.rep1)
  assert.equal((await db.query(`select count(*)::int n from invoice_events where invoice_id = $1 and event_type = 'emailed'`, [inv])).rows[0].n, 1)
})

test('the hourly count covers only the sender\'s own emails that were not failed', async () => {
  const expected = (await db.query(`select count(*)::int n from email_messages where sender_id = $1 and status <> 'failed'`, [U.rep1])).rows[0].n
  assert.equal((await q(U.rep1, `select email_sent_last_hour() n`)).rows[0].n, expected)
  assert.equal((await q(U.rep2, `select email_sent_last_hour() n`)).rows[0].n, 0)
})
