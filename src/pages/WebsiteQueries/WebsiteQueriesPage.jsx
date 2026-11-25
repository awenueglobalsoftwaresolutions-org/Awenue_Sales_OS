import { useMemo, useState } from 'react'
import { CheckCircle2, Clock, Mail, MessageSquare, Phone, Sparkles } from 'lucide-react'
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
import {
  CONTACT_STATUSES,
  CONTACT_SUBJECTS,
  WEBSITE_STATUS_TONE,
  formatWebsiteStatus,
} from '../../services/website'

const PAGE_SIZE = 10

export default function WebsiteQueriesPage() {
  const { can } = useAuth()
  const canEdit = can('leads.edit')
  const { data, setData, loading, syncing, error, autoRefreshSec, setAutoRefreshSec, syncNow } = useWebsiteSync('contacts')
  const profiles = useFetch(listProfiles, [])

  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState({ key: 'createdAt', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)

  const messages = data?.contactMessages || []

  const kpis = useMemo(() => {
    const total = messages.length
    const isNew = messages.filter((m) => m.status === 'NEW').length
    const inProgress = messages.filter((m) => m.status === 'IN_PROGRESS').length
    const resolved = messages.filter((m) => m.status === 'RESOLVED').length
    return { total, isNew, inProgress, resolved }
  }, [messages])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return messages.filter((m) => {
      if (subjectFilter && m.subject !== subjectFilter) return false
      if (statusFilter && m.status !== statusFilter) return false
      if (q) {
        const hay = [m.fullName, m.email, m.phone, m.messageNumber, m.subject, m.message]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [messages, search, subjectFilter, statusFilter])

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
    setSearch(''); setSubjectFilter(''); setStatusFilter(''); setPage(1)
  }

  const handleSaved = (updated) => {
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        contactMessages: (prev.contactMessages || []).map((item) => (item.id === updated.id ? updated : item)),
      }
    })
  }

  const columns = [
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
                <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />{m.email}</span>
              ) : m.phone ? (
                <span className="inline-flex items-center gap-1 truncate"><Phone className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />{[m.countryCode, m.phone].filter(Boolean).join(' ')}</span>
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
      render: (m) => (
        <Badge tone={WEBSITE_STATUS_TONE[m.status] || 'gray'}>
          {formatWebsiteStatus(m.status)}
        </Badge>
      ),
    },
    {
      key: 'assignedTo',
      header: 'Assigned To',
      render: (m) => <span className="text-xs text-ink-600">{m.assignedTo || '—'}</span>,
    },
    {
      key: 'createdAt',
      header: 'Received',
      sortKey: 'createdAt',
      className: 'whitespace-nowrap text-xs text-ink-500',
      render: (m) => fmtDate(m.createdAt),
    },
  ]

  const isFiltered = Boolean(search || subjectFilter || statusFilter)

  return (
    <div>
      <PageHeader
        icon={MessageSquare}
        title="Website Contact Queries"
        subtitle="Contact Us messages submitted on awenueglobalsoftwaresolutions.in"
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
          icon={MessageSquare}
          label="Total Messages"
          value={kpis.total}
          tone="brand"
          onClick={() => { setStatusFilter(''); setPage(1) }}
        />
        <StatTile
          icon={Sparkles}
          label="Unread / New"
          value={kpis.isNew}
          tone="sky"
          onClick={() => { setStatusFilter(statusFilter === 'NEW' ? '' : 'NEW'); setPage(1) }}
        />
        <StatTile
          icon={Clock}
          label="In Progress"
          value={kpis.inProgress}
          tone="amber"
          onClick={() => { setStatusFilter(statusFilter === 'IN_PROGRESS' ? '' : 'IN_PROGRESS'); setPage(1) }}
        />
        <StatTile
          icon={CheckCircle2}
          label="Resolved"
          value={kpis.resolved}
          tone="emerald"
          onClick={() => { setStatusFilter(statusFilter === 'RESOLVED' ? '' : 'RESOLVED'); setPage(1) }}
        />
      </div>

      <FilterBar
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1) }}
        placeholder="Search sender, email, message ID, or content…"
        isFiltered={isFiltered}
        onClear={clearFilters}
      >
        <FilterSelect
          label="All Subjects"
          value={subjectFilter}
          onChange={(v) => { setSubjectFilter(v); setPage(1) }}
          options={CONTACT_SUBJECTS.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          label="All Statuses"
          value={statusFilter}
          onChange={(v) => { setStatusFilter(v); setPage(1) }}
          options={CONTACT_STATUSES.map((s) => ({ value: s, label: formatWebsiteStatus(s) }))}
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
                icon={MessageSquare}
                title={isFiltered ? 'No matching contact messages' : 'No contact messages yet'}
                description={isFiltered ? 'Try adjusting your search or filters.' : 'Contact Us messages from the main website will appear here after syncing.'}
              />
            }
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={sorted.length} onPage={setPage} />
        </>
      )}

      <WebsiteContactModal
        message={selected}
        profiles={profiles.data || []}
        canEdit={canEdit}
        onClose={() => setSelected(null)}
        onSaved={handleSaved}
      />
    </div>
  )
}
