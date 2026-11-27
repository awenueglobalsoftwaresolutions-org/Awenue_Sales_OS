import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, CheckCircle, ChevronLeft, Clock, Copy, Download, Eye, FolderInput, Mail, Pencil, RefreshCw, Send, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { addPayment, cancelInvoice, deleteInvoice, duplicateInvoice, getInvoice, getInvoiceEmailDeliveryStatus, recordSend, removePayment, sendInvoiceByEmail } from '../../services/invoices'
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
import { INVOICE_TEMPLATES, INVOICE_BILLING_TEMPLATE, buildContext, renderEmail, invoiceEmailDefaults } from '../../lib/emailTemplate'

const STATUS_TONE = { draft: 'gray', sent: 'blue', partially_paid: 'amber', paid: 'green', overdue: 'red', cancelled: 'gray' }
const EMAIL_STATUS_TONE = {
  delivered: 'green',
  sent: 'blue',
  processing: 'amber',
  sending: 'amber',
  queued: 'sky',
  failed: 'red',
  bounced: 'red',
  not_sent: 'gray',
}
const today = () => new Date().toISOString().slice(0, 10)
const fmtEventType = (t) => (t ? t.replace(/_/g, ' ') : '')

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
  const emailStatusFetch = useFetch(() => getInvoiceEmailDeliveryStatus(id), [id])
  
  const [editing, setEditing] = useState(false)
  const [addingPayment, setAddingPayment] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [filing, setFiling] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [targetEmail, setTargetEmail] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState(INVOICE_BILLING_TEMPLATE.id)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [showBodyEditor, setShowBodyEditor] = useState(false)

  if (inv.loading && !inv.data) return <Spinner className="py-20" />
  if (inv.error) return <ErrorState message={inv.error} onRetry={inv.reload} />
  if (!inv.data) return <p className="p-8 text-center">Invoice not found.</p>
  const d = inv.data; const st = effectiveStatus(d, today()); const isClosed = ['paid', 'cancelled'].includes(d.status)

  const emailLog = emailStatusFetch.data
  const hasBeenSentViaEmail = (d.sends || []).some((s) => s.channel === 'email') || emailLog?.status === 'sent' || emailLog?.status === 'delivered'
  const isUpdatedAfterSend = emailLog?.sent_at && d.updated_at && new Date(d.updated_at).getTime() > (new Date(emailLog.sent_at).getTime() + 1000)

  // Compute effective email status label and tone
  let effectiveEmailStatus = 'not_sent'
  if (sendingEmail) effectiveEmailStatus = 'sending'
  else if (emailLog?.status) effectiveEmailStatus = emailLog.status
  else if (hasBeenSentViaEmail) effectiveEmailStatus = 'sent'

  const refresh = () => {
    inv.reload()
    emailStatusFetch.reload()
  }

  const dl = async () => { setDownloading(true); try { await downloadInvoicePdf(d, d.items || []) } catch (e) { toast.error(friendlyError(e)) } finally { setDownloading(false) } }
  const openPreview = async () => { try { setPreview(URL.createObjectURL(await invoicePdfBlob(d, d.items || []))) } catch (e) { toast.error(friendlyError(e)) } }
  const closePreview = () => { if (preview) URL.revokeObjectURL(preview); setPreview(null) }
  const toFiles = async () => { setFiling(true); try { await saveInvoicePdfToFiles(d, d.items, profile); toast.success('Saved to the organization\'s Files (Invoices folder)') } catch (e) { toast.error(friendlyError(e)) } finally { setFiling(false) } }
  const dup = async () => { try { const newId = await duplicateInvoice(id); toast.success('Invoice duplicated'); navigate(`/invoices/${newId}`) } catch (e) { toast.error(friendlyError(e)) } }

  const openSendConfirm = () => {
    setTargetEmail(d.bill_to_email || d.contact?.email || d.organization?.email || '')
    const tmpl = INVOICE_TEMPLATES.find((t) => t.id === selectedTemplateId) || INVOICE_BILLING_TEMPLATE
    const ctx = buildContext({ invoice: d, organization: d.organization, contact: d.contact })
    const rendered = renderEmail(tmpl.subject, tmpl.body, ctx)
    setEmailSubject(rendered.subject)
    setEmailBody(rendered.body)
    setConfirmModalOpen(true)
  }

  const handleSelectTemplate = (tmplId) => {
    setSelectedTemplateId(tmplId)
    const tmpl = INVOICE_TEMPLATES.find((t) => t.id === tmplId) || INVOICE_BILLING_TEMPLATE
    const ctx = buildContext({ invoice: d, organization: d.organization, contact: d.contact })
    const rendered = renderEmail(tmpl.subject, tmpl.body, ctx)
    setEmailSubject(rendered.subject)
    setEmailBody(rendered.body)
  }

  const executeSendInvoiceEmail = async () => {
    const to = targetEmail.trim()
    if (!to) {
      toast.error('Recipient email address is required.')
      return
    }

    setSendingEmail(true)
    const toastId = toast.loading(`Generating official PDF & emailing invoice to ${to}...`)
    try {
      let pdfBase64 = null
      try {
        const blob = await invoicePdfBlob(d, d.items || [])
        pdfBase64 = await blobToBase64(blob)
      } catch (pdfErr) {
        console.warn('[PDF] Generation warning:', pdfErr.message)
      }

      await sendInvoiceByEmail(id, {
        recipientEmail: to,
        pdfBase64,
        items: d.items,
        force: true,
        templateStyle: selectedTemplateId === 'detailed-invoice-sheet' ? 'invoice_document' : 'clean_letter',
        customSubject: emailSubject,
        customBody: emailBody,
        dealTitle: d.deal?.title,
      })

      toast.success(`Invoice #${d.invoice_number} successfully emailed to ${to}!`, { id: toastId })
      setConfirmModalOpen(false)
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
        openSendConfirm()
        return
      }
      await recordSend(id, channel, d.bill_to_email || null)
      toast.success('Send recorded')
      refresh()
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 animate-fade-up">
      <Link to="/invoices" className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900"><ChevronLeft className="h-4 w-4" />Invoices</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold font-mono">{d.invoice_number}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <Badge tone={STATUS_TONE[st] || 'gray'}>{(st || 'draft').replace('_', ' ')}</Badge>
            <Badge tone={EMAIL_STATUS_TONE[effectiveEmailStatus] || 'gray'}>
              Email: {(effectiveEmailStatus || 'not_sent').replace('_', ' ')}
            </Badge>
            <span className="text-sm text-ink-500">Due {fmtDay(d.due_date)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isClosed && (can('invoices.approve') || can('invoices.edit')) && (
            <button
              className="btn-primary flex items-center gap-1.5 !bg-emerald-600 hover:!bg-emerald-700 !text-white shadow-sm"
              onClick={openSendConfirm}
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

      {isUpdatedAfterSend && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-semibold">Invoice Updated Since Last Dispatch</p>
              <p className="text-xs text-amber-700">Changes were made to this invoice after it was emailed on {fmtDate(emailLog?.sent_at)}. You can resend the updated invoice to notify the client.</p>
            </div>
          </div>
          {!isClosed && (can('invoices.approve') || can('invoices.edit')) && (
            <button
              onClick={openSendConfirm}
              disabled={sendingEmail}
              className="btn-primary !bg-amber-600 hover:!bg-amber-700 !text-white text-xs whitespace-nowrap !py-1.5"
            >
              Send Updated Invoice
            </button>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-ink-500">From</p>
                <p className="font-semibold text-ink-900">{d.issuer?.company_name || 'AWENUE Global Software Solutions'}</p>
                {d.issuer?.address && <p className="text-xs text-ink-500">{d.issuer.address}</p>}
                {d.issuer?.email && <p className="text-xs text-ink-500">{d.issuer.email}</p>}
                {d.issuer?.phone && <p className="text-xs text-ink-500">{d.issuer.phone}</p>}
                {d.issuer?.tax_id && <p className="text-xs text-ink-500 font-mono">Tax ID: {d.issuer.tax_id}</p>}
              </div>
              <div><p className="text-xs text-ink-500">To</p><p className="font-semibold">{d.bill_to_name}</p>{d.bill_to_address && <p className="text-xs text-ink-500">{d.bill_to_address}</p>}{d.bill_to_email && <p className="text-xs text-ink-500">{d.bill_to_email}</p>}</div>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b border-ink-100 text-xs font-semibold text-ink-500"><tr><th className="pb-1 text-left">Description</th><th className="pb-1 text-right">Qty</th><th className="pb-1 text-right">Unit</th><th className="pb-1 text-right">Total</th></tr></thead>
              <tbody className="divide-y divide-ink-100">
                {(d.items || []).map((it) => <tr key={it.id}><td className="py-2">{it.description}</td><td className="py-2 text-right">{it.quantity}</td><td className="py-2 text-right">{fmtMoney(it.unit_price, d.currency)}</td><td className="py-2 text-right font-medium">{fmtMoney(it.line_total, d.currency)}</td></tr>)}
              </tbody>
            </table>
            <div className="mt-4 flex justify-end"><div className="w-64 space-y-1.5 text-sm">
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
          {/* Dedicated Invoice Email Status Card */}
          <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-1.5 text-ink-900">
                <Mail className="h-4 w-4 text-emerald-600" />
                Invoice Email Status
              </h2>
              <Badge tone={EMAIL_STATUS_TONE[effectiveEmailStatus] || 'gray'}>
                {effectiveEmailStatus.replace('_', ' ')}
              </Badge>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-ink-50">
                <span className="text-ink-500">Recipient Email</span>
                <span className="font-medium text-ink-900 truncate max-w-[170px]" title={emailLog?.recipient_email || d.bill_to_email || ''}>
                  {emailLog?.recipient_email || d.bill_to_email || '—'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-ink-50">
                <span className="text-ink-500">Last Sent Date</span>
                <span className="font-medium text-ink-900">
                  {emailLog?.sent_at ? fmtDate(emailLog.sent_at) : (d.sends || []).find((s) => s.channel === 'email')?.sent_at ? fmtDate((d.sends || []).find((s) => s.channel === 'email').sent_at) : 'Not sent yet'}
                </span>
              </div>
              {emailLog?.delivered_at && (
                <div className="flex justify-between py-1 border-b border-ink-50">
                  <span className="text-ink-500">Delivered At</span>
                  <span className="font-medium text-emerald-700 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> {fmtDate(emailLog.delivered_at)}
                  </span>
                </div>
              )}
              {emailLog?.resend_email_id && (
                <div className="flex justify-between py-1 border-b border-ink-50">
                  <span className="text-ink-500">Resend ID</span>
                  <span className="font-mono text-[11px] text-ink-700 truncate max-w-[170px]" title={emailLog.resend_email_id}>
                    {emailLog.resend_email_id}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-ink-50">
                <span className="text-ink-500">Official Sender</span>
                <span className="text-[11px] text-ink-600">billing@awenueglobalsoftwaresolutions.in</span>
              </div>
              {emailLog?.status === 'failed' && emailLog.last_error && (
                <div className="rounded-lg bg-red-50 p-2.5 text-red-700 border border-red-100">
                  <p className="font-semibold text-xs flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> Delivery Failed</p>
                  <p className="text-[11px] mt-1">{emailLog.last_error}</p>
                </div>
              )}
            </div>

            {!isClosed && (can('invoices.approve') || can('invoices.edit')) && (
              <div className="mt-4 pt-3 border-t border-ink-100 flex flex-col gap-2">
                <button
                  className="btn-primary w-full flex items-center justify-center gap-1.5 !bg-emerald-600 hover:!bg-emerald-700 !text-white text-xs !py-2"
                  onClick={openSendConfirm}
                  disabled={sendingEmail}
                >
                  <Mail className="h-3.5 w-3.5" />
                  {sendingEmail ? 'Processing…' : hasBeenSentViaEmail ? 'Resend Invoice Email' : 'Send Invoice by Email'}
                </button>
                {emailLog?.status === 'failed' && (
                  <button
                    className="btn-ghost w-full border border-red-200 !text-red-700 hover:bg-red-50 text-xs !py-1.5 flex items-center justify-center gap-1"
                    onClick={openSendConfirm}
                    disabled={sendingEmail}
                  >
                    <RefreshCw className="h-3 w-3" /> Retry Failed Delivery
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Payments */}
          <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Payments</h2>{!isClosed && can('invoices.edit') && d.status !== 'draft' && Number(d.balance) > 0 && <button className="btn-ghost !py-1.5 text-xs" onClick={() => setAddingPayment(true)}>Record payment</button>}</div>
            {(d.payments || []).length ? (d.payments || []).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-ink-100 last:border-0 text-sm">
                <div><p className="font-medium">{fmtMoney(p.amount, d.currency)}</p><p className="text-xs text-ink-500">{fmtDay(p.paid_on)} · {p.method?.replace('_', ' ') || '—'}{p.reference ? ` · ${p.reference}` : ''}</p></div>
                {can('invoices.approve') && !isClosed && <button className="btn-ghost !p-1 !text-red-500" aria-label="Remove payment" onClick={() => removePayment(p.id).then(refresh).catch((e) => toast.error(friendlyError(e)))}><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>)) : <p className="text-sm text-ink-500">No payments recorded yet.</p>}
          </section>

          {/* Sends History */}
          <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Send history</h2>
              {!isClosed && (can('invoices.approve') || can('invoices.edit')) && (
                <div className="flex gap-1">
                  <button className="btn-ghost !py-1 text-xs text-emerald-700 hover:bg-emerald-50 border border-emerald-200" onClick={openSendConfirm}>
                    <Mail className="h-3 w-3 inline mr-0.5" /> Email
                  </button>
                  <button className="btn-ghost !py-1 text-xs" onClick={() => send('whatsapp')}>WhatsApp</button>
                </div>
              )}
            </div>
            {(d.sends || []).length ? (d.sends || []).map((s) => (
              <div key={s.id} className="text-xs py-1.5 border-b border-ink-50 last:border-0 text-ink-600 flex items-center justify-between">
                <span>{s.channel === 'email' ? '✉️ Email' : s.channel} {s.recipient ? `→ ${s.recipient}` : ''}</span>
                <span className="text-ink-400">{fmtDate(s.sent_at)}</span>
              </div>
            )) : <p className="text-sm text-ink-500">Not sent yet.</p>}
          </section>

          {/* Events History */}
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
      
      {/* Complete Confirmation Dialog Required by Section 2 & User Request */}
      <Modal open={confirmModalOpen} title={hasBeenSentViaEmail ? 'Resend Invoice Email' : 'Send Invoice by Email'} onClose={() => !sendingEmail && setConfirmModalOpen(false)} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-ink-600">
            Please select your email template and verify invoice details before dispatching to the client. The official generated PDF will be attached.
          </p>

          {/* Template Selector */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5 space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-emerald-900">
              Select Email Template
            </label>
            <select
              className="input !bg-white !border-emerald-300 font-medium text-ink-900"
              value={selectedTemplateId}
              onChange={(e) => handleSelectTemplate(e.target.value)}
              disabled={sendingEmail}
            >
              {INVOICE_TEMPLATES.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-emerald-800">
              {selectedTemplateId === 'awenue-billing-notice'
                ? '✓ Clean and clear letter with AWENUE official logo, concise summary, and PDF attached.'
                : '✓ Full table itemization breakdown with bank payment details and PDF attached.'}
            </p>
          </div>

          <div className="rounded-lg border border-ink-150 bg-ink-50/50 p-4 space-y-2 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-ink-500 text-xs">Invoice Number:</span>
              <strong className="font-mono text-ink-900">#{d.invoice_number}</strong>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-ink-500 text-xs">Client Name:</span>
              <strong className="text-ink-900">{d.bill_to_name}</strong>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-ink-500 text-xs">Total Amount:</span>
              <strong className="text-emerald-700 text-base">{fmtMoney(d.total, d.currency)}</strong>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-ink-500 text-xs">Due Date:</span>
              <span className="text-ink-700">{fmtDay(d.due_date)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-ink-500 text-xs">Official Sender:</span>
              <span className="text-xs text-ink-600 font-medium">AWENUE Billing Department &lt;billing@awenueglobalsoftwaresolutions.in&gt;</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-ink-500 text-xs">Attachment:</span>
              <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
                📎 Invoice-{d.invoice_number}.pdf
              </span>
            </div>
          </div>

          <Field label="Recipient Email Address" required>
            <input
              type="email"
              placeholder="client@example.com"
              className="input"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              disabled={sendingEmail}
              autoFocus
            />
          </Field>

          {/* Email Subject Field */}
          <Field label="Email Subject" required>
            <input
              type="text"
              className="input font-medium"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              disabled={sendingEmail}
            />
          </Field>

          {/* Message Preview & Customization Accordion */}
          <div className="rounded-lg border border-ink-150 overflow-hidden">
            <button
              type="button"
              className="w-full flex items-center justify-between px-3.5 py-2.5 bg-ink-50 hover:bg-ink-100 text-xs font-medium text-ink-700 transition-colors"
              onClick={() => setShowBodyEditor(!showBodyEditor)}
            >
              <span>{showBodyEditor ? 'Hide Message Preview' : 'Show Message Preview & Content'}</span>
              <span className="text-ink-500">{showBodyEditor ? '▲' : '▼'}</span>
            </button>
            {showBodyEditor && (
              <div className="p-3 bg-white space-y-2">
                <textarea
                  rows={8}
                  className="input font-mono text-xs leading-relaxed"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  disabled={sendingEmail}
                />
                <p className="text-[11px] text-ink-400">
                  Tip: You can customize the message text before sending, or leave as default.
                </p>
              </div>
            )}
          </div>

          {hasBeenSentViaEmail && (
            <div className="rounded-lg bg-sky-50 p-3 text-xs text-sky-800 border border-sky-100 flex items-start gap-2">
              <Clock className="h-4 w-4 shrink-0 text-sky-600 mt-0.5" />
              <div>
                <strong>Notice:</strong> This invoice was previously dispatched. Confirming will generate a fresh delivery via Resend.
              </div>
            </div>
          )}

          {isUpdatedAfterSend && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <div>
                <strong>Invoice Updated:</strong> The invoice totals or line items were modified after the previous send. This will deliver the newly updated invoice.
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4 mt-4">
          <button className="btn-ghost" onClick={() => setConfirmModalOpen(false)} disabled={sendingEmail}>Cancel</button>
          <button
            className="btn-primary !bg-emerald-600 hover:!bg-emerald-700 !text-white flex items-center gap-1.5"
            onClick={executeSendInvoiceEmail}
            disabled={sendingEmail || !targetEmail.trim()}
          >
            <Mail className="h-4 w-4" />
            {sendingEmail ? 'Dispatching Email…' : hasBeenSentViaEmail ? 'Confirm & Resend' : 'Confirm & Send Email'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
