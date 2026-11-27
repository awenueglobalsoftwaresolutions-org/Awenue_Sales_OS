import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../contexts/AuthContext'
import { deleteDeal, getDeal, moveDeal, updateDeal } from '../../services/deals'
import { DEAL_STAGES, STAGE_TONE, isClosedStage, labelOf } from '../../constants/options'
import { friendlyError } from '../../lib/errors'
import { fmtDate, fmtDay, fmtMoney, fullName, leadCode } from '../../lib/format'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'
import EmptyState from '../../components/common/EmptyState'
import InfoGrid from '../../components/common/InfoGrid'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import ActivityTimeline from '../../components/common/ActivityTimeline'
import ConvertDealModal from '../../components/projects/ConvertDealModal'
import { getProjectForDeal } from '../../services/projects'
import RecordTasks from '../../components/common/RecordTasks'
import RecordInvoices from '../../components/invoices/RecordInvoices'
import RecordEmails from '../../components/email/RecordEmails'
import { fromDeal } from '../../lib/invoicePrefill'
import DealForm from '../../components/forms/DealForm'
import LostReasonModal from './LostReasonModal'

export default function DealDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const deal = useFetch(() => getDeal(id), [id])
  const linkedProject = useFetch(() => getProjectForDeal(id), [id])
  const [converting, setConverting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [losing, setLosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [timelineKey, setTimelineKey] = useState(0)

  if (deal.loading && !deal.data) return <Spinner className="py-20" />
  if (deal.error) return <ErrorState message={deal.error} onRetry={deal.reload} />
  if (!deal.data) return <EmptyState title="Deal not found" description="It may have been deleted, or it isn't assigned to you." action={<Link className="btn-primary" to="/deals">Back to deals</Link>} />
  const d = deal.data
  const closed = isClosedStage(d.stage)

  const refresh = () => { deal.reload(); setTimelineKey((k) => k + 1) }
  const save = async (values) => { await updateDeal(id, values); toast.success('Deal updated'); setEditing(false); refresh() }
  const remove = async () => { await deleteDeal(id); toast.success('Deal deleted'); navigate('/deals', { replace: true }) }
  const changeStage = async (stage, reason) => {
    if (stage === d.stage) return
    if (stage === 'lost' && reason === undefined) { setLosing(true); return }
    setBusy(true)
    try { await moveDeal(d, stage, reason); toast.success(`Moved to ${labelOf(DEAL_STAGES, stage)}`); refresh() }
    catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 animate-fade-up">
      <Link to="/deals" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Deals</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{d.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            <span className="font-semibold text-ink-900">{fmtMoney(d.value, d.currency)}</span>
            <Badge tone={STAGE_TONE[d.stage]}>{labelOf(DEAL_STAGES, d.stage)}</Badge>
            {closed && <Badge>Closed</Badge>}
          </p>
        </div>
        <div className="flex gap-2">
          {linkedProject.data ? <Link to={`/projects/${linkedProject.data.id}`} className="btn-outline">Project PRJ-{String(linkedProject.data.project_number).padStart(4, '0')}</Link>
            : can('projects.create') && d.organization_id && <button className="btn-outline" onClick={() => setConverting(true)}>Convert to project</button>}
          {can('deals.edit') && <button className="btn-outline" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</button>}
          {can('deals.delete') && <button className="btn-outline border-red-200 !text-red-600 hover:bg-red-50" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete</button>}
        </div>
      </div>

      <section className="surface-card p-5">
        <div className="mb-4 flex items-center gap-3 border-b border-ink-100 pb-4">
          <label htmlFor="stage" className="text-sm font-medium text-ink-700">Stage</label>
          <select id="stage" className="input !w-auto" value={d.stage} disabled={busy || !can('deals.edit')} onChange={(e) => changeStage(e.target.value)}>
            {DEAL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <InfoGrid items={[
          ['Organization', d.organization && <Link className="text-brand-600 hover:underline" to={`/organizations/${d.organization.id}`}>{d.organization.name}</Link>],
          ['Primary contact', d.contact && <Link className="text-brand-600 hover:underline" to={`/contacts/${d.contact.id}`}>{fullName(d.contact)}</Link>],
          ['Associated lead', d.lead && <Link className="text-brand-600 hover:underline" to={`/leads/${d.lead.id}`}>{leadCode(d.lead.lead_number)} · {fullName(d.lead)}</Link>],
          ['Service', d.interested_service], ['Probability', `${d.probability}%`], ['Expected closing', fmtDay(d.expected_close_date)],
          ['Salesperson', d.assignee?.full_name || 'Unassigned'], ['Created', fmtDate(d.created_at)], ['Last updated', fmtDate(d.updated_at)],
          d.won_at && ['Won on', fmtDate(d.won_at)], d.lost_at && ['Lost on', fmtDate(d.lost_at)], d.lost_reason && ['Lost reason', d.lost_reason],
        ].filter(Boolean)} />
        {d.description && <div className="mt-4 border-t border-ink-100 pt-4"><p className="text-xs font-medium text-ink-500">Description</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{d.description}</p></div>}
        {d.notes && <div className="mt-4 border-t border-ink-100 pt-4"><p className="text-xs font-medium text-ink-500">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm text-ink-700">{d.notes}</p></div>}
      </section>

      {can('invoices.view') && <RecordInvoices column="deal_id" id={id} prefill={fromDeal(d)} />}
      {can('communications.view') && <RecordEmails column="deal_id" id={id} context={{ deal: d, contact: d.contact, organization: d.organization }} />}
      <RecordTasks column="deal_id" id={id} />
      <ActivityTimeline key={timelineKey} column="deal_id" id={id} title="Deal history" />

      {converting && <ConvertDealModal deal={d} onClose={() => setConverting(false)} />}
      <Modal open={editing} title="Edit deal" onClose={() => setEditing(false)} size="lg"><DealForm initial={d} onSubmit={save} onCancel={() => setEditing(false)} /></Modal>
      <ConfirmDialog open={deleting} title="Delete deal?" message={`“${d.title}” and its tasks and history will be permanently deleted.`} onConfirm={remove} onClose={() => setDeleting(false)} />
      {losing && <LostReasonModal deal={d} onClose={() => setLosing(false)} onSubmit={async (reason) => { await moveDeal(d, 'lost', reason); toast.success('Moved to Lost'); setLosing(false); refresh() }} />}
    </div>
  )
}
