import { useState } from 'react'
import { Download, Loader2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { downloadCsv, toCsv } from '../../lib/csv'
import { logEvent } from '../../services/audit'
import { friendlyError } from '../../lib/errors'
import { EXPORT_ENTITIES } from '../../services/csvEntities'
import CsvImportModal from './CsvImportModal'
import { useAuth } from '../../contexts/AuthContext'

// Import and Export buttons for a list page. `list` is the page's useListQuery result, so the export honours the current search, filters and sort.
export default function CsvTools({ entity, list }) {
  const { can } = useAuth()
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState(false)

  const exportAll = async () => {
    const cfg = EXPORT_ENTITIES[entity]
    setBusy(true)
    try {
      const rows = []
      for (let page = 1; page <= 50; page++) {
        const { rows: chunk, total } = await cfg.fetcher({ page, pageSize: 1000, search: list.search, filters: list.filters, sort: list.sort })
        rows.push(...chunk)
        if (rows.length >= total || !chunk.length) break
      }
      if (!rows.length) { toast.info('Nothing to export with the current filters.'); return }
      downloadCsv(`${cfg.filename}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(cfg.columns, rows.map(cfg.toRow)))
      logEvent({ action: 'export', module: entity, description: `Exported ${rows.length} ${entity} to CSV`, metadata: { rows: rows.length, search: list.search || null, filters: Object.fromEntries(Object.entries(list.filters).filter(([, v]) => v)) } })
      toast.success(`Exported ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`)
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }

  return (
    <>
      {can(`${entity}.create`) && <button className="btn-outline" onClick={() => setImporting(true)}><Upload className="h-4 w-4" />Import</button>}
      {can(`${entity}.export`) && <button className="btn-outline" onClick={exportAll} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Export</button>}
      {importing && <CsvImportModal entityKey={entity} onClose={() => setImporting(false)} onDone={list.reload} />}
    </>
  )
}
