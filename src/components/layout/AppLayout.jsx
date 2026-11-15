import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

const KEY = 'awenue.sidebar.collapsed'
const readCollapsed = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { pathname } = useLocation()
  const { profile } = useAuth()

  useEffect(() => setMobileOpen(false), [pathname])

  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(KEY, c ? '0' : '1') } catch { /* storage unavailable */ }
    return !c
  })

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={toggle} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobile={() => setMobileOpen(true)} />
        {profile?.must_change_password && <p role="alert" className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">You're using a temporary password. <Link className="font-semibold underline" to="/settings?tab=account">Choose your own now</Link>.</p>}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  )
}
