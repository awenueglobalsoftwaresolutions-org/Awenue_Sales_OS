import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity as ActivityIcon, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useFormSubmit } from '../../hooks/useFormSubmit'
import { useListQuery } from '../../hooks/useListQuery'
import { createActivity, listAllActivities } from '../../services/activities'
import { listContactOptions, listDealOptions, listLeadOptions, listOrganizationOptions, listProfiles } from '../../services/lookups'
import { ACTIVITY_TYPES, MANUAL_ACTIVITY_TYPES, labelOf } from '../../constants/options'
import { activityLink, fmtDateTime, fullName, leadCode } from '../../lib/format'
import PageHeader from '../../components/common/PageHeader'
import { FilterBar, FilterSelect } from '../../components/common/FilterBar'
import DataTable from '../../components/tables/DataTable'
import Pagination from '../../components/common/Pagination'
import EmptyState from '../../components/common/EmptyState'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import Badge from '../../components/common/Badge'
import Spinner from '../../components/common/Spinner'
import { ICONS } from '../../components/common/ActivityTimeline'
import { Field, FormError, FormFooter, Options } from '../../components/forms/FormParts'

const RECORD_TYPES = [
  { value: 'lead_id', label: 'Lead', load: listLeadOptions, text: (r) => `${leadCode(r.lead_number)} · ${fullName(r)}` },
  { value: 'contact_id', label: 'Contact', load: listContactOptions, text: fullName },
  { value: 'organization_id', label: 'Organization', load: listOrganizationOptions, text: (r) => r.name },
  { value: 'deal_id', label: 'Deal', load: listDealOptions, text: (r) => r.title },
]
const schema = z.object({
  record_type: z.string().min(1), record_id: z.string().min(1, 'Choose a record'), activity_type: z.string().min(1),
  title: z.string().trim().min(1, 'Add a short title'), description: z.string().trim().optional(),
})

function LogActivityForm({ onDone, onCancel }) {
  const { profile } = useAuth()
  const form = useForm({ resolver: zodResolver(schema), defaultValues: { record_type: 'lead_id', record_id: '', activity_type: 'note', title: '', description: '' } })
  const { register, watch, setValue, formState: { errors, isSubmitting } } = form
  const type = watch('record_type')
  const rt = RECORD_TYPES.find((r) => r.value === type)
  const options = useFetch(rt.load, [type])
  const { submit, formError } = useFormSubmit(form, async (v) => { await createActivity(v, v.record_type, v.record_id, profile); onDone() })
  return (
    <form onSubmit={submit} noValidate>
      <FormError message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Record type"><select className="input" {...register('record_type', { onChange: () => setValue('record_id', '') })}>{RECORD_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
        <Field label={rt.label} required error={errors.record_id?.message}>
          {options.loading ? <Spinner className="py-2" /> : (
            <select className="input" {...register('record_id')}><option value="">Select…</option>{(options.data || []).map((o) => <option key={o.id} value={o.id}>{rt.text(o)}</option>)}</select>)}
        </Field>
        <Field label="Activity type"><select className="input" {...register('activity_type')}><Options list={MANUAL_ACTIVITY_TYPES} placeholder="Type" /></select></Field>
        <Field label="Title" required error={errors.title?.message}><input className="input" placeholder="e.g. Intro call" {...register('title')} /></Field>
        <Field label="Details" className="sm:col-span-2"><textarea rows={3} className="input" {...register('description')} /></Field>
      </div>
      <FormFooter busy={isSubmitting} onCancel={onCancel} label="Log activity" />
    </form>
  )
}

const INITIAL_SORT = { key: 'created_at', dir: 'desc' }

export default function ActivitiesPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const list = useListQuery(listAllActivities, { initialSort: INITIAL_SORT })
  const users = useFetch(listProfiles, [])
  const [adding, setAdding] = useState(false)

  const columns = [
    { key: 'type', header: 'Type', render: (a) => {
      const Icon = ICONS[a.activity_type] || ActivityIcon
      return (
        <span className="inline-flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-3.5 w-3.5" aria-hidden /></span>
          <span className="text-xs font-medium text-ink-700">{labelOf(ACTIVITY_TYPES, a.activity_type)}</span>
        </span>
      )
    } },
    { key: 'title', header: 'Activity', render: (a) => <div className="max-w-md"><p className="font-medium text-ink-900">{a.title}</p>{a.description && <p className="truncate text-xs text-ink-500">{a.description}</p>}</div> },
    { key: 'related', header: 'Related to', render: (a) => {
      const r = a.deal ? ['Deal', a.deal.title] : a.lead ? ['Lead', fullName(a.lead)] : a.contact ? ['Contact', fullName(a.contact)] : a.organization ? ['Organization', a.organization.name] : null
      return r ? <span className="text-sm"><Badge tone="indigo">{r[0]}</Badge> <span className="ml-1 font-medium text-ink-700">{r[1]}</span></span> : '—'
    } },
    { key: 'user', header: 'By', render: (a) => a.user?.full_name || '—' },
    { key: 'created_at', header: 'When', sortKey: 'created_at', render: (a) => <span className="whitespace-nowrap text-ink-600">{fmtDateTime(a.created_at)}</span> },
  ]
  const addButton = !can('activities.create') ? null : <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Log activity</button>

  return (
    <div className="w-full space-y-5 animate-fade-up">
      <PageHeader title="Activities" subtitle="Everything that happened, newest first" icon={ActivityIcon} actions={addButton} />
      <FilterBar search={list.search} onSearch={list.setSearch} placeholder="Search activities" isFiltered={list.isFiltered} onClear={list.clearFilters}>
        <FilterSelect label="Any type" value={list.filters.activity_type} onChange={(v) => list.setFilter('activity_type', v)} options={ACTIVITY_TYPES} />
        <FilterSelect label="Anyone" value={list.filters.user_id} onChange={(v) => list.setFilter('user_id', v)} options={(users.data || []).map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
      </FilterBar>
      {list.error && !list.rows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <>
          <DataTable columns={columns} rows={list.rows} loading={list.loading} sort={list.sort} onSort={list.toggleSort}
            onRowClick={(a) => { const to = activityLink(a); if (to) navigate(to) }}
            empty={list.isFiltered
              ? <EmptyState illustration="search" title="No activities match" description="Try a different search or clear the filters." />
              : <EmptyState illustration="activities" title="No activity yet" description="Calls, emails, meetings, notes, stage changes and completed tasks show up here." action={addButton} />} />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
        </>
      )}
      <Modal open={adding} title="Log activity" onClose={() => setAdding(false)}>
        {adding && <LogActivityForm onCancel={() => setAdding(false)} onDone={() => { toast.success('Activity logged'); setAdding(false); list.reload() }} />}
      </Modal>
    </div>
  )
}
