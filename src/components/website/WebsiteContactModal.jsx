import { useEffect, useState } from 'react'
import { Calendar, CheckCircle2, Clock, Eye, Mail, Phone, Save } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '../common/Modal'
import Badge from '../common/Badge'
import { fmtDateTime } from '../../lib/format'
import {
  CONTACT_STATUSES,
  WEBSITE_STATUS_TONE,
  formatWebsiteStatus,
  updateWebsiteContactMessage,
} from '../../services/website'

export default function WebsiteContactModal({ message, profiles = [], canEdit, onClose, onSaved }) {
  const [status, setStatus] = useState('NEW')
  const [assignedTo, setAssignedTo] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!message) return
    setStatus(message.status || 'NEW')
    setAssignedTo(message.assignedTo || '')
    setInternalNotes(message.internalNotes || '')
  }, [message])

  if (!message) return null

  const phoneDisplay = [message.countryCode, message.phone].filter(Boolean).join(' ')

  const persistUpdate = async (nextStatus, closeAfter = true) => {
    setSaving(true)
    try {
      const payload = {
        status: nextStatus,
        assignedTo: assignedTo.trim() || null,
        internalNotes: internalNotes.trim() || null,
      }
      const res = await updateWebsiteContactMessage(message.id, payload)
      setStatus(nextStatus)
      toast.success(`Message marked as ${formatWebsiteStatus(nextStatus)}`)
      onSaved(res?.data || { ...message, ...payload, updatedAt: new Date().toISOString() })
      if (closeAfter) onClose()
    } catch (err) {
      toast.error(err?.message || 'Could not update contact message.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(message)}
      onClose={onClose}
      size="lg"
      title={`${message.messageNumber || 'Message'} — ${message.fullName || 'Contact Query'}`}
    >
      <div className="space-y-5">
        {/* Sender Info */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
          <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm text-ink-700">
            {message.email && (
              <a href={`mailto:${message.email}`} className="inline-flex min-w-0 items-center gap-1.5 break-all font-medium text-brand-600 hover:underline">
                <Mail className="h-4 w-4 shrink-0" aria-hidden />{message.email}
              </a>
            )}
            {phoneDisplay && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Phone className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />{phoneDisplay}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {message.subject && <Badge tone="indigo">{message.subject}</Badge>}
            <Badge tone={WEBSITE_STATUS_TONE[message.status] || 'gray'}>
              {formatWebsiteStatus(message.status)}
            </Badge>
          </div>
        </div>

        {/* Full Message */}
        <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Message</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
            {message.message || '—'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-ink-400">
          <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" aria-hidden />Received: {fmtDateTime(message.createdAt)}</span>
          {message.updatedAt && <span>Updated: {fmtDateTime(message.updatedAt)}</span>}
        </div>

        {/* Quick Status Actions */}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-100 bg-ink-50/40 p-3">
            <span className="mr-1 text-xs font-semibold text-ink-500">Quick Actions:</span>
            <button
              type="button"
              disabled={saving || status === 'READ'}
              onClick={() => persistUpdate('READ', false)}
              className="btn-outline !px-3 !py-1.5 text-xs"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden />Mark Read
            </button>
            <button
              type="button"
              disabled={saving || status === 'IN_PROGRESS'}
              onClick={() => persistUpdate('IN_PROGRESS', false)}
              className="btn-outline !px-3 !py-1.5 text-xs"
            >
              <Clock className="h-3.5 w-3.5" aria-hidden />In Progress
            </button>
            <button
              type="button"
              disabled={saving || status === 'RESOLVED'}
              onClick={() => persistUpdate('RESOLVED', false)}
              className="btn-outline !px-3 !py-1.5 text-xs text-emerald-700 hover:bg-emerald-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Resolve
            </button>
          </div>
        )}

        {/* Management Form */}
        <form
          onSubmit={(e) => { e.preventDefault(); persistUpdate(status, true) }}
          className="space-y-4 border-t border-ink-100 pt-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="contact-status">Status</label>
              <select
                id="contact-status"
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={!canEdit || saving}
              >
                {CONTACT_STATUSES.map((s) => (
                  <option key={s} value={s}>{formatWebsiteStatus(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="contact-assigned">Assigned To</label>
              <input
                id="contact-assigned"
                list="crm-contact-team-members"
                className="input"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="Team member name or email"
                disabled={!canEdit || saving}
              />
              <datalist id="crm-contact-team-members">
                {profiles.map((p) => (
                  <option key={p.id} value={p.full_name || p.email} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="contact-notes">Internal Notes</label>
            <textarea
              id="contact-notes"
              rows={3}
              className="input"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Add follow-up notes or resolution details…"
              disabled={!canEdit || saving}
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Close</button>
            {canEdit && (
              <button type="submit" className="btn-primary" disabled={saving}>
                <Save className="h-4 w-4" aria-hidden />
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            )}
          </div>
        </form>
      </div>
    </Modal>
  )
}
