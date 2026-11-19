import { useCallback, useEffect, useState } from 'react'
import { Eye, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { useFetch } from '../../hooks/useFetch'
import { listContactOptions, listOrganizationOptions } from '../../services/lookups'
import { getInvoiceSettings, listServicesWithPrices, saveInvoice } from '../../services/invoices'
import { calcInvoice, calcLine } from '../../lib/invoiceCalc'
import { friendlyError } from '../../lib/errors'
import { invoicePdfBlob } from '../../lib/invoicePdf'
import { CURRENCIES } from '../../constants/options'
import { fmtMoney } from '../../lib/format'
import { Field } from '../../components/forms/FormParts'
import Spinner from '../../components/common/Spinner'
import Modal from '../../components/common/Modal'
import CustomerPicker from '../../components/invoices/CustomerPicker'
import LineDescription from '../../components/invoices/LineDescription'

const blankLine = () => ({ description: '', quantity: '1', unit_price: '', discount_type: 'percent', discount_value: '0', tax_rate: '0' })
const toNum = (v) => (isNaN(Number(v)) || String(v).trim() === '' ? 0 : Number(v))
const FIELDS = ['bill_to_name', 'bill_to_email', 'bill_to_phone', 'bill_to_address', 'bill_to_tax_id', 'organization_id', 'contact_id', 'lead_id', 'deal_id', 'issue_date', 'due_date', 'currency', 'notes', 'terms', 'payment_instructions']
const asLine = (i) => ({ description: i.description ?? '', quantity: String(i.quantity ?? 1), unit_price: String(i.unit_price ?? ''), discount_type: i.discount_type || 'percent', discount_value: String(i.discount_value ?? 0), tax_rate: String(i.tax_rate ?? 0) })

function LineItem({ item, index, onChange, onPatch, onRemove, currency, errors, services }) {
  const calc = calcLine({ quantity: toNum(item.quantity), unit_price: toNum(item.unit_price), discount_type: item.discount_type, discount_value: toNum(item.discount_value), tax_rate: toNum(item.tax_rate) })
  const f = (k) => (e) => onChange(index, k, e.target.value)
  const err = (k) => errors[`${index}.${k}`]
  return (
    <div className="rounded-lg border border-ink-100 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className="mt-2 text-xs font-semibold text-ink-500">Line {index + 1}</span>
        <button type="button" className="btn-ghost !p-1.5 !text-red-500" onClick={() => onRemove(index)} aria-label={`Remove line ${index + 1}`}><Trash2 className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-6">
          <span className="label">Description</span>
          <LineDescription value={item.description} onChange={(v) => onChange(index, 'description', v)} onPick={(patch) => onPatch(index, patch)} services={services} currency={currency} />
          {err('description') && <p className="field-error">{err('description')}</p>}
        </div>
        <Field label="Quantity" error={err('quantity')}><input type="number" step="any" min="0.001" className="input" value={item.quantity} onChange={f('quantity')} /></Field>
        <Field label="Unit price" className="sm:col-span-2" error={err('unit_price')}><input type="number" step="any" min="0" className="input" value={item.unit_price} onChange={f('unit_price')} /></Field>
        <Field label="Discount type"><select className="input" value={item.discount_type} onChange={f('discount_type')}><option value="percent">%</option><option value="amount">{currency}</option></select></Field>
        <Field label="Discount"><input type="number" step="any" min="0" className="input" value={item.discount_value} onChange={f('discount_value')} /></Field>
        <Field label="Tax rate %"><input type="number" step="any" min="0" max="100" className="input" value={item.tax_rate} onChange={f('tax_rate')} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-4 text-sm text-ink-500">
        <span>Subtotal {fmtMoney(calc.subtotal, currency)}</span>
        {calc.discount > 0 && <span className="text-emerald-600">−{fmtMoney(calc.discount, currency)}</span>}
        {calc.tax > 0 && <span>Tax +{fmtMoney(calc.tax, currency)}</span>}
        <span className="font-semibold text-ink-900">{fmtMoney(calc.total, currency)}</span>
      </div>
    </div>
  )
}

// prefill: values copied from the record the invoice is created from (organization, contact, lead or deal)
export default function InvoiceForm({ initial, prefill, onClose, onSaved }) {
  const settings = useFetch(getInvoiceSettings, [])
  const orgs = useFetch(listOrganizationOptions, [])
  const contacts = useFetch(listContactOptions, [])
  const services = useFetch(listServicesWithPrices, [])
  const base = { ...(prefill || {}), ...(initial || {}) }
  const [inv, setInv] = useState(() => ({
    ...Object.fromEntries(FIELDS.map((k) => [k, base[k] ?? (k === 'issue_date' ? new Date().toISOString().slice(0, 10) : k === 'currency' ? '' : '')])),
    _lead_label: base._lead_label || (base.lead ? `LD-${String(base.lead.lead_number).padStart(4, '0')} · ${[base.lead.first_name, base.lead.last_name].filter(Boolean).join(' ')}` : ''),
    _deal_label: base._deal_label || base.deal?.title || '',
  }))
  const [items, setItems] = useState(() => (base.items?.length ? base.items.map(asLine) : [blankLine()]))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const calc = calcInvoice(items.map((it) => ({ quantity: toNum(it.quantity), unit_price: toNum(it.unit_price), discount_type: it.discount_type, discount_value: toNum(it.discount_value), tax_rate: toNum(it.tax_rate) })))

  // defaults from Settings (currency, terms, payment details, due date) fill only what is still empty
  useEffect(() => {
    const s = settings.data; if (!s) return
    setInv((v) => {
      const next = { ...v, currency: v.currency || s.default_currency || 'USD', terms: v.terms || s.terms || '', payment_instructions: v.payment_instructions || s.payment_instructions || '' }
      if (!next.due_date) { const d = new Date(`${next.issue_date}T00:00:00`); d.setDate(d.getDate() + (s.default_due_days ?? 14)); next.due_date = d.toISOString().slice(0, 10) }
      return next
    })
    if (!initial?.id) setItems((it) => it.map((l) => (l.tax_rate === '0' && !l.description && s.default_tax_rate ? { ...l, tax_rate: String(s.default_tax_rate) } : l)))
  }, [settings.data]) // eslint-disable-line react-hooks/exhaustive-deps

  const setF = (k) => (e) => setInv((v) => ({ ...v, [k]: e.target.value }))
  const changeItem = useCallback((i, k, v) => setItems((it) => it.map((x, j) => (j === i ? { ...x, [k]: v } : x))), [])
  const patchItem = useCallback((i, patch) => setItems((it) => it.map((x, j) => (j === i ? { ...x, ...patch } : x))), [])
  const removeItem = useCallback((i) => setItems((it) => it.filter((_, j) => j !== i)), [])

  const unlink = (k) => setInv((v) => ({ ...v, [k]: '', ...(k === 'lead_id' ? { _lead_label: '' } : {}), ...(k === 'deal_id' ? { _deal_label: '' } : {}) }))
  const orgName = (orgs.data || []).find((o) => o.id === inv.organization_id)?.name
  const c = (contacts.data || []).find((x) => x.id === inv.contact_id)
  const chips = [['organization_id', 'Organization', orgName], ['contact_id', 'Contact', c && [c.first_name, c.last_name].filter(Boolean).join(' ')], ['lead_id', 'Lead', inv._lead_label], ['deal_id', 'Deal', inv._deal_label]].filter(([k, , label]) => inv[k] && label)

  const validate = () => {
    const e = {}
    if (!inv.bill_to_name.trim()) e.bill_to_name = 'Enter who the invoice is for'
    if (!inv.issue_date) e.issue_date = 'Required'
    if (!inv.due_date) e.due_date = 'Required'
    if (inv.due_date && inv.issue_date && inv.due_date < inv.issue_date) e.due_date = 'Must be on or after the issue date'
    items.forEach((it, i) => {
      if (!it.description.trim()) e[`${i}.description`] = 'Required'
      if (it.unit_price === '' || toNum(it.unit_price) < 0) e[`${i}.unit_price`] = 'Required'
      if (toNum(it.quantity) <= 0) e[`${i}.quantity`] = 'Must be above 0'
    })
    return e
  }
  const lines = () => items.map((it) => ({ description: it.description.trim(), quantity: toNum(it.quantity), unit_price: toNum(it.unit_price), discount_type: it.discount_type, discount_value: toNum(it.discount_value), tax_rate: toNum(it.tax_rate) }))

  const save = async () => {
    const e = validate(); setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      const payload = Object.fromEntries(FIELDS.map((k) => [k, inv[k]])); payload.id = initial?.id || undefined
      const id = await saveInvoice(payload, lines())
      toast.success(initial?.id ? 'Invoice saved' : 'Draft invoice created'); onSaved(id)
    } catch (err) { toast.error(friendlyError(err)) } finally { setSaving(false) }
  }

  const showPreview = async () => {
    const e = validate(); setErrors(e)
    if (Object.keys(e).length) return toast.error('Fix the highlighted fields to preview.')
    setPreviewing(true)
    try {
      const s = settings.data || {}
      const blob = await invoicePdfBlob({ ...inv, invoice_number: initial?.invoice_number || 'DRAFT', status: 'draft', amount_paid: 0,
        issuer: { company_name: s.company_name, address: s.address, email: s.email, phone: s.phone, website: s.website, tax_id: s.tax_id, logo_url: s.logo_url, signature_url: s.signature_url } }, lines())
      setPreview(URL.createObjectURL(blob))
    } catch (err) { toast.error(friendlyError(err)) } finally { setPreviewing(false) }
  }
  const closePreview = () => { if (preview) URL.revokeObjectURL(preview); setPreview(null) }

  if (settings.loading) return <Spinner className="py-20" />
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="sm:col-span-2">
          <span className="label">Bill to <span className="text-red-500">*</span></span>
          <CustomerPicker value={inv.bill_to_name} onChange={(v) => setInv((s) => ({ ...s, bill_to_name: v }))} onPick={(patch) => setInv((s) => ({ ...s, ...patch }))} />
          {errors.bill_to_name && <p className="field-error">{errors.bill_to_name}</p>}
          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map(([k, label, text]) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">{label}: <strong className="font-semibold">{text}</strong>
                  <button type="button" className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Unlink ${label}`} onClick={() => unlink(k)}><X className="h-3 w-3" /></button></span>))}
            </div>)}
        </div>
        <Field label="Email"><input type="email" className="input" value={inv.bill_to_email} onChange={setF('bill_to_email')} /></Field>
        <Field label="Phone"><input className="input" value={inv.bill_to_phone} onChange={setF('bill_to_phone')} /></Field>
        <Field label="Address" className="sm:col-span-2"><textarea rows={2} className="input" value={inv.bill_to_address} onChange={setF('bill_to_address')} /></Field>
        <Field label="Tax ID / registration no."><input className="input" value={inv.bill_to_tax_id} onChange={setF('bill_to_tax_id')} /></Field>
        <Field label="Organization"><select className="input" value={inv.organization_id} onChange={setF('organization_id')}><option value="">None</option>{(orgs.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
        <Field label="Contact"><select className="input" value={inv.contact_id} onChange={setF('contact_id')}><option value="">None</option>{(contacts.data || []).map((x) => <option key={x.id} value={x.id}>{[x.first_name, x.last_name].filter(Boolean).join(' ')}</option>)}</select></Field>
        <Field label="Currency"><select className="input" value={inv.currency} onChange={setF('currency')}>{CURRENCIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Issue date" error={errors.issue_date} required><input type="date" className="input" value={inv.issue_date} onChange={setF('issue_date')} /></Field>
        <Field label="Due date" error={errors.due_date} required><input type="date" className="input" value={inv.due_date} onChange={setF('due_date')} /></Field>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Line items</h2>
        <button type="button" className="btn-ghost border border-ink-300" onClick={() => setItems((it) => [...it, blankLine()])}><Plus className="h-4 w-4" />Add line</button>
      </div>
      <div className="mb-5 space-y-3">
        {items.map((it, i) => <LineItem key={i} item={it} index={i} onChange={changeItem} onPatch={patchItem} onRemove={removeItem} currency={inv.currency || 'USD'} errors={errors} services={services.data || []} />)}
        {items.length === 0 && <p className="rounded-lg border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500">No line items yet. Add at least one.</p>}
      </div>

      <div className="mb-5 flex justify-end">
        <div className="w-60 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-ink-500">Sub total</span><span>{fmtMoney(calc.subtotal, inv.currency || 'USD')}</span></div>
          {calc.discount > 0 && <div className="flex justify-between"><span className="text-ink-500">Discount</span><span className="text-emerald-600">−{fmtMoney(calc.discount, inv.currency || 'USD')}</span></div>}
          {calc.taxBreakdown.map((t) => <div key={t.rate} className="flex justify-between"><span className="text-ink-500">Tax ({t.rate}%)</span><span>{fmtMoney(t.amount, inv.currency || 'USD')}</span></div>)}
          <div className="flex justify-between border-t border-ink-200 pt-1 text-base font-bold"><span>Grand total</span><span>{fmtMoney(calc.total, inv.currency || 'USD')}</span></div>
        </div>
      </div>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Field label="Payment info" className="sm:col-span-2"><textarea rows={3} className="input" value={inv.payment_instructions} onChange={setF('payment_instructions')} placeholder={'Bank Name: …\nAccount Name: …\nAccount No.: …'} /></Field>
        <Field label="Notes"><textarea rows={3} className="input" value={inv.notes} onChange={setF('notes')} /></Field>
        <Field label="Terms and conditions (one per line)"><textarea rows={3} className="input" value={inv.terms} onChange={setF('terms')} /></Field>
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-ink-100 pt-4">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="btn-ghost border border-ink-300" onClick={showPreview} disabled={previewing}><Eye className="h-4 w-4" />{previewing ? 'Preparing…' : 'Preview PDF'}</button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || items.length === 0}>{saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Create draft'}</button>
      </div>

      <Modal open={Boolean(preview)} title="Invoice preview" onClose={closePreview} size="lg">
        {preview && <iframe title="Invoice preview" src={preview} className="h-[75vh] w-full rounded-lg border border-ink-100" />}
      </Modal>
    </div>
  )
}
