import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Paperclip, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import Modal from '../common/Modal'
import Spinner from '../common/Spinner'
import { buildContext, renderEmail, VARIABLE_GROUPS } from '../../lib/emailTemplate'
import { friendlyError } from '../../lib/errors'
import { invoiceFileName, invoicePdfBlob } from '../../lib/invoicePdf'
import { blobToBase64, getMyGmail, listOrgFiles, listTemplates, sendEmail } from '../../services/email'
import { recordSend } from '../../services/invoices'

const MAX_BYTES = 10 * 1024 * 1024
const split = (s) => s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)
const kb = (n) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`)

// context: { contact?, lead?, organization?, deal?, invoice?, task? } — the record the email is about.
export default function EmailComposer({ onClose, context = {}, initial = {}, includeInvoice = false, onSent }) {
  const { profile, can } = useAuth()
  const templates = useFetch(listTemplates, [])
  const gmail = useFetch(() => getMyGmail(profile.id), [profile.id])
  const orgFiles = useFetch(() => (context.organization?.id ? listOrgFiles(context.organization.id) : Promise.resolve([])), [context.organization?.id])
  const contactEmail = context.contact?.email || context.lead?.email || context.deal?.contact?.email || ''
  const [tpl, setTpl] = useState(initial.template_id || '')
  const [to, setTo] = useState(initial.to?.length ? initial.to.join(', ') : contactEmail)
  const [cc, setCc] = useState(''); const [bcc, setBcc] = useState(''); const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(initial.subject || ''); const [body, setBody] = useState(initial.body || '')
  const [uploads, setUploads] = useState([]); const [picked, setPicked] = useState(new Set())
  const [attachInvoice, setAttachInvoice] = useState(Boolean(includeInvoice && context.invoice))
  const [tab, setTab] = useState('write'); const [sending, setSending] = useState(false)
  const bodyRef = useRef(null); const fileRef = useRef(null)
  const ctx = useMemo(() => buildContext({ ...context, sender: profile }), [context, profile])
  const rendered = renderEmail(subject, body, ctx)
  const connected = gmail.data?.status === 'connected'

  const pickTemplate = (id) => {
    setTpl(id)
    const t = (templates.data || []).find((x) => x.id === id)
    if (t) { setSubject(t.subject); setBody(t.body) }
  }
  const insertVar = (key) => {
    const token = `{{${key}}}`; const el = bodyRef.current
    if (!el) { setBody((b) => b + token); return }
    const s = el.selectionStart ?? body.length; const e = el.selectionEnd ?? s
    setBody(body.slice(0, s) + token + body.slice(e))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length) })
  }
  const addFiles = (e) => {
    const files = [...e.target.files]; e.target.value = ''
    const total = uploads.reduce((n, u) => n + u.size, 0) + files.reduce((n, f) => n + f.size, 0)
    if (total > MAX_BYTES) return toast.error('Attachments can be at most 10 MB in total.')
    setUploads((u) => [...u, ...files.map((f) => ({ name: f.name, size: f.size, type: f.type || 'application/octet-stream', file: f }))])
  }
  const togglePick = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const send = async () => {
    const recipients = split(to)
    if (!recipients.length) return toast.error('Add at least one recipient.')
    if (!rendered.subject.trim()) return toast.error('Add a subject.')
    if (!rendered.body.trim()) return toast.error('Write a message.')
    if (rendered.missing.length) return toast.error(`Fill in or remove: ${rendered.missing.join(', ')}`)
    setSending(true)
    try {
      const inv = context.invoice
      const uploadsOut = await Promise.all(uploads.map(async (u) => ({ name: u.name, type: u.type, data_base64: await blobToBase64(u.file) })))
      if (attachInvoice && inv) uploadsOut.push({ name: invoiceFileName(inv), type: 'application/pdf', data_base64: await blobToBase64(await invoicePdfBlob(inv, inv.items || [])) })
      const links = { contact_id: context.contact?.id, lead_id: context.lead?.id, organization_id: context.organization?.id || context.contact?.organization?.id,
        deal_id: context.deal?.id, invoice_id: inv?.id, task_id: context.task?.id }
      const res = await sendEmail({ to: recipients, cc: split(cc), bcc: split(bcc), subject: rendered.subject, body_text: rendered.body,
        template_id: tpl || undefined, links, file_ids: [...picked], uploads: uploadsOut })
      if (inv && can('invoices.approve')) { try { await recordSend(inv.id, 'email', recipients[0]) } catch { /* the email itself went out */ } }
      toast.success(`Sent from ${res.sent_from || gmail.data?.email}`)
      onSent?.(res); onClose()
    } catch (e) { toast.error(friendlyError(e)) } finally { setSending(false) }
  }

  return (
    <Modal open title={initial.title || 'New email'} onClose={() => !sending && onClose()} size="lg">
      {!connected && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {gmail.loading ? 'Checking your Gmail connection…' : gmail.data?.status === 'needs_reconnect' ? 'Your Gmail connection needs to be renewed.' : 'Connect your Gmail account to send email from your own address.'}{' '}
          <Link to="/settings?tab=email" className="font-semibold underline" onClick={onClose}>Open email settings</Link>
        </p>)}
      {gmail.loading && !gmail.data && <Spinner className="py-2" />}
      {connected && <p className="mb-3 text-xs text-ink-500">From: <span className="font-medium text-ink-700">{gmail.data.email}</span></p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className="label">Template</span>
          <select className="input" value={tpl} onChange={(e) => pickTemplate(e.target.value)}>
            <option value="">No template</option>
            {(templates.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
        <div className="sm:col-span-2">
          <div className="flex items-end justify-between gap-2"><span className="label">To</span>
            <button type="button" className="text-xs font-medium text-brand-600 hover:underline" onClick={() => setShowCc((v) => !v)}>{showCc ? 'Hide Cc / Bcc' : 'Cc / Bcc'}</button></div>
          <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com, another@company.com" aria-label="To" />
        </div>
        {showCc && <>
          <label className="block"><span className="label">Cc</span><input className="input" value={cc} onChange={(e) => setCc(e.target.value)} aria-label="Cc" /></label>
          <label className="block"><span className="label">Bcc</span><input className="input" value={bcc} onChange={(e) => setBcc(e.target.value)} aria-label="Bcc" /></label>
        </>}
        <label className="block sm:col-span-2"><span className="label">Subject</span><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex items-center gap-1">
          {[['write', 'Write'], ['preview', 'Preview']].map(([k, label]) => {
            const active = tab === k
            return (
              <button
                key={k}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(k)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active ? 'bg-brand-50 text-brand-700 shadow-xs' : 'text-ink-500 hover:bg-ink-100'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <select className="input !w-auto text-xs" value="" onChange={(e) => e.target.value && insertVar(e.target.value)} aria-label="Insert a field">
          <option value="">Insert field…</option>
          {VARIABLE_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.items.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}
        </select>
      </div>
      {tab === 'write' ? (
        <textarea ref={bodyRef} rows={10} className="input mt-2" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" />
      ) : (
        <div className="mt-2 rounded-lg border border-ink-100 bg-white p-4 text-sm">
          <p className="mb-2 font-semibold">{rendered.subject || '(no subject)'}</p>
          <div className="whitespace-pre-wrap">{rendered.body || '(empty message)'}</div>
        </div>)}
      {rendered.missing.length > 0 && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">Empty fields: {rendered.missing.join(', ')}. Fill them in on the record or remove them from the message.</p>}

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between"><span className="label mb-0">Attachments</span>
          <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => fileRef.current?.click()}><Paperclip className="h-3.5 w-3.5" />Add files</button>
          <input ref={fileRef} type="file" multiple hidden onChange={addFiles} /></div>
        <ul className="space-y-1 text-sm">
          {uploads.map((u, i) => (
            <li key={`u${i}`} className="flex items-center justify-between rounded bg-ink-50 px-2 py-1">
              <span className="truncate">{u.name} <span className="text-xs text-ink-500">{kb(u.size)}</span></span>
              <button type="button" aria-label={`Remove ${u.name}`} onClick={() => setUploads((x) => x.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
            </li>))}
          {context.invoice && (
            <li><label className="flex items-center gap-2"><input type="checkbox" checked={attachInvoice} onChange={(e) => setAttachInvoice(e.target.checked)} />Attach invoice PDF ({invoiceFileName(context.invoice)})</label></li>)}
        </ul>
        {(orgFiles.data || []).length > 0 && (
          <details className="rounded-lg border border-ink-100 p-2 text-sm">
            <summary className="cursor-pointer font-medium">Attach from {context.organization?.name} files ({picked.size} selected)</summary>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {orgFiles.data.slice(0, 100).map((f) => (
                <li key={f.id}><label className="flex items-center gap-2"><input type="checkbox" checked={picked.has(f.id)} onChange={() => togglePick(f.id)} />{f.name}</label></li>))}
            </ul>
          </details>)}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-end gap-2.5 border-t border-ink-100 pt-4">
        <button type="button" className="btn-outline" onClick={onClose} disabled={sending}>Cancel</button>
        <button type="button" className="btn-primary" disabled={!connected || sending || rendered.missing.length > 0} onClick={send}>
          <Send className="h-4 w-4" />{sending ? 'Sending…' : 'Send'}</button>
      </div>
    </Modal>
  )
}
