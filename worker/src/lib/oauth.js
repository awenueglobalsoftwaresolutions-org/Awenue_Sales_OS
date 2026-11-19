// Google sign-in for Gmail sending. The OAuth "state" is signed so a callback can't be forged, and expires after ten minutes.
import { HttpError } from './http.js'
import { base64url, unb64 } from './mime.js'

const enc = new TextEncoder(), dec = new TextDecoder()
export const GMAIL_SCOPES = 'openid email https://www.googleapis.com/auth/gmail.send'
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
async function sign(secret, msg) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))
}
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0 }

export async function signState(payload, secret) {
  const body = base64url(enc.encode(JSON.stringify(payload)))
  return `${body}.${await sign(secret, body)}`
}
export async function verifyState(state, secret) {
  const [body, sig] = String(state || '').split('.')
  const bad = () => new HttpError(400, 'This sign-in link is invalid. Start again from Settings.')
  if (!body || !sig || !same(await sign(secret, body), sig)) throw bad()
  let p
  try { p = JSON.parse(dec.decode(unb64(body.replace(/-/g, '+').replace(/_/g, '/')))) } catch { throw bad() }
  if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) throw new HttpError(400, 'That sign-in took too long. Start again from Settings.')
  return p
}
export function authUrl(env, state) {
  const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.GOOGLE_REDIRECT_URI, response_type: 'code', scope: GMAIL_SCOPES,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}
async function tokenRequest(env, params) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }).toString() })
  return { ok: r.ok, data: await r.json().catch(() => ({})) }
}
export async function exchangeCode(env, code) {
  const r = await tokenRequest(env, { code, grant_type: 'authorization_code', redirect_uri: env.GOOGLE_REDIRECT_URI })
  if (!r.ok) throw new HttpError(400, 'Google didn’t accept the sign-in. Try again.')
  return r.data
}
// Returns a short-lived access token. A revoked grant is flagged so the account can be marked for reconnection.
export async function refreshAccess(env, refreshToken) {
  const r = await tokenRequest(env, { refresh_token: refreshToken, grant_type: 'refresh_token' })
  if (!r.ok) { const e = new HttpError(409, 'Your Gmail connection has expired or was revoked. Reconnect in Settings.'); e.revoked = r.data?.error === 'invalid_grant'; throw e }
  return r.data.access_token
}
export async function userInfo(accessToken) {
  const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!r.ok) throw new HttpError(400, 'Could not read your Google account.')
  return r.json()
}
export async function revokeToken(token) {
  try { await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString() }) } catch { /* best effort */ }
}
