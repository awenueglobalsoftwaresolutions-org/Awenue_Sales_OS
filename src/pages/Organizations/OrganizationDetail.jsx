import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ExternalLink, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../contexts/AuthContext'
import { deleteOrganization, getOrganization, updateOrganization } from '../../services/organizations'
import { listContactsByOrganization } from '../../services/contacts'
import { listDealsByOrganization, listLeadsByOrganization } from '../../services/leads'
import { labelOf, COMPANY_SIZES, LEAD_STATUSES } from '../../constants/options'
import { fmtDate, fmtMoney, fullName, leadCode, location } from '../../lib/format'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'
import EmptyState from '../../components/common/EmptyState'
import InfoGrid from '../../components/common/InfoGrid'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import RelatedSection from '../../components/common/RelatedSection'
import ActivityTimeline from '../../components/common/ActivityTimeline'
import RecordTasks from '../../components/common/RecordTasks'
import OrganizationForm from '../../components/forms/OrganizationForm'
import OrgFiles from '../../components/files/OrgFiles'

export default function OrganizationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const org = useFetch(() => getOrganization(id), [id])
  const contacts = useFetch(() => listContactsByOrganization(id), [id])
  const leads = useFetch(() => listLeadsByOrganization(id), [id])
  const deals = useFetch(() => listDealsByOrganization(id), [id])
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') === 'files' ? 'files' : 'overview'
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (org.loading && !org.data) return <Spinner className="py-20" />
  if (org.error) return <ErrorState message={org.error} onRetry={org.reload} />
  if (!org.data) return <EmptyState title="Organization not found" description="It may have been deleted." action={<Link className="btn-primary" to="/organizations">Back to organizations</Link>} />
  const o = org.data

  const save = async (values) => { await updateOrganization(id, values); toast.success('Organization updated'); setEditing(false); org.reload() }
  const remove = async () => { await deleteOrganization(id); toast.success('Organization deleted'); navigate('/organizations', { replace: true }) }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/organizations" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Organizations</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{o.name}</h1><p className="text-sm text-ink-500">{[o.industry, location(o) !== '—' && location(o)].filter(Boolean).join(' · ')}</p></div>
        <div className="flex gap-2">
          {can('organizations.edit') && <button className="btn-ghost border border-ink-300" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</button>}
          {can('organizations.delete') && <button className="btn-ghost border border-ink-300 !text-red-600" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete</button>}
        </div>
      </div>

      <div role="tablist" aria-label="Organization sections" className="flex gap-1 border-b border-ink-100">
        {[['overview', 'Overview'], ['files', 'Files']].map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} onClick={() => setSp(key === 'files' ? { tab: 'files' } : {}, { replace: true })}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-500 hover:text-ink-900'}`}>{label}</button>
        ))}
      </div>
      {tab === 'files' ? <OrgFiles orgId={id} /> : (
      <>
      <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
        <InfoGrid items={[
          ['Website', o.website && <a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={/^https?:/.test(o.website) ? o.website : `https://${o.website}`} target="_blank" rel="noreferrer">{o.website}<ExternalLink className="h-3 w-3" /></a>],
          ['LinkedIn', o.linkedin_url && <a className="inline-flex items-center gap-1 text-brand-600 hover:underline" href={o.linkedin_url} target="_blank" rel="noreferrer">Profile<ExternalLink className="h-3 w-3" /></a>],
          ['Company size', o.company_size && labelOf(COMPANY_SIZES, o.company_size)],
          ['Industry', o.industry], ['Location', location(o)], ['Added', fmtDate(o.created_at)],
          ['Address', o.address],
        ]} />
        {o.description && <p className="mt-4 whitespace-pre-wrap border-t border-ink-100 pt-4 text-sm text-ink-700">{o.description}</p>}
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <RelatedSection title="Contacts" state={contacts} empty="No contacts yet.">
          {(c) => <li key={c.id} className="py-2"><Link className="text-sm font-medium text-brand-600 hover:underline" to={`/contacts/${c.id}`}>{fullName(c)}</Link><p className="text-xs text-ink-500">{c.designation || c.email || '—'}</p></li>}
        </RelatedSection>
        <RelatedSection title="Leads" state={leads} empty="No leads yet.">
          {(l) => <li key={l.id} className="flex items-center justify-between gap-2 py-2"><Link className="text-sm font-medium text-brand-600 hover:underline" to={`/leads/${l.id}`}>{fullName(l)} <span className="text-xs font-normal text-ink-500">{leadCode(l.lead_number)}</span></Link><Badge>{labelOf(LEAD_STATUSES, l.status)}</Badge></li>}
        </RelatedSection>
        <RelatedSection title="Deals" state={deals} empty="No deals yet.">
          {(d) => <li key={d.id} className="py-2"><Link className="text-sm font-medium text-brand-600 hover:underline" to={`/deals/${d.id}`}>{d.title}</Link><p className="text-xs text-ink-500">{fmtMoney(d.value, d.currency)}</p></li>}
        </RelatedSection>
      </div>

      <RecordTasks column="organization_id" id={id} />
      <ActivityTimeline column="organization_id" id={id} />
      </>
      )}

      <Modal open={editing} title="Edit organization" onClose={() => setEditing(false)}>
        <OrganizationForm initial={o} onSubmit={save} onCancel={() => setEditing(false)} />
      </Modal>
      <ConfirmDialog open={deleting} title="Delete organization?" message={`“${o.name}” will be permanently deleted. This is blocked while it still has contacts, leads or deals.`} onConfirm={remove} onClose={() => setDeleting(false)} />
    </div>
  )
}
