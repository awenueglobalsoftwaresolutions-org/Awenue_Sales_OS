import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, pageSize, total, onPage }) {
  if (!total) return null
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-xs font-medium text-ink-500">
      <span>Showing <strong className="font-semibold text-ink-800">{from}–{to}</strong> of <strong className="font-semibold text-ink-800">{total}</strong></span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="px-2 text-xs text-ink-600">Page {page} of {pages}</span>
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
