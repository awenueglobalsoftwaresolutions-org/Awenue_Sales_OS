import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, CalendarClock, CheckCircle2, Globe, Mail, Phone, Plus, RefreshCw, Sparkles, Tag, Target, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { useListQuery } from '../../hooks/useListQuery'
import { createLead, deleteLead, getLeadMetrics, listLeads, updateLead } from '../../services/leads'
import { listProfiles, listServiceNames } from '../../services/lookups'
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
import Avatar from '../../components/common/Avatar'
import LeadForm from '../../components/forms/LeadForm'
import { syncAndPersistWebsiteData } from '../../services/websiteSync'

const INITIAL_SORT = { key: 'created_at', dir: 'desc' }

const METRIC_TONES = {
  brand: { icon: 'bg-brand-50 text-brand-600 ring-brand-200/80', border: 'hover:border-brand-300', active: 'border-brand-500 ring-2 ring-brand-100', bar: 'bg-brand-500' },
  violet: { icon: 'bg-violet-50 text-violet-600 ring-violet-200/80', border: 'hover:border-violet-300', active: 'border-violet-500 ring-2 ring-violet-100', bar: 'bg-violet-500' },
  amber: { icon: 'bg-amber-50 text-amber-600 ring-amber-200/80', border: 'hover:border-amber-300', active: 'border-amber-500 ring-2 ring-amber-100', bar: 'bg-amber-500' },
  sky: { icon: 'bg-sky-50 text-sky-600 ring-sky-200/80', border: 'hover:border-sky-300', active: 'border-sky-500 ring-2 ring-sky-100', bar: 'bg-sky-500' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600 ring-emerald-200/80', border: 'hover:border-emerald-300', active: 'border-emerald-500 ring-2 ring-emerald-100', bar: 'bg-emerald-500' },
}

function MetricCard({ icon: Icon, label, value, sub, active, onClick, tone = 'brand' }) {
  const t = METRIC_TONES[tone] || METRIC_TONES.brand
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group block w-full rounded-2xl border bg-white p-3.5 sm:p-4 text-left shadow-card transition duration-150 hover:-translate-y-0.5 hover:shadow-card-hover ${active ? t.active : `border-ink-200/80 ${t.border}`}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[11px] font-medium text-ink-500 sm:text-xs">{label}</p>
        {Icon && (
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ring-1 transition group-hover:scale-105 sm:h-9 sm:w-9 ${t.icon}`} aria-hidden>
            <Icon className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <p className="text-xl font-bold tabular-nums tracking-tight text-ink-900 sm:text-2xl">{value ?? '—'}</p>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {sub && <p className="truncate text-[10px] font-medium text-ink-500 sm:text-[11px]">{sub}</p>}
        <span className={`h-1.5 w-6 rounded-full ${t.bar}`} aria-hidden />
      </div>
    </button>
  )
}

export default function LeadsPage() {
  const { profile, can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const list = useListQuery(listLeads, { initialSort: INITIAL_SORT })
  const metrics = useFetch(getLeadMetrics, [])
  const services = useFetch(listServiceNames, [])
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [syncingWeb, setSyncingWeb] = useState(false)

  useEffect(() => { if (params.get('new')) { setEditing({}); setParams({}, { replace: true }) } }, [params, setParams])

  const reloadAll = () => { list.reload(); metrics.reload() }

  const handleWebsiteSync = async () => {
    setSyncingWeb(true)
    try {
      const res = await syncAndPersistWebsiteData(profile, { type: 'enquiries' })
      const created = res?.stats?.leadsCreated || 0
      const updated = res?.stats?.leadsUpdated || 0
      toast.success(`Website inquiries synced: ${created} new, ${updated} updated in database`)
      reloadAll()
    } catch (err) {
      toast.error(err?.message || 'Failed to sync website inquiries.')
    } finally {
      setSyncingWeb(false)
    }
  }

  const save = async (values) => {
    if (editing?.id) await updateLead(editing, values, profile)
    else await createLead(values, profile)
    toast.success(editing?.id ? 'Lead updated' : 'Lead added')
    setEditing(null); reloadAll()
  }
  const remove = async () => { await deleteLead(deleting.id); toast.success('Lead deleted'); setDeleting(null); reloadAll() }

  const baseMetrics = metrics.data || {}
  const m = useMemo(() => {
    return {
      total: baseMetrics.total ?? 0,
      newMonth: baseMetrics.newMonth ?? 0,
      qualified: baseMetrics.qualified ?? 0,
      converted: baseMetrics.converted ?? 0,
      followups: baseMetrics.followups ?? 0,
    }
  }, [baseMetrics])

  const convRate = m.total ? Math.round((m.converted / m.total) * 100) : 0

  const columns = [
    { key: 'lead_number', header: 'Lead ID', className: 'whitespace-nowrap', render: (l) => (
      <span className="inline-flex items-center whitespace-nowrap rounded-md bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200/80">
        {leadCode(l.lead_number)}
      </span>) },
    { key: 'name', header: 'Lead', sortKey: 'first_name', render: (l) => (
      <div className="flex max-w-[180px] items-center gap-2">
        <Avatar person={{ full_name: fullName(l) }} size={28} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-900">{fullName(l)}</p>
          <div className="flex items-center gap-1 text-[11px] text-ink-500">
            {l.phone ? (
              <span className="inline-flex items-center gap-1 truncate"><Phone className="h-3 w-3 shrink-0 text-ink-400" aria-hidden /><span className="truncate">{l.phone}</span></span>
            ) : l.email ? (
              <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0 text-ink-400" aria-hidden /><span className="truncate">{l.email}</span></span>
            ) : (
              <span className="truncate">{l.job_title || '—'}</span>
            )}
          </div>
        </div>
      </div>) },
    { key: 'interested_service', header: 'Service', render: (l) => (
      l.interested_service
        ? <span className="inline-flex max-w-[120px] items-center gap-1 rounded-lg bg-brand-50/80 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-brand-100"><Tag className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{l.interested_service}</span></span>
        : <span className="text-ink-400">—</span>) },
    { key: 'organization', header: 'Organization', render: (l) => (
      l.organization?.id
        ? <Link className="inline-flex max-w-[125px] items-center gap-1 font-medium text-ink-800 hover:text-brand-600 hover:underline" to={`/organizations/${l.organization.id}`} onClick={(e) => e.stopPropagation()}><Building2 className="h-3 w-3 shrink-0 text-ink-400" aria-hidden /><span className="truncate">{l.organization.name}</span></Link>
        : l.organization?.name
          ? <span className="inline-flex max-w-[125px] items-center gap-1 font-medium text-ink-800"><Building2 className="h-3 w-3 shrink-0 text-ink-400" aria-hidden /><span className="truncate">{l.organization.name}</span></span>
          : <span className="text-ink-400">—</span>) },
    { key: 'source', header: 'Source', className: 'whitespace-nowrap', render: (l) => (
      l.source
        ? <span className="inline-flex items-center gap-1 rounded-md bg-ink-50 px-1.5 py-0.5 text-[11px] font-medium text-ink-700"><Globe className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />{labelOf(LEAD_SOURCES, l.source)}</span>
        : <span className="text-ink-400">—</span>) },
    { key: 'status', header: 'Stage', className: 'whitespace-nowrap', render: (l) => (
      <Badge tone={STATUS_TONE[l.status]}>{labelOf(LEAD_STATUSES, l.status)}</Badge>) },
    { key: 'priority', header: 'Priority', sortKey: 'priority_rank', className: 'whitespace-nowrap', render: (l) => <Badge tone={PRIORITY_TONE[l.priority]}>{labelOf(PRIORITIES, l.priority)}</Badge> },
    { key: 'assignee', header: 'Owner', render: (l) => (
      l.assignee?.full_name
        ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-700"><Avatar person={l.assignee} size={20} /><span className="max-w-[90px] truncate">{l.assignee.full_name}</span></span>
        : <span className="whitespace-nowrap rounded-md border border-dashed border-ink-200 px-1.5 py-0.5 text-[11px] text-ink-400">Unassigned</span>) },
    { key: 'created_at', header: 'Created', sortKey: 'created_at', className: 'whitespace-nowrap', render: (l) => <span className="whitespace-nowrap text-[11px] text-ink-500">{fmtDate(l.created_at)}</span> },
    { key: 'actions', header: '', className: 'w-16 whitespace-nowrap', render: (l) => (
      <RowActions
        canEdit={can('leads.edit')}
        canDelete={can('leads.delete')}
        label={fullName(l)}
        onEdit={() => setEditing(l)}
        onDelete={() => setDeleting(l)}
      />) },
  ]
  const addButton = !can('leads.create') ? null : <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add lead</button>
  const syncButton = (
    <button
      type="button"
      onClick={handleWebsiteSync}
      disabled={syncingWeb}
      className="btn-outline"
      title="Sync website enquiries to CRM database"
    >
      <RefreshCw className={`h-4 w-4 ${syncingWeb ? 'animate-spin' : ''}`} aria-hidden />
      {syncingWeb ? 'Syncing…' : 'Sync Website'}
    </button>
  )

  return (
    <div className="w-full space-y-5 animate-fade-up">
      <PageHeader title="Leads" subtitle="Manage CRM & website enquiries, nurture leads, and convert customers" icon={UserPlus} actions={<>{syncButton}<CsvTools entity="leads" list={list} />{addButton}</>} />

      {/* Top Lead Metrics Matrix */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          icon={Users} label="Total leads" value={m.total} sub="Single source of truth"
          tone="brand" sparkColor="#5b5bd6" sparkPoints="0,15 14,12 28,14 42,9 56,7 70,3"
          active={!list.filters.status} onClick={() => list.setFilter('status', '')}
        />
        <MetricCard
          icon={Sparkles} label="New leads" value={m.newMonth} sub="This month"
          tone="violet" sparkColor="#7c3aed" sparkPoints="0,16 14,14 28,11 42,10 56,6 70,4"
          active={list.filters.status === 'new'} onClick={() => list.setFilter('status', 'new')}
        />
        <MetricCard
          icon={CalendarClock} label="Follow-ups due" value={m.followups} sub="Open lead tasks"
          tone="amber" sparkColor="#d97706" sparkPoints="0,12 14,14 28,10 42,12 56,8 70,6"
          onClick={() => navigate('/tasks')}
        />
        <MetricCard
          icon={Target} label="Qualified" value={m.qualified} sub="Ready for deal"
          tone="sky" sparkColor="#0284c7" sparkPoints="0,17 14,13 28,12 42,7 56,6 70,3"
          active={list.filters.status === 'qualified'} onClick={() => list.setFilter('status', 'qualified')}
        />
        <MetricCard
          icon={CheckCircle2} label="Converted" value={m.converted} sub={`${convRate}% conversion`}
          tone="emerald" sparkColor="#10b981" sparkPoints="0,16 14,15 28,11 42,8 56,5 70,2"
          active={list.filters.status === 'converted'} onClick={() => list.setFilter('status', 'converted')}
        />
      </div>

      {/* Stage Pill Tabs */}
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter leads by stage">
        <button
          type="button"
          onClick={() => list.setFilter('status', '')}
          className={!list.filters.status ? 'tab-pill-active' : 'tab-pill-inactive'}
        >
          All Leads
        </button>
        {LEAD_STATUSES.map((st) => {
          const active = list.filters.status === st.value
          return (
            <button
              key={st.value}
              type="button"
              onClick={() => list.setFilter('status', active ? '' : st.value)}
              className={active ? 'tab-pill-active' : 'tab-pill-inactive'}
            >
              {st.label}
            </button>
          )
        })}
      </div>

      <FilterBar search={list.search} onSearch={list.setSearch} placeholder="Search name, email, phone" isFiltered={list.isFiltered} onClear={list.clearFilters}>
        <FilterSelect label="Any source" value={list.filters.source} onChange={(v) => list.setFilter('source', v)} options={LEAD_SOURCES} />
        <FilterSelect label="Any service" value={list.filters.interested_service} onChange={(v) => list.setFilter('interested_service', v)} options={(services.data || []).map((s) => ({ value: s.name, label: s.name }))} />
        <input className="input !w-36" placeholder="Country" value={list.filters.country || ''} onChange={(e) => list.setFilter('country', e.target.value)} aria-label="Filter by country" />
      </FilterBar>

      {list.error && !list.rows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <>
          <DataTable columns={columns} rows={list.rows} loading={list.loading && !list.rows.length} sort={list.sort} onSort={list.toggleSort}
            onRowClick={(l) => navigate(`/leads/${l.id}`)}
            empty={list.isFiltered
              ? <EmptyState illustration="search" title="No leads match" description="Try a different search or clear the filters." />
              : <EmptyState illustration="leads" title="No leads yet" description="Add your first lead to start tracking outreach." action={addButton} />} />
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
