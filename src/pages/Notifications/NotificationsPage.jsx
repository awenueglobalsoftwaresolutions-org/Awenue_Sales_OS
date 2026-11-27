import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import PageHeader from '../../components/common/PageHeader'
import Spinner from '../../components/common/Spinner'
import EmptyState from '../../components/common/EmptyState'
import NotificationPreferences from '../../components/notifications/NotificationPreferences'
import { listNotifications, markAllRead, setRead } from '../../services/notifications'
import { fmtDateTimeTz } from '../../lib/tz'

const PAGE = 30
export default function NotificationsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const tz = profile?.timezone || 'UTC'
  const [filter, setFilter] = useState('all')
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState(false)
  const [prefs, setPrefs] = useState(false)
  const load = async (more = false) => {
    setBusy(true)
    try {
      const before = more && items?.length ? items[items.length - 1].created_at : null
      const rows = await listNotifications({ userId: profile.id, unreadOnly: filter === 'unread', limit: PAGE, before })
      setItems(more ? [...(items || []), ...rows] : rows)
    } catch (e) { toast.error('Could not load notifications') } finally { setBusy(false) }
  }
  useEffect(() => { setItems(null); load(false) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter, profile.id])
  const open = async (n) => {
    if (!n.read_at) { await setRead([n.id], true).catch(() => {}); setItems((l) => l.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))) }
    if (n.link) navigate(n.link)
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Notifications" subtitle="Assignments, remarks and updates for you"
        actions={<><button className="btn-outline" onClick={() => setPrefs(true)}>Settings</button><button className="btn-outline" onClick={async () => { await markAllRead(profile.id); toast.success('All marked as read'); load(false) }}><CheckCheck className="h-4 w-4" />Mark all read</button></>} />
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter notifications">
        {[['all', 'All'], ['unread', 'Unread']].map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={filter === value}
            className={filter === value ? 'tab-pill-active' : 'tab-pill-inactive'} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>
      {items === null ? <Spinner className="py-16" /> : !items.length ? <EmptyState icon={Bell} title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'} description="When someone assigns you work or leaves a remark, it appears here." /> : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-card">
          {items.map((n) => (
            <li key={n.id}><button onClick={() => open(n)} className={`flex w-full gap-3 px-5 py-4 text-left hover:bg-ink-50 ${n.read_at ? '' : 'bg-brand-50/40'}`}>
              <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-brand-600'}`} aria-hidden />
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-ink-900">{n.title}</span>{n.body && <span className="block text-sm text-ink-600">{n.body}</span>}
                <span className="mt-1 block text-xs text-ink-400">{n.actor?.full_name ? `${n.actor.full_name} · ` : ''}{fmtDateTimeTz(n.created_at, tz)}</span></span>
            </button></li>))}
        </ul>)}
      {items && items.length === PAGE && <div className="text-center"><button className="btn-outline" disabled={busy} onClick={() => load(true)}>{busy ? 'Loading…' : 'Load older'}</button></div>}
      <NotificationPreferences open={prefs} onClose={() => setPrefs(false)} userId={profile.id} />
    </div>)
}
