import { useState } from 'react'
import { Mail, Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { listMessagesFor } from '../../services/email'
import { fmtDateTimeTz } from '../../lib/tz'
import Badge from '../common/Badge'
import ErrorState from '../common/ErrorState'
import Spinner from '../common/Spinner'
import EmailComposer from './EmailComposer'

const TONE = { sent: 'green', queued: 'gray', failed: 'red' }
const LABEL = { sent: 'Sent', queued: 'Sending', failed: 'Failed' }

// Every email linked to one record (contact, lead, organization, deal or invoice), with a Compose button.
export default function RecordEmails({ column, id, context, initial, composeLabel = 'Compose email', includeInvoice = false, title = 'Emails' }) {
  const { can, profile } = useAuth()
  const tz = profile?.timezone || 'UTC'
  const list = useFetch(() => listMessagesFor(column, id), [column, id])
  const [composing, setComposing] = useState(false)
  const [open, setOpen] = useState(null)
  const rows = list.data || []
  return (
    <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}{list.data && <span className="ml-1 font-normal text-ink-500">({rows.length})</span>}</h2>
        {can('communications.create') && <button className="btn-ghost !py-1.5" onClick={() => setComposing(true)}><Plus className="h-4 w-4" />{composeLabel}</button>}
      </div>
      {list.loading && !list.data ? <Spinner className="py-6" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !rows.length ? <p className="text-sm text-ink-500">No emails yet. Emails sent about this record appear here and in its timeline.</p>
        : (
          <ul className="divide-y divide-ink-100">
            {rows.map((m) => (
              <li key={m.id} className="py-2.5">
                <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
                  <span className="flex min-w-0 items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.subject}</span>
                      <span className="block truncate text-xs text-ink-500">From {m.sender_email} to {m.to_addresses.join(', ')} · {fmtDateTimeTz(m.created_at, tz)}</span>
                    </span>
                  </span>
                  <Badge tone={TONE[m.status]}>{LABEL[m.status]}</Badge>
                </button>
                {open === m.id && (
                  <div className="mt-2 rounded-lg bg-ink-50 p-3 text-sm">
                    {m.cc_addresses?.length > 0 && <p className="mb-1 text-xs text-ink-500">Cc: {m.cc_addresses.join(', ')}</p>}
                    {m.bcc_addresses?.length > 0 && <p className="mb-1 text-xs text-ink-500">Bcc: {m.bcc_addresses.join(', ')}</p>}
                    <p className="whitespace-pre-wrap">{m.body_text}</p>
                    {m.attachments?.length > 0 && <p className="mt-2 text-xs text-ink-500">Attachments: {m.attachments.map((a) => a.name).join(', ')}</p>}
                    {m.error && <p className="mt-2 text-xs text-red-600">{m.error}</p>}
                  </div>)}
              </li>))}
          </ul>)}
      {composing && <EmailComposer onClose={() => setComposing(false)} context={context} initial={initial} includeInvoice={includeInvoice} onSent={() => list.reload()} />}
    </section>
  )
}
