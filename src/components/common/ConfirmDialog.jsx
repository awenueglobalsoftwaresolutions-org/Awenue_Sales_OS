import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import Modal from './Modal'
import { friendlyError } from '../../lib/errors'

export default function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async () => {
    setBusy(true); setError('')
    try { await onConfirm() } catch (e) { setError(friendlyError(e)) } finally { setBusy(false) }
  }
  const close = () => { if (!busy) { setError(''); onClose() } }
  return (
    <Modal open={open} title={title} onClose={close} size="sm">
      <p className="text-sm text-ink-700">{message}</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-ghost" onClick={close} disabled={busy}>Cancel</button>
        <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={run} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
