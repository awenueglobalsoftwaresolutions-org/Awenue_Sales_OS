import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useListQuery } from '../../hooks/useListQuery'
import { createLead, deleteLead, listLeads, updateLead } from '../../services/leads'
import { listServiceNames } from '../../services/lookups'
import { LEAD_SOURCES, LEAD_STATUSES, PRIORITY_TONE, PRIORITIES, STATUS_TONE, labelOf } from '../../constants/options'
import { fmtDate, fullName, leadCode } from '../../lib/format'
import PageHeader from '../../components/common/PageHeader'
import CsvTools from '../../components/csv/CsvTools'
import { FilterBar, FilterSelect } from '../../components/common/FilterBar'
import DataTable from '../../components/tables/DataTable'
import Pagination from '../../components/common/Pagination'
import EmptyState from '../../components/common/EmptyState'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import RowActions from '../../components/common/RowActions'
import Badge from '../../components/common/Badge'
import LeadForm from '../../components/forms/LeadForm'

const INITIAL_SORT = { key: 'created_at', dir: 'desc' }

export default function LeadsPage() {
  const { profile, can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const list = useListQuery(listLeads, { initialSort: INITIAL_SORT })
  const services = useFetch(listServiceNames, [])
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { if (params.get('new')) { setEditing({}); setParams({}, { replace: true }) } }, [params, setParams])

  const save = async (values) => {
    if (editing?.id) await updateLead(editing, values, profile)
    else await createLead(values, profile)
    toast.success(editing?.id ? 'Lead updated' : 'Lead added')
    setEditing(null); list.reload()
  }
  const remove = async () => { await deleteLead(deleting.id); toast.success('Lead deleted'); setDeleting(null); list.reload() }

  const columns = [
    { key: 'lead_number', header: 'ID', render: (l) => <span className="text-ink-500">{leadCode(l.lead_number)}</span> },
    { key: 'name', header: 'Lead', sortKey: 'first_name', render: (l) => (
      <div><p className="font-medium">{fullName(l)}</p><p className="text-xs text-ink-500">{l.job_title || l.email || '—'}</p></div>) },
    { key: 'organization', header: 'Organization', render: (l) => l.organization ? <Link className="text-brand-600 hover:underline" to={`/organizations/${l.organization.id}`} onClick={(e) => e.stopPropagation()}>{l.organization.name}</Link> : '—' },
    { key: 'source', header: 'Source', render: (l) => (l.source ? labelOf(LEAD_SOURCES, l.source) : '—') },
    { key: 'status', header: 'Status', render: (l) => <Badge tone={STATUS_TONE[l.status]}>{labelOf(LEAD_STATUSES, l.status)}</Badge> },
    { key: 'priority', header: 'Priority', sortKey: 'priority_rank', render: (l) => <Badge tone={PRIORITY_TONE[l.priority]}>{labelOf(PRIORITIES, l.priority)}</Badge> },
    { key: 'assignee', header: 'Assigned to', render: (l) => l.assignee?.full_name || 'Unassigned' },
    { key: 'created_at', header: 'Created', sortKey: 'created_at', render: (l) => fmtDate(l.created_at) },
    { key: 'actions', header: '', className: 'w-24', render: (l) => <RowActions canEdit={can('leads.edit')} canDelete={can('leads.delete')} label={fullName(l)} onEdit={() => setEditing(l)} onDelete={() => setDeleting(l)} /> },
  ]
  const addButton = !can('leads.create') ? null : <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add lead</button>

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Leads" subtitle="Everyone who might become a customer" actions={<><CsvTools entity="leads" list={list} />{addButton}</>} />
      <FilterBar search={list.search} onSearch={list.setSearch} placeholder="Search name, email, phone" isFiltered={list.isFiltered} onClear={list.clearFilters}>
        <FilterSelect label="Any status" value={list.filters.status} onChange={(v) => list.setFilter('status', v)} options={LEAD_STATUSES} />
        <FilterSelect label="Any source" value={list.filters.source} onChange={(v) => list.setFilter('source', v)} options={LEAD_SOURCES} />
        <FilterSelect label="Any service" value={list.filters.interested_service} onChange={(v) => list.setFilter('interested_service', v)} options={(services.data || []).map((s) => ({ value: s.name, label: s.name }))} />
        <input className="input !w-36" placeholder="Country" value={list.filters.country || ''} onChange={(e) => list.setFilter('country', e.target.value)} aria-label="Filter by country" />
      </FilterBar>

      {list.error && !list.rows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <>
          <DataTable columns={columns} rows={list.rows} loading={list.loading} sort={list.sort} onSort={list.toggleSort}
            onRowClick={(l) => navigate(`/leads/${l.id}`)}
            empty={list.isFiltered
              ? <EmptyState icon={UserPlus} title="No leads match" description="Try a different search or clear the filters." />
              : <EmptyState icon={UserPlus} title="No leads yet" description="Add your first lead to start tracking outreach." action={addButton} />} />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
        </>
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit lead' : 'Add lead'} onClose={() => setEditing(null)} size="lg">
        {editing && <LeadForm key={editing.id || 'new'} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} title="Delete lead?" message={`${deleting ? fullName(deleting) : ''} and their activity history will be permanently deleted.`} onConfirm={remove} onClose={() => setDeleting(null)} />
    </div>
  )
}
