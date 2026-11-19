import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { getRecordTotals, listInvoicesForRecord } from '../../services/invoices'
import { effectiveStatus } from '../../lib/invoiceCalc'
import { fmtDay, fmtMoney } from '../../lib/format'
import Badge from '../common/Badge'
import ErrorState from '../common/ErrorState'
import Modal from '../common/Modal'
import Spinner from '../common/Spinner'
import InvoiceForm from '../../pages/Invoices/InvoiceForm'

const TONE = { draft: 'gray', sent: 'blue', partially_paid: 'amber', paid: 'green', overdue: 'red', cancelled: 'gray' }

// Invoices tied to one record (an organization, contact, lead or deal), with what has been billed, paid and is still owed.
export default function RecordInvoices({ column, id, prefill, bare = false }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const list = useFetch(() => listInvoicesForRecord(column, id), [column, id])
  const totals = useFetch(() => getRecordTotals(column, id), [column, id])
  const [creating, setCreating] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const rows = list.data || []
  const t = totals.data || {}

  const body = (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Invoices{list.data && <span className="ml-1 font-normal text-ink-500">({rows.length})</span>}</h2>
        {can('invoices.create') && <button className="btn-ghost !py-1.5" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />New invoice</button>}
      </div>
      {Object.keys(t).length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {Object.entries(t).map(([cur, v]) => [['Billed', v.billed, ''], ['Paid', v.paid, 'text-emerald-600'], ['Outstanding', v.outstanding, Number(v.outstanding) > 0 ? 'text-amber-600' : '']].map(([label, val, cls]) => (
            <div key={`${cur}${label}`} className="rounded-lg bg-ink-50 px-3 py-2"><p className="text-xs text-ink-500">{label} · {cur}</p><p className={`text-base font-bold ${cls}`}>{fmtMoney(val || 0, cur)}</p></div>)))}
        </div>)}
      {list.loading && !list.data ? <Spinner className="py-6" /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !rows.length ? <p className="text-sm text-ink-500">No invoices yet.</p>
        : (
          <ul className="divide-y divide-ink-100">
            {rows.map((r) => { const st = effectiveStatus(r, today); return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0"><Link to={`/invoices/${r.id}`} className="font-mono text-sm font-semibold text-brand-700 hover:underline">{r.invoice_number}</Link><p className="text-xs text-ink-500">Issued {fmtDay(r.issue_date)} · due {fmtDay(r.due_date)}</p></div>
                <div className="flex items-center gap-3"><span className="text-sm font-medium">{fmtMoney(r.total, r.currency)}</span><Badge tone={TONE[st]}>{st.replace('_', ' ')}</Badge></div>
              </li>) })}
          </ul>)}
      <Modal open={creating} title="New invoice" onClose={() => setCreating(false)} size="lg">
        {creating && <InvoiceForm prefill={prefill} onClose={() => setCreating(false)} onSaved={(newId) => { setCreating(false); navigate(`/invoices/${newId}`) }} />}
      </Modal>
    </>
  )
  return bare ? <div>{body}</div> : <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">{body}</section>
}
