import { useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileUp, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { autoMap, downloadCsv, parseCsvFile, toCsv } from '../../lib/csv'
import { friendlyError } from '../../lib/errors'
import { IMPORT_ENTITIES, importRows } from '../../services/csvEntities'
import Modal from '../common/Modal'
import Badge from '../common/Badge'

function analyse(entity, rows, mapping, ctx) {
  const seen = new Map()
  return rows.map((row, i) => {
    const raw = {}
    entity.fields.forEach((fl) => { raw[fl.key] = mapping[fl.key] ? String(row[mapping[fl.key]] ?? '').trim() : '' })
    const { values, errors, dupKey, label } = entity.convert(raw, ctx)
    let status = 'ready'; let reason = ''
    if (errors.length) { status = 'error'; reason = errors.join('; ') }
    else if (dupKey && ctx.existing.has(dupKey)) { status = 'duplicate'; reason = 'Already exists' }
    else if (dupKey && seen.has(dupKey)) { status = 'duplicate'; reason = `Repeated in this file (row ${seen.get(dupKey)})` }
    if (status === 'ready' && dupKey) seen.set(dupKey, i + 2)
    return { line: i + 2, row, values, status, reason, label }
  })
}

const TONE = { error: 'red', failed: 'red', duplicate: 'amber', ready: 'green' }

export default function CsvImportModal({ entityKey, onClose, onDone }) {
  const entity = IMPORT_ENTITIES[entityKey]
  const { profile } = useAuth()
  const input = useRef(null)
  const [step, setStep] = useState('upload')          // upload | map | review | importing | done
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({})
  const [ctx, setCtx] = useState(null)
  const [progress, setProgress] = useState([0, 0])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const analysis = useMemo(() => (ctx && parsed ? analyse(entity, parsed.rows, mapping, ctx) : []), [ctx, parsed, mapping, entity])
  const ready = analysis.filter((a) => a.status === 'ready')
  const problems = analysis.filter((a) => a.status !== 'ready')
  const missingRequired = entity.fields.filter((fl) => fl.required && !mapping[fl.key])

  const pick = async (file) => {
    if (!file) return
    setError(''); setBusy(true)
    try { const p = await parseCsvFile(file); setParsed(p); setMapping(autoMap(entity.fields, p.headers)); setStep('map') }
    catch (e) { setError(friendlyError(e)) } finally { setBusy(false) }
  }
  const toReview = async () => {
    setError(''); setBusy(true)
    try { setCtx(await entity.loadContext()); setStep('review') }
    catch (e) { setError(friendlyError(e)) } finally { setBusy(false) }
  }
  const run = async () => {
    setStep('importing'); setError('')
    try { const r = await importRows(entity, ready, profile, (a, b) => setProgress([a, b])); setResult(r); setStep('done'); if (r.imported) onDone() }
    catch (e) { setError(friendlyError(e)); setStep('review') }
  }
  const report = (items) => downloadCsv(`${entityKey}-import-report.csv`, toCsv(['Row', 'Status', 'Reason', ...parsed.headers],
    items.map((a) => ({ Row: a.line, Status: a.status, Reason: a.reason, ...a.row }))))
  const template = () => downloadCsv(`${entityKey}-template.csv`, toCsv(Object.keys(entity.template), [entity.template]))
  const close = () => { if (step !== 'importing') onClose() }

  return (
    <Modal open title={`Import ${entity.label}`} onClose={close} size="lg">
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {step === 'upload' && (
        <div>
          <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]) }}
            className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-ink-300 px-6 py-12 text-center hover:border-brand-500">
            {busy ? <Loader2 className="h-8 w-8 animate-spin text-brand-600" /> : <FileUp className="h-8 w-8 text-ink-500" aria-hidden />}
            <span className="mt-3 text-sm font-semibold">Choose a CSV file or drop it here</span>
            <span className="mt-1 text-xs text-ink-500">Up to 5 MB and 5,000 rows. The first row must be column names.</span>
            <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = '' }} />
          </label>
          <button className="btn-ghost mt-3" onClick={template}><Download className="h-4 w-4" />Download a template</button>
        </div>
      )}

      {step === 'map' && parsed && (
        <div>
          <p className="mb-3 text-sm text-ink-700">{parsed.rows.length} rows found. Match your columns to {entity.label} fields. Fields marked * are required.</p>
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-ink-100">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-ink-100">
                {entity.fields.map((fl) => (
                  <tr key={fl.key}>
                    <td className="w-1/3 px-3 py-2 font-medium">{fl.label}{fl.required && <span className="text-red-500"> *</span>}</td>
                    <td className="px-3 py-2">
                      <select className="input" aria-label={`CSV column for ${fl.label}`} value={mapping[fl.key] || ''} onChange={(e) => setMapping((m) => ({ ...m, [fl.key]: e.target.value }))}>
                        <option value="">{fl.required ? 'Choose a column…' : "Don't import"}</option>
                        {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </td>
                    <td className="hidden max-w-[160px] truncate px-3 py-2 text-xs text-ink-500 sm:table-cell">{mapping[fl.key] ? String(parsed.rows[0][mapping[fl.key]] ?? '') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {missingRequired.length > 0 && <p className="mt-3 text-sm text-amber-700">Map {missingRequired.map((x) => x.label).join(', ')} to continue.</p>}
          <div className="mt-5 flex justify-between">
            <button className="btn-ghost" onClick={() => setStep('upload')}>Choose another file</button>
            <button className="btn-primary" disabled={missingRequired.length > 0 || busy} onClick={toReview}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Check data</button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <Badge tone="green">{ready.length} ready</Badge>
            <Badge tone="amber">{analysis.filter((a) => a.status === 'duplicate').length} duplicates (skipped)</Badge>
            <Badge tone="red">{analysis.filter((a) => a.status === 'error').length} with errors (skipped)</Badge>
          </div>
          {problems.length > 0 && (
            <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-ink-100">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-ink-50 text-xs text-ink-500"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Issue</th><th className="px-3 py-2">Data</th></tr></thead>
                <tbody className="divide-y divide-ink-100">
                  {problems.slice(0, 100).map((a) => (
                    <tr key={a.line}><td className="px-3 py-2 text-ink-500">{a.line}</td><td className="px-3 py-2"><Badge tone={TONE[a.status]}>{a.status === 'error' ? 'Error' : 'Duplicate'}</Badge> <span className="text-ink-700">{a.reason}</span></td><td className="max-w-[200px] truncate px-3 py-2 text-xs text-ink-500">{a.label}</td></tr>))}
                </tbody>
              </table>
              {problems.length > 100 && <p className="p-2 text-center text-xs text-ink-500">Showing the first 100. Download the report for all {problems.length}.</p>}
            </div>
          )}
          {problems.length === 0 && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Everything looks good.</p>}
          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setStep('map')}>Back</button>
              {problems.length > 0 && <button className="btn-ghost" onClick={() => report(problems)}><Download className="h-4 w-4" />Error report</button>}
            </div>
            <button className="btn-primary" disabled={!ready.length} onClick={run}>Import {ready.length} {entity.label}</button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="py-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-600" aria-hidden />
          <p className="mt-3 text-sm font-medium">Importing… {progress[0]} of {progress[1] || ready.length}</p>
          <div className="mx-auto mt-3 h-2 max-w-sm overflow-hidden rounded bg-ink-100"><div className="h-full bg-brand-600 transition-all" style={{ width: `${progress[1] ? (progress[0] / progress[1]) * 100 : 0}%` }} /></div>
          <p className="mt-2 text-xs text-ink-500">Keep this window open until it finishes.</p>
        </div>
      )}

      {step === 'done' && result && (
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">{result.imported ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-amber-600" />}Import finished</div>
          <ul className="mt-3 space-y-1 text-sm text-ink-700">
            <li><strong>{result.imported}</strong> {entity.label} imported</li>
            <li><strong>{analysis.filter((a) => a.status === 'duplicate').length + result.duplicates}</strong> skipped as duplicates</li>
            <li><strong>{analysis.filter((a) => a.status === 'error').length + result.failed.filter((x) => x.status === 'failed').length}</strong> skipped because of errors</li>
          </ul>
          {result.failed.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{result.failed.length} rows failed while saving, for example row {result.failed[0].line}: {result.failed[0].reason}</p>}
          <div className="mt-5 flex justify-between">
            {problems.length + result.failed.length > 0 ? <button className="btn-ghost" onClick={() => report([...problems, ...result.failed])}><Download className="h-4 w-4" />Download report</button> : <span />}
            <button className="btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
