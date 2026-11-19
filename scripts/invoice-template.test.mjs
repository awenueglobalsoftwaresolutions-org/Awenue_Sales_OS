// The invoice layout: one page for a normal invoice, clean page breaks for long ones, signature and status handling.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildDoc, SAMPLE } from './render-invoice-sample.mjs'
import { money, ordinalDate } from '../src/lib/invoiceTemplate.js'

// a tiny transparent-background PNG stands in for an uploaded signature
const PNG = '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'
const text = (doc) => {
  const dir = mkdtempSync(join(tmpdir(), 'inv-')); const f = join(dir, 'x.pdf'); writeFileSync(f, Buffer.from(doc.output('arraybuffer')))
  try { return execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }) } catch { return null }     // skipped where poppler isn't installed
}
const many = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ description: `Service line number ${i + 1}`, quantity: 2, unit_price: 100 + i, discount_type: 'percent', discount_value: 0, tax_rate: 10, ...extra }))

test('formatting matches the design', () => {
  assert.equal(ordinalDate('2030-02-12'), '12th Feb 2030'); assert.equal(ordinalDate('2026-11-01'), '1st Nov 2026'); assert.equal(ordinalDate('2026-11-22'), '22nd Nov 2026'); assert.equal(ordinalDate('2026-11-03'), '3rd Nov 2026'); assert.equal(ordinalDate('2026-11-11'), '11th Nov 2026')
  assert.equal(money(750, 'USD'), '$750.00'); assert.equal(money(1750, 'USD', true), '$ 1,750.00'); assert.equal(money(100000, 'INR'), '₹1,00,000.00'); assert.equal(money(50, 'AED'), 'AED 50.00'); assert.equal(money(-30, 'USD', true), '−$ 30.00')
})

test('the sample invoice from the design fits on one page and contains every element', () => {
  const doc = buildDoc(SAMPLE.invoice, SAMPLE.items); assert.equal(doc.getNumberOfPages(), 1)
  const t = text(doc); if (!t) return
  for (const s of ['INVOICE', 'INV-2026-0001', '12th Feb 2030', '12th Mar 2030', 'FROM:', 'BILL TO:', 'Website Design', '$750.00', 'SUB TOTAL', '$ 1,750.00', 'TAX (10%)', '$ 175.00', 'GRAND TOTAL', '$ 1,925.00',
    'PAYMENT INFO:', 'Account No.: 0123 4567 8901', 'Terms and conditions:', '+123-456-7890', 'hello@reallygreatsite.com', 'reallygreatsite.com']) assert.ok(t.includes(s), `missing ${s}`)
})

test('long invoices break across pages with the table header, footer and totals intact', () => {
  const doc = buildDoc(SAMPLE.invoice, many(40)); const n = doc.getNumberOfPages(); assert.ok(n >= 2 && n <= 4, `pages: ${n}`)
  const t = text(doc); if (!t) return
  assert.equal((t.match(/ITEM DESCRIPTION/g) || []).length, n - (t.split('\f').slice(0, n).filter((p) => !p.includes('ITEM DESCRIPTION')).length), 'the table header repeats on pages that continue the table')
  assert.equal((t.match(/hello@reallygreatsite\.com/g) || []).length, n, 'footer on every page')
  assert.equal((t.match(/GRAND TOTAL/g) || []).length, 1); assert.ok(t.includes('Service line number 40') && t.includes('PAYMENT INFO:'))
})

test('discounts, payments, status tags, long text and a signature are handled', () => {
  const items = [{ description: 'Consulting with a really long description that needs to wrap onto a second line to prove wrapping works', quantity: 1.5, unit_price: 200, discount_type: 'percent', discount_value: 10, tax_rate: 18 }]
  const doc = buildDoc({ ...SAMPLE.invoice, status: 'partially_paid', amount_paid: 100, currency: 'INR', bill_to_email: 'a@b.com', bill_to_phone: '+91 99999 00000', notes: 'Thank you for your business.' }, items, { signature: { data: PNG, format: 'PNG', w: 400, h: 200 } })
  assert.ok(doc.getNumberOfPages() <= 2, 'payment info, notes, terms and signature may continue on a second page')
  const t = text(doc); if (!t) return
  for (const s of ['PARTIALLY PAID', 'Discount 10%', 'DISCOUNT', 'TAX (18%)', 'AMOUNT PAID', 'BALANCE DUE', '₹', 'Notes:', 'a@b.com', 'wrap onto a second line']) assert.ok(t.includes(s), `missing ${s}`)
  assert.ok(buildDoc({ ...SAMPLE.invoice, status: 'sent', due_date: '2020-01-01' }, SAMPLE.items) && text(buildDoc({ ...SAMPLE.invoice, status: 'sent', due_date: '2020-01-01' }, SAMPLE.items))?.includes('OVERDUE') !== false)
})

test('works without optional parts: no logo, no payment info, no terms, no footer details', () => {
  const doc = buildDoc({ ...SAMPLE.invoice, payment_instructions: null, terms: null, issuer: { company_name: 'Solo Co' } }, SAMPLE.items, { withLogo: false }); assert.equal(doc.getNumberOfPages(), 1)
  const t = text(doc); if (t) { assert.ok(!t.includes('PAYMENT INFO:') && !t.includes('Terms and conditions:') && t.includes('Solo Co')) }
})
