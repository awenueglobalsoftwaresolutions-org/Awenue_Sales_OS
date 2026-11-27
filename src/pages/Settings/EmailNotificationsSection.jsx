import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Eye,
  Filter,
  LifeBuoy,
  Mail,
  Receipt,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { friendlyError } from '../../lib/errors'
import { fmtDateTime } from '../../lib/format'
import {
  getEmailNotificationStats,
  listEmailNotificationLogs,
  retryEmailNotification,
} from '../../services/emailNotifications'
import Badge from '../../components/common/Badge'
import Spinner from '../../components/common/Spinner'
import Modal from '../../components/common/Modal'
import { Card } from './Sections'

const STATUS_CONFIG = {
  delivered: { label: 'Delivered', tone: 'green', icon: CheckCircle2 },
  sent: { label: 'Sent', tone: 'blue', icon: Send },
  queued: { label: 'Queued', tone: 'amber', icon: Clock },
  processing: { label: 'Processing', tone: 'blue', icon: RefreshCw },
  delivery_delayed: { label: 'Delayed', tone: 'amber', icon: Clock },
  failed: { label: 'Failed', tone: 'red', icon: XCircle },
  bounced: { label: 'Bounced', tone: 'red', icon: AlertTriangle },
  complained: { label: 'Complained', tone: 'red', icon: ShieldAlert },
}

const EVENT_LABELS = {
  ticket_created: 'Ticket Created',
  ticket_reply: 'Ticket Reply',
  ticket_status_changed: 'Status Updated',
  ticket_assigned: 'Ticket Assigned',
  ticket_resolved: 'Ticket Resolved',
  ticket_reopened: 'Ticket Reopened',
  ticket_closed: 'Ticket Closed',
  ticket_escalated: 'Ticket Escalated',
  invoice_generated: 'Invoice Generated',
  invoice_reminder: 'Invoice Reminder',
  payment_confirmation: 'Payment Confirmation',
  payment_overdue: 'Payment Overdue',
  invoice_cancelled: 'Invoice Cancelled',
}

export default function EmailNotificationsSection() {
  const { profile, can } = useAuth()
  const [stats, setStats] = useState(null)
  const [logs, setLogs] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [senderFilter, setSenderFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLog, setSelectedLog] = useState(null)
  const [retryingId, setRetryingId] = useState(null)

  const loadData = async (resetPage = false) => {
    try {
      setLoading(true)
      const targetPage = resetPage ? 1 : page
      if (resetPage) setPage(1)

      const [statsData, logsData] = await Promise.all([
        getEmailNotificationStats(profile?.workspace_id),
        listEmailNotificationLogs({
          status: statusFilter,
          senderType: senderFilter,
          search: searchTerm,
          page: targetPage,
          limit: 20,
        }),
      ])

      setStats(statsData)
      setLogs(logsData.logs || [])
      setTotalCount(logsData.total || 0)
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, senderFilter])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    loadData(true)
  }

  const handleRetry = async (logId) => {
    try {
      setRetryingId(logId)
      const res = await retryEmailNotification(logId)
      if (res.ok) {
        toast.success('Email retry successfully dispatched via Resend!')
        loadData()
      } else {
        toast.error(res.error || 'Failed to retry email delivery.')
      }
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setRetryingId(null)
    }
  }

  const totalPages = Math.ceil(totalCount / 20) || 1

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Total Sent</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">{stats?.sent ?? '—'}</p>
          <p className="mt-1 text-[11px] text-ink-400">Accepted by Resend</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Delivered</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{stats?.delivered ?? '—'}</p>
          <p className="mt-1 text-[11px] text-emerald-600">Confirmed inbox receipt</p>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Failed</p>
          <p className="mt-1 text-2xl font-bold text-red-800">{stats?.failed ?? 0}</p>
          <p className="mt-1 text-[11px] text-red-600">Temporary or API errors</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Bounced</p>
          <p className="mt-1 text-2xl font-bold text-amber-800">{stats?.bounced ?? 0}</p>
          <p className="mt-1 text-[11px] text-amber-600">Invalid / rejected inbox</p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-700">
            <LifeBuoy className="h-3.5 w-3.5" /> Support
          </div>
          <p className="mt-1 text-2xl font-bold text-blue-900">{stats?.support_count ?? '—'}</p>
          <p className="mt-1 truncate text-[11px] text-blue-600" title="support@awenueglobalsoftwaresolutions.in">
            support@awenue...
          </p>
        </div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-700">
            <Receipt className="h-3.5 w-3.5" /> Billing
          </div>
          <p className="mt-1 text-2xl font-bold text-indigo-900">{stats?.billing_count ?? '—'}</p>
          <p className="mt-1 truncate text-[11px] text-indigo-600" title="billing@awenueglobalsoftwaresolutions.in">
            billing@awenue...
          </p>
        </div>
      </div>

      {/* Main Logs Table Card */}
      <Card
        title="Email Notification History & Delivery Tracking"
        description="Comprehensive audit of all automated transactional notifications dispatched through Resend. Strict sender separation is enforced between Support and Billing."
      >
        {/* Filters Bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* Identity Filter */}
            <div className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs">
              <Filter className="h-3.5 w-3.5 text-ink-400" />
              <span className="font-medium text-ink-500">Identity:</span>
              <select
                className="bg-transparent font-medium text-ink-800 outline-none"
                value={senderFilter}
                onChange={(e) => setSenderFilter(e.target.value)}
              >
                <option value="">All Identities</option>
                <option value="support">Support (support@awenue...)</option>
                <option value="billing">Billing (billing@awenue...)</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs">
              <span className="font-medium text-ink-500">Status:</span>
              <select
                className="bg-transparent font-medium text-ink-800 outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="delivered">Delivered</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="bounced">Bounced</option>
                <option value="queued">Queued</option>
              </select>
            </div>

            <button
              onClick={() => loadData(false)}
              className="btn-ghost !p-2 text-ink-600"
              title="Refresh Logs"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                placeholder="Search recipient, subject, or Resend ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input !py-1.5 !pl-8 text-xs sm:w-64"
              />
            </div>
            <button type="submit" className="btn-primary !py-1.5 text-xs">
              Search
            </button>
          </form>
        </div>

        {/* Logs Table */}
        {loading && !logs.length ? (
          <Spinner className="py-12" />
        ) : !logs.length ? (
          <div className="py-12 text-center text-sm text-ink-500">
            No email notification logs found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold uppercase tracking-wider text-ink-600">
                <tr>
                  <th className="py-2.5 pl-3 pr-2">Status</th>
                  <th className="px-2 py-2.5">Sender</th>
                  <th className="px-2 py-2.5">Event</th>
                  <th className="px-2 py-2.5">Recipient</th>
                  <th className="px-2 py-2.5">Subject & Reference</th>
                  <th className="px-2 py-2.5">Sent At</th>
                  <th className="py-2.5 pl-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 text-ink-700">
                {logs.map((log) => {
                  const st = STATUS_CONFIG[log.status] || { label: log.status, tone: 'gray' }
                  const isFailed = log.status === 'failed' || log.status === 'bounced'

                  return (
                    <tr key={log.id} className="hover:bg-ink-50/40">
                      <td className="py-3 pl-3 pr-2 whitespace-nowrap">
                        <Badge tone={st.tone}>{st.label}</Badge>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap">
                        {log.sender_type === 'billing' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
                            <Receipt className="h-3 w-3" /> Billing
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                            <LifeBuoy className="h-3 w-3" /> Support
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap font-medium text-ink-900">
                        {EVENT_LABELS[log.event_type] || log.event_type}
                      </td>
                      <td className="px-2 py-3">
                        <div className="font-medium text-ink-900">{log.recipient_email}</div>
                        {log.recipient_name && (
                          <div className="text-[11px] text-ink-400">{log.recipient_name}</div>
                        )}
                      </td>
                      <td className="px-2 py-3 max-w-xs">
                        <div className="truncate font-medium text-ink-800" title={log.subject}>
                          {log.subject}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px]">
                          {log.ticket && (
                            <Link
                              to={`/tickets/${log.ticket.id}`}
                              className="inline-flex items-center gap-0.5 text-brand-600 hover:underline"
                            >
                              Ticket #{log.ticket.ticket_number} <ExternalLink className="h-2.5 w-2.5" />
                            </Link>
                          )}
                          {log.invoice && (
                            <Link
                              to={`/invoices/${log.invoice.id}`}
                              className="inline-flex items-center gap-0.5 text-brand-600 hover:underline"
                            >
                              Invoice #{log.invoice.invoice_number} <ExternalLink className="h-2.5 w-2.5" />
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-ink-500">
                        {fmtDateTime(log.sent_at || log.created_at)}
                      </td>
                      <td className="py-3 pl-2 pr-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="btn-ghost !p-1.5 text-ink-600"
                            title="View Details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {isFailed && can('communications.manage') && (
                            <button
                              onClick={() => handleRetry(log.id)}
                              disabled={retryingId === log.id}
                              className="btn-ghost border border-red-200 !p-1.5 !text-red-600 hover:bg-red-50"
                              title="Safe Retry Delivery"
                            >
                              <RefreshCw
                                className={`h-3.5 w-3.5 ${retryingId === log.id ? 'animate-spin' : ''}`}
                              />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-500">
          <div>
            Showing {logs.length} of {totalCount} notifications
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1 || loading}
              onClick={() => {
                setPage((p) => Math.max(1, p - 1))
                loadData(false)
              }}
              className="btn-ghost border border-ink-200 !py-1 !px-2.5 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="font-medium text-ink-700">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages || loading}
              onClick={() => {
                setPage((p) => p + 1)
                loadData(false)
              }}
              className="btn-ghost border border-ink-200 !py-1 !px-2.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </Card>

      {/* Log Details Modal */}
      {selectedLog && (
        <Modal
          open
          title={`Email Delivery Details — ${selectedLog.subject}`}
          onClose={() => setSelectedLog(null)}
          size="md"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-ink-50 p-3.5">
              <div>
                <p className="text-ink-500 font-medium">Status</p>
                <div className="mt-1">
                  <Badge tone={STATUS_CONFIG[selectedLog.status]?.tone || 'gray'}>
                    {STATUS_CONFIG[selectedLog.status]?.label || selectedLog.status}
                  </Badge>
                </div>
              </div>
              <div>
                <p className="text-ink-500 font-medium">Delivery Attempts</p>
                <p className="mt-1 font-semibold text-ink-900">{selectedLog.attempt_count || 1}</p>
              </div>
              <div>
                <p className="text-ink-500 font-medium">Sender Identity</p>
                <p className="mt-1 font-semibold text-ink-900">{selectedLog.sender_email}</p>
              </div>
              <div>
                <p className="text-ink-500 font-medium">Recipient Address</p>
                <p className="mt-1 font-semibold text-ink-900">{selectedLog.recipient_email}</p>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <p className="font-semibold text-ink-700">Resend Message ID</p>
                <p className="font-mono text-ink-600 select-all">{selectedLog.resend_email_id || 'Not assigned yet'}</p>
              </div>
              <div>
                <p className="font-semibold text-ink-700">Idempotency Key</p>
                <p className="font-mono text-ink-600 select-all">{selectedLog.idempotency_key || 'None'}</p>
              </div>
              {selectedLog.last_error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                  <p className="font-semibold">Last Recorded Error:</p>
                  <p className="mt-1 font-mono whitespace-pre-wrap">{selectedLog.last_error}</p>
                </div>
              )}
              {selectedLog.delivered_at && (
                <div>
                  <p className="font-semibold text-emerald-700">Delivered Timestamp:</p>
                  <p className="text-ink-600">{fmtDateTime(selectedLog.delivered_at)}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-ink-100 pt-3">
              {(selectedLog.status === 'failed' || selectedLog.status === 'bounced') && can('communications.manage') && (
                <button
                  onClick={() => {
                    handleRetry(selectedLog.id)
                    setSelectedLog(null)
                  }}
                  className="btn-primary !py-1.5"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry Delivery Now
                </button>
              )}
              <button onClick={() => setSelectedLog(null)} className="btn-ghost">
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
