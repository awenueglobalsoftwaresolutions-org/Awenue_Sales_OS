import { Link } from 'react-router-dom'
import { useState } from 'react'
import { toast } from 'sonner'
import Modal from '../common/Modal'
import ProjectForm from './ProjectForm'
import { createProject } from '../../services/projects'
import { friendlyError } from '../../lib/errors'
import { Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { listProjectsForOrg, listTicketsForOrg, PROJECT_STATUSES, TICKET_STATUSES } from '../../services/projects'
import Badge from '../common/Badge'
import Spinner from '../common/Spinner'
import ErrorState from '../common/ErrorState'
import { Progress } from '../../pages/Projects/ProjectsPage'

const STATUS_TONE = { not_started: 'gray', in_progress: 'blue', on_hold: 'amber', pending_client_approval: 'amber', under_review: 'indigo', completed: 'green', cancelled: 'red' }
const label = (list, v) => list.find((x) => x.value === v)?.label || v

// The Projects tab on an organization: its projects, and the support tickets raised against them.
export default function OrgProjects({ org }) {
  const { can } = useAuth()
  const [creating, setCreating] = useState(false)
  const projects = useFetch(() => listProjectsForOrg(org.id), [org.id])
  const tickets = useFetch(() => listTicketsForOrg(org.id), [org.id])
  if (projects.loading && !projects.data) return <Spinner className="py-10" />
  if (projects.error) return <ErrorState message={projects.error} onRetry={projects.reload} />
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Projects <span className="font-normal text-ink-500">({projects.data.length})</span></h2>
        {can('projects.create') && <button className="btn-primary !py-2" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New project</button>}
      </div>
      <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
        {projects.data.map((p) => (
          <li key={p.id}><Link to={`/projects/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-brand-50/40">
            <div className="min-w-0"><p className="text-sm font-medium text-ink-900">{p.name}</p><p className="font-mono text-xs text-ink-500">PRJ-{String(p.project_number).padStart(4, '0')}</p></div>
            <div className="flex items-center gap-3"><Progress value={p.progress} /><Badge tone={STATUS_TONE[p.status]}>{label(PROJECT_STATUSES, p.status)}</Badge></div></Link></li>))}
        {!projects.data.length && <li className="px-4 py-8 text-center text-sm text-ink-500">No projects for this client yet.</li>}
      </ul>
      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Support tickets {tickets.data && <span className="font-normal text-ink-500">({tickets.data.length})</span>}</h2>
        {tickets.loading && !tickets.data ? <Spinner className="py-6" /> : tickets.error ? <ErrorState message={tickets.error} onRetry={tickets.reload} /> : (
          <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-100 bg-white">
            {tickets.data.map((t) => (
              <li key={t.id}><Link to={`/tickets?q=${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-brand-50/40">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-ink-900">TKT-{String(t.ticket_number).padStart(4, '0')} · {t.subject}</p><p className="text-xs text-ink-500">{t.project?.name}</p></div>
                <Badge tone={['resolved', 'closed'].includes(t.status) ? 'green' : 'amber'}>{label(TICKET_STATUSES, t.status)}</Badge></Link></li>))}
            {!tickets.data?.length && <li className="px-4 py-8 text-center text-sm text-ink-500">No support tickets for this client.</li>}
          </ul>)}
      </div>
      <Modal open={creating} title="New project" onClose={() => setCreating(false)} size="lg">
        {creating && <ProjectForm lockOrg initial={{ organization_id: org.id }} submitLabel="Create project" onCancel={() => setCreating(false)}
          onSubmit={async (values) => { try { await createProject(values); toast.success('Project created with its standard stages'); setCreating(false); projects.reload() } catch (e) { toast.error(friendlyError(e)) } }} />}
      </Modal>
    </div>)
}
