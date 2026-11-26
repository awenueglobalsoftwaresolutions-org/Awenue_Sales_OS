import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LifeBuoy, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useListQuery } from '../../hooks/useListQuery'
import { listOrganizationOptions, listProfiles } from '../../services/lookups'
import { createTicket, listTickets, PRIORITY_OPTIONS, TICKET_CATEGORIES, TICKET_STATUSES } from '../../services/projects'
import { friendlyError } from '../../lib/errors'
import { fmtDateTime } from '../../lib/format'
import Gate from '../../components/layout/Gate'
import PageHeader from '../../components/common/PageHeader'
import { FilterBar, FilterSelect } from '../../components/common/FilterBar'
import DataTable from '../../components/tables/DataTable'
import Pagination from '../../components/common/Pagination'
import EmptyState from '../../components/common/EmptyState'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import Badge from '../../components/common/Badge'
import TicketForm from '../../components/projects/TicketForm'
import TicketDetail from './TicketDetail'

const label = (list, v) => list.find((x) => x.value === v)?.label || v
const TONE = { open: 'amber', assigned: 'blue', in_progress: 'blue', waiting_client: 'gray', under_review: 'indigo', resolved: 'green', closed: 'gray' }

export default function TicketsPage() {
  const { can, profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const list = useListQuery(listTickets, { initialSort: { key: 'created_at', dir: 'desc' } })
  const orgs = useFetch(listOrganizationOptions, [])
  const users = useFetch(listProfiles, [])
  const [raising, setRaising] = useState(false)
  const [openId, setOpenId] = useState(null)
  useEffect(() => {
    if (params.get('new')) { setRaising(true); setParams({}, { replace: true }) }
    if (params.get('q')) { setOpenId(params.get('q')); setParams({}, { replace: true }) }
  }, [params, setParams])

  const columns = [
    { key: 'ticket_number', header: 'ID', render: (t) => <span className="font-mono text-xs text-ink-500">TKT-{String(t.ticket_number).padStart(4, '0')}</span> },
    { key: 'subject', header: 'Subject', sortKey: 'subject', render: (t) => <div><p className="font-medium text-ink-900">{t.subject}</p><p className="text-xs text-ink-500">{t.organization?.name} · {t.project?.name}</p></div> },
    { key: 'category', header: 'Type', render: (t) => label(TICKET_CATEGORIES, t.category) },
    { key: 'priority', header: 'Priority', render: (t) => <Badge tone={t.priority === 'urgent' ? 'red' : t.priority === 'high' ? 'amber' : 'gray'}>{label(PRIORITY_OPTIONS, t.priority)}</Badge> },
    { key: 'status', header: 'Status', render: (t) => <Badge tone={TONE[t.status]}>{label(TICKET_STATUSES, t.status)}</Badge> },
    { key: 'assignee', header: 'Assigned to', render: (t) => t.assignee?.full_name || 'Unassigned' },
    { key: 'created_at', header: 'Raised', sortKey: 'created_at', render: (t) => fmtDateTime(t.created_at) },
  ]
  const addButton = can('tickets.create') && <button className="btn-primary" onClick={() => setRaising(true)}><Plus className="h-4 w-4" />Raise ticket</button>

  return (
    <Gate perm="tickets.view">
      <div className="mx-auto max-w-7xl space-y-5">
        <PageHeader title="Support tickets" subtitle="Bugs, technical issues and change requests from clients" actions={addButton} />
        <FilterBar search={list.search} onSearch={list.setSearch} placeholder="Search subject" isFiltered={list.isFiltered} onClear={list.clearFilters}>
          <FilterSelect label="Any status" value={list.filters.status} onChange={(v) => list.setFilter('status', v)} options={TICKET_STATUSES} />
          <FilterSelect label="Any priority" value={list.filters.priority} onChange={(v) => list.setFilter('priority', v)} options={PRIORITY_OPTIONS} />
          <FilterSelect label="Any type" value={list.filters.category} onChange={(v) => list.setFilter('category', v)} options={TICKET_CATEGORIES} />
          <FilterSelect label="Any client" value={list.filters.organization_id} onChange={(v) => list.setFilter('organization_id', v)} options={(orgs.data || []).map((o) => ({ value: o.id, label: o.name }))} />
          <FilterSelect label="Anyone" value={list.filters.assigned_to} onChange={(v) => list.setFilter('assigned_to', v)} options={(users.data || []).map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        </FilterBar>
        {list.error && !list.rows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
          <>
            <DataTable columns={columns} rows={list.rows} loading={list.loading} sort={list.sort} onSort={list.toggleSort} onRowClick={(t) => setOpenId(t.id)}
              empty={list.isFiltered ? <EmptyState icon={LifeBuoy} title="No tickets match" description="Try different filters." />
                : <EmptyState icon={LifeBuoy} title="No tickets yet" description="When a client reports a problem, raise a ticket against their project." action={addButton} />} />
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
          </>)}
      </div>
      <Modal open={raising} title="Raise a support ticket" onClose={() => setRaising(false)} size="lg">
        {raising && <TicketForm onCancel={() => setRaising(false)} onSubmit={async (v) => {
          try { await createTicket({ ...v, assigned_to: v.assigned_to || null }, { workspaceId: profile.workspace_id, userId: profile.id }); toast.success('Ticket raised'); setRaising(false); list.reload() }
          catch (e) { toast.error(friendlyError(e)) } }} />}
      </Modal>
      {openId && <TicketDetail ticketId={openId} onClose={() => setOpenId(null)} onChanged={() => list.reload()} />}
    </Gate>
  )
}
