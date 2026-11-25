import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Crown, KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { friendlyError } from '../../lib/errors'
import { fmtDate } from '../../lib/format'
import { createUser, listRoles, listUsers, removeUser, updateUser } from '../../services/settings'
import { supabase } from '../../lib/supabase'
import { Field, FormError, FormFooter } from '../../components/forms/FormParts'
import Avatar from '../../components/common/Avatar'
import Badge from '../../components/common/Badge'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import Spinner from '../../components/common/Spinner'
import { Card } from './Sections'

const addSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter a name').max(100), email: z.string().trim().min(1, 'Enter an email').email('Enter a valid email'),
  role: z.string().min(1), manager_id: z.string().optional(), job_title: z.string().trim().optional(), department: z.string().trim().optional(), phone: z.string().trim().optional(),
  password: z.string().refine((v) => v === '' || v.length >= 10, 'Use at least 10 characters, or leave empty to send an invitation email'),
})
const editSchema = z.object({ full_name: z.string().trim().min(1, 'Enter a name').max(100), phone: z.string().trim().optional(), job_title: z.string().trim().optional(), department: z.string().trim().optional() })

function AddUserModal({ roles, users, canAssign, isSuperAdmin, onClose, onDone }) {
  const form = useForm({ resolver: zodResolver(addSchema), defaultValues: { full_name: '', email: '', role: 'sales_executive', manager_id: '', job_title: '', department: '', phone: '', password: '' } })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, async (v) => {
    const r = await createUser({ ...v, manager_id: v.manager_id || undefined, password: v.password || undefined })
    toast.success(r.invited ? `Invitation sent to ${v.email}` : `Account created. Share the temporary password with ${v.full_name}.`)
    onDone()
  })
  return (
    <Modal open title="Add user" onClose={() => !isSubmitting && onClose()}>
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required error={errors.full_name?.message}><input className="input" {...register('full_name')} /></Field>
          <Field label="Email" required error={errors.email?.message}><input type="email" className="input" {...register('email')} /></Field>
          <Field label="Role"><select className="input" disabled={!canAssign} {...register('role')}>{roles.filter((r) => r.key !== 'super_admin' || isSuperAdmin).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></Field>
          <Field label="Team lead"><select className="input" disabled={!canAssign} {...register('manager_id')}><option value="">None</option>{users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select></Field>
          <Field label="Job title"><input className="input" {...register('job_title')} /></Field>
          <Field label="Department"><input className="input" {...register('department')} /></Field>
          <Field label="Phone"><input className="input" {...register('phone')} /></Field>
          <Field label="Temporary password (optional)" error={errors.password?.message}><input type="text" autoComplete="off" className="input" {...register('password')} /></Field>
        </div>
        <p className="mt-3 text-xs text-ink-500">Leave the password empty to email an invitation link (needs email set up in Supabase). With a password, the person must change it the first time they sign in.</p>
        <FormFooter busy={isSubmitting} onCancel={onClose} label="Add user" />
      </form>
    </Modal>
  )
}

function EditUserModal({ user, onClose, onDone }) {
  const form = useForm({ resolver: zodResolver(editSchema), defaultValues: { full_name: user.full_name || '', phone: user.phone || '', job_title: user.job_title || '', department: user.department || '' } })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, async (v) => {
    await updateUser(user.id, { full_name: v.full_name.trim(), phone: v.phone?.trim() || null, job_title: v.job_title?.trim() || null, department: v.department?.trim() || null })
    toast.success('User updated'); onDone()
  })
  return (
    <Modal open title={`Edit ${user.full_name || user.email}`} onClose={() => !isSubmitting && onClose()} size="sm">
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <div className="space-y-4">
          <Field label="Full name" required error={errors.full_name?.message}><input className="input" {...register('full_name')} /></Field>
          <Field label="Job title"><input className="input" {...register('job_title')} /></Field>
          <Field label="Department"><input className="input" {...register('department')} /></Field>
          <Field label="Phone"><input className="input" {...register('phone')} /></Field>
        </div>
        <FormFooter busy={isSubmitting} onCancel={onClose} />
      </form>
    </Modal>
  )
}

export default function UsersSection() {
  const { profile, can, isSuperAdmin } = useAuth()
  const users = useFetch(listUsers, [])
  const roles = useFetch(listRoles, [])
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [busy, setBusy] = useState(false)
  const [canCreate, canEdit, canAssign, canDelete] = [can('users.create'), can('users.edit'), can('users.assign'), can('users.delete')]

  const roleName = (key) => roles.data?.find((r) => r.key === key)?.name || key
  const visible = useMemo(() => (users.data || []).filter((u) => {
    const t = search.trim().toLowerCase()
    return (!t || [u.full_name, u.email, u.job_title, u.department].some((x) => x?.toLowerCase().includes(t)))
      && (!roleFilter || u.role === roleFilter) && (!statusFilter || (statusFilter === 'active') === u.is_active)
  }), [users.data, search, roleFilter, statusFilter])

  const change = async (id, patch, msg) => { setBusy(true); try { await updateUser(id, patch); toast.success(msg); users.reload() } catch (e) { toast.error(friendlyError(e)); users.reload() } finally { setBusy(false) } }
  const sendReset = async (u) => {
    const { error } = await supabase.auth.resetPasswordForEmail(u.email, { redirectTo: `${window.location.origin}/reset-password` })
    if (error) toast.error(friendlyError(error)); else toast.success(`Password reset email sent to ${u.email}`)
  }
  const pending = (users.data || []).filter((u) => !u.is_active).length

  return (
    <Card title="Users" description="Add people, choose their role and team, and turn access on or off. People who sign up on their own stay inactive until you activate them here.">
      {users.loading && !users.data ? <Spinner /> : users.error ? <ErrorState message={users.error} onRetry={users.reload} /> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden /><input className="input !pl-9" placeholder="Search name, email, title" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search users" /></div>
            <select className="input !w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} aria-label="Filter by role"><option value="">Any role</option>{(roles.data || []).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
            <select className="input !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status"><option value="">Any status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
            {canCreate && <button className="btn-primary ml-auto" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add user</button>}
          </div>
          {pending > 0 && canEdit && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{pending} {pending === 1 ? 'person is' : 'people are'} inactive. Activate anyone who should have access.</p>}
          <div className="overflow-x-auto rounded-lg border border-ink-100">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-ink-50 text-xs font-semibold text-ink-500"><tr><th className="px-4 py-2.5">User</th><th className="px-4 py-2.5">Role</th><th className="px-4 py-2.5">Team lead</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Joined</th><th className="px-4 py-2.5" /></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {visible.map((u) => {
                  const me = u.id === profile.id
                  const founderEmail = (import.meta.env.VITE_FOUNDER_EMAIL || '').toLowerCase().trim()
                  const isFounder = Boolean(
                    u.is_permanent ||
                    (u.role === 'super_admin' && /founder|cto/i.test(u.job_title || '')) ||
                    (founderEmail && u.email?.toLowerCase() === founderEmail)
                  )
                  const locked = (u.role === 'super_admin' && !isSuperAdmin) || isFounder
                  return (
                    <tr key={u.id} className={isFounder ? 'bg-amber-50/20' : undefined}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar person={u} size={32} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="truncate font-semibold text-ink-900">{u.full_name || '—'}</p>
                              {me && <span className="text-xs font-normal text-ink-500">(you)</span>}
                              {isFounder && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-300">
                                  <Crown className="h-3 w-3 text-amber-600" /> Founder and CTO
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-ink-500">{[u.job_title, u.email].filter(Boolean).join(' · ')}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        {isFounder ? (
                          <Badge tone="violet">Founder and CTO</Badge>
                        ) : canAssign && !me && !locked ? (
                          <select className="input !w-auto" value={u.role} disabled={busy} aria-label={`Role for ${u.full_name || u.email}`} onChange={(e) => change(u.id, { role: e.target.value }, 'Role updated')}>{(roles.data || []).filter((r) => r.key !== 'super_admin' || isSuperAdmin || u.role === 'super_admin').map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
                        ) : (
                          roleName(u.role)
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isFounder ? (
                          <span className="text-xs font-semibold text-ink-500">Root Organization</span>
                        ) : canAssign && !locked ? (
                          <select className="input !w-auto" value={u.manager_id || ''} disabled={busy} aria-label={`Team lead for ${u.full_name || u.email}`} onChange={(e) => change(u.id, { manager_id: e.target.value || null }, 'Team updated')}><option value="">None</option>{(users.data || []).filter((m) => m.id !== u.id && m.is_active).map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}</select>
                        ) : (
                          users.data?.find((m) => m.id === u.manager_id)?.full_name || '—'
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {isFounder ? (
                          <Badge tone="green">Permanent Active</Badge>
                        ) : canEdit && !me && !locked ? (
                          <button className="btn-ghost !py-1 text-xs" disabled={busy} onClick={() => change(u.id, { is_active: !u.is_active }, u.is_active ? 'User deactivated' : 'User activated')}>{u.is_active ? 'Deactivate' : 'Activate'}</button>
                        ) : (
                          <Badge tone={u.is_active ? 'green' : 'amber'}>{u.is_active ? 'Active' : 'Inactive'}</Badge>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-ink-500">{fmtDate(u.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          {canEdit && (!locked || me) && <button className="btn-ghost !p-1.5" aria-label={`Edit ${u.full_name || u.email}`} onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></button>}
                          {canEdit && <button className="btn-ghost !p-1.5" aria-label={`Send password reset to ${u.email}`} onClick={() => sendReset(u)}><KeyRound className="h-4 w-4" /></button>}
                          {canDelete && !me && !locked && !isFounder && <button className="btn-ghost !p-1.5 hover:!bg-red-50 hover:!text-red-600" aria-label={`Remove ${u.full_name || u.email}`} onClick={() => setRemoving(u)}><Trash2 className="h-4 w-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!visible.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-500">No users match.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-500">{visible.length} of {users.data.length} users</p>
        </>
      )}
      {adding && roles.data && <AddUserModal roles={roles.data} users={users.data || []} canAssign={canAssign} isSuperAdmin={isSuperAdmin} onClose={() => setAdding(false)} onDone={() => { setAdding(false); users.reload() }} />}
      {editing && <EditUserModal user={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); users.reload() }} />}
      <ConfirmDialog open={Boolean(removing)} title="Remove user?" confirmLabel="Remove"
        message={`${removing?.full_name || removing?.email} will lose access permanently and their account will be deleted. Records they created or owned stay in the CRM. To keep their account but stop access, deactivate them instead.`}
        onConfirm={async () => {
          const founderEmail = (import.meta.env.VITE_FOUNDER_EMAIL || '').toLowerCase().trim()
          const isProtected = Boolean(
            removing?.is_permanent ||
            (removing?.role === 'super_admin' && /founder|cto/i.test(removing?.job_title || '')) ||
            (founderEmail && removing?.email?.toLowerCase() === founderEmail)
          )
          if (isProtected) {
            toast.error('The Founder and CTO account is permanently protected and cannot be removed.')
            setRemoving(null)
            return
          }
          await removeUser(removing.id)
          toast.success('User removed')
          setRemoving(null)
          users.reload()
        }}
        onClose={() => setRemoving(null)} />
    </Card>
  )
}
