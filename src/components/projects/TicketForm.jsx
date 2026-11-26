import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Field, FormError, FormFooter, Options } from '../forms/FormParts'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useFetch } from '../../hooks/useFetch'
import { listOrganizationOptions, listProfiles } from '../../services/lookups'
import { listProjects, PRIORITY_OPTIONS, TICKET_CATEGORIES } from '../../services/projects'
import { supabase } from '../../lib/supabase'

const schema = z.object({
  organization_id: z.string().min(1, 'Choose the client'), project_id: z.string().min(1, 'Choose the project this issue belongs to'),
  subject: z.string().trim().min(1, 'Enter a subject').max(200), description: z.string().trim().min(1, 'Describe the problem').max(5000),
  category: z.string().min(1), priority: z.string().min(1), assigned_to: z.string().optional(),
})

async function projectsOf(orgId) {
  if (!orgId) return []
  const { data, error } = await supabase.from('projects').select('id,name,project_number').eq('organization_id', orgId).order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export default function TicketForm({ initial = {}, lockOrg = false, lockProject = false, onSubmit, onCancel }) {
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { organization_id: '', project_id: '', subject: '', description: '', category: 'bug_report', priority: 'medium', assigned_to: '', ...initial } })
  const { register, watch, formState: { errors, isSubmitting } } = form
  const { submit, formError } = useFormSubmit(form, onSubmit)
  const orgId = watch('organization_id')
  const orgs = useFetch(listOrganizationOptions, [])
  const projects = useFetch(() => projectsOf(orgId), [orgId])
  const users = useFetch(listProfiles, [])
  return (
    <form onSubmit={submit} noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Client" required error={errors.organization_id?.message}><select className="input" disabled={lockOrg} {...register('organization_id', { onChange: () => form.setValue('project_id', '') })}><Options list={(orgs.data || []).map((o) => ({ value: o.id, label: o.name }))} placeholder="Choose…" /></select></Field>
        <Field label="Project" required error={errors.project_id?.message}><select className="input" disabled={lockProject || !orgId} {...register('project_id')}><Options list={(projects.data || []).map((p) => ({ value: p.id, label: `PRJ-${String(p.project_number).padStart(4, '0')} · ${p.name}` }))} placeholder={orgId ? 'Choose…' : 'Choose a client first'} /></select></Field>
        <Field label="Subject" required error={errors.subject?.message} className="sm:col-span-2"><input className="input" placeholder="e.g. Checkout fails on Safari" {...register('subject')} /></Field>
        <Field label="Type" required><select className="input" {...register('category')}><Options list={TICKET_CATEGORIES} /></select></Field>
        <Field label="Priority" required><select className="input" {...register('priority')}><Options list={PRIORITY_OPTIONS} /></select></Field>
        <Field label="Description" required error={errors.description?.message} className="sm:col-span-2"><textarea rows={4} className="input" {...register('description')} /></Field>
        <Field label="Assigned to"><select className="input" {...register('assigned_to')}><option value="">Unassigned</option>{(users.data || []).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select></Field>
      </div>
      <FormFooter busy={isSubmitting} onCancel={onCancel} label="Raise ticket" />
    </form>
  )
}
