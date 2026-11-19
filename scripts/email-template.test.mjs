// Template filling, signatures, subjects and the record context used by the composer.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildContext, invoiceEmailDefaults, renderEmail, renderTemplate } from '../src/lib/emailTemplate.js'

test('placeholders are filled from the record and sender; empty or unknown ones are reported', () => {
  const ctx = buildContext({ contact: { first_name: 'Asha', last_name: 'Verma', email: 'asha@acme.com', organization: { name: 'Acme Ltd' } }, sender: { full_name: 'Rita Rep', email: 'rita@crm.test' } })
  const r = renderTemplate('Hi {{contact.first_name}} from {{organization.name}}, {{contact.phone}} {{made.up}}', ctx)
  assert.equal(r.text, 'Hi Asha from Acme Ltd,  ')
  assert.deepEqual(r.missing.sort(), ['contact.phone', 'made.up'])
})

test('the signature is added once, and not again when the template places it', () => {
  const ctx = buildContext({ sender: { full_name: 'Rita', email_signature: 'Rita — Awenue' } })
  assert.equal(renderEmail('Hi', 'Body text', ctx).body, 'Body text\n\nRita — Awenue')
  assert.equal(renderEmail('Hi', 'Body\n{{sender.signature}}', ctx).body, 'Body\nRita — Awenue')
  assert.equal(renderEmail('Hi', 'Body', buildContext({ sender: {} })).body, 'Body')
})

test('subjects stay on one line; the context covers leads, deals, invoices and tasks', () => {
  assert.equal(renderEmail('Hi\nthere', 'x', buildContext({})).subject, 'Hi there')
  const ctx = buildContext({
    lead: { first_name: 'Ravi', lead_number: 7, job_title: 'Founder' },
    deal: { title: 'Website', value: 4500, currency: 'USD', expected_close_date: '2026-12-01' },
    invoice: { invoice_number: 'INV-2026-0003', total: 1925, balance: 925, currency: 'USD', due_date: '2026-12-12' },
    task: { title: 'Call back', due_date: '2026-11-22' },
  })
  assert.equal(ctx['lead.code'], 'LD-0007'); assert.equal(ctx['contact.first_name'], 'Ravi'); assert.equal(ctx['contact.designation'], 'Founder')
  assert.equal(ctx['deal.value'], '$4,500'); assert.equal(ctx['invoice.total'], '$1,925'); assert.equal(ctx['invoice.balance'], '$925')
  assert.equal(ctx['invoice.due_date'], '12th Dec 2026'); assert.equal(ctx['deal.close_date'], '1st Dec 2026'); assert.equal(ctx['task.due_date'], '22nd Nov 2026')
})

test('invoice emails start with the bill-to address and the invoice details', () => {
  const d = invoiceEmailDefaults({ bill_to_email: 'accounts@shodwe.studio' })
  assert.deepEqual(d.to, ['accounts@shodwe.studio'])
  assert.ok(d.subject.includes('{{invoice.number}}') && d.body.includes('{{invoice.total}}'))
  assert.deepEqual(invoiceEmailDefaults({}).to, [])
})
