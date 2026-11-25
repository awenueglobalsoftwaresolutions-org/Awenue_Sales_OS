import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  KanbanSquare,
  Layers,
  Mail,
  MessageSquare,
  Phone,
  Sparkles,
  Tag,
} from 'lucide-react'
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
import WebsiteContactModal from '../../components/website/WebsiteContactModal'
import WebsiteEnquiryModal from '../../components/website/WebsiteEnquiryModal'
import {
  CONTACT_STATUSES,
  CONTACT_SUBJECTS,
  ENQUIRY_STATUSES,
  WEBSITE_STATUS_TONE,
  formatWebsiteStatus,
} from '../../services/website'

const PAGE_SIZE = 10

export default function WebsiteQueriesPage() {
  const { can } = useAuth()
  const canEdit = can('leads.edit')
  const { data, setData, loading, syncing, error, autoRefreshSec, setAutoRefreshSec, syncNow } = useWebsiteSync('all')
  const profiles = useFetch(listProfiles, [])

  const [activeTab, setActiveTab] = useState('contacts') // 'contacts' | 'enquiries'
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' })
  const [page, setPage] = useState(1)

  const [selectedContact, setSelectedContact] = useState(null)
  const [selectedEnquiry, setSelectedEnquiry] = useState(null)

  const messages = data?.contactMessages || []
  const enquiries = data?.projectEnquiries || []

  // KPIs for Contacts
  const contactKpis = useMemo(() => {
    const total = messages.length
    const isNew = messages.filter((m) => m.status === 'NEW').length
    const inProgress = messages.filter((m) => m.status === 'IN_PROGRESS').length
    const resolved = messages.filter((m) => m.status === 'RESOLVED').length
    return { total, isNew, inProgress, resolved }
  }, [messages])

  // KPIs for Enquiries
  const enquiryKpis = useMemo(() => {
    const total = enquiries.length
    const isNew = enquiries.filter((e) => e.status === 'NEW').length
    const inReview = enquiries.filter((e) => e.status === 'IN_REVIEW' || e.status === 'CONTACTED').length
    const converted = enquiries.filter((e) => e.status === 'CONVERTED').length
    return { total, isNew, inReview, converted }
  }, [enquiries])

  // Filtered dataset based on active tab
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = activeTab === 'contacts' ? messages : enquiries

    return list.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false
      if (activeTab === 'contacts' && subjectFilter && item.subject !== subjectFilter) return false

      if (q) {
        if (activeTab === 'contacts') {
          const hay = [item.fullName, item.email, item.phone, item.messageNumber, item.subject, item.message]
            .filter(Boolean).join(' ').toLowerCase()
          if (!hay.includes(q)) return false
        } else {
          const hay = [
            item.fullName, item.email, item.phone, item.enquiryNumber, item.companyName,
            item.projectScope, Array.isArray(item.selectedServices) ? item.selectedServices.join(' ') : item.selectedServices,
          ].filter(Boolean).join(' ').toLowerCase()
          if (!hay.includes(q)) return false
        }
      }
      return true
    })
  }, [activeTab, messages, enquiries, search, subjectFilter, statusFilter])

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
    setSearch('')
    setSubjectFilter('')
    setStatusFilter('')
    setPage(1)
  }

  const switchTab = (tab) => {
    setActiveTab(tab)
    clearFilters()
  }

  // Saved callback for contact messages
  const handleContactSaved = (updated) => {
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        contactMessages: (prev.contactMessages || []).map((item) => (item.id === updated.id ? updated : item)),
      }
    })
  }

  // Saved callback for project enquiries
  const handleEnquirySaved = (updated) => {
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        projectEnquiries: (prev.projectEnquiries || []).map((item) => (item.id === updated.id ? updated : item)),
      }
    })
  }

  // Contacts Columns
  const contactColumns = [
    {
      key: 'messageNumber',
      header: 'Message ID',
      sortKey: 'messageNumber',
      className: 'whitespace-nowrap',
      render: (m) => (
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-600 ring-1 ring-ink-200/80">
          {m.messageNumber || '—'}
        </span>
      ),
    },
    {
      key: 'fullName',
      header: 'Sender',
      sortKey: 'fullName',
      render: (m) => (
        <div className="flex max-w-[210px] items-center gap-2">
          <Avatar person={{ full_name: m.fullName || 'Contact' }} size={28} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{m.fullName || '—'}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
              {m.email ? (
                <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0 text-ink-400" /><span className="truncate">{m.email}</span></span>
              ) : m.phone ? (
                <span className="inline-flex items-center gap-1 truncate"><Phone className="h-3 w-3 shrink-0 text-ink-400" />{[m.countryCode, m.phone].filter(Boolean).join(' ')}</span>
              ) : '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      sortKey: 'subject',
      render: (m) => (m.subject ? <Badge tone="indigo">{m.subject}</Badge> : <span className="text-ink-400">—</span>),
    },
    {
      key: 'message',
      header: 'Message',
      render: (m) => <p className="max-w-[260px] truncate text-xs text-ink-600">{m.message || '—'}</p>,
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      className: 'whitespace-nowrap',
      render: (m) => (
        <Badge tone={WEBSITE_STATUS_TONE[m.status] || 'gray'}>
          {formatWebsiteStatus(m.status)}
        </Badge>
      ),
    },
    {
      key: 'assignedTo',
      header: 'Assigned To',
      render: (m) => (
        m.assignedTo
          ? <span className="text-xs font-medium text-ink-700">{m.assignedTo}</span>
          : <span className="whitespace-nowrap rounded-md border border-dashed border-ink-200 px-1.5 py-0.5 text-[11px] text-ink-400">Unassigned</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Received',
      sortKey: 'createdAt',
      className: 'whitespace-nowrap text-[11px] text-ink-500',
      render: (m) => fmtDate(m.createdAt),
    },
  ]

  // Enquiries Columns
  const enquiryColumns = [
    {
      key: 'enquiryNumber',
      header: 'Enquiry ID',
      sortKey: 'enquiryNumber',
      className: 'whitespace-nowrap',
      render: (e) => (
        <span className="inline-flex items-center whitespace-nowrap rounded-md bg-sky-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-sky-700 ring-1 ring-sky-200/80">
          {e.enquiryNumber || '—'}
        </span>
      ),
    },
    {
      key: 'fullName',
      header: 'Prospect / Client',
      sortKey: 'fullName',
      render: (e) => (
        <div className="flex max-w-[210px] items-center gap-2">
          <Avatar person={{ full_name: e.fullName || 'Lead' }} size={28} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink-900">{e.fullName || '—'}</p>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-500">
              {e.email ? (
                <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0 text-ink-400" /><span className="truncate">{e.email}</span></span>
              ) : null}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'companyName',
      header: 'Company / Org',
      sortKey: 'companyName',
      render: (e) => (
        e.companyName ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-800">
            <Building2 className="h-3.5 w-3.5 text-ink-400" />
            <span className="truncate">{e.companyName}</span>
          </span>
        ) : <span className="text-ink-400">—</span>
      ),
    },
    {
      key: 'selectedServices',
      header: 'Services',
      render: (e) => {
        const list = Array.isArray(e.selectedServices) ? e.selectedServices : e.selectedServices ? [e.selectedServices] : []
        if (!list.length) return <span className="text-ink-400">—</span>
        return (
          <div className="flex max-w-[220px] flex-wrap gap-1">
            {list.slice(0, 2).map((s, idx) => (
              <span key={idx} className="rounded bg-ink-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-ink-700">
                {s}
              </span>
            ))}
            {list.length > 2 && <span className="text-[10px] text-ink-400">+{list.length - 2}</span>}
          </div>
        )
      },
    },
    {
      key: 'budgetRange',
      header: 'Budget Range',
      className: 'whitespace-nowrap',
      render: (e) => (
        e.budgetRange ? (
          <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold text-brand-700">
            {e.budgetRange}
          </span>
        ) : <span className="text-ink-400">—</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortKey: 'status',
      className: 'whitespace-nowrap',
      render: (e) => (
        <Badge tone={WEBSITE_STATUS_TONE[e.status] || 'gray'}>
          {formatWebsiteStatus(e.status)}
        </Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      sortKey: 'createdAt',
      className: 'whitespace-nowrap text-[11px] text-ink-500',
      render: (e) => fmtDate(e.createdAt),
    },
  ]

  const isFiltered = Boolean(search || subjectFilter || statusFilter)

  return (
    <div className="w-full space-y-5 animate-fade-up">
      <PageHeader
        icon={MessageSquare}
        title="Website Queries & Leads"
        subtitle="Live inquiries and Contact Us messages synced from awenueglobalsoftwaresolutions.in"
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/pipeline?tab=leads"
              className="btn-outline !py-1.5 text-xs inline-flex items-center gap-1.5"
            >
              <KanbanSquare className="h-3.5 w-3.5" />
              Open in Sales Pipeline
            </Link>
            <SyncControls
              syncedAt={data?.syncedAt}
              syncing={syncing}
              onSync={syncNow}
              autoRefreshSec={autoRefreshSec}
              onAutoRefreshChange={setAutoRefreshSec}
            />
          </div>
        }
      />

      {/* Main Tabs: Contact Us Queries vs Project Enquiries */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-2">
        <div className="flex items-center gap-2 rounded-xl bg-ink-100/70 p-1">
          <button
            type="button"
            onClick={() => switchTab('contacts')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'contacts' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5 text-indigo-600" />
            Contact Us Queries
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${activeTab === 'contacts' ? 'bg-indigo-50 text-indigo-700' : 'bg-ink-200 text-ink-700'}`}>
              {messages.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => switchTab('enquiries')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === 'enquiries' ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-sky-600" />
            Project Enquiries
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${activeTab === 'enquiries' ? 'bg-sky-50 text-sky-700' : 'bg-ink-200 text-ink-700'}`}>
              {enquiries.length}
            </span>
          </button>
        </div>

        <div className="text-xs text-ink-500">
          Directly synced & persisted to Supabase database (`leads`)
        </div>
      </div>

      {/* KPIs */}
      {activeTab === 'contacts' ? (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={MessageSquare}
            label="Total Messages"
            value={contactKpis.total}
            sub="All contact queries"
            tone="brand"
            onClick={() => { setStatusFilter(''); setPage(1) }}
          />
          <StatTile
            icon={Sparkles}
            label="Unread / New"
            value={contactKpis.isNew}
            sub="Awaiting review"
            tone="sky"
            onClick={() => { setStatusFilter(statusFilter === 'NEW' ? '' : 'NEW'); setPage(1) }}
          />
          <StatTile
            icon={Clock}
            label="In Progress"
            value={contactKpis.inProgress}
            sub="Being handled"
            tone="amber"
            onClick={() => { setStatusFilter(statusFilter === 'IN_PROGRESS' ? '' : 'IN_PROGRESS'); setPage(1) }}
          />
          <StatTile
            icon={CheckCircle2}
            label="Resolved"
            value={contactKpis.resolved}
            sub="Completed"
            tone="emerald"
            onClick={() => { setStatusFilter(statusFilter === 'RESOLVED' ? '' : 'RESOLVED'); setPage(1) }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={Sparkles}
            label="Total Enquiries"
            value={enquiryKpis.total}
            sub="Project proposals submitted"
            tone="brand"
            onClick={() => { setStatusFilter(''); setPage(1) }}
          />
          <StatTile
            icon={Sparkles}
            label="New Enquiries"
            value={enquiryKpis.isNew}
            sub="Needs initial outreach"
            tone="sky"
            onClick={() => { setStatusFilter(statusFilter === 'NEW' ? '' : 'NEW'); setPage(1) }}
          />
          <StatTile
            icon={Clock}
            label="In Review / Contacted"
            value={enquiryKpis.inReview}
            sub="In discussions"
            tone="amber"
            onClick={() => { setStatusFilter(statusFilter === 'IN_REVIEW' ? '' : 'IN_REVIEW'); setPage(1) }}
          />
          <StatTile
            icon={CheckCircle2}
            label="Converted"
            value={enquiryKpis.converted}
            sub="Moved into active deals"
            tone="emerald"
            onClick={() => { setStatusFilter(statusFilter === 'CONVERTED' ? '' : 'CONVERTED'); setPage(1) }}
          />
        </div>
      )}

      {/* Filter Bar */}
      <FilterBar
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        placeholder={activeTab === 'contacts' ? 'Search sender, email, ID, or message text…' : 'Search prospect, company, services, or scope…'}
        isFiltered={isFiltered}
        onClear={clearFilters}
      >
        {activeTab === 'contacts' && (
          <FilterSelect
            label="All Subjects"
            value={subjectFilter}
            onChange={(v) => { setSubjectFilter(v); setPage(1) }}
            options={CONTACT_SUBJECTS.map((s) => ({ value: s, label: s }))}
          />
        )}
        <FilterSelect
          label="All Statuses"
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1) }}
          options={(activeTab === 'contacts' ? CONTACT_STATUSES : ENQUIRY_STATUSES).map((s) => ({
            value: s,
            label: formatWebsiteStatus(s),
          }))}
        />
      </FilterBar>

      {/* Table Content */}
      {error ? (
        <ErrorState message={error} onRetry={syncNow} />
      ) : (
        <>
          <DataTable
            columns={activeTab === 'contacts' ? contactColumns : enquiryColumns}
            rows={paged}
            loading={loading}
            sort={sort}
            onSort={handleSort}
            onRowClick={(row) => {
              if (activeTab === 'contacts') {
                setSelectedContact(row)
              } else {
                setSelectedEnquiry(row)
              }
            }}
            empty={
              <EmptyState
                illustration={isFiltered ? 'search' : undefined}
                icon={activeTab === 'contacts' ? MessageSquare : Sparkles}
                title={isFiltered ? 'No matching queries' : activeTab === 'contacts' ? 'No contact messages yet' : 'No project enquiries yet'}
                description={isFiltered ? 'Try adjusting your search or filters.' : 'Website submissions will appear here automatically.'}
              />
            }
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={sorted.length} onPage={setPage} />
        </>
      )}

      {/* Modals */}
      <WebsiteContactModal
        message={selectedContact}
        profiles={profiles.data || []}
        canEdit={canEdit}
        onClose={() => setSelectedContact(null)}
        onSaved={handleContactSaved}
      />

      <WebsiteEnquiryModal
        enquiry={selectedEnquiry}
        profiles={profiles.data || []}
        canEdit={canEdit}
        onClose={() => setSelectedEnquiry(null)}
        onSaved={handleEnquirySaved}
      />
    </div>
  )
}
