import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FolderKanban, Plus, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useListQuery } from '../../hooks/useListQuery'
import { listOrganizationOptions } from '../../services/lookups'
import { createProject, getProjectSummary, listProjects, PROJECT_STATUSES, PRIORITY_OPTIONS } from '../../services/projects'
import { friendlyError } from '../../lib/errors'
import { fmtDay } from '../../lib/format'
import Gate from '../../components/layout/Gate'
import PageHeader from '../../components/common/PageHeader'
import { FilterBar, FilterSelect } from '../../components/common/FilterBar'
import DataTable from '../../components/tables/DataTable'
import Pagination from '../../components/common/Pagination'
import EmptyState from '../../components/common/EmptyState'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import Badge from '../../components/common/Badge'
import ProjectForm from '../../components/projects/ProjectForm'
import StageTemplatesModal from '../../components/projects/StageTemplatesModal'

const STATUS_TONE = { not_started: 'gray', in_progress: 'blue', on_hold: 'amber', pending_client_approval: 'amber', under_review: 'indigo', completed: 'green', cancelled: 'red' }
const PRIORITY_TONE = { low: 'gray', medium: 'blue', high: 'amber', urgent: 'red' }
export const Progress = ({ value }) => (
  <div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${value}%` }} /></div><span className="text-xs font-medium text-ink-600">{value}%</span></div>)
const label = (list, v) => list.find((x) => x.value === v)?.label || v

export default function ProjectsPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const list = useListQuery(listProjects, { initialSort: { key: 'created_at', dir: 'desc' } })
  const summary = useFetch(getProjectSummary, [])
  const orgs = useFetch(listOrganizationOptions, [])
  const [creating, setCreating] = useState(false)
  const [stages, setStages] = useState(false)
  useEffect(() => { if (params.get('new')) { setCreating(true); setParams({}, { replace: true }) } }, [params, setParams])

  const columns = [
    { key: 'project_number', header: 'ID', render: (p) => <span className="font-mono text-xs text-ink-500">PRJ-{String(p.project_number).padStart(4, '0')}</span> },
    { key: 'name', header: 'Project', sortKey: 'name', render: (p) => <div><p className="font-medium text-ink-900">{p.name}</p><p className="text-xs text-ink-500">{p.organization?.name}</p></div> },
    { key: 'status', header: 'Status', render: (p) => <Badge tone={STATUS_TONE[p.status]}>{label(PROJECT_STATUSES, p.status)}</Badge> },
    { key: 'progress', header: 'Progress', render: (p) => <Progress value={p.progress} /> },
    { key: 'priority', header: 'Priority', render: (p) => <Badge tone={PRIORITY_TONE[p.priority]}>{label(PRIORITY_OPTIONS, p.priority)}</Badge> },
    { key: 'assignee', header: 'Team', render: (p) => p.assignee?.full_name || 'Unassigned' },
    { key: 'expected_end_date', header: 'Due', sortKey: 'expected_end_date', render: (p) => fmtDay(p.expected_end_date) },
  ]
  const s = summary.data?.projects || {}
  const total = Object.values(s).reduce((n, v) => n + v, 0)
  const addButton = can('projects.create') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New project</button>

  return (
    <Gate perm="projects.view">
      <div className="mx-auto max-w-7xl space-y-5">
        <PageHeader title="Projects" subtitle="From first requirement to delivery, for every client"
          actions={<>{can('projects.manage') && <button className="btn-outline" onClick={() => setStages(true)}><Settings2 className="h-4 w-4" />Stages</button>}{addButton}</>} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[['Total projects', total], ['In progress', s.in_progress || 0], ['Completed', s.completed || 0], ['On hold / awaiting approval', (s.on_hold || 0) + (s.pending_client_approval || 0)]].map(([l, v]) => (
            <div key={l} className="rounded-2xl border border-ink-100 bg-white p-4 shadow-card"><p className="text-xs font-medium text-ink-500">{l}</p><p className="mt-1 text-2xl font-bold text-ink-900">{v}</p></div>))}
        </div>

        <FilterBar search={list.search} onSearch={list.setSearch} placeholder="Search project name" isFiltered={list.isFiltered} onClear={list.clearFilters}>
          <FilterSelect label="Any status" value={list.filters.status} onChange={(v) => list.setFilter('status', v)} options={PROJECT_STATUSES} />
          <FilterSelect label="Any priority" value={list.filters.priority} onChange={(v) => list.setFilter('priority', v)} options={PRIORITY_OPTIONS} />
          <FilterSelect label="Any client" value={list.filters.organization_id} onChange={(v) => list.setFilter('organization_id', v)} options={(orgs.data || []).map((o) => ({ value: o.id, label: o.name }))} />
        </FilterBar>

        {list.error && !list.rows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
          <>
            <DataTable columns={columns} rows={list.rows} loading={list.loading} sort={list.sort} onSort={list.toggleSort} onRowClick={(p) => navigate(`/projects/${p.id}`)}
              empty={list.isFiltered ? <EmptyState icon={FolderKanban} title="No projects match" description="Try different filters." />
                : <EmptyState icon={FolderKanban} title="No projects yet" description="Start a project for a client. It gets the standard stages, and you can track each one." action={addButton} />} />
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
          </>)}
      </div>
      <Modal open={creating} title="New project" onClose={() => setCreating(false)} size="lg">
        {creating && <ProjectForm submitLabel="Create project" onCancel={() => setCreating(false)}
          onSubmit={async (values) => { const id = await createProject(values); toast.success('Project created with its standard stages'); setCreating(false); navigate(`/projects/${id}`) }} />}
      </Modal>
      {stages && <StageTemplatesModal onClose={() => setStages(false)} />}
    </Gate>
  )
}
