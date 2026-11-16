import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Handshake } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useListQuery } from '../../hooks/useListQuery'
import { listInvoices, getSummary } from '../../services/invoices'
import { listProfiles } from '../../services/lookups'
import { effectiveStatus } from '../../lib/invoiceCalc'
import { fmtDay, fmtMoney } from '../../lib/format'
import Gate from '../../components/layout/Gate'
import PageHeader from '../../components/common/PageHeader'
import { FilterBar, FilterSelect } from '../../components/common/FilterBar'
import DataTable from '../../components/tables/DataTable'
import Pagination from '../../components/common/Pagination'
import EmptyState from '../../components/common/EmptyState'
import ErrorState from '../../components/common/ErrorState'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import Spinner from '../../components/common/Spinner'
import InvoiceForm from './InvoiceForm'

const STATUS_OPTS = [{ value: 'draft', label: 'Draft' }, { value: 'sent', label: 'Sent' }, { value: 'partially_paid', label: 'Partially paid' }, { value: 'paid', label: 'Paid' }, { value: 'overdue', label: 'Overdue' }, { value: 'cancelled', label: 'Cancelled' }]
const STATUS_TONE = { draft: 'gray', sent: 'blue', partially_paid: 'amber', paid: 'green', overdue: 'red', cancelled: 'gray' }
const today = () => new Date().toISOString().slice(0, 10)

function StatCard({ label, value, to, danger }) {
  return (
    <Link to={to} className="rounded-xl border border-ink-100 bg-white p-4 shadow-card hover:border-brand-500">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={`mt-1 text-xl font-bold leading-tight ${danger ? 'text-red-600' : ''}`}>{value ?? '—'}</p>
    </Link>)
}

export default function InvoicesPage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const list = useListQuery(listInvoices, { initialSort: { key: 'created_at', dir: 'desc' } })
  const users = useFetch(listProfiles, [])
  const summary = useFetch(getSummary, [])
  const [creating, setCreating] = useState(false)

  useEffect(() => { if (params.get('new')) { setCreating(true); setParams({}, { replace: true }) } }, [params, setParams])

  const money = (obj) => { const e = Object.entries(obj || {}); return e.length ? e.map(([c, v]) => fmtMoney(v, c)).join(' · ') : '—' }
  const s = summary.data

  const columns = [
    { key: 'invoice_number', header: 'Invoice #', render: (r) => <span className="font-mono font-semibold text-brand-700">{r.invoice_number}</span> },
    { key: 'bill_to_name', header: 'Bill to', render: (r) => <div><p className="font-medium">{r.bill_to_name}</p><p className="text-xs text-ink-500">{r.organization?.name || r.bill_to_email || ''}</p></div> },
    { key: 'issue_date', header: 'Issue date', sortKey: 'issue_date', render: (r) => fmtDay(r.issue_date) },
    { key: 'due_date', header: 'Due date', sortKey: 'due_date', render: (r) => <span className={effectiveStatus(r, today()) === 'overdue' ? 'font-semibold text-red-600' : ''}>{fmtDay(r.due_date)}</span> },
    { key: 'total', header: 'Total', sortKey: 'total', render: (r) => fmtMoney(r.total, r.currency) },
    { key: 'balance', header: 'Balance', render: (r) => Number(r.balance) > 0 ? <span className="text-amber-600">{fmtMoney(r.balance, r.currency)}</span> : '—' },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[effectiveStatus(r, today())] || 'gray'}>{effectiveStatus(r, today()).replace('_', ' ')}</Badge> },
  ]
  const addButton = can('invoices.create') && <button className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New invoice</button>

  return (
    <Gate perm="invoices.view">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader title="Invoices" subtitle="Generate, track and collect payments" actions={addButton} />
        {s && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Drafts" value={s.drafts} to="?status=draft" />
            <StatCard label="Outstanding" value={money(s.outstanding)} to="?status=sent" />
            <StatCard label="Overdue" value={money(s.overdue)} to="?status=overdue" danger={Object.values(s.overdue || {}).some((v) => Number(v) > 0)} />
            <StatCard label="Overdue count" value={s.overdue_count} to="?status=overdue" danger={s.overdue_count > 0} />
            <StatCard label="Collected this month" value={money(s.collected_month)} to="?status=paid" />
          </div>)}

        <FilterBar search={list.search} onSearch={list.setSearch} placeholder="Search invoice number, bill-to name" isFiltered={list.isFiltered} onClear={list.clearFilters}>
          <FilterSelect label="Any status" value={list.filters.status} onChange={(v) => list.setFilter('status', v)} options={STATUS_OPTS} />
          <FilterSelect label="Anyone" value={list.filters.created_by} onChange={(v) => list.setFilter('created_by', v)} options={(users.data || []).map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        </FilterBar>

        {list.error && !list.rows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
          <>
            <DataTable columns={columns} rows={list.rows} loading={list.loading} sort={list.sort} onSort={list.toggleSort} onRowClick={(r) => navigate(`/invoices/${r.id}`)}
              empty={list.isFiltered
                ? <EmptyState icon={Handshake} title="No invoices match" description="Try different filters." />
                : <EmptyState icon={Handshake} title="No invoices yet" description="Create your first invoice." action={addButton} />} />
            <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} />
          </>)}
      </div>
      <Modal open={creating} title="New invoice" onClose={() => setCreating(false)} size="lg">
        {creating && <InvoiceForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); list.reload(); navigate(`/invoices/${id}`) }} />}
      </Modal>
    </Gate>
  )
}
