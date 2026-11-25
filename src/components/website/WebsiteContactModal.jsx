import { useEffect, useState } from 'react'
import { Calendar, CheckCircle2, Clock, Eye, KanbanSquare, Mail, Phone, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import Modal from '../common/Modal'
import Badge from '../common/Badge'
import ConfirmDialog from '../common/ConfirmDialog'
import ConvertLeadModal from '../../pages/Leads/ConvertLeadModal'
import { fmtDateTime } from '../../lib/format'
import {
  CONTACT_STATUSES,
  WEBSITE_STATUS_TONE,
  formatWebsiteStatus,
} from '../../services/website'
import { updateWebsiteQueryDirectly, deleteWebsiteQueryDirectly } from '../../services/websiteSync'
import { supabase } from '../../lib/supabase'

export default function WebsiteContactModal({ message, profiles = [], canEdit, onClose, onSaved, onDeleted }) {
  const { profile } = useAuth()
  const [status, setStatus] = useState('NEW')
  const [assignedTo, setAssignedTo] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [convertingLead, setConvertingLead] = useState(null)
  const [loadingConvert, setLoadingConvert] = useState(false)

  useEffect(() => {
    if (!message) return
    setStatus(message.status || 'NEW')
    setAssignedTo(message.assignedTo || '')
    setInternalNotes(message.internalNotes || '')
  }, [message])

  if (!message) return null

  const phoneDisplay = [message.countryCode, message.phone].filter(Boolean).join(' ')

  const handleDelete = async () => {
    setSaving(true)
    try {
      await deleteWebsiteQueryDirectly({ type: 'contacts', item: message }, profile)
      toast.success('Contact query deleted from CRM Database.')
      onDeleted?.(message.id)
      setConfirmDelete(false)
      onClose()
    } catch (err) {
      toast.error(err?.message || 'Failed to delete query.')
    } finally {
      setSaving(false)
    }
  }

  const handleStartConvert = async () => {
    setLoadingConvert(true)
    try {
      let lead = null
      if (message.lead_id) {
        const { data } = await supabase.from('leads').select('*').eq('id', message.lead_id).maybeSingle()
        lead = data
      }
      if (!lead && message.email) {
        const { data } = await supabase.from('leads').select('*').ilike('email', message.email).maybeSingle()
        lead = data
      }
      if (!lead) {
        // Fallback construct lead object
        lead = {
          id: message.lead_id || null,
          first_name: message.fullName || 'Website Contact',
          last_name: '',
          email: message.email,
          phone: phoneDisplay,
          interested_service: message.subject || 'Website Query',
          notes: message.message,
          source: 'website',
          status: 'new',
        }
      }
      setConvertingLead(lead)
    } catch (err) {
      toast.error('Could not prepare lead for conversion.')
    } finally {
      setLoadingConvert(false)
    }
  }

  const persistUpdate = async (nextStatus, closeAfter = true) => {
    setSaving(true)
    try {
      const payload = {
        status: nextStatus,
        assignedTo: assignedTo.trim() || null,
        internalNotes: internalNotes.trim() || null,
      }
      await updateWebsiteQueryDirectly({
        type: 'contacts',
        item: message,
        status: nextStatus,
        assignedTo: payload.assignedTo,
        internalNotes: payload.internalNotes,
      }, profile)
      setStatus(nextStatus)
      toast.success(`Message marked as ${formatWebsiteStatus(nextStatus)} (Saved to CRM DB)`)
      onSaved({ ...message, ...payload, updatedAt: new Date().toISOString() })
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

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                  className="btn-ghost !p-2 text-red-600 hover:!bg-red-50 hover:text-red-700"
                  title="Delete from Database"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  <span className="text-xs">Delete Query</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartConvert}
                disabled={saving || loadingConvert}
                className="btn-outline !py-1.5 text-xs text-brand-700 hover:bg-brand-50"
              >
                <KanbanSquare className="h-3.5 w-3.5" aria-hidden />
                {loadingConvert ? 'Opening…' : 'Convert to Deal'}
              </button>
              <button type="button" className="btn-outline" onClick={onClose}>Close</button>
              {canEdit && (
                <button type="submit" className="btn-primary" disabled={saving}>
                  <Save className="h-4 w-4" aria-hidden />
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Contact Query?"
        message={`Are you sure you want to delete query from ${message.fullName || message.email}? This will remove it from the CRM Database.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(false)}
      />

      {convertingLead && (
        <ConvertLeadModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
          onDone={() => {
            setConvertingLead(null)
            persistUpdate('RESOLVED', false)
            toast.success('Converted to Sales Pipeline deal!')
          }}
        />
      )}
    </Modal>
  )
}
