import { customerToInvoice, searchCustomers } from '../../services/invoices'
import Badge from '../common/Badge'
import Suggest from './Suggest'

const TONE = { Organization: 'indigo', Contact: 'green', Lead: 'blue' }

export default function CustomerPicker({ value, onChange, onPick }) {
  return (
    <Suggest value={value} onChange={onChange} load={searchCustomers} ariaLabel="Bill to name" placeholder="Start typing a company, contact or lead"
      onPick={async (s) => onPick(await customerToInvoice(s))}
      renderItem={(s) => (
        <div className="flex items-center gap-3">
          <span className="w-24 shrink-0"><Badge tone={TONE[s.kind]}>{s.kind}</Badge></span>
          <span className="min-w-0"><span className="block truncate text-sm font-medium">{s.title}</span>{s.subtitle && <span className="block truncate text-xs text-ink-500">{s.subtitle}</span>}</span>
        </div>)} />
  )
}
