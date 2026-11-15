import { AlertTriangle } from 'lucide-react'

export default function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-red-100 bg-red-50/50 px-6 py-10 text-center">
      <AlertTriangle className="mb-2 h-8 w-8 text-red-500" aria-hidden />
      <p className="text-sm font-semibold text-red-700">Something went wrong</p>
      <p className="mt-1 max-w-md text-sm text-red-700/80">{message}</p>
      {onRetry && <button onClick={onRetry} className="btn-ghost mt-4">Try again</button>}
    </div>
  )
}
