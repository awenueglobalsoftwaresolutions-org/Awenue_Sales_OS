// Email templates: {{field}} placeholders filled from the record and the sender. Pure functions, used by the app and the tests.
import { fmtMoney, leadCode } from './format.js'
import { ordinalDate } from './invoiceTemplate.js'

export const VARIABLE_GROUPS = [
  { label: 'Contact', items: [['contact.first_name', 'First name'], ['contact.last_name', 'Last name'], ['contact.full_name', 'Full name'], ['contact.email', 'Email'], ['contact.phone', 'Phone'], ['contact.designation', 'Job title']] },
  { label: 'Organization', items: [['organization.name', 'Organization name']] },
  { label: 'Lead', items: [['lead.code', 'Lead ID']] },
  { label: 'Deal', items: [['deal.title', 'Deal title'], ['deal.value', 'Deal value'], ['deal.close_date', 'Expected close date']] },
  { label: 'Invoice', items: [['invoice.number', 'Invoice number'], ['invoice.total', 'Invoice total'], ['invoice.balance', 'Balance due'], ['invoice.due_date', 'Due date']] },
  { label: 'Task', items: [['task.title', 'Task title'], ['task.due_date', 'Task due date']] },
  { label: 'You', items: [['sender.name', 'Your name'], ['sender.email', 'Your email'], ['sender.signature', 'Your signature']] },
]
const PLACEHOLDER = /\{\{\s*([a-z_]+\.[a-z_]+)\s*\}\}/gi
const SIGNATURE = /\{\{\s*sender\.signature\s*\}\}/i

export const INVOICE_BILLING_TEMPLATE = {
  id: 'awenue-billing-notice',
  name: 'AWENUE Official Billing Notice (Clean Letter with Logo)',
  subject: 'Invoice {{invoice.number}} for {{deal.title}} from AWENUE Global Software Solutions',
  body: `Dear {{contact.full_name}},

Greetings from AWENUE Global Software Solutions!
We hope you are doing well.

Please find attached the invoice for {{deal.title}}, issued by AWENUE Global Software Solutions.

Invoice Details
Invoice Number: {{invoice.number}}
Total Amount: {{invoice.total}}
Payment Due Date: {{invoice.due_date}}

We kindly request you to review the attached invoice and arrange the payment on or before the specified due date.

Should you have any questions, require clarification regarding the invoice, or need any assistance with the payment process, please feel free to contact our Billing Department at billing@awenueglobalsoftwaresolutions.in.

We sincerely appreciate your trust in AWENUE Global Software Solutions and value the opportunity to work with you. We look forward to building a long-term and successful business relationship.

Thank you for choosing AWENUE Global Software Solutions.

Warm Regards,
Billing Department
AWENUE Global Software Solutions
Email: billing@awenueglobalsoftwaresolutions.in
Website: https://www.awenueglobalsoftwaresolutions.in/

Please find your invoice attached to this email for your reference and records.`,
}

export const INVOICE_DETAILED_TEMPLATE = {
  id: 'detailed-invoice-sheet',
  name: 'Detailed Invoice Sheet (Full Table & Breakdown)',
  subject: 'Invoice #{{invoice.number}} from AWENUE Global Software Solutions',
  body: `Dear {{contact.full_name}},

Please find attached your official invoice #{{invoice.number}} from AWENUE Global Software Solutions.

Invoice Details:
- Invoice Number: {{invoice.number}}
- Deal / Service: {{deal.title}}
- Total Amount: {{invoice.total}}
- Due Date: {{invoice.due_date}}

Please review the attached invoice PDF for full itemization and complete payment by the due date.

For billing-related queries, please contact:
billing@awenueglobalsoftwaresolutions.in

Warm Regards,
AWENUE Billing Department`,
}

export const INVOICE_TEMPLATES = [
  INVOICE_BILLING_TEMPLATE,
  INVOICE_DETAILED_TEMPLATE,
]

export function buildContext({ contact, lead, organization, deal, invoice, task, sender } = {}) {
  const person = contact || lead || (invoice?.bill_to_name ? { first_name: invoice.bill_to_name, last_name: '' } : {})
  const org = organization || contact?.organization || lead?.organization || deal?.organization || null
  const money = (v, c) => (v == null || v === '' ? '' : fmtMoney(v, c || 'USD'))
  const dealObj = deal || invoice?.deal || {}
  return {
    'contact.first_name': contact?.first_name ?? lead?.first_name ?? (invoice?.bill_to_name || ''),
    'contact.last_name': person.last_name ?? '',
    'contact.full_name': contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : (invoice?.bill_to_name || ''),
    'contact.email': person.email ?? invoice?.bill_to_email ?? '',
    'contact.phone': person.phone ?? invoice?.bill_to_phone ?? '',
    'contact.designation': contact?.designation ?? lead?.job_title ?? '',
    'organization.name': org?.name ?? '',
    'lead.code': lead ? leadCode(lead.lead_number) : '',
    'deal.title': dealObj?.title || 'Professional Software Services',
    'deal.value': dealObj?.value ? money(dealObj.value, dealObj.currency) : (invoice ? money(invoice.total, invoice.currency) : ''),
    'deal.close_date': dealObj?.expected_close_date ? ordinalDate(dealObj.expected_close_date) : '',
    'invoice.number': invoice?.invoice_number ?? '',
    'invoice.total': invoice ? money(invoice.total, invoice.currency) : '',
    'invoice.balance': invoice ? money(invoice.balance, invoice.currency) : '',
    'invoice.due_date': invoice?.due_date ? ordinalDate(invoice.due_date) : '',
    'task.title': task?.title ?? '',
    'task.due_date': task?.due_date ? ordinalDate(task.due_date) : '',
    'sender.name': sender?.full_name ?? 'AWENUE Billing Department',
    'sender.email': sender?.email ?? 'billing@awenueglobalsoftwaresolutions.in',
    'sender.signature': sender?.email_signature ?? '',
  }
}

// Fills placeholders. Empty or unknown fields are returned in `missing` so the composer can stop the send.
export function renderTemplate(str, ctx) {
  const missing = new Set()
  const text = String(str ?? '').replace(PLACEHOLDER, (_, key) => {
    const v = ctx[key.toLowerCase()]
    if (v === undefined || v === null || String(v).trim() === '') { missing.add(key); return '' }
    return String(v)
  })
  return { text, missing: [...missing] }
}

// Subject on one line; the signature is added at the end unless the template places it itself.
export function renderEmail(subject, body, ctx) {
  const s = renderTemplate(subject, ctx)
  const b = renderTemplate(body, ctx)
  let text = b.text
  const sig = ctx['sender.signature']
  if (sig && !SIGNATURE.test(body)) text = `${text.replace(/\s+$/, '')}\n\n${sig}`
  return { subject: s.text.replace(/[\r\n]+/g, ' ').trim(), body: text, missing: [...new Set([...s.missing, ...b.missing])] }
}

export function invoiceEmailDefaults(invoice) {
  return {
    to: invoice?.bill_to_email ? [invoice.bill_to_email] : [],
    subject: 'Invoice {{invoice.number}} from {{sender.name}}',
    body: INVOICE_BILLING_TEMPLATE.body,
  }
}
