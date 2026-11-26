import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { friendlyError } from '../../lib/errors'
import { fmtDateTime } from '../../lib/format'
import { getTicket, listTicketEvents, TICKET_CATEGORIES, TICKET_STATUSES, updateTicket, PRIORITY_OPTIONS } from '../../services/projects'
import { listProfiles } from '../../services/lookups'
import Modal from '../../components/common/Modal'
import Badge from '../../components/common/Badge'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'

const label = (list, v) => list.find((x) => x.value === v)?.label || v

// Full ticket: details, status and assignment controls, resolution, and its history.
export default function TicketDetail({ ticketId, onClose, onChanged }) {
  const { profile, can } = useAuth()
  const ticket = useFetch(() => getTicket(ticketId), [ticketId])
  const events = useFetch(() => listTicketEvents(ticketId), [ticketId])
  const users = useFetch(listProfiles, [])
  const [resolution, setResolution] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (patch, msg) => {
    setBusy(true)
    try { await updateTicket(ticketId, patch); toast.success(msg); ticket.reload(); events.reload(); onChanged?.() }
    catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  const t = ticket.data
  const closed = t?.status === 'closed'
  return (
    <Modal open title={t ? `TKT-${String(t.ticket_number).padStart(4, '0')}` : 'Ticket'} onClose={onClose} size="lg">
      {ticket.loading && !t ? <Spinner className="py-10" /> : ticket.error ? <ErrorState message={ticket.error} onRetry={ticket.reload} /> : !t ? null : (
        <div className="space-y-5">
          <div>
            <h3 className="text-lg font-semibold text-ink-900">{t.subject}</h3>
            <p className="mt-1 text-xs text-ink-500">{t.organization?.name} · {t.project?.name} · raised by {t.creator?.full_name || 'someone'} on {fmtDateTime(t.created_at)}</p>
            <div className="mt-2 flex flex-wrap gap-2"><Badge tone="blue">{label(TICKET_CATEGORIES, t.category)}</Badge><Badge tone={t.priority === 'urgent' ? 'red' : t.priority === 'high' ? 'amber' : 'gray'}>{label(PRIORITY_OPTIONS, t.priority)}</Badge></div>
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-ink-50 p-3 text-sm text-ink-800">{t.description}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Status</span>
              <select className="input" value={t.status} disabled={!can('tickets.edit') || busy || closed} onChange={(e) => save({ status: e.target.value }, 'Status updated')}>
                {TICKET_STATUSES.filter((s) => s.value !== 'closed' || can('tickets.approve')).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></label>
            <label className="block"><span className="label">Assigned to</span>
              <select className="input" value={t.assigned_to || ''} disabled={!can('tickets.assign') || busy || closed} onChange={(e) => save({ assigned_to: e.target.value || null }, 'Assignee updated')}>
                <option value="">Unassigned</option>{(users.data || []).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.email}</option>)}</select></label>
          </div>

          {t.resolution ? (
            <div className="rounded-xl bg-brand-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Resolution</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink-900">{t.resolution}</p><p className="mt-1 text-xs text-ink-500">Resolved {fmtDateTime(t.resolved_at)}</p></div>
          ) : can('tickets.edit') && !closed && (
            <div className="space-y-2">
              <label className="block"><span className="label">Resolution</span><textarea rows={3} className="input" value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="What was changed or fixed" /></label>
              <button className="btn-primary" disabled={busy || !resolution.trim()} onClick={() => save({ status: 'resolved', resolution: resolution.trim() }, 'Ticket resolved')}>Mark as resolved</button>
            </div>)}
          {t.status === 'resolved' && can('tickets.approve') && <button className="btn-outline" disabled={busy} onClick={() => save({ status: 'closed' }, 'Ticket closed')}>Close ticket</button>}
          {closed && <p className="text-sm text-ink-500">Closed {fmtDateTime(t.closed_at)}. History is kept for reference.</p>}

          <div>
            <p className="mb-2 text-sm font-semibold text-ink-900">History</p>
            <ol className="space-y-2 border-l-2 border-ink-100 pl-4">
              {(events.data || []).map((e) => (
                <li key={e.id} className="text-sm"><p className="text-ink-900">{e.description}</p><p className="text-xs text-ink-500">{e.actor?.full_name || 'System'} · {fmtDateTime(e.created_at)}</p></li>))}
            </ol>
          </div>
        </div>)}
    </Modal>)
}
