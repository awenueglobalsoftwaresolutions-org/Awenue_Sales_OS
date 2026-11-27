// Awenue API — Cloudflare Worker. Routes are grouped in ./routes; shared helpers live in ./lib.
import { HttpError, corsHeaders, json } from './lib/http.js'
import * as files from './routes/files.js'
import * as users from './routes/users.js'
import * as auth from './routes/auth.js'
import * as gmail from './routes/gmail.js'
import * as email from './routes/email.js'
import * as website from './routes/website.js'
import * as resendEmail from './routes/resendEmail.js'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = corsHeaders(request, env)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    try {
      const route = `${request.method} ${url.pathname}`
      if (request.method === 'PATCH' && url.pathname.startsWith('/website/project-enquiries/')) {
        const id = decodeURIComponent(url.pathname.slice('/website/project-enquiries/'.length))
        return json(await website.updateEnquiry(request, id, env), 200, cors)
      }
      if (request.method === 'PATCH' && url.pathname.startsWith('/website/contact-messages/')) {
        const id = decodeURIComponent(url.pathname.slice('/website/contact-messages/'.length))
        return json(await website.updateContact(request, id, env), 200, cors)
      }
      if (request.method === 'POST' && url.pathname.match(/^\/api\/invoices\/[^/]+\/send-email$/)) {
        const id = url.pathname.split('/')[3]
        return json(await resendEmail.sendInvoice(request, env, id), 200, cors)
      }
      if (request.method === 'GET' && url.pathname.match(/^\/api\/invoices\/[^/]+\/email-status$/)) {
        const id = url.pathname.split('/')[3]
        return json(await resendEmail.getInvoiceEmailStatus(request, env, id), 200, cors)
      }
      switch (route) {
        case 'GET /file': return await files.serveFile(url, env)
        case 'GET /gmail/callback': return await gmail.callback(url, env)
        case 'GET /website/sync': return json(await website.sync(request, url, env), 200, cors)
        case 'POST /website/webhook': case 'POST /api/website/webhook': return json(await website.webhook(request, env), 200, cors)
        case 'POST /upload': case 'POST /files/upload': return json(await files.upload(request, url, env), 201, cors)
        case 'POST /sign': case 'POST /files/sign': return json(await files.signUrl(request, url, env), 200, cors)
        case 'POST /delete': case 'POST /files/delete': return json(await files.remove(request, env), 200, cors)
        case 'POST /auth/login': return json(await auth.login(request, env), 200, cors)
        case 'POST /audit/event': return json(await auth.event(request, env), 200, cors)
        case 'POST /audit/session': return json(await auth.session(request, env), 200, cors)
        case 'POST /users/create': return json(await users.createUser(request, env), 201, cors)
        case 'POST /users/remove': return json(await users.removeUser(request, env), 200, cors)
        case 'POST /gmail/connect': return json(await gmail.connect(request, env), 200, cors)
        case 'POST /gmail/disconnect': return json(await gmail.disconnect(request, env), 200, cors)
        case 'POST /email/send': return json(await email.send(request, env), 200, cors)
        case 'POST /email/notifications/ticket-created': return json(await resendEmail.ticketCreated(request, env), 200, cors)
        case 'POST /email/notifications/ticket-reply': return json(await resendEmail.ticketReply(request, env), 200, cors)
        case 'POST /email/notifications/ticket-status': return json(await resendEmail.ticketStatus(request, env), 200, cors)
        case 'POST /email/notifications/invoice': case 'POST /api/invoices/send-email': return json(await resendEmail.sendInvoice(request, env), 200, cors)
        case 'POST /email/notifications/payment': return json(await resendEmail.paymentConfirmation(request, env), 200, cors)
        case 'POST /email/notifications/retry': return json(await resendEmail.retryNotification(request, env), 200, cors)
        case 'GET /email/notifications/stats': return json(await resendEmail.getStats(request, env), 200, cors)
        case 'GET /email/notifications/logs': return json(await resendEmail.listLogs(request, url, env), 200, cors)
        case 'POST /webhooks/resend': case 'POST /api/webhooks/resend': return json(await resendEmail.handleWebhook(request, env), 200, cors)
        default: throw new HttpError(404, 'Not found')
      }
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors)
      console.error(e)
      return json({ error: 'Unexpected server error' }, 500, cors)
    }
  },
}
