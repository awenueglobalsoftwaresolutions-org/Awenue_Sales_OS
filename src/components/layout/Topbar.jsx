import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Bell, CalendarDays, LogOut, Menu, Plus, Settings, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useClickOutside } from '../../hooks/useClickOutside'
import { ROLE_LABELS } from '../../constants/nav'
import GlobalSearch from '../search/GlobalSearch'
import Avatar from '../common/Avatar'

function Dropdown({ button, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useClickOutside(ref, () => setOpen(false), open)
  return (
    <div className="relative" ref={ref}>
      {button(() => setOpen((o) => !o))}
      {open && (
        <div role="menu" onClick={() => setOpen(false)} className="absolute right-0 z-50 mt-2 w-60 animate-fade-up rounded-2xl border border-ink-100 bg-white p-1.5 shadow-pop">
          {children}
        </div>
      )}
    </div>
  )
}

const Item = ({ icon: Icon, children, ...rest }) => (
  <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-ink-700 transition hover:bg-brand-50 hover:text-brand-700" {...rest}>
    <Icon className="h-4 w-4 text-ink-400" aria-hidden />{children}
  </button>
)

const QUICK_ADD = [['lead', '/leads'], ['organization', '/organizations'], ['contact', '/contacts'], ['deal', '/deals'], ['task', '/tasks'], ['invoice', '/invoices']]

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
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ink-100 bg-white/95 px-4 backdrop-blur-sm sm:px-5">
      <button className="btn-ghost !p-2 lg:hidden" onClick={onOpenMobile} aria-label="Open menu"><Menu className="h-5 w-5" /></button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden items-center gap-2 rounded-xl border border-ink-100 bg-ink-50/70 px-3 py-1.5 text-xs font-medium text-ink-600 xl:inline-flex">
          <CalendarDays className="h-3.5 w-3.5 text-brand-500" aria-hidden />
          {format(new Date(), 'EEE, d MMM yyyy')}
        </span>

        <Dropdown button={(toggle) => <button onClick={toggle} className="btn-primary !px-3.5"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Quick add</span></button>}>
          {QUICK_ADD.map(([label, to]) => <Item key={to} icon={Plus} onClick={() => navigate(`${to}?new=1`)}>New {label}</Item>)}
        </Dropdown>

        <Dropdown button={(toggle) => <button onClick={toggle} className="btn-outline !p-2" aria-label="Notifications"><Bell className="h-[18px] w-[18px] text-ink-600" /></button>}>
          <p className="px-3 py-6 text-center text-sm text-ink-500">You're all caught up.</p>
        </Dropdown>

        <button className="btn-outline !p-2" onClick={() => navigate('/settings')} aria-label="Settings"><Settings className="h-[18px] w-[18px] text-ink-600" /></button>

        <Dropdown button={(toggle) => (
          <button onClick={toggle} className="ml-1 flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition hover:bg-ink-50" aria-label="Account menu">
            <Avatar person={profile || { full_name: name }} size={34} />
            <span className="hidden text-left leading-tight md:block">
              <span className="block max-w-[120px] truncate text-xs font-semibold text-ink-900">{name}</span>
              <span className="block text-[11px] text-ink-500">{ROLE_LABELS[profile?.role] ?? 'Member'}</span>
            </span>
          </button>
        )}>
          <div className="border-b border-ink-100 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-ink-900">{name}</p>
            <p className="truncate text-xs text-ink-500">{ROLE_LABELS[profile?.role] ?? 'Member'}</p>
          </div>
          <Item icon={UserRound} onClick={() => navigate('/settings')}>Your profile</Item>
          <Item icon={Settings} onClick={() => navigate('/settings')}>Settings</Item>
          <Item icon={LogOut} onClick={handleSignOut}>Sign out</Item>
        </Dropdown>
      </div>
    </header>
  )
}
