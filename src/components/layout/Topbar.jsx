import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Bell,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronDown,
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
import { ROLE_LABELS } from '../../constants/nav'
import GlobalSearch from '../search/GlobalSearch'
import Avatar from '../common/Avatar'

function Dropdown({ button, children, width = 'w-64' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false), open)
  return (
    <div className="relative" ref={ref}>
      {button(() => setOpen((o) => !o), open)}
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className={`absolute right-0 z-50 mt-2 ${width} animate-fade-up rounded-2xl border border-ink-100 bg-white/98 p-1.5 shadow-xl backdrop-blur-md ring-1 ring-ink-900/5`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

const Item = ({ icon: Icon, children, tone = 'default', ...rest }) => (
  <button
    role="menuitem"
    className={`group flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-all duration-150 ${
      tone === 'danger'
        ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
        : 'text-ink-700 hover:bg-brand-50/70 hover:text-brand-900'
    }`}
    {...rest}
  >
    <Icon
      className={`h-4 w-4 transition-colors ${
        tone === 'danger' ? 'text-red-400 group-hover:text-red-600' : 'text-ink-400 group-hover:text-brand-600'
      }`}
      aria-hidden
    />
    {children}
  </button>
)

const QUICK_ADD = [
  ['Lead', '/leads', UserPlus, 'text-blue-500 bg-blue-50'],
  ['Deal', '/deals', Handshake, 'text-amber-500 bg-amber-50'],
  ['Contact', '/contacts', Contact, 'text-emerald-500 bg-emerald-50'],
  ['Organization', '/organizations', Building2, 'text-indigo-500 bg-indigo-50'],
  ['Task', '/tasks', CheckSquare, 'text-purple-500 bg-purple-50'],
  ['Invoice', '/invoices', Receipt, 'text-rose-500 bg-rose-50'],
]

export default function Topbar({ onOpenMobile }) {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const name = profile?.full_name || user?.email || 'You'

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
    <header className="relative z-30 flex h-16 shrink-0 items-center gap-2.5 border-b border-ink-100/80 bg-white/90 px-3.5 backdrop-blur-md shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:gap-3.5 sm:px-6">
      {/* Mobile sidebar trigger */}
      <button
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-ink-200/70 bg-white text-ink-600 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 active:scale-95 lg:hidden"
        onClick={onOpenMobile}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Global search */}
      <GlobalSearch />

      {/* Right controls */}
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
        {/* Date pill with live indicator */}
        <div className="hidden items-center gap-2 rounded-xl border border-ink-200/70 bg-ink-50/60 px-3 py-1.5 text-xs font-medium text-ink-600 shadow-2xs xl:inline-flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <CalendarDays className="h-3.5 w-3.5 text-brand-600" aria-hidden />
          <span>{format(new Date(), 'EEE, d MMM yyyy')}</span>
        </div>

        {/* Quick Add Dropdown */}
        <Dropdown
          width="w-64"
          button={(toggle, open) => (
            <button
              onClick={toggle}
              className={`flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm shadow-brand-500/25 transition-all duration-150 hover:bg-brand-500 hover:shadow active:scale-95 ${
                open ? 'ring-2 ring-brand-300' : ''
              }`}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Quick add</span>
              <ChevronDown className={`h-3.5 w-3.5 opacity-80 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        >
          <div className="border-b border-ink-100/80 px-3.5 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ink-400">Quick create</p>
          </div>
          <div className="py-1">
            {QUICK_ADD.map(([label, to, Icon, badgeStyle]) => (
              <button
                key={to}
                onClick={() => navigate(`${to}?new=1`)}
                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm text-ink-700 transition hover:bg-brand-50/70 hover:text-brand-900"
              >
                <span className={`grid h-7 w-7 place-items-center rounded-lg ${badgeStyle} transition group-hover:scale-105`}>
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="font-medium">New {label}</span>
              </button>
            ))}
          </div>
        </Dropdown>

        {/* Notifications */}
        <Dropdown
          width="w-72"
          button={(toggle, open) => (
            <button
              onClick={toggle}
              className={`relative flex h-9 w-9 items-center justify-center rounded-xl border border-ink-200/70 bg-white text-ink-600 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 active:scale-95 ${
                open ? 'border-brand-500 ring-2 ring-brand-100' : ''
              }`}
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-white" />
            </button>
          )}
        >
          <div className="border-b border-ink-100 px-3.5 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Notifications</p>
              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">All clear</span>
            </div>
          </div>
          <div className="px-4 py-8 text-center">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-ink-50 text-ink-400">
              <Bell className="h-5 w-5" />
            </div>
            <p className="mt-2 text-sm font-medium text-ink-800">You're all caught up</p>
            <p className="mt-0.5 text-xs text-ink-500">No new notifications at this time.</p>
          </div>
        </Dropdown>

        {/* Settings button */}
        <button
          className="hidden h-9 w-9 items-center justify-center rounded-xl border border-ink-200/70 bg-white text-ink-600 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 hover:text-ink-900 active:scale-95 sm:inline-flex"
          onClick={() => navigate('/settings')}
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Divider */}
        <div className="hidden h-6 w-px bg-ink-200/70 sm:block" />

        {/* Profile Dropdown */}
        <Dropdown
          width="w-64"
          button={(toggle, open) => (
            <button
              onClick={toggle}
              className={`flex items-center gap-2.5 rounded-xl border border-ink-200/70 bg-white py-1 pl-1 pr-2.5 shadow-sm transition hover:border-ink-300 hover:bg-ink-50 active:scale-95 ${
                open ? 'border-brand-500 ring-2 ring-brand-100' : ''
              }`}
              aria-label="Account menu"
            >
              <Avatar person={profile || { full_name: name }} size={32} className="ring-1 ring-ink-200/60" />
              <div className="hidden text-left leading-tight md:block">
                <span className="block max-w-[120px] truncate text-xs font-semibold text-ink-900">{name}</span>
                <span className="inline-block rounded bg-brand-50 px-1 py-0.2 text-[10px] font-medium text-brand-700">
                  {ROLE_LABELS[profile?.role] ?? 'Member'}
                </span>
              </div>
              <ChevronDown className={`hidden h-3.5 w-3.5 text-ink-400 transition-transform duration-150 md:inline-block ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        >
          <div className="border-b border-ink-100 px-3.5 py-3">
            <p className="truncate text-sm font-bold text-ink-900">{name}</p>
            <p className="truncate text-xs text-ink-500">{user?.email || ''}</p>
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
              <Sparkles className="h-3 w-3" />
              {ROLE_LABELS[profile?.role] ?? 'Member'}
            </div>
          </div>
          <div className="py-1">
            <Item icon={UserRound} onClick={() => navigate('/settings?tab=profile')}>Your profile</Item>
            <Item icon={Settings} onClick={() => navigate('/settings')}>Settings</Item>
            <div className="my-1 border-t border-ink-100" />
            <Item icon={LogOut} tone="danger" onClick={handleSignOut}>Sign out</Item>
          </div>
        </Dropdown>
      </div>
    </header>
  )
}
