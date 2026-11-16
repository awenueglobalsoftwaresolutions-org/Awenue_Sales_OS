import { FilterBar, FilterSelect } from '../common/FilterBar'
import { AUDIT_ACTIONS, AUDIT_MODULES } from '../../services/audit'
import { useFetch } from '../../hooks/useFetch'
import { listUsers } from '../../services/settings'
import { useAuth } from '../../contexts/AuthContext'

const STATUS_OPTS = [{ value: 'success', label: 'Success' }, { value: 'failed', label: 'Failed' }]

export default function AuditFilters({ filters, setFilter, clearFilters, isFiltered }) {
  const { profile, can } = useAuth()
  const users = useFetch(listUsers, [])
  const people = (users.data || []).filter((u) => can('reports.manage') || u.id === profile.id || u.manager_id === profile.id)
  const { userId, userText, fromDate, toDate, fromTime, toTime, module, action, status, ip, location, search } = filters
  const sf = (k) => (v) => setFilter(k, v)
  return (
    <div className="mb-4 space-y-2">
      <FilterBar search={search} onSearch={sf('search')} placeholder="Search description, action, name…" isFiltered={isFiltered} onClear={clearFilters}>
        <FilterSelect label="Any employee" value={userId} onChange={sf('userId')} options={people.map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        <FilterSelect label="Any module" value={module} onChange={sf('module')} options={AUDIT_MODULES.map((m) => ({ value: m, label: m }))} />
        <FilterSelect label="Any action" value={action} onChange={sf('action')} options={AUDIT_ACTIONS.map(([v, l]) => ({ value: v, label: l }))} />
        <FilterSelect label="Any status" value={status} onChange={sf('status')} options={STATUS_OPTS} />
      </FilterBar>
      <div className="flex flex-wrap items-center gap-2">
        <label className="label mb-0">From</label>
        <input type="date" className="input !w-40" value={fromDate} onChange={(e) => sf('fromDate')(e.target.value)} aria-label="From date" />
        <label className="label mb-0">To</label>
        <input type="date" className="input !w-40" value={toDate} onChange={(e) => sf('toDate')(e.target.value)} aria-label="To date" />
        <label className="label mb-0">Time window</label>
        <input type="time" className="input !w-32" value={fromTime} onChange={(e) => sf('fromTime')(e.target.value)} aria-label="From time" />
        <span className="text-ink-500">–</span>
        <input type="time" className="input !w-32" value={toTime} onChange={(e) => sf('toTime')(e.target.value)} aria-label="To time" />
        <div className="flex gap-2">
          <input type="text" className="input !w-36" value={ip} onChange={(e) => sf('ip')(e.target.value)} placeholder="IP address" aria-label="Filter by IP address" />
          <input type="text" className="input !w-40" value={location} onChange={(e) => sf('location')(e.target.value)} placeholder="Location (city/country)" aria-label="Filter by location" />
        </div>
      </div>
    </div>
  )
}
