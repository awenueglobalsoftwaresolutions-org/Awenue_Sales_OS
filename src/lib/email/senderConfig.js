// Centralized Email Sender Configuration for AWENUE Global Software Solutions
// Strict separation between Support and Billing identities.

export const EMAIL_IDENTITIES = {
  SUPPORT: {
    type: 'support',
    name: 'AWENUE Support Team',
    email: 'support@awenueglobalsoftwaresolutions.in',
    replyTo: 'support@awenueglobalsoftwaresolutions.in',
    defaultFrom: 'AWENUE Support Team <support@awenueglobalsoftwaresolutions.in>',
  },
  BILLING: {
    type: 'billing',
    name: 'AWENUE Billing Department',
    email: 'billing@awenueglobalsoftwaresolutions.in',
    replyTo: 'billing@awenueglobalsoftwaresolutions.in',
    defaultFrom: 'AWENUE Billing Department <billing@awenueglobalsoftwaresolutions.in>',
  },
}

export const SUPPORT_EVENTS = [
  'ticket_created',
  'ticket_reply',
  'ticket_status_changed',
  'ticket_assigned',
  'ticket_resolved',
  'ticket_reopened',
  'ticket_closed',
  'ticket_escalated',
]

export const BILLING_EVENTS = [
  'invoice_generated',
  'invoice_reminder',
  'payment_confirmation',
  'payment_overdue',
  'invoice_cancelled',
]

export function formatSenderString(name, email) {
  const cleanName = (name || '').trim().replace(/[<>"\r\n]/g, '')
  const cleanEmail = (email || '').trim().toLowerCase()
  return cleanName ? `"${cleanName}" <${cleanEmail}>` : cleanEmail
}

/**
 * Returns the resolved sender configuration for an event type with optional environment overrides.
 * Strictly guarantees that support cannot be used for billing, and vice versa.
 */
export function getSenderConfig(eventType, env = {}) {
  const isSupport = SUPPORT_EVENTS.includes(eventType)
  const isBilling = BILLING_EVENTS.includes(eventType)

  if (!isSupport && !isBilling) {
    throw new Error(`Unknown or unregistered email event type: "${eventType}".`)
  }

  if (isSupport) {
    const from = (env.RESEND_SUPPORT_FROM || '').trim() || EMAIL_IDENTITIES.SUPPORT.defaultFrom
    const replyTo = (env.RESEND_SUPPORT_REPLY_TO || '').trim() || EMAIL_IDENTITIES.SUPPORT.replyTo
    return {
      senderType: 'support',
      name: EMAIL_IDENTITIES.SUPPORT.name,
      email: EMAIL_IDENTITIES.SUPPORT.email,
      from,
      replyTo,
    }
  }

  const from = (env.RESEND_BILLING_FROM || '').trim() || EMAIL_IDENTITIES.BILLING.defaultFrom
  const replyTo = (env.RESEND_BILLING_REPLY_TO || '').trim() || EMAIL_IDENTITIES.BILLING.replyTo
  return {
    senderType: 'billing',
    name: EMAIL_IDENTITIES.BILLING.name,
    email: EMAIL_IDENTITIES.BILLING.email,
    from,
    replyTo,
  }
}

/**
 * Guard function to prevent cross-identity contamination.
 */
export function assertSenderEventMatch(senderType, eventType) {
  if (senderType === 'support' && !SUPPORT_EVENTS.includes(eventType)) {
    throw new Error(`Security Violation: Support sender cannot be used for "${eventType}" billing email.`)
  }
  if (senderType === 'billing' && !BILLING_EVENTS.includes(eventType)) {
    throw new Error(`Security Violation: Billing sender cannot be used for "${eventType}" support ticket email.`)
  }
}
