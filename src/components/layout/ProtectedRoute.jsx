import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Spinner from '../common/Spinner'

export default function ProtectedRoute() {
  const { session, loading, profile, profileReady, signOut, refreshProfile } = useAuth()
  const location = useLocation()
  if (loading || (session && !profileReady)) return <Spinner label="Checking your session" className="h-screen" />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!profile || profile.is_active === false) {
    return (
      <div className="grid h-screen place-items-center bg-ink-50 px-4">
        <div className="max-w-sm rounded-2xl border border-ink-100 bg-white p-6 text-center shadow-card">
          <p className="font-bold">We couldn't open your account</p>
          <p className="mt-2 text-sm text-ink-500">It may have been deactivated, or the connection failed. Try again, or ask an admin to check your access.</p>
          <div className="mt-5 flex justify-center gap-2"><button className="btn-primary" onClick={refreshProfile}>Try again</button><button className="btn-ghost border border-ink-300" onClick={signOut}>Sign out</button></div>
        </div>
      </div>
    )
  }
  return <Outlet />
}
