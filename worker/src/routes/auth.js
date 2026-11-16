import { HttpError } from '../lib/http.js'
import { adminClient, authenticate } from '../lib/supabase.js'
import { requestOrigin, writeAudit } from '../lib/audit.js'

const MAX_FAILURES = 10          // per address or per email, in the window below
const WINDOW_MINUTES = 15
const EVENT_ACTIONS = new Set(['logout', 'export', 'report_generated', 'report_downloaded', 'invoice_downloaded'])

// POST /auth/login {email, password}: signs in through Supabase, records the attempt, and throttles repeated failures.
export async function login(request, env) {
  const b = await request.json().catch(() => ({}))
  const email = String(b.email || '').trim().toLowerCase()
  const password = String(b.password || '')
  if (!email || !password || email.length > 254 || password.length > 200) throw new HttpError(400, 'Email or password is incorrect.')
  const origin = requestOrigin(request)
  const admin = adminClient(env)

  const tr = await admin.rest('rpc/recent_failed_logins', { method: 'POST', body: JSON.stringify({ p_ip: origin.ip, p_email: email, p_minutes: WINDOW_MINUTES }) })
  const failures = tr.ok ? Number(await tr.json()) : 0
  if (failures >= MAX_FAILURES) {
    await writeAudit(env, request, { username: email, action: 'login_failed', module: 'auth', description: 'Sign-in blocked: too many failed attempts', status: 'failed', metadata: { reason: 'throttled' } })
    throw new HttpError(429, 'Too many failed attempts. Please wait 15 minutes and try again.')
  }

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  })
  if (res.status >= 500) throw new HttpError(502, 'Sign-in is temporarily unavailable. Please try again.')
  if (res.status === 429) throw new HttpError(429, 'Too many sign-in attempts. Please wait a moment and try again.')
  const session = await res.json().catch(() => ({}))
  if (!res.ok || !session.access_token) {
    await writeAudit(env, request, { username: email, action: 'login_failed', module: 'auth', description: 'Failed sign-in attempt', status: 'failed', metadata: { reason: 'invalid_credentials' } })
    throw new HttpError(400, 'Email or password is incorrect.')   // same answer whether or not the email exists
  }

  const pr = await admin.rest(`profiles?id=eq.${session.user.id}&select=full_name,email,is_active`)
  const [profile] = pr.ok ? await pr.json() : []
  await writeAudit(env, request, { userId: session.user.id, username: profile?.full_name || profile?.email || email, action: 'login', module: 'auth', description: 'Signed in',
    metadata: profile && !profile.is_active ? { account_active: false } : {} })
  return session
}

// POST /audit/event {action, module, record_id?, description?, metadata?}: events the browser reports about itself.
export async function event(request, env) {
  const ctx = await authenticate(request, env)
  const b = await request.json().catch(() => ({}))
  if (!EVENT_ACTIONS.has(b.action)) throw new HttpError(400, 'That event type can\'t be recorded from the app.')
  const module = String(b.module || '')
  if (!/^[a-z_]{2,40}$/.test(module)) throw new HttpError(400, 'Invalid module.')
  const metadata = b.metadata && typeof b.metadata === 'object' && !Array.isArray(b.metadata) ? b.metadata : {}
  if (JSON.stringify(metadata).length > 4000) throw new HttpError(400, 'Too much detail.')
  const pr = await ctx.sb(`profiles?id=eq.${ctx.user.id}&select=full_name,email,is_active`)
  const [profile] = pr.ok ? await pr.json() : []
  if (!profile?.is_active) throw new HttpError(403, 'Your account is not active.')
  await writeAudit(env, request, { userId: ctx.user.id, username: profile.full_name || profile.email, action: b.action, module,
    record: b.record_id ? String(b.record_id).slice(0, 80) : null, description: String(b.description || '').slice(0, 500), metadata })
  return { ok: true }
}

// POST /audit/session: remember where this address is, so later events from it can show an approximate location.
export async function session(request, env) {
  await authenticate(request, env)
  const o = requestOrigin(request)
  if (o.ip && (o.country || o.city)) {
    await adminClient(env).rest('rpc/remember_ip_geo', { method: 'POST', body: JSON.stringify({ p_ip: o.ip, p_country: o.country, p_region: o.region, p_city: o.city, p_isp: o.isp }) })
  }
  return { ok: true }
}
