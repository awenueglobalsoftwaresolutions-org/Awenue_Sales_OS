import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CalendarDays, CheckCircle2, Mail, Phone, Plus, RefreshCw, StickyNote } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { createActivity, listActivities } from '../../services/activities'
import { MANUAL_ACTIVITY_TYPES } from '../../constants/options'
import { fmtDateTime } from '../../lib/format'
import { Field, FormError, FormFooter, Options } from '../forms/FormParts'
import Spinner from './Spinner'
import ErrorState from './ErrorState'

export const ICONS = { email: Mail, call: Phone, meeting: CalendarDays, note: StickyNote, status_update: RefreshCw, task_completion: CheckCircle2 }
const schema = z.object({ activity_type: z.string().min(1), title: z.string().trim().min(1, 'Add a short title'), description: z.string().trim().optional() })

// column: FK column on activities ('lead_id' | 'contact_id' | 'organization_id' | 'deal_id'); id: that record's id.
export default function ActivityTimeline({ column, id, title = 'Activity' }) {
  const { profile, can } = useAuth()
  const list = useFetch(() => listActivities(column, id), [column, id])
  const [adding, setAdding] = useState(false)
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { activity_type: 'note', title: '', description: '' } })
  const { submit, formError } = useFormSubmit(form, async (v) => {
    await createActivity(v, column, id, profile)
    toast.success('Activity logged')
    form.reset(); setAdding(false); list.reload()
  })
  const { register, formState: { errors, isSubmitting } } = form

  return (
    <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {!adding && can('activities.create') && <button className="btn-ghost !py-1.5" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Log activity</button>}
      </div>

      {adding && (
        <form onSubmit={submit} noValidate className="mb-5 rounded-lg bg-ink-50 p-4">
          <FormError message={formError} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Type"><select className="input" {...register('activity_type')}><Options list={MANUAL_ACTIVITY_TYPES} placeholder="Type" /></select></Field>
            <Field label="Title" error={errors.title?.message} className="sm:col-span-2"><input className="input" placeholder="e.g. Intro call, sent proposal" {...register('title')} /></Field>
            <Field label="Details" className="sm:col-span-3"><textarea rows={2} className="input" {...register('description')} /></Field>
          </div>
          <FormFooter busy={isSubmitting} onCancel={() => { setAdding(false); form.reset() }} label="Log activity" />
        </form>
      )}

      {list.loading && !list.data ? <Spinner className="py-4" />
        : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !list.data?.length ? <p className="text-sm text-ink-500">Nothing logged yet. Log a call, email, meeting or note to start the history.</p>
        : (
          <ol className="space-y-4">
            {list.data.map((a) => {
              const Icon = ICONS[a.activity_type] || StickyNote
              return (
                <li key={a.id} className="flex gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600"><Icon className="h-4 w-4" aria-hidden /></span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{a.title}</p>
                    {a.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-700">{a.description}</p>}
                    <p className="mt-0.5 text-xs text-ink-500">{a.user?.full_name || 'Someone'} · {fmtDateTime(a.created_at)}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
    </section>
  )
}
