// Centralized Resend Email Service for AWENUE Global Software Solutions
// Handles sender separation, template compilation, idempotency, and structured delivery.

import { Resend } from 'resend'
import {
  EMAIL_IDENTITIES,
  getSenderConfig,
  assertSenderEventMatch,
  SUPPORT_EVENTS,
  BILLING_EVENTS,
} from './senderConfig.js'
import {
  renderTicketCreatedEmail,
  renderTicketReplyEmail,
  renderTicketStatusEmail,
  renderTicketResolvedEmail,
  renderInvoiceGeneratedEmail,
  renderPaymentConfirmationEmail,
  renderInvoiceReminderEmail,
  renderPaymentOverdueEmail,
  renderInvoiceCancelledEmail,
} from './templates.js'

const EMAIL_REGEX = /^[^@\s<>,;"]+@[^@\s<>,;"]+\.[^@\s<>,;"]+$/

let resendClientInstance = null
let currentResendKey = null

/**
 * Returns a singleton Resend client using the server-side API key.
 */
export function getResendClient(apiKey = process.env.RESEND_API_KEY) {
  const key = (apiKey || '').trim()
  if (!key) return null
  if (!resendClientInstance || currentResendKey !== key) {
    resendClientInstance = new Resend(key)
    currentResendKey = key
  }
  return resendClientInstance
}

/**
 * Validates recipient email format and bounds.
 */
export function validateRecipient(email) {
  const clean = String(email || '').trim().toLowerCase()
  if (!clean || clean.length > 254 || !EMAIL_REGEX.test(clean)) {
    throw new Error(`Invalid recipient email address: "${email}".`)
  }
  return clean
}

/**
 * Low-level core dispatcher with strict sender routing, idempotency, and attachment handling.
 */
export async function sendResendMail({
  eventType,
  to,
  recipientName = '',
  subject,
  html,
  text,
  attachments = [],
  idempotencyKey = null,
  relatedTicketId = null,
  relatedInvoiceId = null,
  env = process.env,
  resendClient = null,
}) {
  const recipient = validateRecipient(to)
  const sender = getSenderConfig(eventType, env)

  // Strict enforcement: support cannot send billing, billing cannot send support
  assertSenderEventMatch(sender.senderType, eventType)

  if (!subject || !subject.trim()) {
    throw new Error('Email subject is required and cannot be empty.')
  }
  if (!html || !html.trim()) {
    throw new Error('Email HTML body is required.')
  }

  const client = resendClient || getResendClient(env.RESEND_API_KEY)
  if (!client) {
    return {
      ok: false,
      status: 'failed',
      error: 'Resend API key is not configured on the server (RESEND_API_KEY).',
      senderType: sender.senderType,
      senderEmail: sender.email,
      recipientEmail: recipient,
    }
  }

  const payload = {
    from: sender.from,
    to: [recipient],
    reply_to: sender.replyTo,
    subject: subject.trim(),
    html,
    text: text || '',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    attachments: attachments.map((att) => ({
      filename: att.filename || att.name || 'document.pdf',
      content: att.content || att.bytes, // Buffer, string, or Uint8Array
    })),
    tags: [
      { name: 'event_type', value: eventType },
      { name: 'sender_type', value: sender.senderType },
      ...(relatedTicketId ? [{ name: 'ticket_id', value: String(relatedTicketId) }] : []),
      ...(relatedInvoiceId ? [{ name: 'invoice_id', value: String(relatedInvoiceId) }] : []),
    ],
  }

  try {
    const { data, error } = await client.emails.send(payload)
    if (error) {
      return {
        ok: false,
        status: 'failed',
        error: error.message || String(error),
        senderType: sender.senderType,
        senderEmail: sender.email,
        recipientEmail: recipient,
        idempotencyKey,
      }
    }

    return {
      ok: true,
      status: 'sent',
      id: data?.id,
      resendEmailId: data?.id,
      senderType: sender.senderType,
      senderEmail: sender.email,
      recipientEmail: recipient,
      idempotencyKey,
    }
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      error: err.message || 'Unexpected network failure connecting to Resend API.',
      senderType: sender.senderType,
      senderEmail: sender.email,
      recipientEmail: recipient,
      idempotencyKey,
    }
  }
}

// ==========================================
// DEDICATED HIGH-LEVEL EVENT ROUTING FUNCTIONS
// ==========================================

export async function sendSupportTicketCreatedEmail({
  to,
  clientName,
  ticketNumber,
  subject,
  description,
  category,
  priority,
  status = 'open',
  createdAt,
  portalUrl,
  ticketId,
  env = process.env,
  resendClient = null,
}) {
  const rendered = renderTicketCreatedEmail({
    clientName,
    ticketNumber,
    subject,
    description,
    category,
    priority,
    status,
    createdAt,
    portalUrl,
  })

  return sendResendMail({
    eventType: 'ticket_created',
    to,
    recipientName: clientName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `ticket_created_${ticketId || ticketNumber}`,
    relatedTicketId: ticketId || null,
    env,
    resendClient,
  })
}

export async function sendSupportTicketReplyEmail({
  to,
  recipientName,
  ticketNumber,
  ticketSubject,
  agentName,
  replyContent,
  status,
  portalUrl,
  ticketId,
  commentId,
  env = process.env,
  resendClient = null,
}) {
  const rendered = renderTicketReplyEmail({
    recipientName,
    ticketNumber,
    ticketSubject,
    agentName,
    replyContent,
    status,
    portalUrl,
  })

  return sendResendMail({
    eventType: 'ticket_reply',
    to,
    recipientName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `ticket_reply_${ticketId}_${commentId || Date.now()}`,
    relatedTicketId: ticketId || null,
    env,
    resendClient,
  })
}

export async function sendSupportTicketStatusEmail({
  to,
  clientName,
  ticketNumber,
  ticketSubject,
  oldStatus,
  newStatus,
  note,
  portalUrl,
  ticketId,
  eventId,
  env = process.env,
  resendClient = null,
}) {
  if (newStatus === 'resolved') {
    const rendered = renderTicketResolvedEmail({
      clientName,
      ticketNumber,
      ticketSubject,
      resolution: note,
      portalUrl,
    })
    return sendResendMail({
      eventType: 'ticket_resolved',
      to,
      recipientName: clientName,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `ticket_resolved_${ticketId}_${eventId || newStatus}`,
      relatedTicketId: ticketId || null,
      env,
      resendClient,
    })
  }

  const rendered = renderTicketStatusEmail({
    clientName,
    ticketNumber,
    ticketSubject,
    oldStatus,
    newStatus,
    note,
    portalUrl,
  })

  const eventType = newStatus === 'closed' ? 'ticket_closed' : 'ticket_status_changed'

  return sendResendMail({
    eventType,
    to,
    recipientName: clientName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `ticket_status_${ticketId}_${newStatus}_${eventId || Date.now()}`,
    relatedTicketId: ticketId || null,
    env,
    resendClient,
  })
}

export async function sendInvoiceEmail({
  to,
  clientName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  amount,
  currency,
  taxTotal,
  subtotal,
  discountTotal,
  amountPaid,
  balance,
  paymentStatus,
  paymentInstructions,
  terms,
  notes,
  invoiceUrl,
  issuer = {},
  billTo = {},
  items = [],
  pdfBytes = null,
  pdfBase64 = null,
  invoiceId,
  env = process.env,
  resendClient = null,
}) {
  const rendered = renderInvoiceGeneratedEmail({
    clientName,
    invoiceNumber,
    invoiceDate,
    dueDate,
    amount,
    currency,
    taxTotal,
    subtotal,
    discountTotal,
    amountPaid,
    balance,
    paymentStatus,
    paymentInstructions,
    terms,
    notes,
    invoiceUrl,
    issuer,
    billTo,
    items,
  })

  const attachments = []
  if (pdfBytes || pdfBase64) {
    attachments.push({
      filename: `Invoice-${String(invoiceNumber).replace(/[^A-Za-z0-9-]/g, '')}.pdf`,
      content: pdfBytes || Buffer.from(pdfBase64, 'base64'),
    })
  }

  return sendResendMail({
    eventType: 'invoice_generated',
    to,
    recipientName: clientName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    attachments,
    idempotencyKey: `invoice_gen_${invoiceId || invoiceNumber}`,
    relatedInvoiceId: invoiceId || null,
    env,
    resendClient,
  })
}

export async function sendPaymentConfirmationEmail({
  to,
  clientName,
  invoiceNumber,
  paymentRef,
  amountPaid,
  paymentDate,
  paymentMethod,
  remainingBalance,
  currency,
  receiptUrl,
  invoiceId,
  paymentId,
  env = process.env,
  resendClient = null,
}) {
  const rendered = renderPaymentConfirmationEmail({
    clientName,
    invoiceNumber,
    paymentRef,
    amountPaid,
    paymentDate,
    paymentMethod,
    remainingBalance,
    currency,
    receiptUrl,
  })

  return sendResendMail({
    eventType: 'payment_confirmation',
    to,
    recipientName: clientName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `payment_confirm_${invoiceId}_${paymentId || paymentRef}`,
    relatedInvoiceId: invoiceId || null,
    env,
    resendClient,
  })
}

export async function sendBillingReminderEmail({
  to,
  clientName,
  invoiceNumber,
  dueDate,
  balance,
  currency,
  isOverdue = false,
  daysOverdue = 1,
  daysLabel = 'upcoming',
  paymentInstructions,
  invoiceUrl,
  invoiceId,
  reminderType = 'due_soon',
  env = process.env,
  resendClient = null,
}) {
  let rendered
  let eventType

  if (isOverdue) {
    eventType = 'payment_overdue'
    rendered = renderPaymentOverdueEmail({
      clientName,
      invoiceNumber,
      dueDate,
      balance,
      daysOverdue,
      currency,
      paymentInstructions,
      invoiceUrl,
    })
  } else {
    eventType = 'invoice_reminder'
    rendered = renderInvoiceReminderEmail({
      clientName,
      invoiceNumber,
      dueDate,
      balance,
      currency,
      daysLabel,
      paymentInstructions,
      invoiceUrl,
    })
  }

  return sendResendMail({
    eventType,
    to,
    recipientName: clientName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `reminder_${invoiceId}_${reminderType}_${new Date().toISOString().slice(0, 10)}`,
    relatedInvoiceId: invoiceId || null,
    env,
    resendClient,
  })
}
