import { NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react'
import { NAV_ITEMS } from '../../constants/nav'
import { useAuth } from '../../contexts/AuthContext'

export default function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }) {
  const { profile, can } = useAuth()
  const wide = !collapsed || mobileOpen
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-ink-900/40 lg:hidden" onClick={onCloseMobile} aria-hidden />}
      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-ink-100 bg-white transition-all duration-200 lg:static
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${wide ? 'w-64' : 'w-[72px]'}`}
      >
        <div className="flex h-16 items-center gap-3 border-b border-ink-100 px-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-base font-bold text-white" aria-hidden>A</div>
          {wide && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-bold">Awenue Sales OS</p>
              <p className="truncate text-xs text-ink-500">{profile?.workspace?.name || 'Sales OS'}</p>
            </div>
          )}
          <button className="btn-ghost !p-1.5 lg:hidden" onClick={onCloseMobile} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.filter((i) => !i.perm || can(i.perm)).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end} title={!wide ? label : undefined} onClick={onCloseMobile}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition
                 ${isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-700 hover:bg-ink-50'} ${!wide ? 'justify-center' : ''}`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              {wide ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t border-ink-100 p-3 lg:block">
          <button onClick={onToggle} className="btn-ghost w-full !justify-start gap-3 !px-3" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronsRight className="mx-auto h-[18px] w-[18px]" /> : <><ChevronsLeft className="h-[18px] w-[18px]" /><span>Collapse</span></>}
          </button>
        </div>
      </aside>
    </>
  )
}
