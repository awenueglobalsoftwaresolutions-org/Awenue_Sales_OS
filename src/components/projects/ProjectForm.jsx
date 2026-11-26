import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Field, FormError, FormFooter, Options } from '../forms/FormParts'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useFetch } from '../../hooks/useFetch'
import { listOrganizationOptions, listProfiles } from '../../services/lookups'
import { PRIORITY_OPTIONS } from '../../services/projects'

const schema = z.object({
  organization_id: z.string().min(1, 'Choose the client organization'),
  name: z.string().trim().min(1, 'Enter a project name').max(160),
  description: z.string().max(5000).optional(), start_date: z.string().optional(), expected_end_date: z.string().optional(),
  priority: z.string().min(1), assigned_to: z.string().optional(), notes: z.string().max(5000).optional(),
}).refine((v) => !v.start_date || !v.expected_end_date || v.expected_end_date >= v.start_date, { path: ['expected_end_date'], message: 'Must be on or after the start date' })

export default function ProjectForm({ initial = {}, lockOrg = false, onSubmit, onCancel, submitLabel = 'Save project' }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { organization_id: '', name: '', description: '', start_date: '', expected_end_date: '', priority: 'medium', assigned_to: '', notes: '', ...initial } })
  const { register, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, onSubmit)
  const orgs = useFetch(listOrganizationOptions, [])
  const users = useFetch(listProfiles, [])
  return (
    <form onSubmit={submit} noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client organization" required error={errors.organization_id?.message} className="sm:col-span-2">
          <select className="input" disabled={lockOrg} {...register('organization_id')}><Options list={(orgs.data || []).map((o) => ({ value: o.id, label: o.name }))} placeholder="Choose…" /></select>
        </Field>
        <Field label="Project name" required error={errors.name?.message} className="sm:col-span-2"><input className="input" {...register('name')} /></Field>
        <Field label="Start date"><input type="date" className="input" {...register('start_date')} /></Field>
        <Field label="Expected completion" error={errors.expected_end_date?.message}><input type="date" className="input" {...register('expected_end_date')} /></Field>
        <Field label="Priority"><select className="input" {...register('priority')}><Options list={PRIORITY_OPTIONS} /></select></Field>
        <Field label="Assigned team / person"><select className="input" {...register('assigned_to')}><option value="">Unassigned</option>{(users.data || []).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select></Field>
        <Field label="Description" className="sm:col-span-2"><textarea rows={3} className="input" {...register('description')} /></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea rows={2} className="input" {...register('notes')} /></Field>
      </div>
      <FormFooter busy={isSubmitting} onCancel={onCancel} label={submitLabel} />
    </form>
  )
}
