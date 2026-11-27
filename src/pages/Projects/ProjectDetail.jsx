import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { friendlyError } from '../../lib/errors'
import { fmtDay, fmtDateTime } from '../../lib/format'
import { addReminder, addStage, addUpdate, deleteProject, deleteReminder, getProject, listReminders, listStages, listTicketsForProject, listUpdates, PRIORITY_OPTIONS, PROJECT_STATUSES, setReminderDone, TICKET_CATEGORIES, TICKET_STATUSES, updateProject, updateStage, createTicket } from '../../services/projects'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { Field, FormFooter } from '../../components/forms/FormParts'
import ProjectForm from '../../components/projects/ProjectForm'
import TicketForm from '../../components/projects/TicketForm'
import { Progress } from './ProjectsPage'
import { useForm } from 'react-hook-form'
import TicketDetail from '../Tickets/TicketDetail'

const TABS = [['overview', 'Overview'], ['stages', 'Stages'], ['updates', 'Updates & history'], ['reminders', 'Reminders'], ['tickets', 'Support tickets']]
const label = (list, v) => list.find((x) => x.value === v)?.label || v
const STATUS_TONE = { not_started: 'gray', in_progress: 'blue', on_hold: 'amber', pending_client_approval: 'amber', under_review: 'indigo', completed: 'green', cancelled: 'red' }

function StagesTab({ projectId, workspaceId, canEdit, onChanged }) {
  const stages = useFetch(() => listStages(projectId), [projectId])
  const [name, setName] = useState('')
  const [open, setOpen] = useState(null)
  const [summary, setSummary] = useState('')
  const act = async (fn, msg) => { try { await fn(); toast.success(msg); stages.reload(); onChanged() } catch (e) { toast.error(friendlyError(e)) } }
  if (stages.loading && !stages.data) return <Spinner className="py-10" />
  if (stages.error) return <ErrorState message={stages.error} onRetry={stages.reload} />
  const done = stages.data.filter((s) => s.status === 'done').length
  const STATUS = { pending: ['Pending', 'bg-ink-100 text-ink-600', 'border-ink-200'], in_progress: ['In progress', 'bg-sky-50 text-sky-700', 'border-sky-300'], done: ['Done', 'bg-brand-50 text-brand-700', 'border-brand-500'] }
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">{done} of {stages.data.length} stages done. Stages run left to right, in order.</p>
      <div className="-mx-1 flex snap-x gap-4 overflow-x-auto px-1 pb-3" role="list" aria-label="Project stages">
        {stages.data.map((s) => {
          const [label, chip, edge] = STATUS[s.status]
          return (
            <section key={s.id} role="listitem" className={`flex w-72 shrink-0 snap-start flex-col rounded-2xl border border-t-4 bg-white p-4 shadow-card ${edge}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-mono text-[11px] text-ink-400">Stage {s.position}</p><p className="font-semibold leading-snug text-ink-900">{s.name}</p></div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip}`}>{label}</span>
              </div>
              <p className="mt-2 text-xs text-ink-500">{s.completed_at ? `Completed ${fmtDateTime(s.completed_at)}` : s.started_at ? `Started ${fmtDateTime(s.started_at)}` : 'Not started'}</p>
              {canEdit && <select className="input !py-1.5 mt-3 text-xs" value={s.status} onChange={(e) => act(() => updateStage(s.id, { status: e.target.value }), 'Stage updated')} aria-label={`Status of ${s.name}`}>
                <option value="pending">Pending</option><option value="in_progress">In progress</option><option value="done">Done</option></select>}
              <div className="mt-3 min-h-[3.5rem] flex-1 whitespace-pre-wrap rounded-xl bg-ink-50 p-3 text-sm text-ink-700">{s.work_summary || <span className="text-ink-400">No work recorded yet.</span>}</div>
              {canEdit && (open === s.id ? (
                <div className="mt-3 space-y-2">
                  <textarea rows={3} className="input text-sm" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What was done in this stage" aria-label="Work completed" />
                  <div className="flex gap-2"><button className="btn-primary !py-1.5 text-xs" onClick={() => act(async () => { await updateStage(s.id, { work_summary: summary.trim() || null }); setOpen(null) }, 'Work recorded')}>Save</button><button className="btn-ghost !py-1.5 text-xs" onClick={() => setOpen(null)}>Cancel</button></div>
                </div>) : <button className="mt-3 text-left text-xs font-semibold text-brand-600 hover:underline" onClick={() => { setOpen(s.id); setSummary(s.work_summary || '') }}>{s.work_summary ? 'Edit work recorded' : 'Record work completed'}</button>)}
            </section>)
        })}
        {canEdit && (
          <form className="flex w-64 shrink-0 snap-start flex-col justify-center gap-2 rounded-2xl border border-dashed border-ink-300 bg-white p-4" onSubmit={(e) => { e.preventDefault(); if (name.trim()) act(async () => { await addStage(projectId, workspaceId, name, stages.data); setName('') }, 'Stage added') }}>
            <p className="text-sm font-semibold text-ink-700">Add a stage</p>
            <input className="input text-sm" placeholder="e.g. Security review" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} aria-label="New stage name" />
            <button className="btn-outline !py-1.5 text-xs" disabled={!name.trim()}><Plus className="h-4 w-4" />Add to the end</button>
          </form>)}
      </div>
    </div>)
}

function UpdatesTab({ projectId, workspaceId, userId, canEdit }) {
  const updates = useFetch(() => listUpdates(projectId), [projectId])
  const [body, setBody] = useState(''); const [kind, setKind] = useState('update'); const [busy, setBusy] = useState(false)
  const post = async (e) => { e.preventDefault(); setBusy(true); try { await addUpdate({ projectId, workspaceId, userId, kind, body }); setBody(''); updates.reload() } catch (err) { toast.error(friendlyError(err)) } finally { setBusy(false) } }
  return (
    <div className="space-y-4">
      {canEdit && <form onSubmit={post} className="rounded-2xl border border-ink-100 bg-white p-4">
        <div className="mb-2 flex gap-2 text-xs">{[['update', 'Progress update'], ['remark', 'Remark']].map(([k, l]) => <button type="button" key={k} onClick={() => setKind(k)} className={`rounded-full px-3 py-1 ${kind === k ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-600'}`}>{l}</button>)}</div>
        <textarea rows={2} className="input" value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's the latest?" aria-label="Progress update" />
        <div className="mt-2 flex justify-end"><button className="btn-primary !py-2" disabled={busy || !body.trim()}>Post</button></div></form>}
      {updates.loading && !updates.data ? <Spinner className="py-6" /> : updates.error ? <ErrorState message={updates.error} onRetry={updates.reload} /> : (
        <ol className="relative space-y-4 border-l-2 border-ink-100 pl-5">
          {updates.data.map((u) => (
            <li key={u.id} className="relative">
              <span className={`absolute -left-[27px] top-1 h-3 w-3 rounded-full ${u.kind === 'status_change' ? 'bg-amber-400' : u.kind === 'stage_change' ? 'bg-sky-400' : u.kind === 'remark' ? 'bg-violet-400' : 'bg-brand-600'}`} />
              <p className="text-sm text-ink-900">{u.body}</p>
              <p className="text-xs text-ink-500">{u.author?.full_name || 'System'} · {fmtDateTime(u.created_at)} · {u.kind.replace('_', ' ')}</p>
            </li>))}
          {!updates.data.length && <p className="text-sm text-ink-500">No updates yet. Status and stage changes appear here automatically.</p>}
        </ol>)}
    </div>)
}

function RemindersTab({ projectId, workspaceId, userId, canEdit, canManage }) {
  const rem = useFetch(() => listReminders(projectId), [projectId])
  const [adding, setAdding] = useState(false)
  const form = useForm({ defaultValues: { title: '', description: '', due_date: '', priority: 'medium' } })
  const save = form.handleSubmit(async (v) => {
    try { await addReminder({ title: v.title.trim(), description: v.description || null, due_date: v.due_date || null, priority: v.priority }, { projectId, workspaceId, userId }); toast.success('Reminder added'); setAdding(false); form.reset(); rem.reload() }
    catch (e) { toast.error(friendlyError(e)) }
  })
  return (
    <div className="space-y-4">
      {canEdit && <div className="flex justify-end"><button className="btn-primary !py-2" onClick={() => setAdding(true)}><Plus className="h-4 w-4" />Add reminder</button></div>}
      {rem.loading && !rem.data ? <Spinner className="py-6" /> : rem.error ? <ErrorState message={rem.error} onRetry={rem.reload} /> : (
        <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
          {rem.data.map((r) => {
            const overdue = !r.is_done && r.due_date && r.due_date < new Date().toISOString().slice(0, 10)
            return (
              <li key={r.id} className="flex items-start gap-3 px-4 py-3">
                <button disabled={!canEdit} onClick={() => setReminderDone(r.id, !r.is_done, userId).then(rem.reload).catch((e) => toast.error(friendlyError(e)))} aria-label={r.is_done ? 'Reopen reminder' : 'Mark done'}
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${r.is_done ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300'}`}>{r.is_done && <Check className="h-3 w-3" />}</button>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${r.is_done ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{r.title}</p>
                  {r.description && <p className="text-xs text-ink-600">{r.description}</p>}
                  <p className={`text-xs ${overdue ? 'font-semibold text-red-600' : 'text-ink-500'}`}>{r.due_date ? `Due ${fmtDay(r.due_date)}` : 'No due date'}{r.assignee?.full_name ? ` · ${r.assignee.full_name}` : ''}{overdue ? ' · Overdue' : ''}</p>
                </div>
                <Badge tone={r.priority === 'urgent' || r.priority === 'high' ? 'amber' : 'gray'}>{label(PRIORITY_OPTIONS, r.priority)}</Badge>
                {canManage && <button className="btn-ghost !p-1 hover:!text-red-600" aria-label="Delete reminder" onClick={() => deleteReminder(r.id).then(rem.reload).catch((e) => toast.error(friendlyError(e)))}><Trash2 className="h-4 w-4" /></button>}
              </li>)
          })}
          {!rem.data.length && <li className="px-4 py-8 text-center text-sm text-ink-500">No reminders. Add client requests, pending approvals or follow-ups here.</li>}
        </ul>)}
      <Modal open={adding} title="New reminder" onClose={() => setAdding(false)} size="sm">
        <form onSubmit={save} className="space-y-4">
          <Field label="Title" required><input className="input" {...form.register('title', { required: true })} /></Field>
          <Field label="Description"><textarea rows={2} className="input" {...form.register('description')} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Due date"><input type="date" className="input" {...form.register('due_date')} /></Field>
            <Field label="Priority"><select className="input" {...form.register('priority')}>{PRIORITY_OPTIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field></div>
          <FormFooter busy={form.formState.isSubmitting} onCancel={() => setAdding(false)} label="Add reminder" />
        </form>
      </Modal>
    </div>)
}

function TicketsTab({ project, canCreate, onOpen }) {
  const tickets = useFetch(() => listTicketsForProject(project.id), [project.id])
  const [raising, setRaising] = useState(false)
  return (
    <div className="space-y-4">
      {canCreate && <div className="flex justify-end"><button className="btn-primary !py-2" onClick={() => setRaising(true)}><Plus className="h-4 w-4" />Raise ticket</button></div>}
      {tickets.loading && !tickets.data ? <Spinner className="py-6" /> : tickets.error ? <ErrorState message={tickets.error} onRetry={tickets.reload} /> : (
        <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
          {tickets.data.map((t) => (
            <li key={t.id}><button onClick={() => onOpen(t.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-50/40">
              <div className="min-w-0"><p className="truncate text-sm font-medium text-ink-900">TKT-{String(t.ticket_number).padStart(4, '0')} · {t.subject}</p><p className="text-xs text-ink-500">{label(TICKET_CATEGORIES, t.category)} · {fmtDateTime(t.created_at)}</p></div>
              <Badge tone={['resolved', 'closed'].includes(t.status) ? 'green' : t.status === 'open' ? 'amber' : 'blue'}>{label(TICKET_STATUSES, t.status)}</Badge></button></li>))}
          {!tickets.data.length && <li className="px-4 py-8 text-center text-sm text-ink-500">No support tickets for this project.</li>}
        </ul>)}
      <Modal open={raising} title="Raise a support ticket" onClose={() => setRaising(false)} size="lg">
        {raising && <TicketForm lockOrg lockProject initial={{ organization_id: project.organization_id, project_id: project.id }} onCancel={() => setRaising(false)}
          onSubmit={async (v) => { await createTicket({ ...v, assigned_to: v.assigned_to || null }, { workspaceId: project.workspace_id, userId: project.__userId }); toast.success('Ticket raised'); setRaising(false); tickets.reload() }} />}
      </Modal>
    </div>)
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const { profile, can } = useAuth()
  const tab = TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'overview'
  const project = useFetch(() => getProject(id), [id])
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [openTicket, setOpenTicket] = useState(null)
  const reload = () => project.reload()
  if (project.loading && !project.data) return <Spinner className="py-24" />
  if (project.error) return <ErrorState message={project.error} onRetry={project.reload} />
  if (!project.data) return <p className="p-8 text-center text-ink-500">This project doesn't exist or you can't see it.</p>
  const p = project.data
  const canEdit = can('projects.edit'), canManage = can('projects.manage')

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Projects</Link>
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-ink-100 bg-white p-6 shadow-card">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs text-ink-500">PRJ-{String(p.project_number).padStart(4, '0')}</p>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">{p.name}</h1>
          <p className="mt-1 text-sm text-ink-600">Client: <Link to={`/organizations/${p.organization?.id}?tab=projects`} className="font-medium text-brand-700 hover:underline">{p.organization?.name}</Link></p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Badge tone={STATUS_TONE[p.status]}>{label(PROJECT_STATUSES, p.status)}</Badge>
            <Badge tone={p.priority === 'urgent' ? 'red' : p.priority === 'high' ? 'amber' : 'gray'}>{label(PRIORITY_OPTIONS, p.priority)} priority</Badge>
            <Progress value={p.progress} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && <select aria-label="Project status" className="input !w-auto" value={p.status} onChange={(e) => updateProject(p.id, { status: e.target.value }).then(() => { toast.success('Status updated'); reload() }).catch((err) => toast.error(friendlyError(err)))}>
            {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>}
          {canEdit && <button className="btn-outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</button>}
          {can('projects.delete') && <button className="btn-outline !text-red-600" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete</button>}
        </div>
      </div>

      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-ink-200">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setSp({ tab: k }, { replace: true })}
          className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${tab === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>{l}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card"><p className="text-xs font-medium text-ink-500">Timeline</p><p className="mt-2 text-sm text-ink-900">Start {fmtDay(p.start_date)} · Expected completion {fmtDay(p.expected_end_date)}</p>{p.completed_at && <p className="mt-1 text-sm text-brand-700">Completed {fmtDateTime(p.completed_at)}</p>}</div>
          <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card"><p className="text-xs font-medium text-ink-500">Team</p><p className="mt-2 text-sm text-ink-900">{p.assignee?.full_name || 'Unassigned'}</p></div>
          <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card md:col-span-2"><p className="text-xs font-medium text-ink-500">Description</p><p className="mt-2 whitespace-pre-wrap text-sm text-ink-800">{p.description || '—'}</p></div>
          {p.notes && <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card md:col-span-2"><p className="text-xs font-medium text-ink-500">Notes</p><p className="mt-2 whitespace-pre-wrap text-sm text-ink-800">{p.notes}</p></div>}
        </div>)}
      {tab === 'stages' && <StagesTab projectId={p.id} workspaceId={p.workspace_id} canEdit={canEdit} onChanged={reload} />}
      {tab === 'updates' && <UpdatesTab projectId={p.id} workspaceId={p.workspace_id} userId={profile.id} canEdit={canEdit} />}
      {tab === 'reminders' && <RemindersTab projectId={p.id} workspaceId={p.workspace_id} userId={profile.id} canEdit={canEdit} canManage={canManage} />}
      {tab === 'tickets' && <TicketsTab project={{ ...p, __userId: profile.id }} canCreate={can('tickets.create')} onOpen={setOpenTicket} />}

      <Modal open={editing} title="Edit project" onClose={() => setEditing(false)} size="lg">
        {editing && <ProjectForm lockOrg initial={{ ...p, organization_id: p.organization_id, assigned_to: p.assigned_to || '', start_date: p.start_date || '', expected_end_date: p.expected_end_date || '', description: p.description || '', notes: p.notes || '' }}
          submitLabel="Save changes" onCancel={() => setEditing(false)}
          onSubmit={async (v) => { const { organization_id, ...rest } = v; await updateProject(p.id, { ...rest, assigned_to: rest.assigned_to || null, start_date: rest.start_date || null, expected_end_date: rest.expected_end_date || null }); toast.success('Project updated'); setEditing(false); reload() }} />}
      </Modal>
      <ConfirmDialog open={deleting} title="Delete project?" confirmLabel="Delete" message="The project, its stages and reminders are removed. Projects with support tickets can't be deleted."
        onClose={() => setDeleting(false)} onConfirm={async () => { try { await deleteProject(p.id); toast.success('Project deleted'); navigate('/projects', { replace: true }) } catch (e) { toast.error(friendlyError(e)) } }} />
      {openTicket && <TicketDetail ticketId={openTicket} onClose={() => setOpenTicket(null)} onChanged={() => reload()} />}
    </div>)
}
