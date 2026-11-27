// Vercel Serverless Function: POST /api/webhooks/resend
import { createClient } from '@supabase/supabase-js'

export const config = {
  api: {
    bodyParser: false, // Need raw body for cryptographic signature verification
  },
}

async function getRawBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const rawBody = await getRawBody(req)
  const secret = (process.env.RESEND_WEBHOOK_SECRET || '').trim()

  // Signature validation if secret is configured
  if (secret) {
    const svixId = req.headers['svix-id'] || req.headers['resend-id']
    const svixTimestamp = req.headers['svix-timestamp'] || req.headers['resend-timestamp']
    const svixSignature = req.headers['svix-signature'] || req.headers['resend-signature']

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(401).json({ error: 'Missing webhook signature headers.' })
    }

    const ts = parseInt(svixTimestamp, 10)
    const now = Math.floor(Date.now() / 1000)
    if (isNaN(ts) || Math.abs(now - ts) > 600) {
      return res.status(401).json({ error: 'Webhook timestamp expired.' })
    }

    try {
      const crypto = await import('crypto')
      const cleanSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
      const binarySecret = Buffer.from(cleanSecret, 'base64')
      const toSign = `${svixId}.${svixTimestamp}.${rawBody}`
      const hmac = crypto.createHmac('sha256', binarySecret).update(toSign).digest('base64')

      const signatures = String(svixSignature).split(' ').map((s) => s.split(',')[1] || s)
      if (!signatures.includes(hmac)) {
        return res.status(401).json({ error: 'Invalid webhook signature.' })
      }
    } catch (err) {
      return res.status(500).json({ error: 'Webhook signature verification error.' })
    }
  }

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload.' })
  }

  const { type, data, created_at } = body
  if (!type || !data?.email_id) {
    return res.status(200).json({ ok: true, ignored: true })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase configuration missing.' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const statusMap = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delivery_delayed',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.failed': 'failed',
  }

  const newStatus = statusMap[type]
  if (!newStatus) return res.status(200).json({ ok: true, ignored: true })

  const patch = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  }
  if (newStatus === 'delivered') patch.delivered_at = created_at || new Date().toISOString()
  if (newStatus === 'bounced' || newStatus === 'failed') {
    patch.last_error = data.rejection_reason || data.bounce_type || `Webhook event: ${type}`
  }

  const { error } = await supabase
    .from('email_notification_logs')
    .update(patch)
    .eq('resend_email_id', data.email_id)

  if (error) {
    console.error('[ResendWebhook] Error updating log:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ ok: true, processed: true, emailId: data.email_id, status: newStatus })
}
