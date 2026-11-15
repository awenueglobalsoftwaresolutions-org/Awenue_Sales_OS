import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { dealSchema } from './schemas'
import { Field, FormError, FormFooter, Options } from './FormParts'
import Spinner from '../common/Spinner'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../contexts/AuthContext'
import { toFormValues } from '../../lib/query'
import { fullName, leadCode } from '../../lib/format'
import { DEAL_FIELDS } from '../../services/deals'
import { listContactOptions, listLeadOptions, listOrganizationOptions, listProfiles, listServiceNames } from '../../services/lookups'
import { CURRENCIES, DEAL_STAGES, stageProbability } from '../../constants/options'

export default function DealForm({ initial, onSubmit, onCancel }) {
  const { profile, can } = useAuth()
  const isEdit = Boolean(initial?.id)
  const defaults = isEdit ? toFormValues(initial, DEAL_FIELDS)
    : { ...toFormValues(initial, DEAL_FIELDS), stage: 'new_lead', probability: 10, currency: 'USD', assigned_to: profile?.id ?? '' }
  const form = useForm({ resolver: zodResolver(dealSchema), defaultValues: defaults })
  const { register, watch, setValue, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, onSubmit)
  const orgs = useFetch(listOrganizationOptions, [])
  const contacts = useFetch(listContactOptions, [])
  const leads = useFetch(listLeadOptions, [])
  const users = useFetch(listProfiles, [])
  const services = useFetch(listServiceNames, [])
  if (orgs.loading || contacts.loading || leads.loading || users.loading || services.loading) return <Spinner label="Loading form" className="py-10" />
  const stage = watch('stage')

  return (
    <form onSubmit={submit} noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Deal title" required error={errors.title?.message} className="sm:col-span-2"><input className="input" {...register('title')} /></Field>
        <Field label="Organization">
          <select className="input" {...register('organization_id')}><option value="">None</option>{(orgs.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
        </Field>
        <Field label="Primary contact">
          <select className="input" {...register('contact_id')}><option value="">None</option>{(contacts.data || []).map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}</select>
        </Field>
        <Field label="Associated lead">
          <select className="input" {...register('lead_id')}><option value="">None</option>{(leads.data || []).map((l) => <option key={l.id} value={l.id}>{leadCode(l.lead_number)} · {fullName(l)}</option>)}</select>
        </Field>
        <Field label="Interested service">
          <select className="input" {...register('interested_service')}><option value="">Select…</option>{(services.data || []).map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select>
        </Field>
        <Field label="Deal value" error={errors.value?.message}><input type="number" step="any" min="0" className="input" {...register('value')} /></Field>
        <Field label="Currency"><select className="input" {...register('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Stage" required error={errors.stage?.message}>
          <select className="input" {...register('stage', { onChange: (e) => setValue('probability', stageProbability(e.target.value)) })}><Options list={DEAL_STAGES} /></select>
        </Field>
        <Field label="Probability (%)" error={errors.probability?.message}><input type="number" min="0" max="100" className="input" {...register('probability')} /></Field>
        <Field label="Expected closing date"><input type="date" className="input" {...register('expected_close_date')} /></Field>
        <Field label="Assigned salesperson">
          <select className="input" {...register('assigned_to')}>{can('deals.assign') && <option value="">Unassigned</option>}{(users.data || []).filter((u) => can('deals.assign') || u.id === profile?.id).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select>
        </Field>
        {stage === 'lost' && <Field label="Why was it lost?" required error={errors.lost_reason?.message} className="sm:col-span-2"><input className="input" {...register('lost_reason')} /></Field>}
        <Field label="Description" className="sm:col-span-2"><textarea rows={2} className="input" {...register('description')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea rows={2} className="input" {...register('notes')} /></Field>
      </div>
      <FormFooter busy={isSubmitting} onCancel={onCancel} label={isEdit ? 'Save changes' : 'Add deal'} />
    </form>
  )
}
