import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useFetch } from '../../hooks/useFetch'
import { useAuth } from '../../contexts/AuthContext'
import { deleteContact, getContact, listDealsByContact, updateContact } from '../../services/contacts'
import { fmtDate, fmtMoney, fullName } from '../../lib/format'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'
import EmptyState from '../../components/common/EmptyState'
import InfoGrid from '../../components/common/InfoGrid'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import RelatedSection from '../../components/common/RelatedSection'
import ActivityTimeline from '../../components/common/ActivityTimeline'
import RecordTasks from '../../components/common/RecordTasks'
import ContactForm from '../../components/forms/ContactForm'

export default function ContactDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const contact = useFetch(() => getContact(id), [id])
  const deals = useFetch(() => listDealsByContact(id), [id])
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  if (contact.loading && !contact.data) return <Spinner className="py-20" />
  if (contact.error) return <ErrorState message={contact.error} onRetry={contact.reload} />
  if (!contact.data) return <EmptyState title="Contact not found" description="It may have been deleted." action={<Link className="btn-primary" to="/contacts">Back to contacts</Link>} />
  const c = contact.data

  const save = async (values) => { await updateContact(id, values); toast.success('Contact updated'); setEditing(false); contact.reload() }
  const remove = async () => { await deleteContact(id); toast.success('Contact deleted'); navigate('/contacts', { replace: true }) }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/contacts" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Contacts</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{fullName(c)}</h1><p className="text-sm text-ink-500">{[c.designation, c.organization?.name].filter(Boolean).join(' at ')}</p></div>
        <div className="flex gap-2">
          {can('contacts.edit') && <button className="btn-ghost border border-ink-300" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</button>}
          {can('contacts.delete') && <button className="btn-ghost border border-ink-300 !text-red-600" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete</button>}
        </div>
      </div>

      <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
        <InfoGrid items={[
          ['Email', c.email && <a className="text-brand-600 hover:underline" href={`mailto:${c.email}`}>{c.email}</a>],
          ['Phone', c.phone],
          ['Organization', c.organization && <Link className="text-brand-600 hover:underline" to={`/organizations/${c.organization.id}`}>{c.organization.name}</Link>],
          ['LinkedIn', c.linkedin_url && <a className="text-brand-600 hover:underline" href={c.linkedin_url} target="_blank" rel="noreferrer">Profile</a>],
          ['Country', c.country], ['Added', fmtDate(c.created_at)],
        ]} />
        {c.notes && <p className="mt-4 whitespace-pre-wrap border-t border-ink-100 pt-4 text-sm text-ink-700">{c.notes}</p>}
      </section>

      <RelatedSection title="Deals" state={deals} empty="No deals linked to this contact yet.">
        {(d) => <li key={d.id} className="py-2"><Link className="text-sm font-medium text-brand-600 hover:underline" to={`/deals/${d.id}`}>{d.title}</Link><p className="text-xs text-ink-500">{fmtMoney(d.value, d.currency)}</p></li>}
      </RelatedSection>

      <RecordTasks column="contact_id" id={id} />
      <ActivityTimeline column="contact_id" id={id} title="Communication history" />

      <Modal open={editing} title="Edit contact" onClose={() => setEditing(false)}><ContactForm initial={c} onSubmit={save} onCancel={() => setEditing(false)} /></Modal>
      <ConfirmDialog open={deleting} title="Delete contact?" message={`${fullName(c)} and their activity history will be permanently deleted.`} onConfirm={remove} onClose={() => setDeleting(false)} />
    </div>
  )
}
