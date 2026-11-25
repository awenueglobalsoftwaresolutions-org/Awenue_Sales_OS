import { useMemo, useState } from 'react'
import { Building2, CheckCircle2, Globe, Mail, Phone, Sparkles, Tag, Target, Users } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { listProfiles } from '../../services/lookups'
import { fmtDate } from '../../lib/format'
import PageHeader from '../../components/common/PageHeader'
import StatTile from '../../components/common/StatTile'
import { FilterBar, FilterSelect } from '../../components/common/FilterBar'
import DataTable from '../../components/tables/DataTable'
import Pagination from '../../components/common/Pagination'
import EmptyState from '../../components/common/EmptyState'
import ErrorState from '../../components/common/ErrorState'
import Badge from '../../components/common/Badge'
import Avatar from '../../components/common/Avatar'
import { SyncControls, useWebsiteSync } from '../../components/website/SyncControls'
import WebsiteEnquiryModal from '../../components/website/WebsiteEnquiryModal'
import {
  ENQUIRY_STATUSES,
  WEBSITE_STATUS_TONE,
  formatWebsiteStatus,
} from '../../services/website'

const PAGE_SIZE = 10

export default function WebsiteLeadsPage() {
  const { can } = useAuth()
  const canEdit = can('leads.edit')
  const { data, setData, loading, syncing, error, autoRefreshSec, setAutoRefreshSec, syncNow } = useWebsiteSync('enquiries')
  const profiles = useFetch(listProfiles, [])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [serviceFilter, setServiceFilter] = useState('')
  const [budgetFilter, setBudgetFilter] = useState('')
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)

  const enquiries = data?.projectEnquiries || []

  const serviceOptions = useMemo(() => {
    const set = new Set()
    enquiries.forEach((e) => (e.selectedServices || []).forEach((s) => s && set.add(s)))
    return [...set].sort().map((s) => ({ value: s, label: s }))
  }, [enquiries])

  const budgetOptions = useMemo(() => {
    const set = new Set()
    enquiries.forEach((e) => e.estimatedBudget && set.add(e.estimatedBudget))
    return [...set].sort().map((b) => ({ value: b, label: b }))
  }, [enquiries])

  const kpis = useMemo(() => {
    const total = enquiries.length
    const isNew = enquiries.filter((e) => e.status === 'NEW').length
    const qualified = enquiries.filter((e) => e.status === 'QUALIFIED').length
    const converted = enquiries.filter((e) => e.status === 'CONVERTED').length
    return { total, isNew, qualified, converted }
  }, [enquiries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return enquiries.filter((e) => {
      if (statusFilter && e.status !== statusFilter) return false
      if (serviceFilter && !(e.selectedServices || []).includes(serviceFilter)) return false
      if (budgetFilter && e.estimatedBudget !== budgetFilter) return false
      if (q) {
        const hay = [e.fullName, e.email, e.phone, e.companyName, e.enquiryNumber, e.projectName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [enquiries, search, statusFilter, serviceFilter, budgetFilter])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    const dir = sort.dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const av = a[sort.key] ?? ''
      const bv = b[sort.key] ?? ''
      return String(av).localeCompare(String(bv)) * dir
    })
    return arr
  }, [filtered, sort])

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return sorted.slice(start, start + PAGE_SIZE)
  }, [sorted, page])

  const handleSort = (key) => {
    setSort((prev) => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }

  const clearFilters = () => {
    setSearch(''); setStatusFilter(''); setServiceFilter(''); setBudgetFilter(''); setPage(1)
  }

  const handleSaved = (updated) => {
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        projectEnquiries: (prev.projectEnquiries || []).map((item) => (item.id === updated.id ? updated : item)),
      }
    })
  }

  const columns = [
    {
      key: 'enquiryNumber',
      header: 'Enquiry ID',
      sortKey: 'enquiryNumber',
      className: 'whitespace-nowrap',
      render: (e) => (
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200/80">
          {e.enquiryNumber || '—'}
        </span>
      ),
    },
    {
      key: 'fullName',
      header: 'Lead',
      sortKey: 'fullName',
      render: (e) => (
        <div className="flex max-w-[210px] items-center gap-2">
          <Avatar person={{ full_name: e.fullName || 'Lead' }} size={28} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{e.fullName || '—'}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
              {e.phone ? (
                <span className="inline-flex items-center gap-1 truncate"><Phone className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />{[e.countryCode, e.phone].filter(Boolean).join(' ')}</span>
              ) : e.email ? (
                <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />{e.email}</span>
              ) : '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'companyName',
      header: 'Company',
      sortKey: 'companyName',
      render: (e) => (
        e.companyName
          ? <span className="inline-flex max-w-[140px] items-center gap-1 text-ink-800"><Building2 className="h-3.5 w-3.5 shrink-0 text-ink-400" aria-hidden /><span className="truncate">{e.companyName}</span></span>
          : <span className="text-ink-400">—</span>
      ),
    },
    {
      key: 'services',
      header: 'Services',
      render: (e) => {
        const list = e.selectedServices || []
        if (!list.length) return <span className="text-ink-400">—</span>
        return (
          <div className="flex flex-wrap items-center gap-1">
            <span className="inline-flex max-w-[140px] items-center gap-1 rounded-lg bg-brand-50/80 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-brand-100">
              <Tag className="h-3 w-3 shrink-0" aria-hidden /><span className="truncate">{list[0]}</span>
            </span>
            {list.length > 1 && <span className="text-[11px] font-medium text-ink-500">+{list.length - 1}</span>}
          </div>
        )
      },
    },
    {
      key: 'estimatedBudget',
      header: 'Budget',
      className: 'whitespace-nowrap',
      render: (e) => <span className="text-xs font-medium text-ink-700">{e.estimatedBudget || '—'}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      render: (e) => (
        <Badge tone={WEBSITE_STATUS_TONE[e.status] || 'gray'}>
          {formatWebsiteStatus(e.status)}
        </Badge>
      ),
    },
    {
      key: 'assignedTo',
      header: 'Assigned To',
      render: (e) => <span className="text-xs text-ink-600">{e.assignedTo || '—'}</span>,
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      sortKey: 'createdAt',
      className: 'whitespace-nowrap text-xs text-ink-500',
      render: (e) => fmtDate(e.createdAt),
    },
  ]

  const isFiltered = Boolean(search || statusFilter || serviceFilter || budgetFilter)

  return (
    <div>
      <PageHeader
        icon={Globe}
        title="Website Leads"
        subtitle="Project enquiries submitted on awenueglobalsoftwaresolutions.in"
        actions={
          <SyncControls
            syncedAt={data?.syncedAt}
            syncing={syncing}
            onSync={syncNow}
            autoRefreshSec={autoRefreshSec}
            onAutoRefreshChange={setAutoRefreshSec}
          />
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Users}
          label="Total Website Leads"
          value={kpis.total}
          tone="brand"
          onClick={() => { setStatusFilter(''); setPage(1) }}
        />
        <StatTile
          icon={Sparkles}
          label="New Leads"
          value={kpis.isNew}
          tone="sky"
          onClick={() => { setStatusFilter(statusFilter === 'NEW' ? '' : 'NEW'); setPage(1) }}
        />
        <StatTile
          icon={Target}
          label="Qualified"
          value={kpis.qualified}
          tone="amber"
          onClick={() => { setStatusFilter(statusFilter === 'QUALIFIED' ? '' : 'QUALIFIED'); setPage(1) }}
        />
        <StatTile
          icon={CheckCircle2}
          label="Converted"
          value={kpis.converted}
          tone="emerald"
          onClick={() => { setStatusFilter(statusFilter === 'CONVERTED' ? '' : 'CONVERTED'); setPage(1) }}
        />
      </div>

      <FilterBar
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        placeholder="Search name, email, phone, company, or enquiry ID…"
        isFiltered={isFiltered}
        onClear={clearFilters}
      >
        <FilterSelect
          label="All Statuses"
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1) }}
          options={ENQUIRY_STATUSES.map((s) => ({ value: s, label: formatWebsiteStatus(s) }))}
        />
        <FilterSelect
          label="All Services"
          value={serviceFilter}
          onChange={(v) => { setServiceFilter(v); setPage(1) }}
          options={serviceOptions}
        />
        <FilterSelect
          label="All Budgets"
          value={budgetFilter}
          onChange={(v) => { setBudgetFilter(v); setPage(1) }}
          options={budgetOptions}
        />
      </FilterBar>

      {error ? (
        <ErrorState message={error} onRetry={syncNow} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={paged}
            loading={loading}
            sort={sort}
            onSort={handleSort}
            onRowClick={(row) => setSelected(row)}
            empty={
              <EmptyState
                icon={Globe}
                title={isFiltered ? 'No matching website leads' : 'No website leads yet'}
                description={isFiltered ? 'Try adjusting your search or filters.' : 'Project enquiries from the main website will appear here after syncing.'}
              />
            }
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={sorted.length} onPage={setPage} />
        </>
      )}

      <WebsiteEnquiryModal
        enquiry={selected}
        profiles={profiles.data || []}
        canEdit={canEdit}
        onClose={() => setSelected(null)}
        onSaved={handleSaved}
      />
    </div>
  )
}
