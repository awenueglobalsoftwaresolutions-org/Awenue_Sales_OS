import { HttpError, mustUuid } from '../lib/http.js'
import { adminClient, authenticate, myProfile, requirePermission } from '../lib/supabase.js'
import { writeAudit } from '../lib/audit.js'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const ROLE_KEY = /^[a-z][a-z0-9_]{1,40}$/
const text = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null }

// POST /users/create {email, full_name, role, password?, manager_id?, job_title?, department?, phone?}
// Without a password an invitation email is sent; with one the account is created with a temporary password the person must change.
export async function createUser(request, env) {
  const req = request
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'users.create')
  const me = await myProfile(ctx)
  const b = await request.json().catch(() => ({}))

  const email = String(b.email || '').trim().toLowerCase()
  const fullName = text(b.full_name, 100)
  const role = String(b.role || 'sales_executive')
  if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, 'Enter a valid email address.')
  if (!fullName) throw new HttpError(400, 'Enter the person\'s name.')
  if (!ROLE_KEY.test(role)) throw new HttpError(400, 'Invalid role.')
  if (b.password != null && b.password !== '' && String(b.password).length < 10) throw new HttpError(400, 'A temporary password needs at least 10 characters.')
  if (b.manager_id) mustUuid(b.manager_id, 'manager')

  // Role rules: only people who can assign roles may pick one, and only a Super Admin can create a Super Admin.
  if (role !== 'sales_executive') await requirePermission(ctx, 'users.assign')
  if (role === 'super_admin' && me.role !== 'super_admin') throw new HttpError(403, 'Only a Super Admin can create another Super Admin.')
  const rr = await ctx.sb(`roles?workspace_id=eq.${me.workspace_id}&key=eq.${role}&select=id`)
  const [roleRow] = rr.ok ? await rr.json() : []
  if (!roleRow) throw new HttpError(400, 'That role does not exist.')

  const admin = adminClient(env)
  const withPassword = Boolean(b.password)
  const created = await (withPassword
    ? admin.auth('admin/users', { method: 'POST', body: JSON.stringify({ email, password: b.password, email_confirm: true, user_metadata: { full_name: fullName } }) })
    : admin.auth('invite', { method: 'POST', body: JSON.stringify({ email, data: { full_name: fullName } }) }))
  const result = await created.json().catch(() => ({}))
  if (!created.ok) {
    const msg = String(result.msg || result.message || result.error_description || '')
    if (/already|registered|exists/i.test(msg)) throw new HttpError(409, 'A user with that email already exists.')
    throw new HttpError(502, withPassword ? 'Could not create the account.' : 'Could not send the invitation. Check your email settings in Supabase, or set a temporary password instead.')
  }
  const userId = result.id || result.user?.id
  if (!userId) throw new HttpError(502, 'The account service returned an unexpected response.')

  // The database trigger created an inactive profile. Activate it with the chosen role and details.
  const patch = await admin.rest(`profiles?id=eq.${userId}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ role, is_active: true, full_name: fullName, manager_id: b.manager_id || null, job_title: text(b.job_title, 100), department: text(b.department, 100), phone: text(b.phone, 40), must_change_password: withPassword }),
  })
  const rows = patch.ok ? await patch.json() : []
  if (!rows.length) {
    await admin.auth(`admin/users/${userId}`, { method: 'DELETE' })      // don't leave a half-created account
    throw new HttpError(500, 'Could not set up the profile. Nothing was created.')
  }
  await writeAudit(env, req, { userId: me.id, username: me.full_name || me.email, action: 'create', module: 'users', record: userId,
    description: `Created user ${fullName} (${email}) as ${role}, ${withPassword ? 'temporary password' : 'invitation email'}`, metadata: { role } })
  return { id: userId, invited: !withPassword }
}

// POST /users/remove {userId}
export async function removeUser(request, env) {
  const ctx = await authenticate(request, env)
  await requirePermission(ctx, 'users.delete')
  const me = await myProfile(ctx)
  const { userId } = await request.json().catch(() => ({}))
  mustUuid(userId, 'user')
  if (userId === me.id) throw new HttpError(400, 'You can\'t remove your own account.')

  const tr = await ctx.sb(`profiles?id=eq.${userId}&select=id,role,email,job_title`)
  const [target] = tr.ok ? await tr.json() : []
  if (!target) throw new HttpError(404, 'User not found.')

  const founderEmail = (env.FOUNDER_EMAIL || '').toLowerCase().trim()
  const isProtectedFounder = Boolean(
    (target.role === 'super_admin' && /founder|cto/i.test(target.job_title || '')) ||
    (founderEmail && target.email?.toLowerCase() === founderEmail)
  )
  if (isProtectedFounder) {
    throw new HttpError(403, 'The Founder and CTO account is permanently protected and cannot be removed.')
  }
  if (target.role === 'super_admin' && me.role !== 'super_admin') throw new HttpError(403, 'Only a Super Admin can remove a Super Admin.')

  // Records they created or owned stay in the CRM (their owner fields become empty). Deactivating is usually the better choice.
  const del = await adminClient(env).auth(`admin/users/${userId}`, { method: 'DELETE' })
  if (!del.ok) throw new HttpError(409, 'That user could not be removed. The workspace must keep at least one active Super Admin.')
  await writeAudit(env, request, { userId: me.id, username: me.full_name || me.email, action: 'delete', module: 'users', record: userId, description: `Removed user account (${target.role})`, metadata: { role: target.role } })
  return { removed: true }
}
