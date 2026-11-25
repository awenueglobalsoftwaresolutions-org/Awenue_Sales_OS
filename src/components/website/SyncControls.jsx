import { useCallback, useEffect, useState } from 'react'
import { Clock, RefreshCw } from 'lucide-react'
import { syncWebsiteData } from '../../services/website'
import { fmtDateTime } from '../../lib/format'

export function useWebsiteSync(type = 'all') {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [autoRefreshSec, setAutoRefreshSec] = useState(0)

  const load = useCallback(async (isManual = false) => {
    if (isManual) setSyncing(true)
    else setLoading((prev) => (data ? prev : true))
    setError(null)
    try {
      const res = await syncWebsiteData({ type, limit: 200 })
      setData(res)
    } catch (e) {
      setError(e?.message || 'Failed to sync with the main website.')
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }, [type])

  useEffect(() => {
    load(false)
  }, [load])

  useEffect(() => {
    if (!autoRefreshSec) return undefined
    const id = setInterval(() => { load(true) }, autoRefreshSec * 1000)
    return () => clearInterval(id)
  }, [autoRefreshSec, load])

  return {
    data,
    setData,
    loading,
    syncing,
    error,
    autoRefreshSec,
    setAutoRefreshSec,
    syncNow: () => load(true),
  }
}

export function SyncControls({ syncedAt, syncing, onSync, autoRefreshSec, onAutoRefreshChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {syncedAt && (
        <span className="inline-flex items-center gap-1.5 rounded-xl border border-ink-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 shadow-sm">
          <Clock className="h-3.5 w-3.5 text-ink-400" aria-hidden />
          Synced {fmtDateTime(syncedAt)}
        </span>
      )}
      <select
        className="input !w-auto !py-1.5 text-xs"
        value={autoRefreshSec}
        onChange={(e) => onAutoRefreshChange(Number(e.target.value))}
        aria-label="Auto refresh interval"
      >
        <option value={0}>Auto-refresh: Off</option>
        <option value={30}>Every 30s</option>
        <option value={60}>Every 1m</option>
        <option value={300}>Every 5m</option>
      </select>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="btn-primary !py-1.5"
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
        {syncing ? 'Syncing…' : 'Sync Now'}
      </button>
    </div>
  )
}
