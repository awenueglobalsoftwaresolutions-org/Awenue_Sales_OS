// Worker backend Resend helper: delivery, logging in Supabase, and webhook verification.
import { Resend } from 'resend'
import { adminClient } from './supabase.js'
import {
  assertSenderEventMatch,
  getSenderConfig,
} from '../../../src/lib/email/senderConfig.js'
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
} from '../../../src/lib/email/templates.js'

let clientCache = null
let keyCache = null

export function getResend(env) {
  const key = (env.RESEND_API_KEY || '').trim()
  if (!key) return null
  if (!clientCache || keyCache !== key) {
    clientCache = new Resend(key)
    keyCache = key
  }
  return clientCache
}

/**
 * Log or update notification record in email_notification_logs using adminClient.
 */
export async function recordNotificationLog(admin, {
  workspaceId,
  eventType,
  senderType,
  senderEmail,
  recipientEmail,
  recipientName = null,
  subject,
  relatedTicketId = null,
  relatedInvoiceId = null,
  resendEmailId = null,
  idempotencyKey = null,
  status = 'queued',
  lastError = null,
  attemptCount = 0,
  payload = {},
  sentAt = null,
}) {
  try {
    const row = {
      workspace_id: workspaceId,
      event_type: eventType,
      sender_type: senderType,
      sender_email: senderEmail,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      subject,
      related_ticket_id: relatedTicketId,
      related_invoice_id: relatedInvoiceId,
      resend_email_id: resendEmailId,
      idempotency_key: idempotencyKey,
      status,
      last_error: lastError,
      attempt_count: attemptCount,
      payload,
      sent_at: sentAt,
    }

    if (idempotencyKey) {
      // Check existing
      const existingRes = await admin.rest(`email_notification_logs?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,status,attempt_count`)
      const [existing] = existingRes.ok ? await existingRes.json() : []
      if (existing) {
        await admin.rest(`email_notification_logs?id=eq.${existing.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status,
            resend_email_id: resendEmailId || undefined,
            last_error: lastError,
            attempt_count: (existing.attempt_count || 0) + 1,
            sent_at: sentAt || undefined,
          }),
        })
        return existing.id
      }
    }

    const res = await admin.rest('email_notification_logs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row),
    })
    const [inserted] = res.ok ? await res.json() : []
    return inserted?.id || null
  } catch (err) {
    console.error('[NotificationLog] Failed to record log:', err.message)
    return null
  }
}

/**
 * Centralized sending function on the backend.
 * Checks idempotency, dispatches via Resend, and records results into the database.
 */
export async function sendBackendNotification(env, {
  workspaceId,
  eventType,
  recipientEmail,
  recipientName = '',
  subject,
  html,
  text,
  attachments = [],
  idempotencyKey = null,
  relatedTicketId = null,
  relatedInvoiceId = null,
  metadata = {},
}) {
  const admin = adminClient(env)
  const sender = getSenderConfig(eventType, env)

  // Strict check
  assertSenderEventMatch(sender.senderType, eventType)

  // Check idempotency: if already sent or delivered, don't re-send
  if (idempotencyKey) {
    try {
      const checkRes = await admin.rest(`email_notification_logs?idempotency_key=eq.${encodeURIComponent(idempotencyKey)}&select=id,status,resend_email_id`)
      const [existing] = checkRes.ok ? await checkRes.json() : []
      if (existing && (existing.status === 'sent' || existing.status === 'delivered')) {
        return {
          ok: true,
          status: existing.status,
          resendEmailId: existing.resend_email_id,
          idempotentSkip: true,
        }
      }
    } catch {}
  }

  const resend = getResend(env)
  if (!resend) {
    const errorMsg = 'RESEND_API_KEY is not configured on the server.'
    await recordNotificationLog(admin, {
      workspaceId,
      eventType,
      senderType: sender.senderType,
      senderEmail: sender.email,
      recipientEmail,
      recipientName,
      subject,
      relatedTicketId,
      relatedInvoiceId,
      idempotencyKey,
      status: 'failed',
      lastError: errorMsg,
      attemptCount: 1,
      payload: metadata,
    })
    return { ok: false, error: errorMsg, status: 'failed' }
  }

  const payload = {
    from: sender.from,
    to: [recipientEmail],
    reply_to: sender.replyTo,
    subject,
    html,
    text: text || '',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    attachments: attachments.map((a) => ({
      filename: a.filename || a.name || 'document.pdf',
      content: a.content || a.bytes,
    })),
    tags: [
      { name: 'event_type', value: eventType },
      { name: 'sender_type', value: sender.senderType },
    ],
  }

  try {
    const { data, error } = await resend.emails.send(payload)
    if (error) {
      const errMsg = error.message || String(error)
      await recordNotificationLog(admin, {
        workspaceId,
        eventType,
        senderType: sender.senderType,
        senderEmail: sender.email,
        recipientEmail,
        recipientName,
        subject,
        relatedTicketId,
        relatedInvoiceId,
        idempotencyKey,
        status: 'failed',
        lastError: errMsg,
        attemptCount: 1,
        payload: metadata,
      })
      return { ok: false, error: errMsg, status: 'failed' }
    }

    const resendEmailId = data?.id || null
    await recordNotificationLog(admin, {
      workspaceId,
      eventType,
      senderType: sender.senderType,
      senderEmail: sender.email,
      recipientEmail,
      recipientName,
      subject,
      relatedTicketId,
      relatedInvoiceId,
      resendEmailId,
      idempotencyKey,
      status: 'sent',
      attemptCount: 1,
      sentAt: new Date().toISOString(),
      payload: metadata,
    })

    return {
      ok: true,
      status: 'sent',
      resendEmailId,
      senderType: sender.senderType,
      senderEmail: sender.email,
    }
  } catch (err) {
    const errMsg = err.message || 'Resend API connection error.'
    await recordNotificationLog(admin, {
      workspaceId,
      eventType,
      senderType: sender.senderType,
      senderEmail: sender.email,
      recipientEmail,
      recipientName,
      subject,
      relatedTicketId,
      relatedInvoiceId,
      idempotencyKey,
      status: 'failed',
      lastError: errMsg,
      attemptCount: 1,
      payload: metadata,
    })
    return { ok: false, error: errMsg, status: 'failed' }
  }
}

/**
 * Verifies Resend Webhook signature using Svix signature algorithm via Web Crypto API.
 */
export async function verifyWebhookSignature({ rawBody, headers, secret }) {
  if (!secret) return false
  const svixId = headers.get('svix-id') || headers.get('resend-id')
  const svixTimestamp = headers.get('svix-timestamp') || headers.get('resend-timestamp')
  const svixSignature = headers.get('svix-signature') || headers.get('resend-signature')

  if (!svixId || !svixTimestamp || !svixSignature) return false

  // Reject timestamps older than 10 minutes to prevent replay attacks
  const ts = parseInt(svixTimestamp, 10)
  const now = Math.floor(Date.now() / 1000)
  if (isNaN(ts) || Math.abs(now - ts) > 600) return false

  const cleanSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`

  try {
    // Decode base64 secret to Uint8Array
    const binarySecret = Uint8Array.from(atob(cleanSecret), (c) => c.charCodeAt(0))
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      binarySecret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(toSign))
    const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))

    // Compare with expected signature (signatures might be space-separated versions like v1,...)
    const passedSignatures = svixSignature.split(' ').map((s) => s.split(',')[1] || s)
    return passedSignatures.includes(computedSignature)
  } catch (err) {
    console.error('[Webhook] Verification error:', err)
    return false
  }
}
