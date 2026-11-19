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

export function buildContext({ contact, lead, organization, deal, invoice, task, sender } = {}) {
  const person = contact || lead || {}
  const org = organization || contact?.organization || lead?.organization || deal?.organization || null
  const money = (v, c) => (v == null || v === '' ? '' : fmtMoney(v, c || 'USD'))
  return {
    'contact.first_name': contact?.first_name ?? lead?.first_name ?? '',
    'contact.last_name': person.last_name ?? '',
    'contact.full_name': [person.first_name, person.last_name].filter(Boolean).join(' '),
    'contact.email': person.email ?? '',
    'contact.phone': person.phone ?? '',
    'contact.designation': contact?.designation ?? lead?.job_title ?? '',
    'organization.name': org?.name ?? '',
    'lead.code': lead ? leadCode(lead.lead_number) : '',
    'deal.title': deal?.title ?? '',
    'deal.value': deal ? money(deal.value, deal.currency) : '',
    'deal.close_date': deal?.expected_close_date ? ordinalDate(deal.expected_close_date) : '',
    'invoice.number': invoice?.invoice_number ?? '',
    'invoice.total': invoice ? money(invoice.total, invoice.currency) : '',
    'invoice.balance': invoice ? money(invoice.balance, invoice.currency) : '',
    'invoice.due_date': invoice?.due_date ? ordinalDate(invoice.due_date) : '',
    'task.title': task?.title ?? '',
    'task.due_date': task?.due_date ? ordinalDate(task.due_date) : '',
    'sender.name': sender?.full_name ?? '',
    'sender.email': sender?.email ?? '',
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
    body: 'Hello,\n\nPlease find invoice {{invoice.number}} for {{invoice.total}}, due {{invoice.due_date}}.\n\nThank you,\n{{sender.name}}',
  }
}
