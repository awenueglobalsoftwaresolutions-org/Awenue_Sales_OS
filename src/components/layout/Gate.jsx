import { ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

// Page-level permission check. (The database enforces the same rules; this just gives a clear message instead of an empty page.)
export default function Gate({ perm, children }) {
  const { can } = useAuth()
  if (can(perm)) return children
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-card">
      <ShieldAlert className="mx-auto h-9 w-9 text-ink-300" aria-hidden />
      <p className="mt-3 font-semibold">You don't have access to this page</p>
      <p className="mt-1 text-sm text-ink-500">Ask an administrator if you need it.</p>
      <Link to="/" className="btn-primary mt-5">Go to dashboard</Link>
    </div>
  )
}
