import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, BellRing, CheckCheck, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useClickOutside } from '../../hooks/useClickOutside'
import { listNotifications, markAllRead, setRead, subscribeToNotifications, unreadCount, enableBrowserNotifications, browserNotificationsSupported, showBrowserNotification } from '../../services/notifications'
import NotificationPreferences from './NotificationPreferences'

const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); if (h < 24) return `${h}h ago`; return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }

export default function NotificationBell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const uid = profile.id
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState(false)
  const [items, setItems] = useState(null)
  const [count, setCount] = useState(0)
  const [perm, setPerm] = useState(browserNotificationsSupported() ? Notification.permission : 'unsupported')
  const wrap = useRef(null)
  useClickOutside(wrap, () => setOpen(false), open)

  const refresh = async () => {
    try { const [list, n] = await Promise.all([listNotifications({ userId: uid, limit: 15 }), unreadCount(uid)]); setItems(list); setCount(n) } catch { /* keep what we have */ }
  }
  useEffect(() => {
    refresh()
    const stop = subscribeToNotifications(uid, (n) => {
      setCount((c) => c + 1)
      setItems((list) => (list ? [{ ...n, actor: null }, ...list].slice(0, 15) : list))
      toast(n.title, { description: n.body || undefined, action: n.link ? { label: 'Open', onClick: () => navigate(n.link) } : undefined })
      showBrowserNotification(n)
    })
    const poll = setInterval(refresh, 120000)                       // fallback if live delivery is unavailable
    return () => { stop(); clearInterval(poll) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid])

  const open1 = async (n) => {
    setOpen(false)
    if (!n.read_at) { await setRead([n.id], true).catch(() => {}); setCount((c) => Math.max(0, c - 1)); setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))) }
    if (n.link) navigate(n.link)
  }
  const readAll = async () => { await markAllRead(uid).catch(() => toast.error('Could not mark all as read')); setCount(0); refresh() }
  const enable = async () => { const r = await enableBrowserNotifications(); setPerm(r); if (r === 'granted') toast.success('Browser notifications on'); }

  return (
    <div className="relative" ref={wrap}>
      <button onClick={() => setOpen((v) => !v)} aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        className="relative grid h-9 w-9 place-items-center rounded-xl border border-ink-200/80 bg-white text-ink-600 shadow-2xs hover:border-ink-300 hover:bg-ink-50/80 hover:text-ink-900">
        <Bell className="h-4 w-4" />
        {count > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">{count > 99 ? '99+' : count}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-pop">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-ink-900">Notifications {count > 0 && <span className="ml-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">{count} new</span>}</h3>
            <div className="flex items-center gap-1">
              {count > 0 && <button onClick={readAll} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Mark all as read" title="Mark all as read"><CheckCheck className="h-4 w-4" /></button>}
              <button onClick={() => setPrefs(true)} className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Notification settings" title="Choose what I'm notified about"><Settings2 className="h-4 w-4" /></button>
            </div>
          </div>
          {perm === 'default' && (
            <button onClick={enable} className="flex w-full items-center gap-2 bg-brand-50 px-4 py-2.5 text-left text-xs font-medium text-brand-800 hover:bg-brand-100"><BellRing className="h-4 w-4" />Turn on browser alerts for new notifications</button>)}
          <ul className="max-h-[420px] divide-y divide-ink-100 overflow-y-auto">
            {items === null && <li className="px-4 py-8 text-center text-sm text-ink-500">Loading…</li>}
            {items && items.length === 0 && <li className="px-4 py-10 text-center text-sm text-ink-500">You're all caught up.</li>}
            {items && items.map((n) => (
              <li key={n.id}>
                <button onClick={() => open1(n)} className={`flex w-full gap-3 px-4 py-3 text-left hover:bg-ink-50 ${n.read_at ? '' : 'bg-brand-50/50'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-brand-600'}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">{n.title}</span>
                    {n.body && <span className="block truncate text-xs text-ink-600">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-ink-400">{n.actor?.full_name ? `${n.actor.full_name} · ` : ''}{ago(n.created_at)}</span>
                  </span>
                </button>
              </li>))}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-ink-100 px-4 py-2.5 text-center text-xs font-semibold text-brand-700 hover:bg-ink-50">View all notifications</Link>
        </div>)}
      <NotificationPreferences open={prefs} onClose={() => setPrefs(false)} userId={uid} />
    </div>
  )
}
