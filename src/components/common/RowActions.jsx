import { Pencil, Trash2 } from 'lucide-react'

export default function RowActions({ onEdit, onDelete, label, canEdit = true, canDelete = true }) {
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  return (
    <div className="flex justify-end gap-1">
      {canEdit && <button className="btn-ghost !p-1.5" onClick={stop(onEdit)} aria-label={`Edit ${label}`}><Pencil className="h-4 w-4" /></button>}
      {canDelete && <button className="btn-ghost !p-1.5 hover:!bg-red-50 hover:!text-red-600" onClick={stop(onDelete)} aria-label={`Delete ${label}`}><Trash2 className="h-4 w-4" /></button>}
    </div>
  )
}
