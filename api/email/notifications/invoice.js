import { handleSendInvoiceEmail } from '../../../_lib/emailNotificationsHandler.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end(JSON.stringify({ error: 'Method not allowed' }))
  }

  return handleSendInvoiceEmail(req, res, process.env, null)
}
