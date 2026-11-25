import { Pencil, Trash2 } from 'lucide-react'

export default function RowActions({ onEdit, onDelete, label, canEdit = true, canDelete = true }) {
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  return (
    <div className="flex items-center justify-end gap-1">
      {canEdit && (
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-500 transition hover:bg-brand-50 hover:text-brand-600 active:scale-95"
          onClick={stop(onEdit)}
          title={`Edit ${label || ''}`}
          aria-label={`Edit ${label || ''}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-ink-500 transition hover:bg-red-50 hover:text-red-600 active:scale-95"
          onClick={stop(onDelete)}
          title={`Delete ${label || ''}`}
          aria-label={`Delete ${label || ''}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
