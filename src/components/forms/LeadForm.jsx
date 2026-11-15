import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { leadSchema } from './schemas'
import { Field, FormError, FormFooter, Options } from './FormParts'
import Spinner from '../common/Spinner'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../contexts/AuthContext'
import { toFormValues } from '../../lib/query'
import { LEAD_FIELDS } from '../../services/leads'
import { listOrganizationOptions, listProfiles, listServiceNames } from '../../services/lookups'
import { LEAD_SOURCES, LEAD_STATUSES, PRIORITIES } from '../../constants/options'

export default function LeadForm({ initial, onSubmit, onCancel }) {
  const { profile, can } = useAuth()
  const isEdit = Boolean(initial?.id)
  const defaults = { status: 'new', priority: 'medium', assigned_to: profile?.id, ...toFormValues(initial, LEAD_FIELDS) }
  if (!isEdit) { defaults.status = 'new'; defaults.priority = 'medium'; defaults.assigned_to = profile?.id ?? '' }
  const form = useForm({ resolver: zodResolver(leadSchema), defaultValues: defaults })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, onSubmit)
  const orgs = useFetch(listOrganizationOptions, [])
  const users = useFetch(listProfiles, [])
  const services = useFetch(listServiceNames, [])
  const converted = initial?.status === 'converted'
  // Conversion happens only through the Convert action; a converted lead's status is locked.
  const statuses = converted ? LEAD_STATUSES.filter((s) => s.value === 'converted') : LEAD_STATUSES.filter((s) => s.value !== 'converted')

  if (orgs.loading || users.loading || services.loading) return <Spinner label="Loading form" className="py-10" />
  return (
    <form onSubmit={submit} noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required error={errors.first_name?.message}><input className="input" {...register('first_name')} /></Field>
        <Field label="Last name"><input className="input" {...register('last_name')} /></Field>
        <Field label="Job title"><input className="input" {...register('job_title')} /></Field>
        <Field label="Organization">
          <select className="input" {...register('organization_id')}>
            <option value="">None</option>
            {(orgs.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <Field label="Email" error={errors.email?.message}><input type="email" className="input" {...register('email')} /></Field>
        <Field label="Phone"><input className="input" {...register('phone')} /></Field>
        <Field label="Website"><input className="input" placeholder="https://" {...register('website')} /></Field>
        <Field label="Industry"><input className="input" {...register('industry')} /></Field>
        <Field label="Country"><input className="input" {...register('country')} /></Field>
        <Field label="State"><input className="input" {...register('state')} /></Field>
        <Field label="City"><input className="input" {...register('city')} /></Field>
        <Field label="Estimated budget (USD)" error={errors.estimated_budget?.message}><input type="number" step="any" min="0" className="input" {...register('estimated_budget')} /></Field>
        <Field label="Lead source"><select className="input" {...register('source')}><Options list={LEAD_SOURCES} /></select></Field>
        <Field label="Interested service">
          <select className="input" {...register('interested_service')}>
            <option value="">Select…</option>
            {(services.data || []).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </Field>
        <Field label="Status" required error={errors.status?.message}><select className="input" {...register('status')}><Options list={statuses} /></select></Field>
        <Field label="Priority" required error={errors.priority?.message}><select className="input" {...register('priority')}><Options list={PRIORITIES} /></select></Field>
        <Field label="Assigned to" className="sm:col-span-2">
          <select className="input" {...register('assigned_to')}>
            {can('leads.assign') && <option value="">Unassigned</option>}
            {(users.data || []).filter((u) => can('leads.assign') || u.id === profile?.id).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}
          </select>
        </Field>
        <Field label="Notes" className="sm:col-span-2"><textarea rows={3} className="input" {...register('notes')} /></Field>
      </div>
      <FormFooter busy={isSubmitting} onCancel={onCancel} label={isEdit ? 'Save changes' : 'Add lead'} />
    </form>
  )
}
