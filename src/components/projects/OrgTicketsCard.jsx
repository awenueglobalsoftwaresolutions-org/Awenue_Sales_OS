import { Link } from 'react-router-dom'
import { LifeBuoy } from 'lucide-react'
import { useFetch } from '../../hooks/useFetch'
import { listTicketsForOrg, TICKET_STATUSES } from '../../services/projects'
import Badge from '../common/Badge'
import Spinner from '../common/Spinner'

const OPEN = ['open', 'assigned', 'in_progress', 'waiting_client', 'under_review']
// Support tickets for an organization, shown in its overview: open issues first.
export default function OrgTicketsCard({ orgId }) {
  const tickets = useFetch(() => listTicketsForOrg(orgId), [orgId])
  const open = (tickets.data || []).filter((t) => OPEN.includes(t.status))
  return (
    <section className="rounded-2xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900"><LifeBuoy className="h-4 w-4 text-brand-600" />Support tickets</h2>
        <Link to="/tickets" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all →</Link>
      </div>
      {tickets.loading && !tickets.data ? <Spinner className="py-4" /> : !tickets.data?.length ? <p className="text-sm text-ink-500">No support tickets for this client.</p> : (
        <>
          <p className="mb-3 text-sm text-ink-600"><span className="font-semibold text-ink-900">{open.length}</span> open · {tickets.data.length - open.length} resolved or closed</p>
          <ul className="divide-y divide-ink-100">
            {tickets.data.slice(0, 5).map((t) => (
              <li key={t.id}><Link to={`/tickets?q=${t.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:text-brand-700">
                <span className="min-w-0"><span className="block truncate text-sm font-medium text-ink-900">TKT-{String(t.ticket_number).padStart(4, '0')} · {t.subject}</span><span className="block truncate text-xs text-ink-500">{t.project?.name}</span></span>
                <Badge tone={['resolved', 'closed'].includes(t.status) ? 'green' : 'amber'}>{TICKET_STATUSES.find((s) => s.value === t.status)?.label}</Badge></Link></li>))}
          </ul>
        </>)}
    </section>)
}
