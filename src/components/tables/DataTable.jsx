import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export default function DataTable({ columns, rows, loading, sort, onSort, onRowClick, empty, rowClassName }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
      <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-ink-100 bg-ink-50/90 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`whitespace-nowrap px-2.5 py-2.5 ${c.className || ''}`}
                    aria-sort={c.sortKey && sort?.key === c.sortKey ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortKey ? (
                    <button onClick={() => onSort(c.sortKey)} className="inline-flex items-center gap-1 transition hover:text-ink-900">
                      {c.header}
                      {sort?.key === c.sortKey ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-600" /> : <ArrowDown className="h-3 w-3 text-brand-600" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={`divide-y divide-ink-100 ${loading && rows.length ? 'opacity-60' : ''}`}>
            {loading && !rows.length
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{columns.map((c) => <td key={c.key} className="px-2.5 py-2.5"><div className="h-4 animate-pulse rounded-lg bg-ink-100" /></td>)}</tr>))
              : rows.map((r) => (
                  <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined}
                      className={`transition duration-100 ${onRowClick ? 'cursor-pointer hover:bg-brand-50/40' : ''} ${rowClassName?.(r) || ''}`}>
                    {columns.map((c) => <td key={c.key} className={`px-2.5 py-2 ${c.className || ''}`}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
                  </tr>))}
          </tbody>
        </table>
      </div>
      {!loading && !rows.length && empty}
    </div>
  )
}
