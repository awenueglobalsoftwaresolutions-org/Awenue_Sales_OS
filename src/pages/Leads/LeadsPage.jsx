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
import { fmtDate, fmtDateTime, fullName, leadCode } from '../../lib/format'
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
import { useWebsiteSync } from '../../components/website/SyncControls'
import WebsiteEnquiryModal from '../../components/website/WebsiteEnquiryModal'
import { WEBSITE_STATUS_TONE, formatWebsiteStatus } from '../../services/website'

const INITIAL_SORT = { key: 'created_at', dir: 'desc' }

const WEB_TO_CRM_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  PROPOSAL_SENT: 'qualified',
  NEGOTIATION: 'qualified',
  CONVERTED: 'converted',
  ON_HOLD: 'unqualified',
  REJECTED: 'lost',
}

function normalizeWebsiteEnquiry(e) {
  return {
    id: `web-${e.id}`,
    isWebsiteLead: true,
    _raw: e,
    lead_number: e.enquiryNumber,
    first_name: e.fullName || 'Website Lead',
    last_name: '',
    email: e.email,
    phone: [e.countryCode, e.phone].filter(Boolean).join(' '),
    interested_service: (e.selectedServices || [])[0] || '',
    organization: e.companyName ? { name: e.companyName } : null,
    source: 'website',
    status: WEB_TO_CRM_STATUS[e.status] || 'new',
    websiteStatus: e.status,
    priority: 'medium',
    priority_rank: 2,
    assignee: e.assignedTo ? { full_name: e.assignedTo } : null,
    created_at: e.createdAt,
  }
}

function MiniSpark({ color = '#5b5bd6', points = '0,16 14,13 28,15 42,8 56,10 70,3' }) {
  return (
    <svg viewBox="0 0 72 20" className="h-5 w-16 shrink-0" fill="none" aria-hidden="true">
      <polyline points={points} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function MetricCard({ icon: Icon, label, value, sub, tone, sparkColor, sparkPoints, active, onClick }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600 ring-brand-100',
    violet: 'bg-violet-50 text-violet-600 ring-violet-100',
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    sky: 'bg-sky-50 text-sky-600 ring-sky-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-2xl border bg-white p-4 text-left shadow-card transition duration-150 hover:-translate-y-0.5 hover:shadow-card-hover ${active ? 'border-brand-500 ring-2 ring-brand-100' : 'border-ink-100 hover:border-brand-200'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ${tones[tone]}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <MiniSpark color={sparkColor} points={sparkPoints} />
      </div>
      <p className="mt-3 text-xs font-medium text-ink-500">{label}</p>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <p className="text-2xl font-bold tracking-tight text-ink-900">{value ?? '—'}</p>
        {sub && <span className="truncate text-[11px] font-medium text-ink-500">{sub}</span>}
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
  const profiles = useFetch(listProfiles, [])
  const webSync = useWebsiteSync('enquiries')
  const [editing, setEditing] = useState(null)
  const [editingWeb, setEditingWeb] = useState(null)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => { if (params.get('new')) { setEditing({}); setParams({}, { replace: true }) } }, [params, setParams])

  const reloadAll = () => { list.reload(); metrics.reload(); webSync.syncNow() }

  const save = async (values) => {
    if (editing?.id) await updateLead(editing, values, profile)
    else await createLead(values, profile)
    toast.success(editing?.id ? 'Lead updated' : 'Lead added')
    setEditing(null); reloadAll()
  }
  const remove = async () => { await deleteLead(deleting.id); toast.success('Lead deleted'); setDeleting(null); reloadAll() }

  const webEnquiries = webSync.data?.projectEnquiries || []
  const normalizedWebLeads = useMemo(() => webEnquiries.map(normalizeWebsiteEnquiry), [webEnquiries])

  const filteredWebLeads = useMemo(() => {
    const q = (list.search || '').trim().toLowerCase()
    const { status, source, interested_service, country } = list.filters
    if (source && source !== 'website') return []
    if (country) return []
    return normalizedWebLeads.filter((l) => {
      if (status && l.status !== status) return false
      if (interested_service && !(l._raw.selectedServices || []).includes(interested_service)) return false
      if (q) {
        const hay = [l.first_name, l.email, l.phone, l.lead_number, l.organization?.name, l._raw.projectName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [normalizedWebLeads, list.search, list.filters])

  const combinedRows = useMemo(() => {
    const base = list.page === 1 ? [...filteredWebLeads, ...list.rows] : list.rows
    const dir = list.sort.dir === 'asc' ? 1 : -1
    return [...base].sort((a, b) => {
      const av = a[list.sort.key] ?? ''
      const bv = b[list.sort.key] ?? ''
      if (list.sort.key === 'priority_rank') return ((av || 0) - (bv || 0)) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [filteredWebLeads, list.rows, list.page, list.sort])

  const baseMetrics = metrics.data || {}
  const m = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const webTotal = normalizedWebLeads.length
    const webNewMonth = normalizedWebLeads.filter((l) => (l.created_at || '') >= monthStart).length
    const webQualified = normalizedWebLeads.filter((l) => l.status === 'qualified').length
    const webConverted = normalizedWebLeads.filter((l) => l.status === 'converted').length
    return {
      total: (baseMetrics.total ?? 0) + webTotal,
      newMonth: (baseMetrics.newMonth ?? 0) + webNewMonth,
      qualified: (baseMetrics.qualified ?? 0) + webQualified,
      converted: (baseMetrics.converted ?? 0) + webConverted,
      followups: baseMetrics.followups ?? 0,
    }
  }, [baseMetrics, normalizedWebLeads])

  const convRate = m.total ? Math.round((m.converted / m.total) * 100) : 0

  const handleWebSaved = (updated) => {
    webSync.setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        projectEnquiries: (prev.projectEnquiries || []).map((item) => (item.id === updated.id ? updated : item)),
      }
    })
  }

  const columns = [
    { key: 'lead_number', header: 'Lead ID', className: 'whitespace-nowrap', render: (l) => (
      <span className="inline-flex items-center whitespace-nowrap rounded-md bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200/80">
        {l.isWebsiteLead ? (l.lead_number || 'WEB') : leadCode(l.lead_number)}
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
        ? <span className="inline-flex items-center gap-1 rounded-md bg-ink-50 px-1.5 py-0.5 text-[11px] font-medium text-ink-700"><Globe className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />{l.isWebsiteLead ? 'Website' : labelOf(LEAD_SOURCES, l.source)}</span>
        : <span className="text-ink-400">—</span>) },
    { key: 'status', header: 'Stage', className: 'whitespace-nowrap', render: (l) => (
      l.isWebsiteLead
        ? <Badge tone={WEBSITE_STATUS_TONE[l.websiteStatus] || 'gray'}>{formatWebsiteStatus(l.websiteStatus)}</Badge>
        : <Badge tone={STATUS_TONE[l.status]}>{labelOf(LEAD_STATUSES, l.status)}</Badge>) },
    { key: 'priority', header: 'Priority', sortKey: 'priority_rank', className: 'whitespace-nowrap', render: (l) => <Badge tone={PRIORITY_TONE[l.priority]}>{labelOf(PRIORITIES, l.priority)}</Badge> },
    { key: 'assignee', header: 'Owner', render: (l) => (
      l.assignee?.full_name
        ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-700"><Avatar person={l.assignee} size={20} /><span className="max-w-[90px] truncate">{l.assignee.full_name}</span></span>
        : <span className="whitespace-nowrap rounded-md border border-dashed border-ink-200 px-1.5 py-0.5 text-[11px] text-ink-400">Unassigned</span>) },
    { key: 'created_at', header: 'Created', sortKey: 'created_at', className: 'whitespace-nowrap', render: (l) => <span className="whitespace-nowrap text-[11px] text-ink-500">{fmtDate(l.created_at)}</span> },
    { key: 'actions', header: '', className: 'w-16 whitespace-nowrap', render: (l) => (
      <RowActions
        canEdit={can('leads.edit')}
        canDelete={!l.isWebsiteLead && can('leads.delete')}
        label={fullName(l)}
        onEdit={() => (l.isWebsiteLead ? setEditingWeb(l._raw) : setEditing(l))}
        onDelete={() => setDeleting(l)}
      />) },
  ]
  const addButton = !can('leads.create') ? null : <button className="btn-primary" onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add lead</button>
  const syncButton = (
    <button
      type="button"
      onClick={webSync.syncNow}
      disabled={webSync.syncing}
      className="btn-outline"
      title={webSync.data?.syncedAt ? `Website synced ${fmtDateTime(webSync.data.syncedAt)}` : 'Sync website enquiries'}
    >
      <RefreshCw className={`h-4 w-4 ${webSync.syncing ? 'animate-spin' : ''}`} aria-hidden />
      {webSync.syncing ? 'Syncing…' : 'Sync Website'}
    </button>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-4 animate-fade-up">
      <PageHeader title="Leads" subtitle="Manage CRM & website enquiries, nurture leads, and convert customers" icon={UserPlus} actions={<>{syncButton}<CsvTools entity="leads" list={list} />{addButton}</>} />

      {/* Top Lead Metrics Matrix */}
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          icon={Users} label="Total leads" value={m.total} sub="CRM + Website"
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
          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${!list.filters.status ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'}`}
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
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-brand-600 text-white shadow-sm' : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'}`}
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

      {list.error && !combinedRows.length ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <>
          <DataTable columns={columns} rows={combinedRows} loading={list.loading && !combinedRows.length} sort={list.sort} onSort={list.toggleSort}
            onRowClick={(l) => (l.isWebsiteLead ? setEditingWeb(l._raw) : navigate(`/leads/${l.id}`))}
            empty={list.isFiltered
              ? <EmptyState illustration="search" title="No leads match" description="Try a different search or clear the filters." />
              : <EmptyState illustration="leads" title="No leads yet" description="Add your first lead to start tracking outreach." action={addButton} />} />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total + filteredWebLeads.length} onPage={list.setPage} />
        </>
      )}

      <Modal open={Boolean(editing)} title={editing?.id ? 'Edit lead' : 'Add lead'} onClose={() => setEditing(null)} size="lg">
        {editing && <LeadForm key={editing.id || 'new'} initial={editing} onSubmit={save} onCancel={() => setEditing(null)} />}
      </Modal>
      <WebsiteEnquiryModal
        enquiry={editingWeb}
        profiles={profiles.data || []}
        canEdit={can('leads.edit')}
        onClose={() => setEditingWeb(null)}
        onSaved={handleWebSaved}
      />
      <ConfirmDialog open={Boolean(deleting)} title="Delete lead?" message={`${deleting ? fullName(deleting) : ''} and their activity history will be permanently deleted.`} onConfirm={remove} onClose={() => setDeleting(null)} />
    </div>
  )
}
