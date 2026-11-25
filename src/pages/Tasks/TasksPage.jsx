import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CalendarDays, Check, CheckSquare, ListTodo, Mail, Plus } from 'lucide-react'
import EmailComposer from '../../components/email/EmailComposer'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useListQuery } from '../../hooks/useListQuery'
import { createTask, deleteTask, getTaskCounts, listTasks, setTaskStatus, updateTask } from '../../services/tasks'
import { listProfiles } from '../../services/lookups'
import { PRIORITIES, PRIORITY_TONE, TASK_DUE_FILTERS, TASK_STATUSES, TASK_STATUS_TONE, TASK_TYPES, labelOf } from '../../constants/options'
import { friendlyError } from '../../lib/errors'
import { fmtDay, fmtTime, fullName, isTaskOverdue, leadCode } from '../../lib/format'
import PageHeader from '../../components/common/PageHeader'
import StatTile from '../../components/common/StatTile'
import { FilterBar, FilterSelect } from '../../components/common/FilterBar'
import DataTable from '../../components/tables/DataTable'
import Pagination from '../../components/common/Pagination'
import EmptyState from '../../components/common/EmptyState'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import RowActions from '../../components/common/RowActions'
import Badge from '../../components/common/Badge'
import TaskForm from '../../components/forms/TaskForm'

const INITIAL_SORT = { key: 'due_date', dir: 'asc' }
const STATUS_FILTERS = [{ value: 'open', label: 'Open (pending + in progress)' }, ...TASK_STATUSES]

export default function TasksPage() {
  const { profile, can } = useAuth()
  const [params, setParams] = useSearchParams()
  const list = useListQuery(listTasks, { initialSort: INITIAL_SORT })
  const counts = useFetch(getTaskCounts, [])
  const users = useFetch(listProfiles, [])
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [mailing, setMailing] = useState(null)

  useEffect(() => { if (params.get('new')) { setEditing({}); setParams({}, { replace: true }) } }, [params, setParams])
  const refresh = () => { list.reload(); counts.reload() }

  const save = async (values) => {
    if (editing?.id) await updateTask(editing.id, values)
    else await createTask(values, profile)
    toast.success(editing?.id ? 'Task updated' : 'Task added')
    setEditing(null); refresh()
  }
  const remove = async () => { await deleteTask(deleting.id); toast.success('Task deleted'); setDeleting(null); refresh() }
  const toggle = async (t) => {
    try { await setTaskStatus(t.id, t.status === 'completed' ? 'pending' : 'completed'); toast.success(t.status === 'completed' ? 'Task reopened' : 'Task completed'); refresh() }
    catch (e) { toast.error(friendlyError(e)) }
  }
  const stop = (e) => e.stopPropagation()

  const columns = [
    { key: 'done', header: '', className: 'w-10', render: (t) => (
      <button onClick={(e) => { stop(e); toggle(t) }} aria-label={t.status === 'completed' ? `Reopen ${t.title}` : `Complete ${t.title}`}
        className={`grid h-5 w-5 place-items-center rounded-full border transition ${t.status === 'completed' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-ink-300 hover:border-brand-500'}`}>{t.status === 'completed' && <Check className="h-3 w-3" />}</button>) },
    { key: 'title', header: 'Task', render: (t) => (
      <div className="min-w-0"><p className={`font-medium ${['completed', 'cancelled'].includes(t.status) ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{t.title}</p><p className="text-xs text-ink-500">{labelOf(TASK_TYPES, t.task_type)}</p></div>) },
    { key: 'related', header: 'Related to', render: (t) => {
      const links = [
        t.deal && [`/deals/${t.deal.id}`, `Deal: ${t.deal.title}`], t.lead && [`/leads/${t.lead.id}`, `Lead: ${leadCode(t.lead.lead_number)} ${fullName(t.lead)}`],
        t.organization && [`/organizations/${t.organization.id}`, `Org: ${t.organization.name}`], t.contact && [`/contacts/${t.contact.id}`, `Contact: ${fullName(t.contact)}`],
      ].filter(Boolean)
      return links.length ? <div className="space-y-0.5">{links.map(([to, text]) => <Link key={to} to={to} onClick={stop} className="block max-w-[220px] truncate text-xs font-medium text-brand-600 hover:underline">{text}</Link>)}</div> : <span className="text-ink-500">—</span>
    } },
    { key: 'assignee', header: 'Assigned to', render: (t) => t.assignee?.full_name || 'Unassigned' },
    { key: 'due_date', header: 'Due', sortKey: 'due_date', render: (t) => {
      const overdue = isTaskOverdue(t)
      return t.due_date ? <div className={overdue ? 'text-red-600' : ''}><p className={overdue ? 'font-semibold' : ''}>{fmtDay(t.due_date)} {fmtTime(t.due_time)}</p>{overdue && <Badge tone="red">Overdue</Badge>}</div> : '—'
    } },
    { key: 'priority', header: 'Priority', sortKey: 'priority_rank', render: (t) => <Badge tone={PRIORITY_TONE[t.priority]}>{labelOf(PRIORITIES, t.priority)}</Badge> },
    { key: 'status', header: 'Status', render: (t) => <Badge tone={TASK_STATUS_TONE[t.status]}>{labelOf(TASK_STATUSES, t.status)}</Badge> },
    { key: 'mail', header: '', className: 'w-10', render: (t) => (can('communications.create') ? <button className="btn-ghost !p-1.5" aria-label={`Email about ${t.title}`} onClick={(e) => { e.stopPropagation(); setMailing(t) }}><Mail className="h-4 w-4" /></button> : null) },
    { key: 'actions', header: '', className: 'w-24', render: (t) => <RowActions canEdit={can('tasks.edit')} canDelete={can('tasks.delete')} label={t.title} onEdit={() => setEditing(t)} onDelete={() => setDeleting(t)} /> },
  ]
  const addButton = !can('tasks.create') ? null : <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add task</button>
  const c = counts.data || {}

  return (
    <div className="mx-auto max-w-7xl animate-fade-up">
      <PageHeader title="Tasks & Follow-ups" subtitle="Calls, emails, meetings and follow-ups" icon={CheckSquare} actions={addButton} />
      <div className="mb-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatTile icon={AlertTriangle} label="Overdue" value={c.overdue} danger={c.overdue > 0} tone="emerald" onClick={() => { list.setFilter('status', ''); list.setFilter('due', 'overdue') }} />
        <StatTile icon={CalendarClock} label="Due today" value={c.today} tone="amber" onClick={() => { list.setFilter('status', ''); list.setFilter('due', 'today') }} />
        <StatTile icon={CalendarDays} label="Next 7 days" value={c.week} tone="sky" onClick={() => { list.setFilter('status', ''); list.setFilter('due', 'week') }} />
        <StatTile icon={ListTodo} label="Open tasks" value={c.open} tone="brand" onClick={() => { list.setFilter('due', ''); list.setFilter('status', 'open') }} />
      </div>
      <FilterBar search={list.search} onSearch={list.setSearch} placeholder="Search task title" isFiltered={list.isFiltered} onClear={list.clearFilters}>
        <FilterSelect label="Any status" value={list.filters.status} onChange={(v) => list.setFilter('status', v)} options={STATUS_FILTERS} />
        <FilterSelect label="Any priority" value={list.filters.priority} onChange={(v) => list.setFilter('priority', v)} options={PRIORITIES} />
        <FilterSelect label="Any due date" value={list.filters.due} onChange={(v) => list.setFilter('due', v)} options={TASK_DUE_FILTERS} />
        <FilterSelect label="Anyone" value={list.filters.assigned_to} onChange={(v) => list.setFilter('assigned_to', v)} options={(users.data || []).map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
      </FilterBar>

      {list.error && !list.rows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <>
          <DataTable columns={columns} rows={list.rows} loading={list.loading} sort={list.sort} onSort={list.toggleSort} onRowClick={(t) => setEditing(t)}
            rowClassName={(t) => (isTaskOverdue(t) ? 'bg-red-50/60' : '')}
            empty={list.isFiltered
              ? <EmptyState illustration="search" title="No tasks match" description="Try a different search or clear the filters." />
              : <EmptyState illustration="tasks" title="No tasks yet" description="Add a task to remember a call, email, meeting or follow-up." action={addButton} />} />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
        </>
      )}

      {mailing && <EmailComposer onClose={() => setMailing(null)} onSent={() => refresh()}
        context={{ task: mailing, contact: mailing.contact, lead: mailing.lead, organization: mailing.organization, deal: mailing.deal }}
        initial={{ title: 'Follow-up email', subject: 'Following up: {{task.title}}', body: 'Hello {{contact.first_name}},\n\nJust following up on our conversation.\n\nBest regards,\n{{sender.name}}' }} />}
      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit task' : 'Add task'} onClose={() => setEditing(null)} size="lg">
        {editing && <TaskForm key={editing.id || 'new'} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} title="Delete task?" message={`“${deleting?.title}” will be permanently deleted.`} onConfirm={remove} onClose={() => setDeleting(null)} />
    </div>
  )
}
