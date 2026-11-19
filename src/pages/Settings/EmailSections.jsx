import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { buildContext, renderEmail, VARIABLE_GROUPS } from '../../lib/emailTemplate'
import { friendlyError } from '../../lib/errors'
import { connectGmail, deleteTemplate, disconnectGmail, getMyGmail, listTemplates, saveTemplate } from '../../services/email'
import { updateOwnProfile } from '../../services/settings'
import Badge from '../../components/common/Badge'
import ConfirmDialog from '../../components/common/ConfirmDialog'
import ErrorState from '../../components/common/ErrorState'
import Modal from '../../components/common/Modal'
import Spinner from '../../components/common/Spinner'
import { Card } from './Sections'

const SAMPLE = buildContext({
  contact: { first_name: 'Asha', last_name: 'Verma', email: 'asha@example.com', designation: 'CTO', organization: { name: 'Acme Ltd' } },
  organization: { name: 'Acme Ltd' }, deal: { title: 'Website redesign', value: 4500, currency: 'USD' },
  invoice: { invoice_number: 'INV-2026-0001', total: 1925, balance: 1925, currency: 'USD', due_date: '2026-12-19' },
  task: { title: 'Send proposal', due_date: '2026-11-25' },
  sender: { full_name: 'Rita Rep', email: 'rita@crm.test', email_signature: 'Rita Rep\nAwenue Global Software Solutions' },
})

const NOTICE = {
  connected: ['success', 'Gmail connected. Emails you send now go from your own address.'],
  denied: ['error', 'Google access wasn’t granted, so nothing was connected.'],
  unverified: ['error', 'Google reports that address isn’t verified.'],
  in_use: ['error', 'That Gmail address is already connected to another person.'],
  inactive: ['error', 'Your account isn’t active.'],
  no_refresh_token: ['error', 'Google didn’t return a long-lived permission. Try connecting again.'],
}

export function EmailAccountSection() {
  const { profile, refreshProfile } = useAuth()
  const [sp, setSp] = useSearchParams()
  const gmail = useFetch(() => getMyGmail(profile.id), [profile.id])
  const [sig, setSig] = useState(profile.email_signature || '')
  const [busy, setBusy] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    const r = sp.get('gmail'); if (!r) return
    const [kind, text] = NOTICE[r] || ['error', 'Gmail couldn’t be connected. Try again.']
    if (kind === 'success') { toast.success(text); gmail.reload() } else toast.error(text)
    const next = new URLSearchParams(sp); next.delete('gmail'); setSp(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connect = async () => { setBusy(true); try { await connectGmail() } catch (e) { toast.error(friendlyError(e)); setBusy(false) } }
  const saveSignature = async () => {
    setBusy(true)
    try { await updateOwnProfile(profile.id, { email_signature: sig.trim() || null }); await refreshProfile(); toast.success('Signature saved') }
    catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  const g = gmail.data
  const state = g?.status === 'connected' ? 'Connected' : g?.status === 'needs_reconnect' ? 'Needs reconnecting' : 'Not connected'
  return (
    <>
      <Card title="Your Gmail account" description="Each person sends from their own Gmail address. Nobody can send as someone else, and the account’s permission can be revoked at any time from your Google account.">
        {gmail.loading && !gmail.data ? <Spinner /> : gmail.error ? <ErrorState message={gmail.error} onRetry={gmail.reload} /> : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{g ? g.email : 'No account connected'}</p>
              <p className="mt-1 flex items-center gap-2 text-xs text-ink-500"><Badge tone={g?.status === 'connected' ? 'green' : g ? 'amber' : 'gray'}>{state}</Badge>{g?.connected_at && <span>since {new Date(g.connected_at).toLocaleDateString('en-GB')}</span>}</p>
              {g?.last_error && <p className="mt-1 text-xs text-red-600">{g.last_error}</p>}
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" disabled={busy} onClick={connect}>{g ? 'Reconnect Gmail' : 'Connect Gmail'}</button>
              {g && <button className="btn-ghost border border-ink-300 !text-red-600" disabled={busy} onClick={() => setDisconnecting(true)}>Disconnect</button>}
            </div>
          </div>)}
        <p className="mt-4 rounded-lg bg-ink-50 p-3 text-xs text-ink-700">Gmail only allows sending, not reading your inbox, so replies arrive in your normal Gmail. Google may ask you to confirm access the first time.</p>
      </Card>

      <Card title="Email signature" description="Added to the end of your emails unless a template places it elsewhere with {{sender.signature}}.">
        <textarea rows={4} className="input max-w-xl" value={sig} onChange={(e) => setSig(e.target.value)} aria-label="Email signature" maxLength={2000} />
        <button className="btn-primary mt-3" disabled={busy} onClick={saveSignature}>Save signature</button>
      </Card>

      <ConfirmDialog open={disconnecting} title="Disconnect Gmail?" confirmLabel="Disconnect"
        message="You won’t be able to send email until you connect again. Emails already sent stay in each record’s history."
        onClose={() => setDisconnecting(false)}
        onConfirm={async () => { await disconnectGmail(); toast.success('Gmail disconnected'); setDisconnecting(false); gmail.reload() }} />
    </>
  )
}

function TemplateModal({ template, profile, onClose, onSaved }) {
  const [name, setName] = useState(template.name || '')
  const [subject, setSubject] = useState(template.subject || '')
  const [body, setBody] = useState(template.body || '')
  const [shared, setShared] = useState(template.shared ?? true)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)
  const insert = (key) => {
    const token = `{{${key}}}`; const el = ref.current
    const s = el?.selectionStart ?? body.length; const e = el?.selectionEnd ?? s
    setBody(body.slice(0, s) + token + body.slice(e))
  }
  const preview = renderEmail(subject, body, SAMPLE)
  const save = async () => {
    if (!name.trim() || !subject.trim() || !body.trim()) return toast.error('Name, subject and message are required.')
    setBusy(true)
    try { await saveTemplate({ name, subject, body, shared }, profile, template.id); toast.success('Template saved'); onSaved() }
    catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <Modal open title={template.id ? 'Edit template' : 'New template'} onClose={() => !busy && onClose()} size="lg">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block"><span className="label">Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></label>
        <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Shared with everyone in the workspace</label>
        <label className="block sm:col-span-2"><span className="label">Subject</span><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} /></label>
        <div className="sm:col-span-2">
          <div className="mb-1 flex items-center justify-between"><span className="label mb-0">Message</span>
            <select className="input !w-auto text-xs" value="" onChange={(e) => e.target.value && insert(e.target.value)} aria-label="Insert a field">
              <option value="">Insert field…</option>
              {VARIABLE_GROUPS.map((g) => <optgroup key={g.label} label={g.label}>{g.items.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}
            </select></div>
          <textarea ref={ref} rows={8} className="input" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="sm:col-span-2 rounded-lg border border-ink-100 bg-white p-4 text-sm">
          <p className="mb-1 text-xs font-medium text-ink-500">Preview with sample data</p>
          <p className="font-semibold">{preview.subject || '(no subject)'}</p>
          <div className="mt-2 whitespace-pre-wrap">{preview.body || '(empty)'}</div>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2 border-t border-ink-100 pt-4">
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save template'}</button>
      </div>
    </Modal>
  )
}

export function EmailTemplatesSection() {
  const { profile, can } = useAuth()
  const list = useFetch(listTemplates, [])
  const [editing, setEditing] = useState(null)
  const [removing, setRemoving] = useState(null)
  const mine = (t) => t.created_by === profile.id || can('communications.manage')
  return (
    <Card title="Email templates" description="Reusable emails whose fields fill in from each record: name, company, deal, invoice and your signature. Shared templates are visible to everyone; private ones only to you.">
      {can('communications.create') && <button className="btn-primary mb-4" onClick={() => setEditing({})}><Plus className="h-4 w-4" />New template</button>}
      {list.loading && !list.data ? <Spinner /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} />
        : !list.data?.length ? <p className="text-sm text-ink-500">No templates yet. Create one for follow-ups, proposals or invoice reminders.</p>
        : (
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-100">
            {list.data.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0"><p className="flex items-center gap-2 text-sm font-medium">{t.name}{!t.shared && <Badge>Private</Badge>}</p><p className="truncate text-xs text-ink-500">{t.subject}</p></div>
                {mine(t) && <div className="flex gap-1">
                  <button className="btn-ghost !p-1.5" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></button>
                  <button className="btn-ghost !p-1.5 hover:!bg-red-50 hover:!text-red-600" aria-label={`Delete ${t.name}`} onClick={() => setRemoving(t)}><Trash2 className="h-4 w-4" /></button>
                </div>}
              </li>))}
          </ul>)}
      {editing && <TemplateModal template={editing} profile={profile} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload() }} />}
      <ConfirmDialog open={Boolean(removing)} title="Delete template?" message={`“${removing?.name}” will be removed. Emails already sent from it keep their text.`}
        onClose={() => setRemoving(null)} onConfirm={async () => { await deleteTemplate(removing.id); toast.success('Template deleted'); setRemoving(null); list.reload() }} />
    </Card>
  )
}
