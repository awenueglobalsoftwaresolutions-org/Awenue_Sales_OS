import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { friendlyError } from '../../lib/errors'
import { addService, listAllServices, removeAvatar, setServiceActive, updateService, updateOwnProfile, updateWorkspaceName, uploadAvatar } from '../../services/settings'
import { DEAL_STAGES, LEAD_SOURCES, LEAD_STATUSES } from '../../constants/options'
import { ROLE_LABELS } from '../../constants/nav'
import { Field, FormError } from '../../components/forms/FormParts'
import Avatar from '../../components/common/Avatar'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'
import Badge from '../../components/common/Badge'

export const Card = ({ title, description, children }) => (
  <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
    <h2 className="text-base font-semibold">{title}</h2>
    {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
    <div className="mt-4">{children}</div>
  </section>
)
const SaveButton = ({ busy, children = 'Save changes' }) => <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Saving…' : children}</button>
const ReadOnlyNote = () => <p className="mb-3 rounded-lg bg-ink-50 p-3 text-sm text-ink-700">You can view this but not change it.</p>

const ZONES = (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['Asia/Kolkata', 'Europe/London', 'America/New_York'])
const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Enter your name').max(100), phone: z.string().trim().max(40).optional(), job_title: z.string().trim().max(100).optional(),
  department: z.string().trim().max(100).optional(), bio: z.string().trim().max(500, 'Keep it under 500 characters').optional(), timezone: z.string().min(1),
})

export function ProfileSection() {
  const { profile, refreshProfile } = useAuth()
  const fileInput = useRef(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: {
    full_name: profile.full_name || '', phone: profile.phone || '', job_title: profile.job_title || '', department: profile.department || '', bio: profile.bio || '', timezone: profile.timezone || 'UTC' } })
  const { submit, formError } = useFormSubmit(form, async (v) => { await updateOwnProfile(profile.id, v); await refreshProfile(); toast.success('Profile updated') })
  const photo = async (fn, msg) => { setPhotoBusy(true); try { await fn(); await refreshProfile(); toast.success(msg) } catch (e) { toast.error(friendlyError(e)) } finally { setPhotoBusy(false) } }
  const { errors, isSubmitting } = form.formState

  return (
    <Card title="Your profile" description="This is how you appear to your team.">
      <div className="mb-5 flex items-center gap-4">
        <Avatar person={profile} size={64} />
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost border border-ink-300" disabled={photoBusy} onClick={() => fileInput.current?.click()}>{photoBusy ? 'Uploading…' : 'Change picture'}</button>
          {profile.avatar_url && <button className="btn-ghost" disabled={photoBusy} onClick={() => photo(() => removeAvatar(profile.id), 'Picture removed')}>Remove</button>}
          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) photo(() => uploadAvatar(f, profile.id), 'Picture updated') }} />
        </div>
      </div>
      <form onSubmit={submit} noValidate className="grid max-w-2xl gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormError message={formError} /></div>
        <Field label="Full name" required error={errors.full_name?.message}><input className="input" {...form.register('full_name')} /></Field>
        <Field label="Phone"><input className="input" {...form.register('phone')} /></Field>
        <Field label="Job title"><input className="input" {...form.register('job_title')} /></Field>
        <Field label="Department"><input className="input" {...form.register('department')} /></Field>
        <Field label="Email"><input className="input bg-ink-50" value={profile.email} readOnly /></Field>
        <Field label="Role"><input className="input bg-ink-50" value={ROLE_LABELS[profile.role] || profile.role} readOnly /></Field>
        <Field label="Time zone" className="sm:col-span-2"><select className="input" {...form.register('timezone')}>{!ZONES.includes('UTC') && <option>UTC</option>}{ZONES.map((z) => <option key={z}>{z}</option>)}</select></Field>
        <Field label="About you" error={errors.bio?.message} className="sm:col-span-2"><textarea rows={3} className="input" {...form.register('bio')} /></Field>
        <div className="sm:col-span-2"><SaveButton busy={isSubmitting} /></div>
      </form>
    </Card>
  )
}

export function OrganizationSection() {
  const { profile, can, refreshProfile } = useAuth()
  const editable = can('settings.manage')
  const form = useForm({ resolver: zodResolver(z.object({ name: z.string().trim().min(1, 'Enter a name') })), defaultValues: { name: profile.workspace?.name || '' } })
  const { submit, formError } = useFormSubmit(form, async (v) => { await updateWorkspaceName(profile.workspace_id, v.name); await refreshProfile(); toast.success('Organization profile updated') })
  return (
    <Card title="Organization profile" description="Your company, shown in the sidebar.">
      {!editable && <ReadOnlyNote />}
      <form onSubmit={submit} noValidate className="max-w-xl space-y-4">
        <FormError message={formError} />
        <Field label="Company name" required error={form.formState.errors.name?.message}><input className="input" disabled={!editable} {...form.register('name')} /></Field>
        {editable && <SaveButton busy={form.formState.isSubmitting} />}
      </form>
    </Card>
  )
}

export function ServicesSection() {
  const { profile, can } = useAuth()
  const editable = can('settings.manage')
  const list = useFetch(listAllServices, [])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async (fn, msg) => { setBusy(true); try { await fn(); toast.success(msg); list.reload() } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) } }
  const add = (e) => { e.preventDefault(); if (!name.trim()) return; run(async () => { await addService(name, (list.data?.length || 0) + 1, profile); setName('') }, 'Service added') }
  return (
    <Card title="Services" description="The services you sell. They appear in lead and deal forms, filters and as suggestions on invoice lines. Add a default price and tax rate and invoices fill them in. Turning a service off hides it from new records; existing records keep it.">
      {!editable && <ReadOnlyNote />}
      {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
          {list.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <span className={`min-w-[160px] flex-1 text-sm ${s.is_active ? '' : 'text-ink-500 line-through'}`}>{s.name}</span>
              {editable ? (
                <span className="flex items-center gap-2 text-xs text-ink-500">
                  <label className="flex items-center gap-1">Price<input type="number" min="0" step="any" className="input !w-24 !py-1" defaultValue={s.default_price ?? ''} aria-label={`Default price for ${s.name}`}
                    onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (s.default_price == null ? null : Number(s.default_price))) run(() => updateService(s.id, { default_price: v }), 'Price saved') }} /></label>
                  <label className="flex items-center gap-1">Tax %<input type="number" min="0" max="100" step="any" className="input !w-20 !py-1" defaultValue={s.default_tax_rate ?? ''} aria-label={`Default tax rate for ${s.name}`}
                    onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== (s.default_tax_rate == null ? null : Number(s.default_tax_rate))) run(() => updateService(s.id, { default_tax_rate: v }), 'Tax rate saved') }} /></label>
                </span>) : (s.default_price != null && <span className="text-xs text-ink-500">{Number(s.default_price).toLocaleString()}{s.default_tax_rate != null ? ` · ${s.default_tax_rate}% tax` : ''}</span>)}
              {editable ? <button className="btn-ghost !py-1 text-xs" disabled={busy} onClick={() => run(() => setServiceActive(s.id, !s.is_active), s.is_active ? 'Service turned off' : 'Service turned on')}>{s.is_active ? 'Turn off' : 'Turn on'}</button> : <Badge tone={s.is_active ? 'green' : 'gray'}>{s.is_active ? 'Active' : 'Off'}</Badge>}
            </li>))}
        </ul>)}
      {editable && (
        <form onSubmit={add} className="mt-4 flex max-w-md gap-2">
          <input className="input" placeholder="New service name" value={name} onChange={(e) => setName(e.target.value)} aria-label="New service name" maxLength={80} />
          <button className="btn-primary shrink-0" disabled={busy || !name.trim()}><Plus className="h-4 w-4" />Add</button>
        </form>)}
    </Card>
  )
}

export function ReferenceSection() {
  const Chips = ({ items }) => <div className="flex flex-wrap gap-2">{items.map((i) => <Badge key={i.value} tone="indigo">{i.label}</Badge>)}</div>
  return (
    <Card title="Pipeline stages and lead options" description="These are built into the database so reports and the pipeline stay consistent. Changing them needs a database migration.">
      <div className="space-y-5">
        <div><h3 className="mb-2 text-sm font-medium">Deal stages (in order)</h3><Chips items={DEAL_STAGES} /></div>
        <div><h3 className="mb-2 text-sm font-medium">Lead sources</h3><Chips items={LEAD_SOURCES} /></div>
        <div><h3 className="mb-2 text-sm font-medium">Lead statuses</h3><Chips items={LEAD_STATUSES} /></div>
      </div>
    </Card>
  )
}

export function AccountSection() {
  const { profile, updatePassword, refreshProfile } = useAuth()
  const schema = z.object({ password: z.string().min(8, 'Use at least 8 characters'), confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } })
  const { submit, formError } = useFormSubmit(form, async (v) => {
    const { error } = await updatePassword(v.password)
    if (error) throw error
    if (profile.must_change_password) { await updateOwnProfile(profile.id, { must_change_password: false }); await refreshProfile() }
    toast.success('Password updated'); form.reset()
  })
  return (
    <Card title="Account" description={profile.must_change_password ? 'You were given a temporary password. Choose your own now.' : 'Change your password.'}>
      <form onSubmit={submit} noValidate className="max-w-sm space-y-4">
        <FormError message={formError} />
        <Field label="New password" error={form.formState.errors.password?.message}><input type="password" autoComplete="new-password" className="input" {...form.register('password')} /></Field>
        <Field label="Confirm password" error={form.formState.errors.confirm?.message}><input type="password" autoComplete="new-password" className="input" {...form.register('confirm')} /></Field>
        <SaveButton busy={form.formState.isSubmitting}>Update password</SaveButton>
      </form>
    </Card>
  )
}
