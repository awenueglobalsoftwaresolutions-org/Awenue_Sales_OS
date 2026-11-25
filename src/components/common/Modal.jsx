import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const SIZES = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-3xl', xl: 'max-w-4xl' }

export default function Modal({ open, title, onClose, size = 'md', children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink-900/60 p-4 sm:p-6 backdrop-blur-[2px]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      aria-modal="true"
      role="dialog"
      aria-label={title}
    >
      <div
        className={`relative my-auto flex max-h-[92vh] w-full ${SIZES[size] || SIZES.md} flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-ink-900/10 animate-fade-up`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ink-100 px-6 py-4.5">
          <h2 className="text-base font-bold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            className="btn-ghost -mr-1.5 !p-1.5 text-ink-400 hover:text-ink-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="thin-scrollbar overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body
  )
}
