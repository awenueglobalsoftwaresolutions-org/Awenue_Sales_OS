// Invoices: arithmetic parity with the browser, numbering, finalization, payments, permissions and history.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createDb, as } from './harness.mjs'
import { calcInvoice, calcLine, effectiveStatus } from '../../src/lib/invoiceCalc.js'

const U = { root: '00000000-0000-0000-0000-0000000000b1', mgr: '00000000-0000-0000-0000-0000000000b2', rep1: '00000000-0000-0000-0000-0000000000b3', rep2: '00000000-0000-0000-0000-0000000000b4', admin: '00000000-0000-0000-0000-0000000000b5' }
let db, ws, year
const q = (uid, sql, p) => as(db, uid, sql, p)
const rejects = (p, re) => assert.rejects(p, (e) => re.test(e.message), `expected ${re}`)
const item = (o = {}) => ({ description: 'Web design', quantity: 1, unit_price: 100, discount_type: 'percent', discount_value: 0, tax_rate: 0, ...o })
const draft = async (uid, items, extra = {}) => (await q(uid, `select save_invoice($1::jsonb, $2::jsonb) id`, [JSON.stringify({ bill_to_name: 'Acme Ltd', currency: 'USD', ...extra }), JSON.stringify(items)])).rows[0].id
const inv = async (uid, id) => (await q(uid, `select * from invoices where id = $1`, [id])).rows[0]
const num = (v) => Number(v)

test.before(async () => {
  db = await createDb(); year = new Date().getFullYear()
  for (const [k, id] of Object.entries(U)) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `${k}@x.com`])
  ws = (await db.query(`select id from workspaces`)).rows[0].id
  await db.exec(`update profiles set is_active = true where id in ('${U.root}','${U.mgr}','${U.rep1}','${U.rep2}','${U.admin}');
    update profiles set role = 'sales_manager' where id = '${U.mgr}'; update profiles set role = 'admin' where id = '${U.admin}';
    update profiles set manager_id = '${U.mgr}' where id = '${U.rep1}';
    update invoice_settings set company_name = 'Awenue Global', default_due_days = 14, payment_instructions = 'Pay by bank transfer', terms = 'Net 14'`)
})

test('arithmetic: a worked example, then 150 random lines match the browser calculation exactly', async () => {
  const l = calcLine({ quantity: 3, unit_price: 100, discount_type: 'percent', discount_value: 10, tax_rate: 18 })
  assert.deepEqual([l.subtotal, l.discount, l.tax, l.total], [300, 30, 48.6, 318.6])
  const items = Array.from({ length: 150 }, (_, i) => item({
    description: `Line ${i}`, quantity: [1, 2, 0.5, 3.333, 12.125, 0.001][i % 6], unit_price: Math.round(Math.random() * 99999) / 100,
    discount_type: i % 3 === 0 ? 'amount' : 'percent', discount_value: i % 3 === 0 ? Math.round(Math.random() * 5000) / 100 : Math.round(Math.random() * 10000) / 100,
    tax_rate: [0, 5, 12, 18, 28, 7.5, 0.25][i % 7] }))
  const id = await draft(U.rep1, items)
  const rows = (await q(U.rep1, `select position, line_subtotal, line_discount, line_tax, line_total from invoice_items where invoice_id = $1 order by position`, [id])).rows
  const calc = calcInvoice(items)
  rows.forEach((r, i) => { const c = calc.lines[i]; assert.deepEqual([num(r.line_subtotal), num(r.line_discount), num(r.line_tax), num(r.line_total)], [c.subtotal, c.discount, c.tax, c.total], `line ${i}`) })
  const t = await inv(U.rep1, id)
  assert.deepEqual([num(t.subtotal), num(t.discount_total), num(t.tax_total), num(t.total)], [calc.subtotal, calc.discount, calc.tax, calc.total])
  assert.equal(num(t.balance), calc.total)
})

test('numbering is unique, per year, and starts with the configured prefix', async () => {
  const a = await draft(U.rep1, [item()]), b = await draft(U.rep2, [item()])
  const na = (await inv(U.rep1, a)).invoice_number
  assert.match(na, new RegExp(`^INV-${year}-\\d{4}$`))
  assert.notEqual(na, (await inv(U.rep2, b)).invoice_number)
  const next = await draft(U.rep1, [item()], { issue_date: `${year + 1}-01-05`, due_date: `${year + 1}-01-19` })
  assert.equal((await inv(U.rep1, next)).invoice_number, `INV-${year + 1}-0001`)
  await q(U.admin, `update invoice_settings set number_prefix = 'AW'`)
  assert.match((await inv(U.rep1, await draft(U.rep1, [item()]))).invoice_number, new RegExp(`^AW-${year}-\\d{4}$`))
  await q(U.admin, `update invoice_settings set number_prefix = 'INV'`)
})

test('saving is all-or-nothing and drafts can be edited', async () => {
  const before = Number((await db.query(`select count(*) n from invoices`)).rows[0].n)
  await rejects(draft(U.rep1, [item(), item({ quantity: 0 })]), /invoice_items_quantity_check|check constraint/)
  await rejects(draft(U.rep1, []), /at least one line item/)
  assert.equal(Number((await db.query(`select count(*) n from invoices`)).rows[0].n), before, 'a failed save leaves nothing behind')
  const id = await draft(U.rep1, [item({ quantity: 2, unit_price: 50 })])
  await q(U.rep1, `select save_invoice($1::jsonb, $2::jsonb)`, [JSON.stringify({ id, bill_to_name: 'Acme Renamed', due_date: `${year + 1}-12-31`, notes: 'Thanks' }), JSON.stringify([item({ unit_price: 10 }), item({ unit_price: 5, description: 'Hosting' })])])
  const t = await inv(U.rep1, id)
  assert.equal(t.bill_to_name, 'Acme Renamed'); assert.equal(num(t.total), 15)
  assert.equal((await q(U.rep1, `select count(*)::int n from invoice_items where invoice_id = $1`, [id])).rows[0].n, 2)
  assert.equal(t.terms, 'Net 14'); assert.equal(t.payment_instructions, 'Pay by bank transfer'); assert.equal(t.issuer.company_name, 'Awenue Global')
})

test('visibility: own invoices, team for managers, everything for Admin', async () => {
  const mine = await draft(U.rep1, [item()]), theirs = await draft(U.rep2, [item()])
  const ids = async (u) => (await q(u, `select id from invoices`)).rows.map((r) => r.id)
  const r1 = await ids(U.rep1), r2 = await ids(U.rep2), m = await ids(U.mgr), a = await ids(U.admin)
  assert.ok(r1.includes(mine) && !r1.includes(theirs)); assert.ok(r2.includes(theirs) && !r2.includes(mine))
  assert.ok(m.includes(mine) && !m.includes(theirs), 'the manager sees their team only'); assert.ok(a.includes(mine) && a.includes(theirs))
  assert.equal((await q(U.rep2, `select * from invoice_items where invoice_id = $1`, [mine])).rows.length, 0)
})

test('sending needs approval, freezes the company details, and locks the invoice', async () => {
  const id = await draft(U.rep1, [item({ quantity: 2, unit_price: 500 })])
  await rejects(q(U.rep1, `select record_invoice_send($1, 'email', 'a@b.com')`, [id]), /permission to send/)
  await q(U.admin, `update invoice_settings set company_name = 'Awenue NEW'`)
  await q(U.rep1, `update invoices set notes = 'refresh' where id = $1`, [id])
  assert.equal((await inv(U.rep1, id)).issuer.company_name, 'Awenue NEW', 'drafts pick up the current company details when saved')
  await q(U.mgr, `select record_invoice_send($1, 'email', 'client@acme.com', 'first send')`, [id])
  let t = await inv(U.mgr, id); assert.equal(t.status, 'sent'); assert.ok(t.sent_at)
  await q(U.admin, `update invoice_settings set company_name = 'Awenue FINAL'`)
  assert.equal((await inv(U.mgr, id)).issuer.company_name, 'Awenue NEW', 'the snapshot froze when it was sent')
  await rejects(q(U.rep1, `update invoices set bill_to_name = 'Hacked' where id = $1`, [id]), /can only change its due date and notes/)
  await rejects(q(U.rep1, `select save_invoice($1::jsonb, $2::jsonb)`, [JSON.stringify({ id, bill_to_name: 'x' }), JSON.stringify([item()])]), /Only draft invoices/)
  await rejects(q(U.rep1, `update invoice_items set unit_price = 1 where invoice_id = $1`, [id]), /Only draft invoices can be edited/)
  await rejects(q(U.rep1, `update invoices set amount_paid = 1000 where id = $1`, [id]), /Payments are recorded|can only change/)
  await rejects(q(U.rep1, `update invoices set status = 'paid' where id = $1`, [id]), /follows payments/)
  await q(U.rep1, `update invoices set due_date = $2, notes = 'extended' where id = $1`, [id, `${year + 2}-01-01`])
  t = await inv(U.rep1, id); assert.equal(t.notes, 'extended')
  await q(U.mgr, `select record_invoice_send($1, 'whatsapp', '+911234567890')`, [id])             // re-send is just another record
  assert.equal((await q(U.mgr, `select count(*)::int n from invoice_sends where invoice_id = $1`, [id])).rows[0].n, 2)
  await rejects(q(U.mgr, `select record_invoice_send($1, 'carrier-pigeon')`, [id]), /Unknown channel/)
  assert.equal((await q(U.rep1, `delete from invoices where id = $1 returning id`, [id])).rows.length, 0, 'only drafts can be deleted')
})

test('payments move the status, can\'t exceed the balance, and only approvers can void them', async () => {
  const id = await draft(U.rep1, [item({ quantity: 1, unit_price: 1000, tax_rate: 10 })])           // total 1100
  await rejects(q(U.rep1, `insert into invoice_payments (invoice_id, workspace_id, amount, created_by) values ($1, $2, 100, $3)`, [id, ws, U.rep1]), /only be recorded on a sent invoice/)
  await q(U.mgr, `select record_invoice_send($1, 'manual')`, [id])
  const pay = async (u, amt) => q(u, `insert into invoice_payments (invoice_id, workspace_id, amount, method, created_by) values ($1, $2, $3, 'bank', $4) returning id`, [id, ws, amt, u])
  const p1 = (await pay(U.rep1, 400)).rows[0].id
  let t = await inv(U.rep1, id); assert.equal(t.status, 'partially_paid'); assert.equal(num(t.amount_paid), 400); assert.equal(num(t.balance), 700)
  await rejects(pay(U.rep1, 700.01), /more than the balance/)
  await rejects(q(U.rep1, `insert into invoice_payments (invoice_id, workspace_id, amount, created_by) values ($1, $2, 0, $3)`, [id, ws, U.rep1]), /amount_check|check constraint/)
  await pay(U.rep1, 700)
  t = await inv(U.rep1, id); assert.equal(t.status, 'paid'); assert.ok(t.paid_at); assert.equal(num(t.balance), 0)
  await rejects(pay(U.rep1, 1), /sent invoice with a balance|more than the balance/)
  assert.equal((await q(U.rep1, `delete from invoice_payments where id = $1 returning id`, [p1])).rows.length, 0, 'reps can\'t void payments')
  assert.equal((await q(U.mgr, `delete from invoice_payments where id = $1 returning id`, [p1])).rows.length, 1)
  t = await inv(U.rep1, id); assert.equal(t.status, 'partially_paid'); assert.equal(num(t.amount_paid), 700); assert.equal(t.paid_at, null)
  await rejects(q(U.mgr, `update invoices set status = 'cancelled', cancelled_reason = 'oops' where id = $1`, [id]), /Remove the recorded payments/)
})

test('cancelling needs approval and a reason; cancelled invoices are frozen', async () => {
  const id = await draft(U.rep1, [item()])
  await q(U.mgr, `select record_invoice_send($1, 'manual')`, [id])
  await rejects(q(U.rep1, `update invoices set status = 'cancelled', cancelled_reason = 'x' where id = $1`, [id]), /permission to cancel/)
  await rejects(q(U.mgr, `update invoices set status = 'cancelled' where id = $1`, [id]), /check constraint|cancelled_reason/)
  await q(U.mgr, `update invoices set status = 'cancelled', cancelled_reason = 'Customer withdrew' where id = $1`, [id])
  const t = await inv(U.mgr, id); assert.equal(t.status, 'cancelled'); assert.ok(t.cancelled_at); assert.equal(t.cancelled_reason, 'Customer withdrew')
  await rejects(q(U.admin, `update invoices set notes = 'edit' where id = $1`, [id]), /Cancelled invoices can't be changed/)
  await rejects(q(U.mgr, `select record_invoice_send($1, 'email')`, [id]), /Cancelled invoices can't be sent/)
})

test('duplicate, history, overdue and summary', async () => {
  const src = await draft(U.rep1, [item({ unit_price: 200 }), item({ unit_price: 300, description: 'Support' })], { issue_date: '2020-01-01', due_date: '2020-01-31' })
  const copy = (await q(U.rep1, `select duplicate_invoice($1) id`, [src])).rows[0].id
  const c = await inv(U.rep1, copy)
  assert.equal(c.status, 'draft'); assert.equal(num(c.total), 500); assert.notEqual(c.invoice_number, (await inv(U.rep1, src)).invoice_number)
  assert.equal((await db.query(`select (due_date - issue_date) d from invoices where id = $1`, [copy])).rows[0].d, 30)
  assert.equal((await q(U.rep1, `select count(*)::int n from invoice_items where invoice_id = $1`, [copy])).rows[0].n, 2)

  await q(U.mgr, `select record_invoice_send($1, 'email', 'x@y.com')`, [src])
  await db.exec(`update invoices set due_date = due_date where false`)
  const ev = (await q(U.mgr, `select event_type from invoice_events where invoice_id = $1 order by id`, [src])).rows.map((r) => r.event_type)
  assert.deepEqual(ev, ['created', 'status_changed', 'sent'])
  await q(U.rep1, `insert into invoice_events (invoice_id, workspace_id, event_type, description, user_id) values ($1, $2, 'downloaded', 'PDF downloaded', $3)`, [src, ws, U.rep1])
  await rejects(q(U.rep1, `insert into invoice_events (invoice_id, workspace_id, event_type, description, user_id) values ($1, $2, 'sent', 'forged', $3)`, [src, ws, U.rep1]), /row-level security/)

  const row = await inv(U.mgr, src)
  const asApi = { ...row, due_date: '2020-01-31' }                                        // the API returns dates as plain strings
  assert.equal(effectiveStatus(asApi, '2026-01-01'), 'overdue'); assert.equal(effectiveStatus({ ...asApi, status: 'paid' }, '2026-01-01'), 'paid')
  const s = (await q(U.admin, `select invoice_summary(current_date, date_trunc('month', current_date)::date) s`)).rows[0].s
  assert.ok(s.drafts >= 1 && s.overdue_count >= 1 && num(s.overdue.USD) >= 500 && num(s.outstanding.USD) >= num(s.overdue.USD))
})

test('settings are admin-only; the audit trail covers invoices without per-line noise', async () => {
  assert.equal((await q(U.rep1, `update invoice_settings set company_name = 'Mine' returning workspace_id`)).rows.length, 0)
  await rejects(q(U.rep1, `select * from invoice_counters`), /permission denied|row-level/).catch(async () => assert.equal((await q(U.rep1, `select * from invoice_counters`)).rows.length, 0))
  await q(U.admin, `insert into storage.objects (bucket_id, name) values ('branding', '${ws}/logo.png')`)
  await rejects(q(U.rep1, `insert into storage.objects (bucket_id, name) values ('branding', '${ws}/evil.png')`), /row-level security/)
  await rejects(q(U.admin, `insert into storage.objects (bucket_id, name) values ('branding', 'other-workspace/logo.png')`), /row-level security/)
  const id = await draft(U.rep1, [item(), item({ description: 'B' }), item({ description: 'C' }), item({ description: 'D' }), item({ description: 'E' })])
  const rows = (await q(U.root, `select action, description from audit_logs where module = 'invoices' and record_id = $1 order by id`, [id])).rows
  assert.ok(rows.some((r) => r.action === 'create' && /Created invoices/.test(r.description)))
  assert.ok(rows.some((r) => /Added 5 line item\(s\)/.test(r.description)))
  assert.ok(rows.length <= 3, `expected a short trail, got ${rows.length}: ${rows.map((r) => r.description).join(' | ')}`)
  const send = await draft(U.rep1, [item()]); await q(U.mgr, `select record_invoice_send($1, 'email')`, [send])
  const audit = (await q(U.root, `select updated_data from audit_logs where module = 'invoices' and record_id = $1 and action = 'update' order by id`, [send])).rows
  assert.ok(audit.some((r) => r.updated_data.status === 'sent'))
})

test('integration: service prices, deal links, line suggestions and per-record totals', async () => {
  // services carry optional default price and tax rate (settings managers only; values are validated)
  const svc = (await q(U.admin, `select id from services where name = 'Web Development'`)).rows[0].id
  await q(U.admin, `update services set default_price = 1500, default_tax_rate = 18 where id = $1`, [svc])
  assert.equal((await q(U.rep1, `update services set default_price = 1 where id = $1 returning id`, [svc])).rows.length, 0, 'reps can\'t change service prices')
  await rejects(q(U.admin, `update services set default_tax_rate = 150 where id = $1`, [svc]), /default_tax_rate_check|check constraint/)
  assert.equal(num((await q(U.rep1, `select default_price from services where id = $1`, [svc])).rows[0].default_price), 1500, 'everyone can read them')

  // an invoice can be tied to an organization, contact and deal, and shows up there
  const org = (await q(U.rep1, `insert into organizations (workspace_id, name, created_by) values ($1, 'Linked Org', $2) returning id`, [ws, U.rep1])).rows[0].id
  const contact = (await q(U.rep1, `insert into contacts (workspace_id, first_name, last_name, organization_id, created_by) values ($1, 'Asha', 'Verma', $2, $3) returning id`, [ws, org, U.rep1])).rows[0].id
  const deal = (await q(U.rep1, `insert into deals (workspace_id, title, organization_id, contact_id, value, currency, created_by, assigned_to) values ($1, 'Big website', $2, $3, 3000, 'USD', $4, $4) returning id`, [ws, org, contact, U.rep1])).rows[0].id
  const link = { organization_id: org, contact_id: contact, deal_id: deal }
  const a = await draft(U.rep1, [item({ unit_price: 1000 })], link), b = await draft(U.rep1, [item({ unit_price: 500 })], link)
  const c = await draft(U.rep1, [item({ unit_price: 200 })], { ...link, currency: 'INR' }), skipped = await draft(U.rep1, [item({ unit_price: 99 })], link)
  const row = await inv(U.rep1, a); assert.deepEqual([row.organization_id, row.contact_id, row.deal_id], [org, contact, deal])
  for (const id of [a, b, c]) await q(U.mgr, `select record_invoice_send($1, 'manual')`, [id])
  await q(U.rep1, `insert into invoice_payments (invoice_id, workspace_id, amount, created_by) values ($1, $2, 400, $3)`, [a, ws, U.rep1])
  await q(U.mgr, `update invoices set status = 'cancelled', cancelled_reason = 'dup' where id = $1`, [b])
  const totals = async (col, id) => (await q(U.rep1, `select record_invoice_totals($1, $2) t`, [col, id])).rows[0].t
  for (const [col, id] of [['organization_id', org], ['contact_id', contact], ['deal_id', deal]]) {
    const t = await totals(col, id)
    assert.deepEqual([num(t.USD.billed), num(t.USD.paid), num(t.USD.outstanding)], [1000, 400, 600], `${col}: drafts and cancelled invoices are left out`)
    assert.deepEqual([num(t.INR.billed), num(t.INR.paid), num(t.INR.outstanding)], [200, 0, 200], 'currencies are never added together')
  }
  await rejects(q(U.rep1, `select record_invoice_totals('bill_to_name; drop table invoices', $1)`, [org]), /Unknown record type/)
  assert.equal((await q(U.rep1, `select * from invoices where deal_id = $1`, [deal])).rows.length, 4)
  assert.equal((await inv(U.rep1, (await q(U.rep1, `select duplicate_invoice($1) id`, [a])).rows[0].id)).deal_id, deal, 'a duplicate stays linked')
  void skipped
})

test('integration: line suggestions come from past invoices, latest price first, and respect access', async () => {
  const mk = (u, desc, price, issue) => draft(u, [item({ description: desc, unit_price: price })], { issue_date: issue, due_date: issue })
  await mk(U.rep1, 'Logo design package', 400, '2026-01-10'); await mk(U.rep1, 'Logo design package', 450, '2026-03-10'); await mk(U.rep1, 'Brand guidelines', 900, '2026-02-01')
  await mk(U.rep2, 'Logo refresh (rep2 only)', 123, '2026-02-02')
  const sug = async (u, text) => (await q(u, `select * from suggest_invoice_lines($1)`, [text])).rows
  const logo = await sug(U.rep1, 'logo')
  assert.equal(logo.filter((r) => r.description === 'Logo design package').length, 1, 'one suggestion per description')
  assert.equal(num(logo.find((r) => r.description === 'Logo design package').unit_price), 450, 'the most recent price')
  assert.ok(!logo.some((r) => /rep2 only/.test(r.description)), 'other people\'s invoices stay private')
  assert.equal((await sug(U.rep1, 'l')).length, 0, 'needs at least two characters')
  assert.ok((await sug(U.admin, 'logo')).some((r) => /rep2 only/.test(r.description)), 'Admin sees everything')
  assert.ok((await sug(U.rep1, 'BRAND')).some((r) => r.description === 'Brand guidelines'), 'case-insensitive')
})

test('integration: the signature joins the company details that freeze on send', async () => {
  await q(U.admin, `update invoice_settings set signature_url = 'https://example.com/sig.png', logo_url = 'https://example.com/logo.png'`)
  const id = await draft(U.rep1, [item()]); await q(U.rep1, `update invoices set notes = 'touch' where id = $1`, [id])
  assert.equal((await inv(U.rep1, id)).issuer.signature_url, 'https://example.com/sig.png')
  await q(U.mgr, `select record_invoice_send($1, 'manual')`, [id])
  await q(U.admin, `update invoice_settings set signature_url = 'https://example.com/other.png'`)
  assert.equal((await inv(U.mgr, id)).issuer.signature_url, 'https://example.com/sig.png', 'a sent invoice keeps the signature it was sent with')
})
