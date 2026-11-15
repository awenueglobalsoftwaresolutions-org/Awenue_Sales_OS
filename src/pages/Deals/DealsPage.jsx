import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Handshake, KanbanSquare, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useListQuery } from '../../hooks/useListQuery'
import { createDeal, deleteDeal, listDeals, updateDeal } from '../../services/deals'
import { listProfiles, listServiceNames } from '../../services/lookups'
import { CLOSING_FILTERS, DEAL_STAGES, STAGE_TONE, labelOf } from '../../constants/options'
import { fmtDay, fmtMoney, fullName } from '../../lib/format'
import PageHeader from '../../components/common/PageHeader'
import { FilterBar, FilterSelect } from '../../components/common/FilterBar'
import DataTable from '../../components/tables/DataTable'
import Pagination from '../../components/common/Pagination'
import EmptyState from '../../components/common/EmptyState'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import RowActions from '../../components/common/RowActions'
import Badge from '../../components/common/Badge'
import DealForm from '../../components/forms/DealForm'

const INITIAL_SORT = { key: 'created_at', dir: 'desc' }

export default function DealsPage() {
  const { profile, can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const list = useListQuery(listDeals, { initialSort: INITIAL_SORT })
  const users = useFetch(listProfiles, [])
  const services = useFetch(listServiceNames, [])
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { if (params.get('new')) { setEditing({}); setParams({}, { replace: true }) } }, [params, setParams])

  const save = async (values) => {
    if (editing?.id) await updateDeal(editing.id, values)
    else await createDeal(values, profile)
    toast.success(editing?.id ? 'Deal updated' : 'Deal added')
    setEditing(null); list.reload()
  }
  const remove = async () => { await deleteDeal(deleting.id); toast.success('Deal deleted'); setDeleting(null); list.reload() }

  const columns = [
    { key: 'title', header: 'Deal', sortKey: 'title', render: (d) => <span className="font-medium">{d.title}</span> },
    { key: 'organization', header: 'Organization', render: (d) => d.organization?.name || '—' },
    { key: 'contact', header: 'Contact', render: (d) => (d.contact ? fullName(d.contact) : '—') },
    { key: 'value', header: 'Value', sortKey: 'value', render: (d) => fmtMoney(d.value, d.currency) },
    { key: 'stage', header: 'Stage', render: (d) => <Badge tone={STAGE_TONE[d.stage]}>{labelOf(DEAL_STAGES, d.stage)}</Badge> },
    { key: 'probability', header: 'Prob.', render: (d) => `${d.probability}%` },
    { key: 'expected_close_date', header: 'Closing', sortKey: 'expected_close_date', render: (d) => fmtDay(d.expected_close_date) },
    { key: 'assignee', header: 'Salesperson', render: (d) => d.assignee?.full_name || 'Unassigned' },
    { key: 'actions', header: '', className: 'w-24', render: (d) => <RowActions canEdit={can('deals.edit')} canDelete={can('deals.delete')} label={d.title} onEdit={() => setEditing(d)} onDelete={() => setDeleting(d)} /> },
  ]
  const addButton = !can('deals.create') ? null : <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add deal</button>

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title="Deals" subtitle="Opportunities you're working on" actions={<><Link to="/pipeline" className="btn-ghost border border-ink-300"><KanbanSquare className="h-4 w-4" />Pipeline view</Link>{addButton}</>} />
      <FilterBar search={list.search} onSearch={list.setSearch} placeholder="Search deal title" isFiltered={list.isFiltered} onClear={list.clearFilters}>
        <FilterSelect label="Any stage" value={list.filters.stage} onChange={(v) => list.setFilter('stage', v)} options={DEAL_STAGES} />
        <FilterSelect label="Any salesperson" value={list.filters.assigned_to} onChange={(v) => list.setFilter('assigned_to', v)} options={(users.data || []).map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        <FilterSelect label="Any service" value={list.filters.interested_service} onChange={(v) => list.setFilter('interested_service', v)} options={(services.data || []).map((s) => ({ value: s.name, label: s.name }))} />
        <FilterSelect label="Any closing date" value={list.filters.closing} onChange={(v) => list.setFilter('closing', v)} options={CLOSING_FILTERS} />
      </FilterBar>

      {list.error && !list.rows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <>
          <DataTable columns={columns} rows={list.rows} loading={list.loading} sort={list.sort} onSort={list.toggleSort} onRowClick={(d) => navigate(`/deals/${d.id}`)}
            empty={list.isFiltered
              ? <EmptyState icon={Handshake} title="No deals match" description="Try a different search or clear the filters." />
              : <EmptyState icon={Handshake} title="No deals yet" description="Add a deal here, or convert a qualified lead from the Leads page." action={addButton} />} />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
        </>
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit deal' : 'Add deal'} onClose={() => setEditing(null)} size="lg">
        {editing && <DealForm key={editing.id || 'new'} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <ConfirmDialog open={Boolean(deleting)} title="Delete deal?" message={`“${deleting?.title}” and its tasks and history will be permanently deleted.`} onConfirm={remove} onClose={() => setDeleting(null)} />
    </div>
  )
}
