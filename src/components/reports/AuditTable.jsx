import { ChevronDown, ChevronRight } from 'lucide-react'
import { Fragment, useState } from 'react'
import Badge from '../common/Badge'
import Pagination from '../common/Pagination'
import Spinner from '../common/Spinner'
import ErrorState from '../common/ErrorState'
import EmptyState from '../common/EmptyState'
import { actionLabel } from '../../services/audit'
import { fmtDateTimeTz } from '../../lib/tz'

const STATUS_TONE = { success: 'green', failed: 'red' }

function ExpandedRow({ row, tz }) {
  return (
    <div className="rounded-lg bg-ink-50 p-4 text-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[['Full description', row.description], ['User ID', row.user_id], ['Record ID', row.record_id],
          ['IP address', row.ip_address], ['IP source', row.metadata?.ip_source], ['ISP', row.isp],
          ['User agent', row.user_agent]].map(([l, v]) => v ? <div key={l}><p className="text-xs font-medium text-ink-500">{l}</p><p className="break-all">{v}</p></div> : null)}
      </div>
      {(row.previous_data || row.updated_data) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {row.previous_data && <div><p className="text-xs font-medium text-ink-500">Before</p><pre className="mt-0.5 max-h-48 overflow-y-auto rounded bg-white p-2 text-xs">{JSON.stringify(row.previous_data, null, 2)}</pre></div>}
          {row.updated_data && <div><p className="text-xs font-medium text-ink-500">After</p><pre className="mt-0.5 max-h-48 overflow-y-auto rounded bg-white p-2 text-xs">{JSON.stringify(row.updated_data, null, 2)}</pre></div>}
        </div>)}
      {row.metadata && Object.keys(row.metadata).length > 0 && (
        <div className="mt-3"><p className="text-xs font-medium text-ink-500">Metadata</p><pre className="mt-0.5 max-h-32 overflow-y-auto rounded bg-white p-2 text-xs">{JSON.stringify(row.metadata, null, 2)}</pre></div>)}
    </div>
  )
}

export const AUDIT_COLUMNS = [
  { key: 'created_at', label: 'Time', sort: true }, { key: 'username', label: 'Employee', sort: true }, { key: 'action', label: 'Action', sort: true }, { key: 'module', label: 'Module', sort: true },
  { key: 'description', label: 'Description' }, { key: 'ip_address', label: 'IP address', sort: true }, { key: 'location', label: 'Location', sortKey: 'city' }, { key: 'device', label: 'Device', sort: true },
  { key: 'browser', label: 'Browser', sort: true }, { key: 'status', label: 'Status', sort: true },
]

export default function AuditTable({ state, page, pageSize, total, onPage, sort, onSort, tz, visible }) {
  const [expanded, setExpanded] = useState(null)
  const toggle = (id) => setExpanded((e) => (e === id ? null : id))
  const rows = state.rows || []
  const col = (key, label) => (
    <button className={`inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-900 ${sort?.key === key ? 'text-ink-900' : ''}`} onClick={() => onSort(key)}>
      {label} {sort?.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : ''}
    </button>)
  if (state.loading && !rows.length) return <Spinner className="py-16" />
  if (state.error) return <ErrorState message={state.error} />
  if (!rows.length) return <EmptyState title="No activities match" description="Try a different search or clear the filters." />
  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white shadow-card">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="border-b border-ink-100 bg-ink-50">
            <tr>
              <th className="w-8 px-3 py-2.5" />
              {AUDIT_COLUMNS.filter((c) => visible.has(c.key)).map((c) => <th key={c.key} className="px-4 py-2.5">{c.sort || c.sortKey ? col(c.sortKey || c.key, c.label) : <span className="text-xs font-semibold text-ink-500">{c.label}</span>}</th>)}
            </tr>
          </thead>
          <tbody className={`divide-y divide-ink-100 ${state.loading ? 'opacity-60' : ''}`}>
            {rows.map((r) => (
              <Fragment key={r.id}>
                <tr className="cursor-pointer hover:bg-ink-50" onClick={() => toggle(r.id)}>
                  <td className="px-3 py-2.5 text-ink-500">{expanded === r.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                  {visible.has('created_at') && <td className="whitespace-nowrap px-4 py-2.5 text-xs text-ink-500">{fmtDateTimeTz(r.created_at, tz)}</td>}
                  {visible.has('username') && <td className="px-4 py-2.5 font-medium">{r.username}</td>}
                  {visible.has('action') && <td className="px-4 py-2.5"><span className={`text-xs font-medium ${r.status === 'failed' ? 'text-red-600' : ''}`}>{actionLabel(r.action)}</span></td>}
                  {visible.has('module') && <td className="px-4 py-2.5 text-xs text-ink-500">{r.module}</td>}
                  {visible.has('description') && <td className="max-w-xs px-4 py-2.5 text-xs"><p className="truncate">{r.description}</p></td>}
                  {visible.has('ip_address') && <td className="px-4 py-2.5 font-mono text-xs text-ink-500">{r.ip_address || 'Not available'}{r.metadata?.ip_source === 'x-forwarded-for' && <span title="This address came from a header that a client could set, so it is unverified"> *</span>}</td>}
                  {visible.has('location') && <td className="px-4 py-2.5 text-xs text-ink-500">{[r.city, r.region, r.country].filter(Boolean).join(', ') || 'Not available'}</td>}
                  {visible.has('device') && <td className="px-4 py-2.5 text-xs text-ink-500">{[r.device, r.os].filter(Boolean).join(' · ') || '—'}</td>}
                  {visible.has('browser') && <td className="px-4 py-2.5 text-xs text-ink-500">{r.browser || '—'}</td>}
                  {visible.has('status') && <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[r.status] || 'gray'}>{r.status}</Badge></td>}
                </tr>
                {expanded === r.id && <tr><td colSpan={visible.size + 1} className="px-4 pb-3 pt-0"><ExpandedRow row={r} tz={tz} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={pageSize} total={total} onPage={onPage} />
    </div>
  )
}
