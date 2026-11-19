// Renders the invoice template in Node (no browser): `node scripts/render-invoice-sample.mjs out.pdf`
import { jsPDF } from 'jspdf'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { FONT_FILES, registerFonts, renderInvoice } from '../src/lib/invoiceTemplate.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
export function buildDoc(invoice, items, { withLogo = true, signature = null } = {}) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  registerFonts(doc, Object.fromEntries(FONT_FILES.map(([f]) => [f, readFileSync(join(root, 'fonts', f)).toString('base64')])))
  const logo = withLogo ? { template: true, format: 'JPEG', data: readFileSync(join(root, 'brand', 'awenue-invoice-logo.jpg')).toString('base64'), w: 533, h: 267 } : null
  renderInvoice(doc, invoice, items, { logo, signature })
  return doc
}
export const SAMPLE = {
  invoice: { invoice_number: 'INV-2026-0001', status: 'sent', issue_date: '2030-02-12', due_date: '2030-03-12', currency: 'USD', amount_paid: 0,
    issuer: { company_name: 'Fauget Design Studio', address: '123 Anywhere St., Any City', tax_id: 'ABC123456', phone: '+123-456-7890', email: 'hello@reallygreatsite.com', website: 'reallygreatsite.com' },
    bill_to_name: 'Shodwe Studios', bill_to_address: '123 Anywhere St., Any City', bill_to_tax_id: 'ABC123456',
    payment_instructions: 'Bank Name: Borcele Bank\nAccount Name: Morgan Maxwell\nAccount No.: 0123 4567 8901',
    terms: 'All rates quoted are valid for 15 days.\n40% payment should be done in advance.\nThe remaining amount should be paid within 20 days of delivery.' },
  items: [['Website Design', 30, 25], ['Icon Design', 50, 10], ['Illustration', 10, 15], ['Presentation Template', 50, 7]]
    .map(([description, quantity, unit_price]) => ({ description, quantity, unit_price, discount_type: 'percent', discount_value: 0, tax_rate: 10 })),
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] || '/tmp/invoice-sample.pdf'
  const doc = buildDoc(SAMPLE.invoice, SAMPLE.items); writeFileSync(out, Buffer.from(doc.output('arraybuffer'))); console.log('wrote', out)
}
