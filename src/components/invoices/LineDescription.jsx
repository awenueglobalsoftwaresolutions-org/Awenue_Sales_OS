import { suggestLines } from '../../services/invoices'
import { fmtMoney } from '../../lib/format'
import Badge from '../common/Badge'
import Suggest from './Suggest'

// Description of a line item: suggests your services (with their default price) and things invoiced before (with the last price).
export default function LineDescription({ value, onChange, onPick, services, currency }) {
  const load = async (q) => {
    const t = q.trim().toLowerCase()
    const fromServices = services.filter((s) => s.name.toLowerCase().includes(t)).map((s) => ({ key: `s${s.id}`, kind: 'Service', description: s.name, unit_price: s.default_price, tax_rate: s.default_tax_rate }))
    const past = (await suggestLines(q)).filter((p) => !fromServices.some((s) => s.description.toLowerCase() === p.description.toLowerCase()))
      .map((p, i) => ({ key: `p${i}`, kind: 'Used before', ...p }))
    return [...fromServices, ...past].slice(0, 8)
  }
  return (
    <Suggest value={value} onChange={onChange} load={load} ariaLabel="Item description" placeholder="Type a service or describe the work"
      onPick={(s) => onPick({ description: s.description, ...(s.unit_price != null ? { unit_price: String(s.unit_price) } : {}), ...(s.tax_rate != null ? { tax_rate: String(s.tax_rate) } : {}),
        ...(s.kind === 'Used before' ? { discount_type: s.discount_type, discount_value: String(s.discount_value ?? 0) } : {}) })}
      renderItem={(s) => (
        <div className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2"><Badge tone={s.kind === 'Service' ? 'indigo' : 'gray'}>{s.kind}</Badge><span className="truncate text-sm">{s.description}</span></span>
          {s.unit_price != null && <span className="shrink-0 text-xs text-ink-500">{fmtMoney(s.unit_price, currency)}</span>}
        </div>)} />
  )
}
