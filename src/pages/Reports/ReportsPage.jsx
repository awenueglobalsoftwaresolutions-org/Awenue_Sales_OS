import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { Activity, Columns3, Download, FileSpreadsheet, FileText, Trash2, UserSearch } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import Gate from '../../components/layout/Gate'
import PageHeader from '../../components/common/PageHeader'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'
import EmptyState from '../../components/common/EmptyState'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import AuditFilters from '../../components/reports/AuditFilters'
import AuditTable, { AUDIT_COLUMNS } from '../../components/reports/AuditTable'
import { EMPTY_FILTERS, auditSummary, fetchAllAudit, getRetention, logEvent, purgeAudit, searchAudit, setRetention } from '../../services/audit'
import { listUsers } from '../../services/settings'
import { exportCsv, exportPdf, exportXlsx, safeFile } from '../../lib/reportExport'
import { friendlyError } from '../../lib/errors'
import { useClickOutside } from '../../hooks/useClickOutside'

const SummaryCharts = lazy(() => import('./SummaryCharts'))
const PAGE = 25
const COL_KEY = 'awenue.audit.columns'

const stat = (label, value, danger = false) => (
  <div key={label} className="rounded-xl border border-ink-100 bg-white p-4 shadow-card"><p className="text-xs font-medium text-ink-500">{label}</p><p className={`mt-1 text-2xl font-bold ${danger ? 'text-red-600' : ''}`}>{value ?? '—'}</p></div>)

const filtersReducer = (state, a) => (a.type === 'set' ? { ...state, [a.key]: a.value } : a.type === 'clear' ? { ...EMPTY_FILTERS, userId: a.keepUser ? state.userId : '' } : state)
const loadColumns = () => { try { const s = JSON.parse(localStorage.getItem(COL_KEY)); if (Array.isArray(s) && s.length) return new Set(s) } catch { /* default */ } return new Set(AUDIT_COLUMNS.map((c) => c.key)) }

function ColumnMenu({ visible, onChange }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  useClickOutside(box, () => setOpen(false), open)
  return (
    <div className="relative" ref={box}>
      <button className="btn-ghost border border-ink-300" onClick={() => setOpen((o) => !o)}><Columns3 className="h-4 w-4" />Columns</button>
      {open && (
        <div className="absolute z-30 mt-2 w-48 rounded-xl border border-ink-100 bg-white p-2 shadow-lg">
          {AUDIT_COLUMNS.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-ink-50">
              <input type="checkbox" className="accent-[#4b4bc4]" checked={visible.has(c.key)} disabled={visible.has(c.key) && visible.size === 1} onChange={() => onChange(c.key)} />{c.label}
            </label>))}
        </div>)}
    </div>)
}

export default function ReportsPage() {
  const { profile, can } = useAuth()
  const tz = profile?.timezone || 'UTC'
  const [mode, setMode] = useState('user')                           // 'user' = Individual User Activity Report, 'all' = everyone
  const [filters, dispatch] = useReducer(filtersReducer, EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' })
  const [visible, setVisible] = useState(loadColumns)
  const [showCharts, setShowCharts] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState([0, 0])
  const [purging, setPurging] = useState(false)
  const [retentionEdit, setRetentionEdit] = useState(false)
  const [retentionDays, setRetentionDays] = useState(365)
  const users = useFetch(listUsers, [])
  const retention = useFetch(getRetention, [])

  const setFilter = useCallback((key, value) => dispatch({ type: 'set', key, value }), [])
  const clearFilters = useCallback(() => dispatch({ type: 'clear', keepUser: mode === 'user' }), [mode])
  const isFiltered = Object.entries(filters).some(([k, v]) => v && !(mode === 'user' && k === 'userId'))
  const ready = mode === 'all' || Boolean(filters.userId)
  useEffect(() => setPage(1), [filters, mode])
  const toggleSort = (key) => { setPage(1); setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' })) }
  const toggleColumn = (key) => setVisible((v) => { const n = new Set(v); n.has(key) ? n.delete(key) : n.add(key); try { localStorage.setItem(COL_KEY, JSON.stringify([...n])) } catch { /* storage unavailable */ } return n })

  const list = useFetch(() => (ready ? searchAudit(filters, tz, { sort: sort.key, dir: sort.dir, limit: PAGE, offset: (page - 1) * PAGE }) : Promise.resolve({ rows: [], total: 0 })), [filters, tz, page, sort.key, sort.dir, ready])
  const summary = useFetch(() => (ready ? auditSummary(filters, tz) : Promise.resolve(null)), [filters, tz, ready])
  const s = summary.data
  const employee = filters.userId ? (users.data || []).find((u) => u.id === filters.userId) : null

  const meta = () => {
    const name = employee ? (employee.full_name || employee.email) : 'All employees'
    const period = [filters.fromDate, filters.toDate].filter(Boolean).join(' to ') || 'All time'
    return { title: employee ? 'Individual User Activity Report' : 'Activity Report', employee: name, employeeId: employee?.id || 'All employees', period, tz,
      generatedBy: profile.full_name || profile.email, name: safeFile(`activity-${name}-${period}`) }
  }

  const download = async (format) => {
    if (downloading) return
    setDownloading(true); setProgress([0, 0])
    try {
      const { rows, total, truncated } = await fetchAllAudit(filters, tz, { onProgress: (a, b) => setProgress([a, b]) })
      const sum = s || await auditSummary(filters, tz); const m = meta()
      await logEvent({ action: 'report_generated', module: 'reports', description: `Generated ${format.toUpperCase()} activity report for ${m.employee}`, metadata: { format, rows: rows.length, period: m.period, employee_id: employee?.id || null } })
      if (format === 'csv') exportCsv(rows, tz, m.name); else if (format === 'xlsx') await exportXlsx(rows, sum, m, m.name); else await exportPdf(rows, sum, m, m.name)
      await logEvent({ action: 'report_downloaded', module: 'reports', description: `Downloaded ${format.toUpperCase()} activity report for ${m.employee}`, metadata: { format, rows: rows.length } })
      truncated ? toast.warning(`The report has the first ${rows.length.toLocaleString()} of ${total.toLocaleString()} activities. Narrow the dates for the rest.`) : toast.success('Report downloaded')
    } catch (e) { toast.error(friendlyError(e)) } finally { setDownloading(false); setProgress([0, 0]) }
  }

  const saveRetention = async () => { try { await setRetention(retentionDays); toast.success('Retention policy updated'); setRetentionEdit(false); retention.reload() } catch (e) { toast.error(friendlyError(e)) } }
  const doPurge = async () => { const n = await purgeAudit(); toast.success(`Deleted ${n} record(s) older than ${retention.data} days`); setPurging(false); list.reload(); summary.reload() }

  return (
    <Gate perm="reports.view">
      <div className="mx-auto max-w-7xl space-y-5">
        <PageHeader title="Reports & Audits" subtitle="Everything important that happens in the CRM, searchable and downloadable"
          actions={can('reports.export') && ready && (
            <div className="flex flex-wrap items-center gap-2">
              {downloading && <span className="text-sm text-ink-500">Preparing… {progress[0]} / {progress[1]}</span>}
              <button className="btn-ghost border border-ink-300" disabled={downloading} onClick={() => download('csv')}><FileText className="h-4 w-4" />CSV</button>
              <button className="btn-ghost border border-ink-300" disabled={downloading} onClick={() => download('xlsx')}><FileSpreadsheet className="h-4 w-4" />Excel</button>
              <button className="btn-ghost border border-ink-300" disabled={downloading} onClick={() => download('pdf')}><Download className="h-4 w-4" />PDF</button>
            </div>)} />

        <div role="tablist" className="flex gap-1 border-b border-ink-100">
          {[['user', 'Individual user activity report'], ['all', 'All activity']].map(([k, label]) => (
            <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${mode === k ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>{label}</button>))}
        </div>

        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Locations come from IP addresses and are approximate: VPNs, proxies and mobile networks can make them wrong. They are not GPS positions. An address marked * came from a header the sender could set, so treat it as unverified.</p>

        <AuditFilters filters={filters} setFilter={setFilter} clearFilters={clearFilters} isFiltered={isFiltered} />

        {!ready ? (
          <div className="rounded-xl border border-dashed border-ink-300 bg-white"><EmptyState icon={UserSearch} title="Choose an employee to begin" description="Pick someone in “Any employee” above, then set a date range and, if you like, a time window. Their recorded activity appears here." /></div>
        ) : (
          <>
            {summary.loading && !s && <Spinner className="py-4" />}
            {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}
            {s && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                  {stat('Total activities', s.total)}{stat('Successful', s.success)}{stat('Failed', s.failed, s.failed > 0)}{stat('Failed logins', s.failed_logins, s.failed_logins > 0)}{stat('Created', s.created)}{stat('Updated', s.updated)}
                  {stat('Deleted', s.deleted)}{stat('Emails sent', s.emails_sent)}{stat('WhatsApp sent', s.whatsapp_sent)}{stat('Unique IPs', s.unique_ips)}
                  {stat('Locations', (s.locations || []).filter((l) => l.location).length)}{stat('Last activity', s.last_at ? new Date(s.last_at).toLocaleDateString('en-GB', { timeZone: tz }) : '—')}
                </div>
              </div>)}

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-ghost border border-ink-300" onClick={() => setShowCharts((v) => !v)}><Activity className="h-4 w-4" />{showCharts ? 'Hide charts' : 'Show charts'}</button>
              <ColumnMenu visible={visible} onChange={toggleColumn} />
              {can('reports.manage') && <button className="btn-ghost border border-ink-300" onClick={() => { setRetentionDays(retention.data || 365); setRetentionEdit(true) }}>Retention policy</button>}
              {can('reports.manage') && <button className="btn-ghost border border-red-200 !text-red-600" onClick={() => setPurging(true)}><Trash2 className="h-4 w-4" />Purge old records</button>}
            </div>
            {showCharts && s && <Suspense fallback={<Spinner className="py-10" />}><SummaryCharts summary={s} tz={tz} /></Suspense>}

            <AuditTable state={{ rows: list.data?.rows || [], loading: list.loading, error: list.error }} page={page} pageSize={PAGE} total={list.data?.total ?? 0} onPage={setPage}
              sort={sort} onSort={toggleSort} tz={tz} visible={visible} />
          </>)}

        <Modal open={retentionEdit} title="Audit retention policy" onClose={() => setRetentionEdit(false)} size="sm">
          <p className="text-sm text-ink-700">Audit records older than this are removed when you run a purge. Minimum 30 days, maximum 3,650 (10 years).</p>
          <div className="mt-4 flex items-center gap-3"><input type="number" className="input !w-32" min={30} max={3650} value={retentionDays} onChange={(e) => setRetentionDays(Number(e.target.value))} aria-label="Retention in days" /><span className="text-sm text-ink-500">days</span></div>
          <div className="mt-5 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setRetentionEdit(false)}>Cancel</button><button className="btn-primary" onClick={saveRetention}>Save</button></div>
        </Modal>
        <ConfirmDialog open={purging} title="Purge audit records?" confirmLabel="Purge" onClose={() => setPurging(false)} onConfirm={doPurge}
          message={`This permanently deletes audit records older than ${retention.data || 365} days. It can't be undone, and the purge itself is recorded.`} />
      </div>
    </Gate>
  )
}
