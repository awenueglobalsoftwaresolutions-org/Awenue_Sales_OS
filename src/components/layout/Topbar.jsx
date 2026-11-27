import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Bell,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Contact,
  Handshake,
  LogOut,
  Menu,
  Plus,
  Receipt,
  Settings,
  Sparkles,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useClickOutside } from '../../hooks/useClickOutside'
import { NAV_GROUPS, ROLE_LABELS } from '../../constants/nav'
import GlobalSearch from '../search/GlobalSearch'
import NotificationBell from '../notifications/NotificationBell'
import Avatar from '../common/Avatar'

function Dropdown({ button, children, className = 'w-60' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false), open)
  return (
    <div className="relative" ref={ref}>
      {button(() => setOpen((o) => !o))}
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={`absolute right-0 z-50 mt-2 ${className} animate-fade-up rounded-2xl border border-ink-100 bg-white p-1.5 shadow-pop ring-1 ring-ink-900/5`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

const QUICK_ADD = [
  { label: 'Lead', to: '/leads', icon: UserPlus, tone: 'text-blue-600 bg-blue-50 ring-blue-200/70' },
  { label: 'Deal', to: '/deals', icon: Handshake, tone: 'text-amber-600 bg-amber-50 ring-amber-200/70' },
  { label: 'Task', to: '/tasks', icon: CheckSquare, tone: 'text-violet-600 bg-violet-50 ring-violet-200/70' },
  { label: 'Contact', to: '/contacts', icon: Contact, tone: 'text-emerald-600 bg-emerald-50 ring-emerald-200/70' },
  { label: 'Organization', to: '/organizations', icon: Building2, tone: 'text-indigo-600 bg-indigo-50 ring-indigo-200/70' },
  { label: 'Invoice', to: '/invoices', icon: Receipt, tone: 'text-sky-600 bg-sky-50 ring-sky-200/70' },
]

export default function Topbar({ onOpenMobile }) {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const name = profile?.full_name || user?.email || 'You'

  const currentContext = useMemo(() => {
    const path = location.pathname
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (item.to === path || (item.to !== '/' && path.startsWith(item.to))) {
          return { groupTitle: group.title || 'Workspace', label: item.label, icon: item.icon }
        }
      }
    }
    return { groupTitle: 'Workspace', label: 'Dashboard', icon: null }
  }, [location.pathname])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        document.querySelector('[aria-label="Global search"]')?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSignOut = async () => {
    const { error } = await signOut()
    if (error) toast.error('Could not sign out. Please try again.')
    else navigate('/login', { replace: true })
  }

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-ink-100 bg-white/95 px-3.5 backdrop-blur-md sm:px-6">
      {/* Left side: Mobile trigger + Mobile logo + Breadcrumb context + Search */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3.5">
        <button
          className="btn-ghost shrink-0 !p-2 text-ink-600 hover:bg-ink-100/70 hover:text-ink-900 lg:hidden"
          onClick={onOpenMobile}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Mobile Brand Logo */}
        <Link
          to="/"
          className="flex items-center gap-2 shrink-0 lg:hidden group py-1"
          aria-label="Awenue Home"
        >
          <img
            src="/brand/awenue-mark.webp"
            alt="Awenue"
            width="28"
            height="28"
            className="h-7 w-7 object-contain transition-transform group-hover:scale-105"
          />
          <span className="hidden sm:inline-block font-bold text-[13px] tracking-tight text-ink-900 group-hover:text-brand-600 transition-colors">
            Awenue
          </span>
        </Link>

        {/* Desktop Breadcrumb Navigator */}
        <div className="hidden items-center gap-1.5 border-r border-ink-200/60 pr-3.5 text-xs lg:flex select-none shrink-0">
          <span className="font-medium text-ink-400">{currentContext.groupTitle}</span>
          <ChevronRight className="h-3 w-3 text-ink-300" aria-hidden />
          <span className="font-semibold text-ink-900">{currentContext.label}</span>
        </div>

        <GlobalSearch />
      </div>

      {/* Right side: Date chip + Quick Add + Notifications + Settings + Profile */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
        {/* Live Date Status Chip */}
        <span className="hidden items-center gap-2 rounded-xl border border-ink-200/70 bg-ink-50/70 px-3 py-1.5 text-xs font-medium text-ink-600 shadow-2xs xl:inline-flex select-none">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <CalendarDays className="h-3.5 w-3.5 text-ink-400" aria-hidden />
          <span>{format(new Date(), 'EEE, d MMM yyyy')}</span>
        </span>

        {/* Quick Add Menu */}
        <Dropdown
          className="w-64"
          button={(toggle) => (
            <button
              onClick={toggle}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs ring-1 ring-brand-700/20 transition duration-150 hover:bg-brand-700 hover:shadow active:scale-[0.98] sm:px-3.5"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">Quick add</span>
            </button>
          )}
        >
          <div className="mb-1 flex items-center justify-between border-b border-ink-100 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">Quick create</p>
            <span className="text-[10px] font-medium text-ink-400">Record</span>
          </div>
          <div className="space-y-0.5">
            {QUICK_ADD.map(({ label, to, icon: Icon, tone }) => (
              <button
                key={to}
                role="menuitem"
                onClick={() => navigate(`${to}?new=1`)}
                className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-700 transition duration-150 hover:bg-ink-50 hover:text-ink-900"
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 transition group-hover:scale-105 ${tone}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="flex-1 font-semibold text-ink-800">New {label}</span>
              </button>
            ))}
          </div>
        </Dropdown>

        <NotificationBell />

        {/* Settings Button */}
        <button
          onClick={() => navigate('/settings')}
          className="hidden h-9 w-9 place-items-center rounded-xl border border-ink-200/80 bg-white text-ink-600 shadow-2xs transition duration-150 hover:border-ink-300 hover:bg-ink-50/80 hover:text-ink-900 sm:grid"
          aria-label="Settings"
          title="System Settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* User Account Menu */}
        <Dropdown
          className="w-64"
          button={(toggle) => (
            <button
              onClick={toggle}
              className="group flex items-center gap-2 rounded-xl border border-ink-200/80 bg-white py-1 pl-1.5 pr-2.5 shadow-2xs transition duration-150 hover:border-ink-300 hover:bg-ink-50/80"
              aria-label="Account menu"
            >
              <Avatar person={profile || { full_name: name }} size={28} className="ring-1 ring-ink-100" />
              <span className="hidden text-left leading-tight md:block">
                <span className="block max-w-[110px] truncate text-xs font-bold text-ink-900 group-hover:text-brand-600 transition-colors">{name}</span>
                <span className="block text-[10px] font-medium text-ink-500">{ROLE_LABELS[profile?.role] ?? 'Member'}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-ink-400 transition-transform duration-150 group-hover:text-ink-600" />
            </button>
          )}
        >
          <div className="p-1.5">
            <div className="mb-1.5 flex items-center gap-2.5 border-b border-ink-100 px-2 py-2">
              <Avatar person={profile || { full_name: name }} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-ink-900">{name}</p>
                <p className="truncate text-[11px] text-ink-500">{user?.email}</p>
                <span className="mt-1 inline-block rounded-md bg-ink-100 px-1.5 py-0.5 text-[9px] font-semibold text-ink-700">
                  {ROLE_LABELS[profile?.role] ?? 'Member'}
                </span>
              </div>
            </div>
            <div className="space-y-0.5">
              <button
                role="menuitem"
                onClick={() => navigate('/settings?tab=account')}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-700 transition hover:bg-ink-50 hover:text-ink-900"
              >
                <UserRound className="h-3.5 w-3.5 text-ink-400" />
                <span>Your profile</span>
              </button>
              <button
                role="menuitem"
                onClick={() => navigate('/settings')}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-700 transition hover:bg-ink-50 hover:text-ink-900"
              >
                <Settings className="h-3.5 w-3.5 text-ink-400" />
                <span>Settings</span>
              </button>
              <div className="my-1 border-t border-ink-100" />
              <button
                role="menuitem"
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
              >
                <LogOut className="h-3.5 w-3.5 text-rose-500" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </Dropdown>
      </div>
    </header>
  )
}
