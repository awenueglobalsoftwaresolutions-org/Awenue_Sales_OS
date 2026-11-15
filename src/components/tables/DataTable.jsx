import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export default function DataTable({ columns, rows, loading, sort, onSort, onRowClick, empty, rowClassName }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-ink-100 bg-white shadow-card">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-ink-100 bg-ink-50 text-xs font-semibold text-ink-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-3 ${c.className || ''}`}
                  aria-sort={c.sortKey && sort?.key === c.sortKey ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                {c.sortKey ? (
                  <button onClick={() => onSort(c.sortKey)} className="inline-flex items-center gap-1 hover:text-ink-900">
                    {c.header}
                    {sort?.key === c.sortKey ? (sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />) : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />}
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={`divide-y divide-ink-100 ${loading && rows.length ? 'opacity-60' : ''}`}>
          {loading && !rows.length
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key} className="px-4 py-3.5"><div className="h-4 animate-pulse rounded bg-ink-100" /></td>)}</tr>))
            : rows.map((r) => (
                <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined}
                    className={`${onRowClick ? 'cursor-pointer hover:bg-ink-50' : ''} ${rowClassName?.(r) || ''}`}>
                  {columns.map((c) => <td key={c.key} className={`px-4 py-3 ${c.className || ''}`}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
                </tr>))}
        </tbody>
      </table>
      {!loading && !rows.length && empty}
    </div>
  )
}
