import { Search, X } from 'lucide-react'

export function FilterBar({ search, onSearch, placeholder, children, isFiltered, onClear }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" aria-hidden />
        <input className="input !pl-9" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label="Search" />
      </div>
      {children}
      {isFiltered && <button className="btn-ghost !px-3" onClick={onClear}><X className="h-4 w-4" />Clear</button>}
    </div>
  )
}

export function FilterSelect({ value, onChange, label, options }) {
  return (
    <select className="input !w-auto" value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">{label}</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
