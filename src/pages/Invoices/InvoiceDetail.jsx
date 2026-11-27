import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Copy, Download, Eye, FolderInput, Mail, Pencil, Send, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { addPayment, cancelInvoice, deleteInvoice, duplicateInvoice, getInvoice, recordSend, removePayment } from '../../services/invoices'
import { apiPost } from '../../services/api'
import { blobToBase64 } from '../../services/email'
import { effectiveStatus } from '../../lib/invoiceCalc'
import { friendlyError } from '../../lib/errors'
import { downloadInvoicePdf, invoicePdfBlob } from '../../lib/invoicePdf'
import { saveInvoicePdfToFiles } from '../../services/invoiceFiles'
import { filesConfigured } from '../../services/files'
import { fmtDate, fmtMoney } from '../../lib/format'
import { fmtDay } from '../../lib/format'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'
import Badge from '../../components/common/Badge'
import Modal from '../../components/common/Modal'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import { Field, FormError, FormFooter } from '../../components/forms/FormParts'
import InvoiceForm from './InvoiceForm'
import RecordEmails from '../../components/email/RecordEmails'
import { invoiceEmailDefaults } from '../../lib/emailTemplate'

const STATUS_TONE = { draft: 'gray', sent: 'blue', partially_paid: 'amber', paid: 'green', overdue: 'red', cancelled: 'gray' }
const today = () => new Date().toISOString().slice(0, 10)
const fmtEventType = (t) => t.replace(/_/g, ' ')
const CH_ICON = { email: Mail, whatsapp: Send, manual: Pencil, other: Send }

function AddPaymentModal({ invoice, onClose, onDone }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({ amount: String(Number(invoice.balance)), paid_on: new Date().toISOString().slice(0, 10), method: 'bank_transfer', reference: '', notes: '' })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) return setErr('Enter a payment amount.')
    if (Number(form.amount) > Number(invoice.balance)) return setErr(`Can't exceed the balance of ${fmtMoney(invoice.balance, invoice.currency)}.`)
    setBusy(true); setErr('')
    try { await addPayment({ invoice_id: invoice.id, workspace_id: invoice.workspace_id, amount: Number(form.amount), paid_on: form.paid_on, method: form.method || null, reference: form.reference || null, notes: form.notes || null, created_by: profile.id }); onDone() }
    catch (e) { setErr(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open title="Record payment" onClose={() => !busy && onClose()} size="sm">
      <div className="space-y-4">
        {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
        <Field label="Amount"><input type="number" step="any" min="0.01" max={invoice.balance} className="input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} /></Field>
        <Field label="Payment date"><input type="date" className="input" value={form.paid_on} onChange={(e) => setForm((f) => ({ ...f, paid_on: e.target.value }))} /></Field>
        <Field label="Method"><select className="input" value={form.method} onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}><option value="">Select…</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="online">Online</option><option value="other">Other</option></select></Field>
        <Field label="Reference"><input className="input" value={form.reference} onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))} /></Field>
        <Field label="Notes"><textarea rows={2} className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></Field>
      </div>
      <FormFooter busy={busy} onCancel={onClose} label="Save payment" />
    </Modal>)
}

function CancelModal({ invoice, onClose, onDone }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false)
  const save = async () => { if (!reason.trim()) return; setBusy(true); try { await cancelInvoice(invoice.id, reason); onDone() } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) } }
  return (
    <Modal open title="Cancel invoice" onClose={() => !busy && onClose()} size="sm">
      <p className="mb-4 text-sm text-ink-700">Give a reason. The invoice will be locked and no further changes can be made.</p>
      <Field label="Reason" required><textarea rows={3} autoFocus className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <FormFooter busy={busy} onCancel={onClose} label="Cancel invoice" />
    </Modal>)
}

export default function InvoiceDetail() {
  const { id } = useParams(); const navigate = useNavigate()
  const { can, profile } = useAuth()
  const inv = useFetch(() => getInvoice(id), [id])
  const [editing, setEditing] = useState(false)
  const [addingPayment, setAddingPayment] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [filing, setFiling] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailPromptOpen, setEmailPromptOpen] = useState(false)
  const [customEmail, setCustomEmail] = useState('')

  if (inv.loading && !inv.data) return <Spinner className="py-20" />
  if (inv.error) return <ErrorState message={inv.error} onRetry={inv.reload} />
  if (!inv.data) return <p className="p-8 text-center">Invoice not found.</p>
  const d = inv.data; const st = effectiveStatus(d, today()); const isClosed = ['paid', 'cancelled'].includes(d.status)

  const refresh = () => inv.reload()
  const dl = async () => { setDownloading(true); try { await downloadInvoicePdf(d, d.items || []) } catch (e) { toast.error(friendlyError(e)) } finally { setDownloading(false) } }
  const openPreview = async () => { try { setPreview(URL.createObjectURL(await invoicePdfBlob(d, d.items || []))) } catch (e) { toast.error(friendlyError(e)) } }
  const closePreview = () => { if (preview) URL.revokeObjectURL(preview); setPreview(null) }
  const toFiles = async () => { setFiling(true); try { await saveInvoicePdfToFiles(d, d.items, profile); toast.success('Saved to the organization\'s Files (Invoices folder)') } catch (e) { toast.error(friendlyError(e)) } finally { setFiling(false) } }
  const dup = async () => { try { const newId = await duplicateInvoice(id); toast.success('Invoice duplicated'); navigate(`/invoices/${newId}`) } catch (e) { toast.error(friendlyError(e)) } }

  const handleSendEmail = async (targetEmail) => {
    const to = (targetEmail || d.bill_to_email || '').trim()
    if (!to) {
      setCustomEmail(d.contact?.email || d.organization?.email || '')
      setEmailPromptOpen(true)
      return
    }

    setSendingEmail(true)
    const toastId = toast.loading(`Generating PDF & emailing invoice to ${to} via Billing Department...`)
    try {
      let pdfBase64 = null
      try {
        const blob = await invoicePdfBlob(d, d.items || [])
        pdfBase64 = await blobToBase64(blob)
      } catch (pdfErr) {
        console.warn('Invoice PDF generation warning:', pdfErr.message)
      }

      await apiPost('/email/notifications/invoice', {
        invoice_id: id,
        recipient_email: to,
        pdf_base64: pdfBase64,
        resend: true,
      })

      await recordSend(id, 'email', to, 'Dispatched via Resend Billing Automation')
      toast.success(`Invoice #${d.invoice_number} successfully sent to ${to}!`, { id: toastId })
      setEmailPromptOpen(false)
      refresh()
    } catch (e) {
      toast.error(friendlyError(e), { id: toastId })
    } finally {
      setSendingEmail(false)
    }
  }

  const send = async (channel) => {
    try {
      if (channel === 'email') {
        await handleSendEmail(d.bill_to_email)
        return
      }
      await recordSend(id, channel, d.bill_to_email || null)
      toast.success('Send recorded')
      refresh()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const hasBeenSentViaEmail = (d.sends || []).some((s) => s.channel === 'email')

  return (
    <div className="mx-auto max-w-5xl space-y-5 animate-fade-up">
      <Link to="/invoices" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Invoices</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-mono">{d.invoice_number}</h1>
          <div className="mt-1 flex flex-wrap gap-2"><Badge tone={STATUS_TONE[st]}>{st.replace('_', ' ')}</Badge><span className="text-sm text-ink-500">Due {fmtDay(d.due_date)}</span></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isClosed && (can('invoices.approve') || can('invoices.edit')) && (
            <button
              className="btn-primary flex items-center gap-1.5 !bg-emerald-600 hover:!bg-emerald-700 !text-white shadow-sm"
              onClick={() => handleSendEmail(d.bill_to_email)}
              disabled={sendingEmail}
              title="Send this invoice and attached PDF directly to client via billing@awenueglobalsoftwaresolutions.in"
            >
              <Mail className="h-4 w-4" />
              {sendingEmail ? 'Sending email…' : hasBeenSentViaEmail ? 'Resend invoice by Email' : 'Send invoice by Email'}
            </button>
          )}
          <button className="btn-ghost border border-ink-300" onClick={openPreview}><Eye className="h-4 w-4" />Preview</button>
          {d.organization_id && filesConfigured && can('files.create') && <button className="btn-ghost border border-ink-300" onClick={toFiles} disabled={filing}><FolderInput className="h-4 w-4" />{filing ? 'Saving…' : 'Save to files'}</button>}
          <button className="btn-ghost border border-ink-300" onClick={dl} disabled={downloading}><Download className="h-4 w-4" />{downloading ? 'Generating…' : 'Download PDF'}</button>
          <button className="btn-ghost border border-ink-300" onClick={dup}><Copy className="h-4 w-4" />Duplicate</button>
          {!isClosed && can('invoices.edit') && <button className="btn-ghost border border-ink-300" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Edit</button>}
          {!isClosed && can('invoices.approve') && <button className="btn-ghost border border-ink-300" onClick={() => send('manual')}><Send className="h-4 w-4" />Mark as sent</button>}
          {!isClosed && can('invoices.approve') && d.status !== 'draft' && <button className="btn-ghost border border-ink-300" onClick={() => setCancelling(true)}><XCircle className="h-4 w-4" />Cancel</button>}
          {d.status === 'draft' && can('invoices.edit') && <button className="btn-ghost border border-red-200 !text-red-600" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4" />Delete</button>}
        </div>
      </div>

      {(d.organization || d.contact || d.lead || d.deal) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {d.organization && <Link className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 hover:underline" to={`/organizations/${d.organization.id}?tab=invoices`}>Organization: {d.organization.name}</Link>}
          {d.contact && <Link className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 hover:underline" to={`/contacts/${d.contact.id}`}>Contact: {[d.contact.first_name, d.contact.last_name].filter(Boolean).join(' ')}</Link>}
          {d.lead && <Link className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 hover:underline" to={`/leads/${d.lead.id}`}>Lead: {[d.lead.first_name, d.lead.last_name].filter(Boolean).join(' ')}</Link>}
          {d.deal && <Link className="rounded-full bg-brand-50 px-3 py-1 text-brand-700 hover:underline" to={`/deals/${d.deal.id}`}>Deal: {d.deal.title}</Link>}
        </div>)}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-ink-500">From</p><p className="font-semibold">{d.issuer?.company_name}</p><p className="text-xs text-ink-500">{d.issuer?.address}</p><p className="text-xs text-ink-500">{d.issuer?.email}</p></div>
              <div><p className="text-xs text-ink-500">To</p><p className="font-semibold">{d.bill_to_name}</p>{d.bill_to_address && <p className="text-xs text-ink-500">{d.bill_to_address}</p>}{d.bill_to_email && <p className="text-xs text-ink-500">{d.bill_to_email}</p>}</div>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-ink-100 text-xs font-semibold text-ink-500"><tr><th className="pb-1 text-left">Description</th><th className="pb-1 text-right">Qty</th><th className="pb-1 text-right">Unit</th><th className="pb-1 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {(d.items || []).map((it) => <tr key={it.id}><td className="py-2">{it.description}</td><td className="py-2 text-right">{it.quantity}</td><td className="py-2 text-right">{fmtMoney(it.unit_price, d.currency)}</td><td className="py-2 text-right font-medium">{fmtMoney(it.line_total, d.currency)}</td></tr>)}
              </tbody>
            </table>
            <div className="mt-4 flex justify-end"><div className="w-48 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span>{fmtMoney(d.subtotal, d.currency)}</span></div>
              {Number(d.discount_total) > 0 && <div className="flex justify-between"><span className="text-ink-500">Discount</span><span className="text-emerald-600">−{fmtMoney(d.discount_total, d.currency)}</span></div>}
              {Number(d.tax_total) > 0 && <div className="flex justify-between"><span className="text-ink-500">Tax</span><span>{fmtMoney(d.tax_total, d.currency)}</span></div>}
              <div className="flex justify-between border-t border-ink-200 pt-1 font-bold"><span>Total</span><span>{fmtMoney(d.total, d.currency)}</span></div>
              {Number(d.amount_paid) > 0 && <div className="flex justify-between"><span className="text-ink-500">Paid</span><span className="text-emerald-600">−{fmtMoney(d.amount_paid, d.currency)}</span></div>}
              {Number(d.balance) > 0 && <div className="flex justify-between font-semibold text-amber-600"><span>Balance due</span><span>{fmtMoney(d.balance, d.currency)}</span></div>}
            </div></div>
          </div>
          {d.payment_instructions && <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-card"><p className="text-xs font-medium text-ink-500">Payment instructions</p><p className="mt-1 whitespace-pre-wrap text-sm">{d.payment_instructions}</p></div>}
          {d.notes && <div className="rounded-xl border border-ink-100 bg-white p-4 shadow-card"><p className="text-xs font-medium text-ink-500">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm">{d.notes}</p></div>}
        </section>

        <div className="space-y-4">
          {/* Payments */}
          <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Payments</h2>{!isClosed && can('invoices.edit') && d.status !== 'draft' && Number(d.balance) > 0 && <button className="btn-ghost !py-1.5 text-xs" onClick={() => setAddingPayment(true)}>Record payment</button>}</div>
            {(d.payments || []).length ? (d.payments || []).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-ink-100 last:border-0 text-sm">
                <div><p className="font-medium">{fmtMoney(p.amount, d.currency)}</p><p className="text-xs text-ink-500">{fmtDay(p.paid_on)} · {p.method?.replace('_', ' ') || '—'}{p.reference ? ` · ${p.reference}` : ''}</p></div>
                {can('invoices.approve') && !isClosed && <button className="btn-ghost !p-1 !text-red-500" aria-label="Remove payment" onClick={() => removePayment(p.id).then(refresh).catch((e) => toast.error(friendlyError(e)))}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>)) : <p className="text-sm text-ink-500">No payments recorded yet.</p>}
          </section>
          {/* Sends */}
          <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Send history</h2>{!isClosed && can('invoices.approve') && <div className="flex gap-1"><button className="btn-ghost !py-1 text-xs" onClick={() => send('email')}>Email</button><button className="btn-ghost !py-1 text-xs" onClick={() => send('whatsapp')}>WhatsApp</button></div>}</div>
            {(d.sends || []).length ? (d.sends || []).map((s) => <div key={s.id} className="text-xs py-1 text-ink-500">{s.channel} {s.recipient ? `→ ${s.recipient}` : ''} · {fmtDate(s.sent_at)}</div>) : <p className="text-sm text-ink-500">Not sent yet.</p>}
          </section>
          {/* History */}
          <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <h2 className="mb-3 text-sm font-semibold">History</h2>
            <ol className="space-y-2">{(d.events || []).map((e) => <li key={e.id} className="text-sm"><p className="font-medium">{fmtEventType(e.event_type)}</p><p className="text-xs text-ink-500">{e.description}</p></li>)}</ol>
          </section>
        </div>
      </div>

      {can('communications.view') && <RecordEmails column="invoice_id" id={id} title="Invoice emails" composeLabel="Send invoice by email" includeInvoice initial={invoiceEmailDefaults(d)} context={{ invoice: d, organization: d.organization, contact: d.contact }} />}
      <Modal open={Boolean(preview)} title={`Preview · ${d.invoice_number}`} onClose={closePreview} size="lg">{preview && <iframe title="Invoice preview" src={preview} className="h-[75vh] w-full rounded-lg border border-ink-100" />}</Modal>
      {editing && <Modal open title="Edit invoice" onClose={() => setEditing(false)} size="lg"><InvoiceForm initial={{ ...d, items: d.items || [] }} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh() }} /></Modal>}
      {addingPayment && <AddPaymentModal invoice={d} onClose={() => setAddingPayment(false)} onDone={() => { setAddingPayment(false); refresh() }} />}
      {cancelling && <CancelModal invoice={d} onClose={() => setCancelling(false)} onDone={() => { setCancelling(false); refresh() }} />}
      <ConfirmDialog open={deleting} title="Delete draft invoice?" message={`${d.invoice_number} will be permanently deleted.`} confirmLabel="Delete"
        onConfirm={async () => { await deleteInvoice(id); toast.success('Invoice deleted'); navigate('/invoices', { replace: true }) }} onClose={() => setDeleting(false)} />
      
      <Modal open={emailPromptOpen} title="Send Invoice by Email" onClose={() => !sendingEmail && setEmailPromptOpen(false)} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            Enter the client email address below to dispatch invoice <strong>#{d.invoice_number}</strong> with the official PDF attached.
          </p>
          <Field label="Client Email Address" required>
            <input
              type="email"
              placeholder="client@example.com"
              className="input"
              value={customEmail}
              onChange={(e) => setCustomEmail(e.target.value)}
              autoFocus
            />
          </Field>
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 text-xs text-emerald-800">
            Official Sender: <strong>AWENUE Billing Department &lt;billing@awenueglobalsoftwaresolutions.in&gt;</strong>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4 mt-4">
          <button className="btn-ghost" onClick={() => setEmailPromptOpen(false)} disabled={sendingEmail}>Cancel</button>
          <button
            className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 !text-white flex items-center gap-1.5"
            onClick={() => handleSendEmail(customEmail)}
            disabled={sendingEmail || !customEmail.trim()}
          >
            <Mail className="h-4 w-4" />
            {sendingEmail ? 'Sending…' : 'Send Invoice Email'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
