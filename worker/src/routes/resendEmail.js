// Worker routes for Resend Email Notifications, Webhook tracking, and Admin Management
import { HttpError, mustUuid } from '../lib/http.js'
import { adminClient, authenticate, myProfile, requirePermission } from '../lib/supabase.js'
import {
  sendBackendNotification,
  verifyWebhookSignature,
} from '../lib/resend.js'
import {
  renderTicketCreatedEmail,
  renderTicketReplyEmail,
  renderTicketStatusEmail,
  renderTicketResolvedEmail,
  renderInvoiceGeneratedEmail,
  renderPaymentConfirmationEmail,
  renderInvoiceReminderEmail,
  renderPaymentOverdueEmail,
} from '../../../src/lib/email/templates.js'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function cleanText(v, max = 5000) {
  const s = String(v ?? '').trim()
  return s ? s.slice(0, max) : ''
}

/**
 * POST /email/notifications/ticket-created
 * Automatically triggered when a ticket is created.
 */
export async function ticketCreated(request, env) {
  const ctx = await authenticate(request, env)
  const me = await myProfile(ctx)
  const b = await request.json().catch(() => ({}))
  const ticketId = b.ticket_id
  if (!ticketId) throw new HttpError(400, 'Ticket ID is required.')
  mustUuid(ticketId, 'ticket')

  const admin = adminClient(env)
  // Fetch ticket details along with organization contact email or creator email
  const r = await ctx.sb(
    `support_tickets?id=eq.${ticketId}&select=id,ticket_number,subject,description,category,priority,status,created_at,workspace_id,organization_id,created_by,organization:organizations(id,name,email),creator:profiles(id,full_name,email)`
  )
  const [ticket] = r.ok ? await r.json() : []
  if (!ticket) throw new HttpError(404, 'Ticket not found.')

  const recipientEmail = (ticket.organization?.email || ticket.creator?.email || '').trim().toLowerCase()
  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return { skipped: true, reason: 'No valid recipient email associated with ticket or organization.' }
  }

  const clientName = ticket.organization?.name || ticket.creator?.full_name || 'Client'
  const appBaseUrl = (env.APP_BASE_URL || 'https://www.awenueglobalsoftwaresolutions.in').replace(/\/$/, '')
  const portalUrl = `${appBaseUrl}/tickets/${ticket.id}`

  const rendered = renderTicketCreatedEmail({
    clientName,
    ticketNumber: ticket.ticket_number,
    subject: ticket.subject,
    description: ticket.description,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    createdAt: new Date(ticket.created_at).toLocaleString(),
    portalUrl,
  })

  return await sendBackendNotification(env, {
    workspaceId: ticket.workspace_id,
    eventType: 'ticket_created',
    recipientEmail,
    recipientName: clientName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `ticket_created_${ticket.id}`,
    relatedTicketId: ticket.id,
    metadata: { ticket_number: ticket.ticket_number, category: ticket.category },
  })
}

/**
 * POST /email/notifications/ticket-reply
 * Triggered when a remark or reply is added to a ticket.
 */
export async function ticketReply(request, env) {
  const ctx = await authenticate(request, env)
  const me = await myProfile(ctx)
  const b = await request.json().catch(() => ({}))
  const ticketId = b.ticket_id
  const commentId = b.comment_id
  const replyContent = cleanText(b.body || b.reply_text)
  if (!ticketId) throw new HttpError(400, 'Ticket ID is required.')
  if (!replyContent) throw new HttpError(400, 'Reply content is required.')
  mustUuid(ticketId, 'ticket')

  const r = await ctx.sb(
    `support_tickets?id=eq.${ticketId}&select=id,ticket_number,subject,status,workspace_id,assigned_to,created_by,organization:organizations(id,name,email),creator:profiles(id,full_name,email),assignee:profiles!assigned_to(id,full_name,email)`
  )
  const [ticket] = r.ok ? await r.json() : []
  if (!ticket) throw new HttpError(404, 'Ticket not found.')

  const appBaseUrl = (env.APP_BASE_URL || 'https://www.awenueglobalsoftwaresolutions.in').replace(/\/$/, '')
  const portalUrl = `${appBaseUrl}/tickets/${ticket.id}`

  // If sender is the ticket creator or org, notify assignee. If sender is agent, notify client.
  const isAgent = me.id !== ticket.created_by
  let recipientEmail
  let recipientName

  if (isAgent) {
    recipientEmail = (ticket.organization?.email || ticket.creator?.email || '').trim().toLowerCase()
    recipientName = ticket.organization?.name || ticket.creator?.full_name || 'Client'
  } else {
    recipientEmail = (ticket.assignee?.email || '').trim().toLowerCase()
    recipientName = ticket.assignee?.full_name || 'Support Staff'
  }

  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return { skipped: true, reason: 'No valid recipient email address for reply notification.' }
  }

  const rendered = renderTicketReplyEmail({
    recipientName,
    ticketNumber: ticket.ticket_number,
    ticketSubject: ticket.subject,
    agentName: me.full_name || 'Support Agent',
    replyContent,
    status: ticket.status,
    portalUrl,
  })

  return await sendBackendNotification(env, {
    workspaceId: ticket.workspace_id,
    eventType: 'ticket_reply',
    recipientEmail,
    recipientName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `ticket_reply_${ticket.id}_${commentId || Date.now()}`,
    relatedTicketId: ticket.id,
    metadata: { ticket_number: ticket.ticket_number, author: me.full_name },
  })
}

/**
 * POST /email/notifications/ticket-status
 * Triggered on status change or resolution.
 */
export async function ticketStatus(request, env) {
  const ctx = await authenticate(request, env)
  const me = await myProfile(ctx)
  const b = await request.json().catch(() => ({}))
  const ticketId = b.ticket_id
  const oldStatus = cleanText(b.old_status, 50)
  const newStatus = cleanText(b.new_status, 50)
  const note = cleanText(b.note || b.resolution, 2000)

  if (!ticketId || !newStatus) throw new HttpError(400, 'Ticket ID and new status are required.')
  mustUuid(ticketId, 'ticket')

  const r = await ctx.sb(
    `support_tickets?id=eq.${ticketId}&select=id,ticket_number,subject,workspace_id,organization:organizations(id,name,email),creator:profiles(id,full_name,email)`
  )
  const [ticket] = r.ok ? await r.json() : []
  if (!ticket) throw new HttpError(404, 'Ticket not found.')

  const recipientEmail = (ticket.organization?.email || ticket.creator?.email || '').trim().toLowerCase()
  const clientName = ticket.organization?.name || ticket.creator?.full_name || 'Client'

  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return { skipped: true, reason: 'No valid recipient email address for status update.' }
  }

  const appBaseUrl = (env.APP_BASE_URL || 'https://www.awenueglobalsoftwaresolutions.in').replace(/\/$/, '')
  const portalUrl = `${appBaseUrl}/tickets/${ticket.id}`

  let rendered
  let eventType = 'ticket_status_changed'

  if (newStatus === 'resolved') {
    eventType = 'ticket_resolved'
    rendered = renderTicketResolvedEmail({
      clientName,
      ticketNumber: ticket.ticket_number,
      ticketSubject: ticket.subject,
      resolution: note,
      resolvedBy: me.full_name || 'AWENUE Support',
      portalUrl,
    })
  } else {
    eventType = newStatus === 'closed' ? 'ticket_closed' : 'ticket_status_changed'
    rendered = renderTicketStatusEmail({
      clientName,
      ticketNumber: ticket.ticket_number,
      ticketSubject: ticket.subject,
      oldStatus,
      newStatus,
      note,
      portalUrl,
    })
  }

  return await sendBackendNotification(env, {
    workspaceId: ticket.workspace_id,
    eventType,
    recipientEmail,
    recipientName,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `ticket_status_${ticket.id}_${newStatus}_${Date.now()}`,
    relatedTicketId: ticket.id,
    metadata: { old_status: oldStatus, new_status: newStatus },
  })
}

/**
 * POST /email/notifications/invoice
 * Sends invoice generated email with PDF attachment.
 */
export async function sendInvoice(request, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'invoices.approve')
  const me = await myProfile(ctx)
  const b = await request.json().catch(() => ({}))
  const invoiceId = b.invoice_id
  if (!invoiceId) throw new HttpError(400, 'Invoice ID is required.')
  mustUuid(invoiceId, 'invoice')

  const r = await ctx.sb(
    `invoices?id=eq.${invoiceId}&select=id,invoice_number,issue_date,due_date,total,balance,tax_total,currency,status,payment_instructions,bill_to_name,bill_to_email,workspace_id`
  )
  const [inv] = r.ok ? await r.json() : []
  if (!inv) throw new HttpError(404, 'Invoice not found.')

  const recipientEmail = (inv.bill_to_email || '').trim().toLowerCase()
  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    throw new HttpError(400, 'This invoice does not have a valid recipient email (bill_to_email).')
  }

  const appBaseUrl = (env.APP_BASE_URL || 'https://www.awenueglobalsoftwaresolutions.in').replace(/\/$/, '')
  const invoiceUrl = `${appBaseUrl}/invoices/${inv.id}`

  const rendered = renderInvoiceGeneratedEmail({
    clientName: inv.bill_to_name || 'Valued Client',
    invoiceNumber: inv.invoice_number,
    invoiceDate: inv.issue_date,
    dueDate: inv.due_date,
    amount: inv.total,
    currency: inv.currency || 'INR',
    taxTotal: inv.tax_total,
    paymentStatus: inv.status,
    paymentInstructions: inv.payment_instructions,
    invoiceUrl,
  })

  const attachments = []
  if (b.pdf_base64) {
    attachments.push({
      filename: `Invoice-${String(inv.invoice_number).replace(/[^A-Za-z0-9-]/g, '')}.pdf`,
      content: b.pdf_base64,
    })
  }

  return await sendBackendNotification(env, {
    workspaceId: inv.workspace_id,
    eventType: 'invoice_generated',
    recipientEmail,
    recipientName: inv.bill_to_name,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    attachments,
    idempotencyKey: `invoice_gen_${inv.id}`,
    relatedInvoiceId: inv.id,
    metadata: { invoice_number: inv.invoice_number, total: inv.total, currency: inv.currency },
  })
}

/**
 * POST /email/notifications/payment
 * Triggered when a payment is verified.
 */
export async function paymentConfirmation(request, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'invoices.edit')
  const me = await myProfile(ctx)
  const b = await request.json().catch(() => ({}))
  const paymentId = b.payment_id
  const invoiceId = b.invoice_id
  if (!paymentId || !invoiceId) throw new HttpError(400, 'Invoice ID and Payment ID are required.')
  mustUuid(paymentId, 'payment')
  mustUuid(invoiceId, 'invoice')

  const ir = await ctx.sb(`invoices?id=eq.${invoiceId}&select=id,invoice_number,balance,currency,bill_to_name,bill_to_email,workspace_id`)
  const [inv] = ir.ok ? await ir.json() : []
  if (!inv) throw new HttpError(404, 'Invoice not found.')

  const pr = await ctx.sb(`payments?id=eq.${paymentId}&select=id,amount,paid_on,method,reference`)
  const [pay] = pr.ok ? await pr.json() : []
  if (!pay) throw new HttpError(404, 'Payment record not found.')

  const recipientEmail = (inv.bill_to_email || '').trim().toLowerCase()
  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return { skipped: true, reason: 'No recipient email on invoice.' }
  }

  const appBaseUrl = (env.APP_BASE_URL || 'https://www.awenueglobalsoftwaresolutions.in').replace(/\/$/, '')
  const receiptUrl = `${appBaseUrl}/invoices/${inv.id}`

  const rendered = renderPaymentConfirmationEmail({
    clientName: inv.bill_to_name || 'Client',
    invoiceNumber: inv.invoice_number,
    paymentRef: pay.reference || 'Bank Transfer',
    amountPaid: pay.amount,
    paymentDate: pay.paid_on,
    paymentMethod: pay.method || 'Online Payment',
    remainingBalance: inv.balance,
    currency: inv.currency || 'INR',
    receiptUrl,
  })

  return await sendBackendNotification(env, {
    workspaceId: inv.workspace_id,
    eventType: 'payment_confirmation',
    recipientEmail,
    recipientName: inv.bill_to_name,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `payment_confirm_${inv.id}_${pay.id}`,
    relatedInvoiceId: inv.id,
    metadata: { payment_id: pay.id, amount: pay.amount },
  })
}

/**
 * POST /email/notifications/retry
 * Safe admin retry for failed emails with original notification payload.
 */
export async function retryNotification(request, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'communications.manage')
  const me = await myProfile(ctx)
  const b = await request.json().catch(() => ({}))
  const logId = b.log_id
  if (!logId) throw new HttpError(400, 'Log ID is required.')
  mustUuid(logId, 'log')

  const admin = adminClient(env)
  const lr = await admin.rest(`email_notification_logs?id=eq.${logId}&select=*`)
  const [log] = lr.ok ? await lr.json() : []
  if (!log) throw new HttpError(404, 'Notification log not found.')

  if (log.status === 'sent' || log.status === 'delivered') {
    throw new HttpError(400, 'This email has already been successfully sent or delivered.')
  }

  // Retry sending
  const res = await sendBackendNotification(env, {
    workspaceId: log.workspace_id,
    eventType: log.event_type,
    recipientEmail: log.recipient_email,
    recipientName: log.recipient_name,
    subject: log.subject,
    html: log.payload?.html || '<p>Retrying transactional notification.</p>',
    text: log.payload?.text || '',
    idempotencyKey: `${log.idempotency_key}_retry_${Date.now()}`,
    relatedTicketId: log.related_ticket_id,
    relatedInvoiceId: log.related_invoice_id,
    metadata: { ...log.payload, retried_from: log.id },
  })

  if (res.ok) {
    await admin.rest(`email_notification_logs?id=eq.${log.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'sent', attempt_count: (log.attempt_count || 0) + 1, last_error: null }),
    })
  }

  return res
}

/**
 * GET /email/notifications/stats
 * Returns overall and identity-specific email metrics for the dashboard.
 */
export async function getStats(request, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'communications.view')
  const me = await myProfile(ctx)

  const admin = adminClient(env)
  const r = await admin.rest(`rpc/get_email_notification_stats`, {
    method: 'POST',
    body: JSON.stringify({ p_workspace_id: me.workspace_id }),
  })

  if (!r.ok) {
    throw new HttpError(500, 'Failed to retrieve notification statistics.')
  }
  return await r.json()
}

/**
 * GET /email/notifications/logs
 * Returns filtered and paginated email notification logs for Admin Management.
 */
export async function listLogs(request, url, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'communications.view')
  const me = await myProfile(ctx)

  const status = url.searchParams.get('status')
  const senderType = url.searchParams.get('sender_type')
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10))
  const limit = Math.min(100, Math.max(10, parseInt(url.searchParams.get('limit') || '30', 10)))
  const offset = (page - 1) * limit

  let query = `email_notification_logs?workspace_id=eq.${me.workspace_id}&order=created_at.desc&limit=${limit}&offset=${offset}`
  if (status) query += `&status=eq.${encodeURIComponent(status)}`
  if (senderType) query += `&sender_type=eq.${encodeURIComponent(senderType)}`

  const admin = adminClient(env)
  const r = await admin.rest(query)
  if (!r.ok) throw new HttpError(500, 'Failed to fetch email logs.')
  const logs = await r.json()

  return { logs, page, limit }
}

/**
 * POST /webhooks/resend
 * Validates Resend Webhook signatures and updates notification logs idempotently.
 */
export async function handleWebhook(request, env) {
  const secret = (env.RESEND_WEBHOOK_SECRET || '').trim()
  const rawBody = await request.text()

  if (secret) {
    const verified = await verifyWebhookSignature({
      rawBody,
      headers: request.headers,
      secret,
    })
    if (!verified) {
      throw new HttpError(401, 'Invalid webhook signature.')
    }
  }

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    throw new HttpError(400, 'Invalid JSON body.')
  }

  const { type, data, created_at } = body
  if (!type || !data?.email_id) {
    return { ok: true, ignored: true }
  }

  const emailId = data.email_id
  const admin = adminClient(env)

  // Map Resend events to our status values:
  // email.sent, email.delivered, email.delivery_delayed, email.bounced, email.complained, email.failed
  const statusMap = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delivery_delayed',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.failed': 'failed',
  }

  const newStatus = statusMap[type]
  if (!newStatus) return { ok: true, ignored: true }

  const patch = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  if (newStatus === 'delivered') {
    patch.delivered_at = created_at || new Date().toISOString()
  }
  if (newStatus === 'bounced' || newStatus === 'failed') {
    patch.last_error = data.rejection_reason || data.bounce_type || `Webhook event: ${type}`
  }

  await admin.rest(`email_notification_logs?resend_email_id=eq.${encodeURIComponent(emailId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })

  return { ok: true, processed: true, emailId, status: newStatus }
}
