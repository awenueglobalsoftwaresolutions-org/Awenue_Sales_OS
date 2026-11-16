import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { listContactOptions, listOrganizationOptions } from '../../services/lookups'
import { getInvoiceSettings, saveInvoice } from '../../services/invoices'
import { calcInvoice, calcLine } from '../../lib/invoiceCalc'
import { friendlyError } from '../../lib/errors'
import { CURRENCIES } from '../../constants/options'
import { fmtMoney } from '../../lib/format'
import { Field } from '../../components/forms/FormParts'
import Spinner from '../../components/common/Spinner'

const blank = () => ({ description: '', quantity: '1', unit_price: '', discount_type: 'percent', discount_value: '0', tax_rate: '0' })
const toNum = (v) => (isNaN(Number(v)) || String(v).trim() === '' ? 0 : Number(v))

function LineItem({ item, index, onChange, onRemove, currency, errors }) {
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
        <Field label="Description" className="sm:col-span-6" error={err('description')}><input className="input" value={item.description} onChange={f('description')} placeholder="e.g. Website development" /></Field>
        <Field label="Quantity" error={err('quantity')}><input type="number" step="any" min="0.001" className="input" value={item.quantity} onChange={f('quantity')} /></Field>
        <Field label="Unit price" className="sm:col-span-2" error={err('unit_price')}><input type="number" step="any" min="0" className="input" value={item.unit_price} onChange={f('unit_price')} /></Field>
        <Field label="Discount type"><select className="input" value={item.discount_type} onChange={f('discount_type')}><option value="percent">%</option><option value="amount">{currency}</option></select></Field>
        <Field label="Discount value"><input type="number" step="any" min="0" className="input" value={item.discount_value} onChange={f('discount_value')} /></Field>
        <Field label="Tax rate %"><input type="number" step="any" min="0" max="100" className="input" value={item.tax_rate} onChange={f('tax_rate')} /></Field>
      </div>
      <div className="mt-3 flex justify-end gap-4 text-sm text-ink-500">
        <span>Sub: {fmtMoney(calc.subtotal, currency)}</span>
        {calc.discount > 0 && <span className="text-emerald-600">−{fmtMoney(calc.discount, currency)}</span>}
        {calc.tax > 0 && <span>Tax: +{fmtMoney(calc.tax, currency)}</span>}
        <span className="font-semibold text-ink-900">= {fmtMoney(calc.total, currency)}</span>
      </div>
    </div>
  )
}

export default function InvoiceForm({ initial, onClose, onSaved }) {
  const { profile } = useAuth()
  const settings = useFetch(getInvoiceSettings, [])
  const orgs = useFetch(listOrganizationOptions, [])
  const contacts = useFetch(listContactOptions, [])
  const defaults = { bill_to_name: '', bill_to_email: '', bill_to_phone: '', bill_to_address: '', bill_to_tax_id: '', organization_id: '', contact_id: '', issue_date: new Date().toISOString().slice(0, 10), due_date: '', currency: 'USD', notes: '', terms: '', payment_instructions: '' }
  const [inv, setInv] = useState(() => Object.fromEntries(Object.keys(defaults).map((k) => [k, initial?.[k] ?? defaults[k]])))
  const [items, setItems] = useState(() => (initial?.items?.length ? initial.items.map((i) => ({ description: i.description, quantity: String(i.quantity), unit_price: String(i.unit_price), discount_type: i.discount_type, discount_value: String(i.discount_value), tax_rate: String(i.tax_rate) })) : [blank()]))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const calc = calcInvoice(items.map((it) => ({ quantity: toNum(it.quantity), unit_price: toNum(it.unit_price), discount_type: it.discount_type, discount_value: toNum(it.discount_value), tax_rate: toNum(it.tax_rate) })))

  useEffect(() => {
    if (!settings.data) return
    const s = settings.data
    setInv((v) => ({ currency: s.default_currency || 'USD', terms: s.terms || '', payment_instructions: s.payment_instructions || '', ...v }))
    if (!initial?.id && !inv.due_date) {
      const issue = new Date(inv.issue_date + 'T00:00:00'); issue.setDate(issue.getDate() + (s.default_due_days ?? 14))
      setInv((v) => ({ ...v, due_date: issue.toISOString().slice(0, 10) }))
    }
  }, [settings.data, initial?.id])

  const setF = (k) => (e) => setInv((v) => ({ ...v, [k]: e.target.value }))
  const changeItem = useCallback((i, k, v) => setItems((it) => it.map((x, j) => (j === i ? { ...x, [k]: v } : x))), [])
  const removeItem = useCallback((i) => setItems((it) => it.filter((_, j) => j !== i)), [])
  const addItem = () => setItems((it) => [...it, blank()])

  const validate = () => {
    const e = {}
    if (!inv.bill_to_name.trim()) e.bill_to_name = 'Enter a name'
    if (!inv.issue_date) e.issue_date = 'Required'
    if (!inv.due_date) e.due_date = 'Required'
    if (inv.due_date && inv.issue_date && inv.due_date < inv.issue_date) e.due_date = 'Must be on or after the issue date'
    items.forEach((it, i) => {
      if (!it.description.trim()) e[`${i}.description`] = 'Required'
      if (!it.unit_price || toNum(it.unit_price) < 0) e[`${i}.unit_price`] = 'Required'
      if (toNum(it.quantity) <= 0) e[`${i}.quantity`] = 'Must be > 0'
    })
    return e
  }

  const save = async () => {
    const e = validate(); setErrors(e)
    if (Object.keys(e).length) return
    setSaving(true)
    try {
      const payload = { ...inv, id: initial?.id || undefined }   // only these fields are sent
      const id = await saveInvoice(payload, items.map((it, i) => ({ description: it.description.trim(), quantity: toNum(it.quantity), unit_price: toNum(it.unit_price), discount_type: it.discount_type, discount_value: toNum(it.discount_value), tax_rate: toNum(it.tax_rate) })))
      toast.success(initial?.id ? 'Invoice saved' : 'Draft invoice created')
      onSaved(id)
    } catch (err) { toast.error(friendlyError(err)) } finally { setSaving(false) }
  }

  if (settings.loading) return <Spinner className="py-20" />
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Bill to (name)" required error={errors.bill_to_name}><input className="input" value={inv.bill_to_name} onChange={setF('bill_to_name')} /></Field>
        <Field label="Bill to (email)"><input type="email" className="input" value={inv.bill_to_email} onChange={setF('bill_to_email')} /></Field>
        <Field label="Bill to (phone)"><input className="input" value={inv.bill_to_phone} onChange={setF('bill_to_phone')} /></Field>
        <Field label="Bill to (address)" className="sm:col-span-2"><input className="input" value={inv.bill_to_address} onChange={setF('bill_to_address')} /></Field>
        <Field label="Bill to (tax ID)"><input className="input" value={inv.bill_to_tax_id} onChange={setF('bill_to_tax_id')} /></Field>
        <Field label="Organization"><select className="input" value={inv.organization_id} onChange={setF('organization_id')}><option value="">None</option>{(orgs.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
        <Field label="Contact"><select className="input" value={inv.contact_id} onChange={setF('contact_id')}><option value="">None</option>{(contacts.data || []).map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}</select></Field>
        <Field label="Currency"><select className="input" value={inv.currency} onChange={setF('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Issue date" error={errors.issue_date} required><input type="date" className="input" value={inv.issue_date} onChange={setF('issue_date')} /></Field>
        <Field label="Due date" error={errors.due_date} required><input type="date" className="input" value={inv.due_date} onChange={setF('due_date')} /></Field>
        <Field label="Notes" className="sm:col-span-3"><textarea rows={2} className="input" value={inv.notes} onChange={setF('notes')} /></Field>
        <Field label="Payment instructions" className="sm:col-span-2"><textarea rows={2} className="input" value={inv.payment_instructions} onChange={setF('payment_instructions')} /></Field>
        <Field label="Terms & conditions"><textarea rows={2} className="input" value={inv.terms} onChange={setF('terms')} /></Field>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Line items</h2>
        <button type="button" className="btn-ghost border border-ink-300" onClick={addItem}><Plus className="h-4 w-4" />Add line</button>
      </div>
      <div className="mb-5 space-y-3">
        {items.map((it, i) => <LineItem key={i} item={it} index={i} onChange={changeItem} onRemove={removeItem} currency={inv.currency} errors={errors} />)}
        {items.length === 0 && <p className="rounded-lg border border-dashed border-ink-300 p-6 text-center text-sm text-ink-500">No line items yet. Add at least one.</p>}
      </div>

      <div className="mb-5 flex justify-end">
        <div className="w-56 space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-ink-500">Subtotal</span><span>{fmtMoney(calc.subtotal, inv.currency)}</span></div>
          {calc.discount > 0 && <div className="flex justify-between"><span className="text-ink-500">Discount</span><span className="text-emerald-600">−{fmtMoney(calc.discount, inv.currency)}</span></div>}
          {calc.taxBreakdown.map((t) => <div key={t.rate} className="flex justify-between"><span className="text-ink-500">Tax ({t.rate}%)</span><span>{fmtMoney(t.amount, inv.currency)}</span></div>)}
          <div className="flex justify-between border-t border-ink-200 pt-1 font-semibold"><span>Total</span><span>{fmtMoney(calc.total, inv.currency)}</span></div>
        </div>
      </div>

      <div className="flex justify-end gap-3 border-t border-ink-100 pt-4">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving || items.length === 0}>{saving ? 'Saving…' : initial?.id ? 'Save changes' : 'Create draft'}</button>
      </div>
    </div>
  )
}
