import { useEffect, useState } from 'react'
import { Building2, Calendar, ExternalLink, Globe, Mail, Phone, Save, Tag } from 'lucide-react'
import { toast } from 'sonner'
import Modal from '../common/Modal'
import Badge from '../common/Badge'
import { fmtDateTime } from '../../lib/format'
import {
  ENQUIRY_STATUSES,
  WEBSITE_STATUS_TONE,
  formatWebsiteStatus,
  updateWebsiteEnquiry,
} from '../../services/website'

function DetailBlock({ label, value }) {
  if (!value) return null
  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800">{value}</p>
    </div>
  )
}

export default function WebsiteEnquiryModal({ enquiry, profiles = [], canEdit, onClose, onSaved }) {
  const [status, setStatus] = useState('NEW')
  const [assignedTo, setAssignedTo] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!enquiry) return
    setStatus(enquiry.status || 'NEW')
    setAssignedTo(enquiry.assignedTo || '')
    setInternalNotes(enquiry.internalNotes || '')
  }, [enquiry])

  if (!enquiry) return null

  const phoneDisplay = [enquiry.countryCode, enquiry.phone].filter(Boolean).join(' ')
  const services = Array.isArray(enquiry.selectedServices) ? enquiry.selectedServices : []
  const subServices = Array.isArray(enquiry.selectedSubServices) ? enquiry.selectedSubServices : []

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await updateWebsiteEnquiry(enquiry.id, {
        status,
        assignedTo: assignedTo.trim() || null,
        internalNotes: internalNotes.trim() || null,
      })
      toast.success('Website lead updated')
      onSaved(res?.data || { ...enquiry, status, assignedTo: assignedTo.trim(), internalNotes: internalNotes.trim(), updatedAt: new Date().toISOString() })
      onClose()
    } catch (err) {
      toast.error(err?.message || 'Could not update lead.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={Boolean(enquiry)}
      onClose={onClose}
      size="lg"
      title={`${enquiry.enquiryNumber || 'Enquiry'} — ${enquiry.fullName || 'Website Lead'}`}
    >
      <div className="space-y-5">
        {/* Top Meta */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
          <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm text-ink-700">
            {enquiry.email && (
              <a href={`mailto:${enquiry.email}`} className="inline-flex min-w-0 items-center gap-1.5 break-all font-medium text-brand-600 hover:underline">
                <Mail className="h-4 w-4 shrink-0" aria-hidden />{enquiry.email}
              </a>
            )}
            {phoneDisplay && (
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Phone className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />{phoneDisplay}
              </span>
            )}
            {enquiry.companyName && (
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Building2 className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />{enquiry.companyName}
              </span>
            )}
            {enquiry.websiteUrl && (
              <a href={enquiry.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                <Globe className="h-4 w-4 shrink-0" aria-hidden />Website<ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
              </a>
            )}
          </div>
          <Badge tone={WEBSITE_STATUS_TONE[enquiry.status] || 'gray'}>
            {formatWebsiteStatus(enquiry.status)}
          </Badge>
        </div>

        {/* Key Specs Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-ink-100 p-3">
            <p className="text-[11px] font-semibold uppercase text-ink-400">Budget</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">{enquiry.estimatedBudget || '—'}</p>
          </div>
          <div className="rounded-xl border border-ink-100 p-3">
            <p className="text-[11px] font-semibold uppercase text-ink-400">Start Timeline</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">{enquiry.projectStartTimeline || '—'}</p>
          </div>
          <div className="rounded-xl border border-ink-100 p-3">
            <p className="text-[11px] font-semibold uppercase text-ink-400">Completion</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">{enquiry.expectedCompletion || '—'}</p>
          </div>
          <div className="rounded-xl border border-ink-100 p-3">
            <p className="text-[11px] font-semibold uppercase text-ink-400">Lead Source</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">{enquiry.leadSource || '—'}</p>
          </div>
        </div>

        {/* Selected Services */}
        {(services.length > 0 || subServices.length > 0) && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-500">Selected Services & Sub-Services</p>
            <div className="flex flex-wrap gap-1.5">
              {services.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">
                  <Tag className="h-3 w-3" aria-hidden />{s}
                </span>
              ))}
              {subServices.map((s) => (
                <span key={s} className="inline-flex items-center rounded-lg bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-700">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Project Scope Details */}
        <div className="grid gap-3 sm:grid-cols-2">
          <DetailBlock label="Project Name" value={enquiry.projectName} />
          <DetailBlock label="Custom Requirement" value={enquiry.customRequirement} />
          <DetailBlock label="Project Description" value={enquiry.projectDescription} />
          <DetailBlock label="Project Goals" value={enquiry.projectGoals} />
          <DetailBlock label="Required Features" value={enquiry.requiredFeatures} />
          <DetailBlock label="Additional Comments" value={enquiry.additionalComments} />
        </div>

        {enquiry.referenceUrl && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
            <span className="font-semibold text-ink-500">Reference URL:</span>
            <a href={enquiry.referenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-brand-600 hover:underline">
              {enquiry.referenceUrl}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            </a>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4 text-xs text-ink-400">
          <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" aria-hidden />Submitted: {fmtDateTime(enquiry.createdAt)}</span>
          {enquiry.updatedAt && <span>Updated: {fmtDateTime(enquiry.updatedAt)}</span>}
        </div>

        {/* Management Form */}
        <form onSubmit={save} className="space-y-4 border-t border-ink-100 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="enquiry-status">Status</label>
              <select
                id="enquiry-status"
                className="input"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={!canEdit || saving}
              >
                {ENQUIRY_STATUSES.map((s) => (
                  <option key={s} value={s}>{formatWebsiteStatus(s)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="enquiry-assigned">Assigned To</label>
              <input
                id="enquiry-assigned"
                list="crm-team-members"
                className="input"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="Team member name or email"
                disabled={!canEdit || saving}
              />
              <datalist id="crm-team-members">
                {profiles.map((p) => (
                  <option key={p.id} value={p.full_name || p.email} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <label className="label" htmlFor="enquiry-notes">Internal Notes</label>
            <textarea
              id="enquiry-notes"
              rows={3}
              className="input"
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="Add qualification notes, call summary, or next steps…"
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
