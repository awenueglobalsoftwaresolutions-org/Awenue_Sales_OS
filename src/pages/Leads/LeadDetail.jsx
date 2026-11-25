import { mustAffect } from '../../lib/query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRightLeft, ChevronLeft, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { deleteLead, getLead, logStatusChange, updateLead } from '../../services/leads'
import { LEAD_SOURCES, LEAD_STATUSES, PRIORITIES, PRIORITY_TONE, STATUS_TONE, labelOf } from '../../constants/options'
import { friendlyError } from '../../lib/errors'
import { fmtDate, fmtMoney, fullName, leadCode, location } from '../../lib/format'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'
import EmptyState from '../../components/common/EmptyState'
import InfoGrid from '../../components/common/InfoGrid'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import ActivityTimeline from '../../components/common/ActivityTimeline'
import RecordTasks from '../../components/common/RecordTasks'
import RecordInvoices from '../../components/invoices/RecordInvoices'
import RecordEmails from '../../components/email/RecordEmails'
import { fromLead } from '../../lib/invoicePrefill'
import LeadForm from '../../components/forms/LeadForm'
import ConvertLeadModal from './ConvertLeadModal'
import { supabase } from '../../lib/supabase'

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile, can } = useAuth()
  const lead = useFetch(() => getLead(id), [id])
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [converting, setConverting] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)

  if (lead.loading && !lead.data) return <Spinner className="py-20" />
  if (lead.error) return <ErrorState message={lead.error} onRetry={lead.reload} />
  if (!lead.data) return <EmptyState title="Lead not found" description="It may have been deleted, or it isn't assigned to you." action={<Link className="btn-primary" to="/leads">Back to leads</Link>} />
  const l = lead.data
  const converted = l.status === 'converted'

  const refresh = () => { lead.reload(); setTimelineKey((k) => k + 1) }
  const save = async (values) => { await updateLead(l, values, profile); toast.success('Lead updated'); setEditing(false); refresh() }
  const remove = async () => { await deleteLead(id); toast.success('Lead deleted'); navigate('/leads', { replace: true }) }
  const changeStatus = async (status) => {
    if (status === l.status) return
    setStatusBusy(true)
    try {
      await mustAffect(supabase.from('leads').update({ status }).eq('id', id))
      await logStatusChange(l, status, profile)
      toast.success('Status updated'); refresh()
    } catch (e) { toast.error(friendlyError(e)) } finally { setStatusBusy(false) }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 animate-fade-up">
      <Link to="/leads" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Leads</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{fullName(l)}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <span>{leadCode(l.lead_number)}</span>{l.job_title && <span>· {l.job_title}</span>}
            <Badge tone={STATUS_TONE[l.status]}>{labelOf(LEAD_STATUSES, l.status)}</Badge>
            <Badge tone={PRIORITY_TONE[l.priority]}>{labelOf(PRIORITIES, l.priority)} priority</Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {l.status === 'qualified' && can('leads.edit') && can('deals.create') && <button className="btn-primary" onClick={() => setConverting(true)}><ArrowRightLeft className="h-4 w-4" />Convert to deal</button>}
          {can('leads.edit') && <button className="btn-outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</button>}
          {can('leads.delete') && <button className="btn-outline border-red-200 !text-red-600 hover:bg-red-50" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete</button>}
        </div>
      </div>

      {converted && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          Converted {fmtDate(l.converted_at)}. A <Link className="font-semibold underline" to={l.converted_deal_id ? `/deals/${l.converted_deal_id}` : '/deals'}>deal</Link> was created{l.converted_contact_id && <> and the contact is <Link className="font-semibold underline" to={`/contacts/${l.converted_contact_id}`}>on file</Link></>}.
        </p>
      )}

      <section className="surface-card p-5">
        <div className="mb-4 flex items-center gap-3 border-b border-ink-100 pb-4">
          <label htmlFor="status" className="text-sm font-medium text-ink-700">Status</label>
          <select id="status" className="input !w-auto" value={l.status} disabled={converted || statusBusy || !can('leads.edit')} onChange={(e) => changeStatus(e.target.value)}>
            {LEAD_STATUSES.filter((s) => s.value !== 'converted' || converted).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <InfoGrid items={[
          ['Email', l.email && <a className="text-brand-600 hover:underline" href={`mailto:${l.email}`}>{l.email}</a>],
          ['Phone', l.phone],
          ['Organization', l.organization && <Link className="text-brand-600 hover:underline" to={`/organizations/${l.organization.id}`}>{l.organization.name}</Link>],
          ['Website', l.website], ['Industry', l.industry], ['Location', location(l)],
          ['Source', l.source && labelOf(LEAD_SOURCES, l.source)], ['Interested service', l.interested_service],
          ['Estimated budget', l.estimated_budget != null && fmtMoney(l.estimated_budget)],
          ['Assigned to', l.assignee?.full_name || 'Unassigned'], ['Created', fmtDate(l.created_at)], ['Last updated', fmtDate(l.updated_at)],
        ]} />
        {l.notes && <div className="mt-4 border-t border-ink-100 pt-4"><p className="text-xs font-medium text-ink-500">Internal notes</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{l.notes}</p></div>}
      </section>

      {can('invoices.view') && <RecordInvoices column="lead_id" id={id} prefill={fromLead(l)} />}
      {can('communications.view') && <RecordEmails column="lead_id" id={id} context={{ lead: l }} />}
      <RecordTasks column="lead_id" id={id} />
      <ActivityTimeline key={timelineKey} column="lead_id" id={id} title="Lead history" />

      <Modal open={editing} title="Edit lead" onClose={() => setEditing(false)} size="lg"><LeadForm initial={l} onSubmit={save} onCancel={() => setEditing(false)} /></Modal>
      <ConfirmDialog open={deleting} title="Delete lead?" message={`${fullName(l)} and their activity history will be permanently deleted.`} onConfirm={remove} onClose={() => setDeleting(false)} />
      {converting && <ConvertLeadModal lead={l} onClose={() => setConverting(false)} onDone={() => { setConverting(false); refresh() }} />}
    </div>
  )
}
