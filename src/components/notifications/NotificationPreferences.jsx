import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import Modal from '../common/Modal'
import Spinner from '../common/Spinner'
import { NOTIFICATION_TYPES, getPreferences, setPreference, enableBrowserNotifications, browserNotificationsSupported } from '../../services/notifications'

export default function NotificationPreferences({ open, onClose, userId }) {
  const [prefs, setPrefs] = useState(null)
  const [perm, setPerm] = useState(browserNotificationsSupported() ? Notification.permission : 'unsupported')
  useEffect(() => { if (open) getPreferences(userId).then(setPrefs).catch(() => setPrefs({})) }, [open, userId])
  const toggle = async (type, on) => {
    setPrefs((p) => ({ ...p, [type]: on }))
    try { await setPreference(userId, type, on) } catch { toast.error('Could not save that setting'); setPrefs((p) => ({ ...p, [type]: !on })) }
  }
  return (
    <Modal open={open} title="Notifications" onClose={onClose} size="sm">
      <p className="mb-4 text-sm text-ink-500">Choose what you're told about. Things you do yourself never notify you.</p>
      {!prefs ? <Spinner /> : (
        <ul className="divide-y divide-ink-100">
          {NOTIFICATION_TYPES.map(([type, label]) => (
            <li key={type} className="flex items-center justify-between py-2.5">
              <span className="text-sm text-ink-800">{label}</span>
              <input type="checkbox" aria-label={label} className="h-4 w-4 accent-[#087a50]" checked={prefs[type] !== false} onChange={(e) => toggle(type, e.target.checked)} />
            </li>))}
        </ul>)}
      <div className="mt-5 flex items-center justify-between rounded-xl bg-ink-50 p-3">
        <span className="text-xs text-ink-600">{perm === 'granted' ? 'Browser alerts are on.' : perm === 'denied' ? 'Browser alerts are blocked in your browser settings.' : perm === 'unsupported' ? 'This browser doesn’t support alerts.' : 'Get an alert on your screen when something arrives.'}</span>
        {perm === 'default' && <button className="btn-outline !py-1.5 text-xs" onClick={async () => setPerm(await enableBrowserNotifications())}>Turn on</button>}
      </div>
    </Modal>)
}
