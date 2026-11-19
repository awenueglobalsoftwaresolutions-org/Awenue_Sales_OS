import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, LogOut, Menu, Plus, Settings, UserRound } from 'lucide-react'
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
        <div role="menu" onClick={() => setOpen(false)} className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-ink-100 bg-white p-1.5 shadow-lg">
          {children}
        </div>
      )}
    </div>
  )
}

const Item = ({ icon: Icon, children, ...rest }) => (
  <button role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50" {...rest}>
    <Icon className="h-4 w-4 text-ink-500" aria-hidden />{children}
  </button>
)

const QUICK_ADD = [['lead', '/leads'], ['organization', '/organizations'], ['contact', '/contacts'], ['deal', '/deals'], ['task', '/tasks'], ['invoice', '/invoices']]

export default function Topbar({ onOpenMobile }) {
  const { profile, user, signOut } = useAuth()
  const navigate = useNavigate()
  const name = profile?.full_name || user?.email || 'You'

  const handleSignOut = async () => {
    const { error } = await signOut()
    if (error) toast.error('Could not sign out. Please try again.')
    else navigate('/login', { replace: true })
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-ink-100 bg-white px-4 sm:px-6">
      <button className="btn-ghost !p-2 lg:hidden" onClick={onOpenMobile} aria-label="Open menu"><Menu className="h-5 w-5" /></button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1.5">
        <Dropdown button={(toggle) => <button onClick={toggle} className="btn-primary !px-3"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Quick add</span></button>}>
          {QUICK_ADD.map(([label, to]) => <Item key={to} icon={Plus} onClick={() => navigate(`${to}?new=1`)}>New {label}</Item>)}
        </Dropdown>

        <Dropdown button={(toggle) => <button onClick={toggle} className="btn-ghost !p-2" aria-label="Notifications"><Bell className="h-5 w-5" /></button>}>
          <p className="px-3 py-6 text-center text-sm text-ink-500">You're all caught up.</p>
        </Dropdown>

        <button className="btn-ghost !p-2" onClick={() => navigate('/settings')} aria-label="Settings"><Settings className="h-5 w-5" /></button>

        <Dropdown button={(toggle) => (
          <button onClick={toggle} className="ml-1 rounded-full" aria-label="Account menu"><Avatar person={profile || { full_name: name }} size={36} /></button>
        )}>
          <div className="border-b border-ink-100 px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-xs text-ink-500">{ROLE_LABELS[profile?.role] ?? 'Member'}</p>
          </div>
          <Item icon={UserRound} onClick={() => navigate('/settings')}>Your profile</Item>
          <Item icon={LogOut} onClick={handleSignOut}>Sign out</Item>
        </Dropdown>
      </div>
    </header>
  )
}
