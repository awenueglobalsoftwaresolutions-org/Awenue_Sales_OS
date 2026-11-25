import { Link, NavLink } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, Settings, X } from 'lucide-react'
import { NAV_GROUPS, ROLE_LABELS } from '../../constants/nav'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { getTaskCounts } from '../../services/tasks'
import Avatar from '../common/Avatar'

export default function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }) {
  const { profile, user, can } = useAuth()
  const counts = useFetch(getTaskCounts, [])
  const wide = !collapsed || mobileOpen
  const overdue = counts.data?.overdue || 0
  const displayName = profile?.full_name || user?.email || 'You'

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-30 bg-ink-900/40 backdrop-blur-[1px] lg:hidden" onClick={onCloseMobile} aria-hidden />}
      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-ink-100 bg-white transition-all duration-200 lg:static
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${wide ? 'w-60' : 'w-[68px]'}`}
      >
        {/* Brand & Collapse Header */}
        <div className={`flex h-14 shrink-0 items-center border-b border-ink-100 px-3 ${wide ? 'justify-between gap-2' : 'justify-center'}`}>
          <Link to="/" onClick={onCloseMobile} className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm ring-1 ring-brand-600/20" aria-hidden>
              A
            </div>
            {wide && (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-bold tracking-tight text-ink-900">Awenue Sales OS</p>
                <p className="truncate text-[10px] font-semibold text-brand-600">{profile?.workspace?.name || 'Sales OS'}</p>
              </div>
            )}
          </Link>

          <button className="btn-ghost !p-1.5 lg:hidden" onClick={onCloseMobile} aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
          {wide ? (
            <button
              onClick={onToggle}
              className="hidden h-7 w-7 shrink-0 place-items-center rounded-lg border border-ink-100 bg-ink-50/70 text-ink-500 transition hover:border-ink-200 hover:bg-ink-100 hover:text-ink-800 lg:grid"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {!wide && (
          <div className="hidden justify-center border-b border-ink-100 py-1.5 lg:flex">
            <button
              onClick={onToggle}
              className="grid h-7 w-7 place-items-center rounded-lg text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Compact Navigation Groups (fits without vertical scrollbar) */}
        <nav className="flex-1 space-y-2.5 overflow-y-auto px-2.5 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_GROUPS.map((group, gi) => {
            const items = group.items.filter((i) => !i.perm || can(i.perm))
            if (!items.length) return null
            return (
              <div key={gi}>
                {group.title && wide && (
                  <p className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-widest text-ink-400">
                    {group.title}
                  </p>
                )}
                {group.title && !wide && <div className="mx-2 mb-1.5 border-t border-ink-100" />}
                <div className="space-y-0.5">
                  {items.map(({ to, label, icon: Icon, end }) => {
                    const showOverdue = to === '/tasks' && overdue > 0
                    return (
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        title={!wide ? label : undefined}
                        onClick={onCloseMobile}
                        className={({ isActive }) =>
                          `group relative flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13px] font-medium transition duration-150
                           ${isActive
                            ? 'bg-brand-50/90 font-semibold text-brand-700 ring-1 ring-brand-200/70'
                            : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'} ${!wide ? 'justify-center !px-1.5' : ''}`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && wide && (
                              <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-brand-600" aria-hidden />
                            )}
                            <span className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-lg transition ${isActive ? 'bg-brand-100/80 text-brand-600' : 'text-ink-400 group-hover:bg-white group-hover:text-ink-700'}`}>
                              <Icon className="h-[15px] w-[15px]" aria-hidden />
                              {!wide && showOverdue && (
                                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white" />
                              )}
                            </span>
                            {wide ? (
                              <>
                                <span className="flex-1 truncate">{label}</span>
                                {showOverdue && (
                                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                    {overdue}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="sr-only">{label}</span>
                            )}
                          </>
                        )}
                      </NavLink>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Compact User Footer */}
        <div className="shrink-0 border-t border-ink-100 p-2">
          <div className={`flex items-center gap-2 rounded-xl bg-ink-50/80 p-1.5 ${!wide ? 'justify-center' : ''}`}>
            <Avatar person={profile || { full_name: displayName }} size={28} />
            {wide && (
              <>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-xs font-semibold text-ink-900">{displayName}</p>
                  <p className="truncate text-[10px] text-ink-500">{ROLE_LABELS[profile?.role] ?? 'Member'}</p>
                </div>
                <Link
                  to="/settings"
                  onClick={onCloseMobile}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-400 transition hover:bg-white hover:text-ink-800"
                  aria-label="Settings"
                  title="Settings"
                >
                  <Settings className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
