import { Resend } from 'resend'
import { verifySupabaseAuth } from './websiteProxy.js'
import { renderInvoiceGeneratedEmail } from '../../src/lib/email/templates.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export async function handleSendInvoiceEmail(req, res, env, pathInvoiceId = null) {
  // 1. Auth check
  const auth = await verifySupabaseAuth(req.headers.authorization, env)
  if (!auth.ok) {
    res.statusCode = auth.status || 401
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: auth.error || 'Please sign in again.' }))
  }

  // 2. Parse body
  let body = {}
  if (req.body && typeof req.body === 'object') {
    body = req.body
  } else {
    body = await new Promise((resolve) => {
      let raw = ''
      req.on('data', (chunk) => { raw += chunk })
      req.on('end', () => {
        try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
      })
      req.on('error', () => resolve({}))
    })
  }

  const invoiceId = pathInvoiceId || body.invoice_id
  if (!invoiceId || !UUID_RE.test(invoiceId)) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Valid invoice UUID is required.' }))
  }

  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '')
  const supabaseAnon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || ''
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()

  // 3. Fetch invoice using user's token (respects RLS)
  const invRes = await fetch(
    `${supabaseUrl}/rest/v1/invoices?id=eq.${invoiceId}&select=id,invoice_number,issue_date,due_date,total,balance,tax_total,currency,status,payment_instructions,bill_to_name,bill_to_email,workspace_id,updated_at,cancelled_reason,issuer`,
    {
      headers: {
        apikey: supabaseAnon,
        Authorization: `Bearer ${token}`,
      },
    }
  )

  const [inv] = invRes.ok ? await invRes.json().catch(() => []) : []
  if (!inv) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Invoice not found.' }))
  }

  if (inv.status === 'cancelled') {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Cannot send a cancelled invoice as an active invoice. Cancelled invoices are frozen.' }))
  }

  // 4. Load invoice settings for workspace
  let settings = null
  try {
    const sRes = await fetch(
      `${supabaseUrl}/rest/v1/invoice_settings?workspace_id=eq.${inv.workspace_id}&select=*`,
      {
        headers: {
          apikey: supabaseAnon,
          Authorization: `Bearer ${token}`,
        },
      }
    )
    if (sRes.ok) {
      const arr = await sRes.json().catch(() => [])
      settings = arr[0] || null
    }
  } catch {
    // ignore
  }

  const paymentInstructions = inv.payment_instructions || settings?.payment_instructions || null
  const recipientEmail = (body.recipient_email || inv.bill_to_email || '').trim().toLowerCase()

  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'This invoice does not have a valid recipient email address.' }))
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
    paymentInstructions,
    invoiceUrl,
  })

  const attachments = []
  if (body.pdf_base64) {
    attachments.push({
      filename: `Invoice-${String(inv.invoice_number).replace(/[^A-Za-z0-9-]/g, '')}.pdf`,
      content: body.pdf_base64,
    })
  }

  const resendApiKey = (env.RESEND_API_KEY || '').trim()
  if (!resendApiKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Resend API key is not configured on the server (RESEND_API_KEY).' }))
  }

  const resend = new Resend(resendApiKey)
  const from = (env.RESEND_BILLING_FROM || 'AWENUE Billing Department <billing@awenueglobalsoftwaresolutions.in>').trim()
  const replyTo = (env.RESEND_BILLING_REPLY_TO || 'billing@awenueglobalsoftwaresolutions.in').trim()

  const isResend = Boolean(body.resend || body.force)
  const idempotencyKey = isResend ? `invoice_gen_${inv.id}_${Date.now()}` : `invoice_gen_${inv.id}`

  const sendPayload = {
    from,
    to: [recipientEmail],
    reply_to: replyTo,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: { 'Idempotency-Key': idempotencyKey },
    tags: [
      { name: 'event_type', value: 'invoice_generated' },
      { name: 'sender_type', value: 'billing' },
      { name: 'invoice_id', value: String(inv.id) },
    ],
  }

  if (attachments.length) {
    sendPayload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
    }))
  }

  let resendResult = null
  try {
    resendResult = await resend.emails.send(sendPayload)
  } catch (err) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: err.message || 'Resend network error.' }))
  }

  if (resendResult.error) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: resendResult.error.message || 'Resend delivery failed.' }))
  }

  const resendEmailId = resendResult.data?.id || null

  // Safely log to email_notification_logs in Supabase using token
  try {
    await fetch(`${supabaseUrl}/rest/v1/email_notification_logs`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnon,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        workspace_id: inv.workspace_id,
        event_type: 'invoice_generated',
        sender_type: 'billing',
        sender_email: 'billing@awenueglobalsoftwaresolutions.in',
        recipient_email: recipientEmail,
        recipient_name: inv.bill_to_name,
        subject: rendered.subject,
        related_invoice_id: inv.id,
        resend_email_id: resendEmailId,
        idempotency_key: idempotencyKey,
        status: 'sent',
        attempt_count: 1,
        sent_at: new Date().toISOString(),
        payload: { invoice_number: inv.invoice_number, total: inv.total, currency: inv.currency, resend: isResend },
      }),
    })
  } catch {
    // Log table might be optional or undergoing migration, never block successful email delivery
  }

  // Safely record invoice send via RPC
  try {
    await fetch(`${supabaseUrl}/rest/v1/rpc/record_invoice_send`, {
      method: 'POST',
      headers: {
        apikey: supabaseAnon,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_id: inv.id,
        p_channel: 'email',
        p_recipient: recipientEmail,
        p_note: 'Dispatched via Resend Billing Automation',
      }),
    })
  } catch {
    // ignore
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify({
    ok: true,
    invoice_id: inv.id,
    invoice_number: inv.invoice_number,
    recipient_email: recipientEmail,
    resend_email_id: resendEmailId,
    status: 'sent',
    sent_at: new Date().toISOString(),
  }))
}
