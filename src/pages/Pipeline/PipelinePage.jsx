import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useFetch } from '../../hooks/useFetch'
import { listDealsForPipeline, moveDeal } from '../../services/deals'
import { listProfiles, listServiceNames } from '../../services/lookups'
import { CLOSING_FILTERS, DEAL_STAGES, isClosedStage, stageProbability } from '../../constants/options'
import { friendlyError } from '../../lib/errors'
import { fmtDay, fmtMoney, fullName, sumByCurrency, todayStr } from '../../lib/format'
import PageHeader from '../../components/common/PageHeader'
import { FilterSelect } from '../../components/common/FilterBar'
import ErrorState from '../../components/common/ErrorState'
import EmptyState from '../../components/common/EmptyState'
import LostReasonModal from '../Deals/LostReasonModal'

const COLUMN_ACCENT = { won: 'border-t-emerald-500', lost: 'border-t-red-400' }

function DealCard({ deal, dragging, onDragStart, onDragEnd, onMove }) {
  const overdue = deal.expected_close_date && deal.expected_close_date < todayStr() && !isClosedStage(deal.stage)
  return (
    <article draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', deal.id); onDragStart(deal.id) }} onDragEnd={onDragEnd}
      className={`cursor-grab rounded-lg border border-ink-100 bg-white p-3 shadow-card active:cursor-grabbing ${dragging ? 'opacity-40' : ''}`}>
      <Link draggable={false} to={`/deals/${deal.id}`} className="text-sm font-semibold hover:text-brand-700 hover:underline">{deal.title}</Link>
      <p className="mt-0.5 truncate text-xs text-ink-500">{deal.organization?.name || 'No organization'}</p>
      {deal.contact && <p className="truncate text-xs text-ink-500">{fullName(deal.contact)}</p>}
      <p className="mt-2 text-sm font-semibold">{fmtMoney(deal.value, deal.currency)}</p>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-ink-500">
        <span className={`inline-flex items-center gap-1 ${overdue ? 'font-semibold text-red-600' : ''}`}><CalendarDays className="h-3.5 w-3.5" aria-hidden />{deal.expected_close_date ? fmtDay(deal.expected_close_date) : 'No date'}</span>
        <span className="truncate">{deal.assignee?.full_name || 'Unassigned'}</span>
      </div>
      <select aria-label={`Move ${deal.title} to another stage`} value={deal.stage} onChange={(e) => onMove(deal, e.target.value)}
        className="mt-2 w-full rounded border border-ink-100 bg-ink-50 px-1.5 py-1 text-xs text-ink-700">
        {DEAL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </article>
  )
}

export default function PipelinePage() {
  const [filters, setFilters] = useState({ assigned_to: '', interested_service: '', closing: '' })
  const data = useFetch(() => listDealsForPipeline(filters), [filters])
  const users = useFetch(listProfiles, [])
  const services = useFetch(listServiceNames, [])
  const [deals, setDeals] = useState([])
  const [dragId, setDragId] = useState(null)
  const [overStage, setOverStage] = useState(null)
  const [losing, setLosing] = useState(null)
  const isFiltered = Object.values(filters).some(Boolean)

  useEffect(() => { if (data.data) setDeals(data.data) }, [data.data])
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }))

  // Optimistic: the card moves immediately and snaps back if saving fails.
  const move = async (deal, stage) => {
    if (deal.stage === stage) return
    if (stage === 'lost') { setLosing(deal); return }
    const prev = deals
    setDeals((all) => all.map((x) => (x.id === deal.id ? { ...x, stage, probability: stageProbability(stage) } : x)))
    try { await moveDeal(deal, stage) } catch (e) { setDeals(prev); toast.error(friendlyError(e)) }
  }
  const onDrop = (e, stage) => {
    e.preventDefault(); setOverStage(null)
    const deal = deals.find((x) => x.id === (e.dataTransfer.getData('text/plain') || dragId))
    setDragId(null)
    if (deal) move(deal, stage)
  }

  return (
    <div className="mx-auto max-w-full">
      <PageHeader title="Sales Pipeline" subtitle="Drag deals between stages, or use the menu on each card" actions={<Link to="/deals?new=1" className="btn-primary"><Plus className="h-4 w-4" />Add deal</Link>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterSelect label="Any salesperson" value={filters.assigned_to} onChange={(v) => setFilter('assigned_to', v)} options={(users.data || []).map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        <FilterSelect label="Any service" value={filters.interested_service} onChange={(v) => setFilter('interested_service', v)} options={(services.data || []).map((s) => ({ value: s.name, label: s.name }))} />
        <FilterSelect label="Any closing date" value={filters.closing} onChange={(v) => setFilter('closing', v)} options={CLOSING_FILTERS} />
        {isFiltered && <button className="btn-ghost" onClick={() => setFilters({ assigned_to: '', interested_service: '', closing: '' })}>Clear</button>}
      </div>

      {data.error && !deals.length ? <ErrorState message={data.error} onRetry={data.reload} />
        : !data.loading && !deals.length && !isFiltered ? (
          <div className="rounded-xl border border-ink-100 bg-white shadow-card"><EmptyState title="No deals in the pipeline" description="Add a deal, or convert a qualified lead, and it will show up here." action={<Link to="/deals?new=1" className="btn-primary">Add deal</Link>} /></div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {DEAL_STAGES.map((stage) => {
              const items = deals.filter((d) => d.stage === stage.value)
              const totals = sumByCurrency(items)
              return (
                <section key={stage.value} aria-label={`${stage.label} stage`}
                  onDragOver={(e) => { e.preventDefault(); setOverStage(stage.value) }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverStage(null) }} onDrop={(e) => onDrop(e, stage.value)}
                  className={`flex w-72 shrink-0 flex-col rounded-xl border border-t-4 bg-ink-50 ${COLUMN_ACCENT[stage.value] || 'border-t-brand-500'} ${overStage === stage.value ? 'border-brand-500 bg-brand-50' : 'border-ink-100'}`}>
                  <header className="p-3">
                    <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{stage.label}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-ink-500">{items.length}</span></div>
                    <p className="mt-0.5 min-h-[1rem] text-xs text-ink-500">{totals.length ? totals.join(' · ') : '—'}</p>
                  </header>
                  <div className="flex min-h-[120px] flex-1 flex-col gap-2 px-3 pb-3">
                    {data.loading && !deals.length && <div className="h-24 animate-pulse rounded-lg bg-ink-100" />}
                    {items.map((deal) => <DealCard key={deal.id} deal={deal} dragging={dragId === deal.id} onDragStart={setDragId} onDragEnd={() => { setDragId(null); setOverStage(null) }} onMove={move} />)}
                    {!data.loading && !items.length && <p className="py-6 text-center text-xs text-ink-500">{isFiltered ? 'No matching deals' : 'Drop a deal here'}</p>}
                  </div>
                </section>
              )
            })}
          </div>
        )}

      {losing && <LostReasonModal deal={losing} onClose={() => setLosing(null)}
        onSubmit={async (reason) => { await moveDeal(losing, 'lost', reason); toast.success('Moved to Lost'); setLosing(null); data.reload() }} />}
    </div>
  )
}
