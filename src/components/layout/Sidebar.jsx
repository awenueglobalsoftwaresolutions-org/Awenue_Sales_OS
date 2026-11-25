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
      {mobileOpen && <div className="fixed inset-0 z-40 bg-ink-900/40 backdrop-blur-[1px] lg:hidden" onClick={onCloseMobile} aria-hidden />}
      <aside
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-ink-100 bg-white transition-all duration-200 lg:relative
          ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'} ${wide ? 'w-[260px] lg:w-[15%] lg:min-w-[200px] lg:max-w-[260px]' : 'w-[68px]'}`}
      >
        {/* Desktop Collapse / Expand Toggle */}
        <button
          type="button"
          onClick={onToggle}
          className="absolute -right-3 top-4 z-20 hidden h-6 w-6 place-items-center rounded-full border border-ink-200 bg-white text-ink-500 shadow-sm transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 hover:scale-105 lg:grid"
          aria-label={wide ? 'Collapse sidebar' : 'Expand sidebar'}
          title={wide ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {wide ? <ChevronsLeft className="h-3.5 w-3.5" /> : <ChevronsRight className="h-3.5 w-3.5" />}
        </button>

        {/* Brand Header */}
        <div className={`flex h-14 shrink-0 items-center border-b border-ink-100 px-3.5 ${wide ? 'justify-between gap-2' : 'justify-center'}`}>
          <Link to="/" onClick={onCloseMobile} className="flex min-w-0 items-center gap-2.5 group">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-brand-600 via-indigo-600 to-sky-500 text-sm font-extrabold text-white shadow-sm ring-1 ring-brand-500/20 transition group-hover:scale-105" aria-hidden>
              A
            </div>
            {wide && (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-bold tracking-tight text-ink-900 group-hover:text-brand-600 transition-colors">Awenue Sales OS</p>
                <div className="flex items-center gap-1.5 text-[10px] text-ink-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="truncate font-medium">{profile?.workspace?.name || 'Live Workspace'}</span>
                </div>
              </div>
            )}
          </Link>

          <button className="btn-ghost !p-1.5 lg:hidden" onClick={onCloseMobile} aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="thin-scrollbar flex-1 space-y-3.5 overflow-y-auto px-2.5 py-3">
          {NAV_GROUPS.map((group, gi) => {
            const items = group.items.filter((i) => !i.perm || can(i.perm))
            if (!items.length) return null
            return (
              <div key={gi}>
                {group.title && wide && (
                  <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-400 select-none">
                    {group.title}
                  </p>
                )}
                {group.title && !wide && <div className="mx-2 mb-2 border-t border-ink-100" />}
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
                          `group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition duration-150
                           ${isActive
                            ? 'bg-brand-50/90 font-semibold text-brand-700 ring-1 ring-brand-200/70 shadow-xs'
                            : 'text-ink-600 hover:bg-ink-50/90 hover:text-ink-900'} ${!wide ? 'justify-center !px-1.5' : ''}`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && wide && (
                              <span className="absolute -left-1 top-2 bottom-2 w-1 rounded-r-full bg-brand-600 shadow-sm shadow-brand-500/50" />
                            )}
                            <span className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-lg transition ${isActive ? 'text-brand-600' : 'text-ink-400 group-hover:text-brand-600'}`}>
                              <Icon className="h-4 w-4" aria-hidden />
                              {!wide && showOverdue && (
                                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
                              )}
                            </span>
                            {wide ? (
                              <>
                                <span className="flex-1 truncate">{label}</span>
                                {showOverdue && (
                                  <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold leading-none text-rose-700 ring-1 ring-rose-300/80">
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
        <div className="shrink-0 border-t border-ink-100 p-2.5">
          {wide ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-ink-100 bg-ink-50/60 p-2 transition hover:border-ink-200 hover:bg-ink-50">
              <div className="relative shrink-0">
                <Avatar person={profile || { full_name: displayName }} size={30} />
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-xs font-semibold text-ink-900">{displayName}</p>
                <p className="truncate text-[10px] font-medium text-ink-500">{ROLE_LABELS[profile?.role] ?? 'Member'}</p>
              </div>
              <Link
                to="/settings"
                onClick={onCloseMobile}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-400 transition hover:bg-white hover:text-brand-600 hover:shadow-xs"
                aria-label="Settings"
                title="Settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <Link
              to="/settings"
              onClick={onCloseMobile}
              title={`${displayName} · Settings`}
              aria-label="Settings"
              className="flex justify-center rounded-xl bg-ink-50/80 p-2 transition hover:bg-ink-100"
            >
              <div className="relative">
                <Avatar person={profile || { full_name: displayName }} size={30} />
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" />
              </div>
            </Link>
          )}
        </div>
      </aside>
    </>
  )
}
