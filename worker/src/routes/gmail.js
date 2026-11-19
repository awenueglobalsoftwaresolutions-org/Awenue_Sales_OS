import { adminClient, authenticate, requirePermission } from '../lib/supabase.js'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'
import { authUrl, exchangeCode, revokeToken, signState, userInfo, verifyState } from '../lib/oauth.js'

// POST /gmail/connect: starts Google sign-in for the signed-in person.
export async function connect(request, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'communications.create')
  const state = await signState({ u: ctx.user.id, n: crypto.randomUUID(), exp: Math.floor(Date.now() / 1000) + 600 }, env.FILE_SIGNING_SECRET)
  return { url: authUrl(env, state) }
}

// GET /gmail/callback: Google sends the person back here. The signed state identifies them; the token is sealed before storage.
export async function callback(url, env) {
  const app = env.APP_URL.replace(/\/$/, '')
  const back = (q) => Response.redirect(`${app}/settings?tab=email&${q}`, 302)
  try {
    if (url.searchParams.get('error')) return back('gmail=denied')
    const st = await verifyState(url.searchParams.get('state'), env.FILE_SIGNING_SECRET)
    const code = url.searchParams.get('code')
    if (!code) return back('gmail=error')
    const tokens = await exchangeCode(env, code)
    if (!tokens.refresh_token) return back('gmail=no_refresh_token')
    const who = await userInfo(tokens.access_token)
    if (!who.email || who.email_verified === false) return back('gmail=unverified')
    const admin = adminClient(env)
    const pr = await admin.rest(`profiles?id=eq.${st.u}&select=workspace_id,is_active`)
    const [p] = pr.ok ? await pr.json() : []
    if (!p || !p.is_active) return back('gmail=inactive')
    const sealed = await encryptSecret(tokens.refresh_token, env.TOKEN_ENCRYPTION_KEY)
    const r = await admin.rest('gmail_accounts?on_conflict=user_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ user_id: st.u, workspace_id: p.workspace_id, email: String(who.email).toLowerCase(), refresh_token_enc: sealed, status: 'connected', last_error: null }),
    })
    if (!r.ok) return back(r.status === 409 ? 'gmail=in_use' : 'gmail=error')
    return back('gmail=connected')
  } catch (e) {
    console.error('gmail callback', e?.message)
    return back('gmail=error')
  }
}

// POST /gmail/disconnect: revokes the grant at Google and removes the stored token.
export async function disconnect(request, env) {
  const ctx = await authenticate(request, env)
  const admin = adminClient(env)
  const r = await admin.rest(`gmail_accounts?user_id=eq.${ctx.user.id}&select=refresh_token_enc`)
  const [row] = r.ok ? await r.json() : []
  if (row) {
    try { await revokeToken(await decryptSecret(row.refresh_token_enc, env.TOKEN_ENCRYPTION_KEY)) } catch { /* still remove the local copy */ }
    await admin.rest(`gmail_accounts?user_id=eq.${ctx.user.id}`, { method: 'DELETE' })
  }
  return { disconnected: true }
}
