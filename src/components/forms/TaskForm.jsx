import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { taskSchema } from './schemas'
import { Field, FormError, FormFooter, Options } from './FormParts'
import Spinner from '../common/Spinner'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../contexts/AuthContext'
import { toFormValues } from '../../lib/query'
import { fullName, leadCode } from '../../lib/format'
import { TASK_FIELDS } from '../../services/tasks'
import { listContactOptions, listDealOptions, listLeadOptions, listOrganizationOptions, listProfiles } from '../../services/lookups'
import { PRIORITIES, TASK_STATUSES, TASK_TYPES } from '../../constants/options'

export default function TaskForm({ initial, onSubmit, onCancel }) {
  const { profile, can } = useAuth()
  const isEdit = Boolean(initial?.id)
  const base = toFormValues(initial, TASK_FIELDS)
  const defaults = isEdit ? { ...base, due_time: (base.due_time || '').slice(0, 5) }
    : { ...base, task_type: 'general', priority: 'medium', status: 'pending', assigned_to: profile?.id ?? '' }
  const form = useForm({ resolver: zodResolver(taskSchema), defaultValues: defaults })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, onSubmit)
  const users = useFetch(listProfiles, [])
  const leads = useFetch(listLeadOptions, [])
  const orgs = useFetch(listOrganizationOptions, [])
  const contacts = useFetch(listContactOptions, [])
  const deals = useFetch(listDealOptions, [])
  if (users.loading || leads.loading || orgs.loading || contacts.loading || deals.loading) return <Spinner label="Loading form" className="py-10" />

  return (
    <form onSubmit={submit} noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Task title" required error={errors.title?.message} className="sm:col-span-2"><input className="input" placeholder="e.g. Send proposal, follow up on call" {...register('title')} /></Field>
        <Field label="Type" required error={errors.task_type?.message}><select className="input" {...register('task_type')}><Options list={TASK_TYPES} /></select></Field>
        <Field label="Priority" required error={errors.priority?.message}><select className="input" {...register('priority')}><Options list={PRIORITIES} /></select></Field>
        <Field label="Due date"><input type="date" className="input" {...register('due_date')} /></Field>
        <Field label="Due time"><input type="time" className="input" {...register('due_time')} /></Field>
        <Field label="Status" required error={errors.status?.message}><select className="input" {...register('status')}><Options list={TASK_STATUSES} /></select></Field>
        <Field label="Assigned to">
          <select className="input" {...register('assigned_to')}>{can('tasks.assign') && <option value="">Unassigned</option>}{(users.data || []).filter((u) => can('tasks.assign') || u.id === profile?.id).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select>
        </Field>
        <Field label="Deal"><select className="input" {...register('deal_id')}><option value="">None</option>{(deals.data || []).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></Field>
        <Field label="Lead"><select className="input" {...register('lead_id')}><option value="">None</option>{(leads.data || []).map((l) => <option key={l.id} value={l.id}>{leadCode(l.lead_number)} · {fullName(l)}</option>)}</select></Field>
        <Field label="Organization"><select className="input" {...register('organization_id')}><option value="">None</option>{(orgs.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
        <Field label="Contact"><select className="input" {...register('contact_id')}><option value="">None</option>{(contacts.data || []).map((c) => <option key={c.id} value={c.id}>{fullName(c)}</option>)}</select></Field>
        <Field label="Description" className="sm:col-span-2"><textarea rows={2} className="input" {...register('description')} /></Field>
      </div>
      <FormFooter busy={isSubmitting} onCancel={onCancel} label={isEdit ? 'Save changes' : 'Add task'} />
    </form>
  )
}
