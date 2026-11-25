import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, CalendarDays, KanbanSquare, Layers, Plus, TrendingUp, Trophy, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useFetch } from '../../hooks/useFetch'
import { listDealsForPipeline, moveDeal } from '../../services/deals'
import { listProfiles, listServiceNames } from '../../services/lookups'
import { CLOSING_FILTERS, DEAL_STAGES, isClosedStage, stageProbability } from '../../constants/options'
import { friendlyError } from '../../lib/errors'
import { fmtDay, fmtMoney, fullName, sumByCurrency, todayStr } from '../../lib/format'
import PageHeader from '../../components/common/PageHeader'
import StatTile from '../../components/common/StatTile'
import { FilterSelect } from '../../components/common/FilterBar'
import Avatar from '../../components/common/Avatar'
import ErrorState from '../../components/common/ErrorState'
import EmptyState from '../../components/common/EmptyState'
import LostReasonModal from '../Deals/LostReasonModal'

const STAGE_STYLE = {
  lead_in: { top: 'border-t-sky-500', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700', bar: 'bg-sky-500' },
  contact_made: { top: 'border-t-indigo-500', dot: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-700', bar: 'bg-indigo-500' },
  qualified: { top: 'border-t-violet-500', dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700', bar: 'bg-violet-500' },
  proposal_sent: { top: 'border-t-amber-500', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  negotiation: { top: 'border-t-orange-500', dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-700', bar: 'bg-orange-500' },
  won: { top: 'border-t-emerald-500', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  lost: { top: 'border-t-red-400', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700', bar: 'bg-red-400' },
}

function DealCard({ deal, dragging, onDragStart, onDragEnd, onMove }) {
  const overdue = deal.expected_close_date && deal.expected_close_date < todayStr() && !isClosedStage(deal.stage)
  const prob = deal.probability ?? 0
  const probColor = prob >= 70 ? 'bg-emerald-500' : prob >= 40 ? 'bg-amber-500' : 'bg-brand-500'
  const probBadge = prob >= 70 ? 'bg-emerald-50 text-emerald-700' : prob >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'

  return (
    <article
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', deal.id); onDragStart(deal.id) }}
      onDragEnd={onDragEnd}
      className={`group cursor-grab rounded-xl border border-ink-100 bg-white p-2.5 shadow-card transition duration-150 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover active:cursor-grabbing ${dragging ? 'opacity-40 scale-95' : ''}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <Link draggable={false} to={`/deals/${deal.id}`} className="min-w-0 truncate text-xs font-semibold text-ink-900 group-hover:text-brand-700 hover:underline">
          {deal.title}
        </Link>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${probBadge}`}>{prob}%</span>
      </div>

      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-ink-500">
        <Building2 className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />
        <span className="truncate">{deal.organization?.name || 'No organization'}</span>
      </p>
      {deal.contact && <p className="mt-0.5 truncate pl-4 text-[11px] text-ink-400">{fullName(deal.contact)}</p>}

      <div className="mt-2 flex items-center justify-between gap-1.5">
        <span className="truncate rounded-md bg-ink-50 px-1.5 py-0.5 text-xs font-bold tabular-nums text-ink-900">
          {fmtMoney(deal.value, deal.currency)}
        </span>
        {deal.assignee && <Avatar person={deal.assignee} size={20} />}
      </div>

      <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-100">
        <div className={`h-full rounded-full transition-all ${probColor}`} style={{ width: `${Math.min(100, Math.max(0, prob))}%` }} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-1.5 text-[10px] text-ink-500">
        <span className={`inline-flex items-center gap-1 truncate ${overdue ? 'rounded bg-red-50 px-1 py-0.5 font-semibold text-red-600' : ''}`}>
          <CalendarDays className="h-2.5 w-2.5 shrink-0" aria-hidden />
          <span className="truncate">{deal.expected_close_date ? fmtDay(deal.expected_close_date) : 'No date'}</span>
        </span>
        <span className="truncate">{deal.assignee?.full_name?.split(' ')[0] || 'Unassigned'}</span>
      </div>

      <select
        aria-label={`Move ${deal.title} to another stage`}
        value={deal.stage}
        onChange={(e) => onMove(deal, e.target.value)}
        className="mt-2 w-full rounded-lg border border-ink-100 bg-ink-50/80 px-1.5 py-1 text-[11px] font-medium text-ink-700 transition focus:border-brand-500 focus:bg-white focus:outline-none"
      >
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

  const openDeals = deals.filter((d) => !isClosedStage(d.stage))
  const wonDeals = deals.filter((d) => d.stage === 'won')
  const openTotals = sumByCurrency(openDeals)
  const wonTotals = sumByCurrency(wonDeals)

  return (
    <div className="w-full flex min-h-full flex-col gap-4 animate-fade-up">
      <PageHeader
        title="Sales Pipeline"
        subtitle="Drag deals between stages, or use the menu on each card"
        icon={KanbanSquare}
        actions={<Link to="/deals?new=1" className="btn-primary"><Plus className="h-4 w-4" />Add deal</Link>}
      />

      {/* Pipeline Graphics & Summary Strip */}
      {deals.length > 0 && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={Layers} label="Total deals" value={deals.length} sub={`${openDeals.length} active in pipeline`} tone="brand" />
            <StatTile icon={TrendingUp} label="Open pipeline" value={openTotals.length ? openTotals.join(' · ') : '—'} sub="Active opportunities" tone="sky" />
            <StatTile icon={Trophy} label="Won deals" value={wonDeals.length} sub={deals.length ? `${Math.round((wonDeals.length / deals.length) * 100)}% of pipeline` : undefined} tone="emerald" />
            <StatTile icon={Wallet} label="Won value" value={wonTotals.length ? wonTotals.join(' · ') : '—'} sub="Closed-won total" tone="amber" />
          </div>

          <div className="surface-card p-3">
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-ink-700">Stage distribution</span>
              <div className="flex flex-wrap items-center gap-3">
                {DEAL_STAGES.map((st) => {
                  const count = deals.filter((d) => d.stage === st.value).length
                  if (!count) return null
                  const s = STAGE_STYLE[st.value] || STAGE_STYLE.lead_in
                  return (
                    <span key={st.value} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-600">
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                      {st.label} ({count})
                    </span>
                  )
                })}
              </div>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-ink-100">
              {DEAL_STAGES.map((st) => {
                const count = deals.filter((d) => d.stage === st.value).length
                if (!count) return null
                const pct = (count / deals.length) * 100
                const s = STAGE_STYLE[st.value] || STAGE_STYLE.lead_in
                return (
                  <div
                    key={st.value}
                    title={`${st.label}: ${count} (${Math.round(pct)}%)`}
                    className={`${s.bar} h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full`}
                    style={{ width: `${pct}%` }}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect label="Any salesperson" value={filters.assigned_to} onChange={(v) => setFilter('assigned_to', v)} options={(users.data || []).map((u) => ({ value: u.id, label: u.full_name || u.email }))} />
        <FilterSelect label="Any service" value={filters.interested_service} onChange={(v) => setFilter('interested_service', v)} options={(services.data || []).map((s) => ({ value: s.name, label: s.name }))} />
        <FilterSelect label="Any closing date" value={filters.closing} onChange={(v) => setFilter('closing', v)} options={CLOSING_FILTERS} />
        {isFiltered && <button className="btn-ghost" onClick={() => setFilters({ assigned_to: '', interested_service: '', closing: '' })}>Clear</button>}
      </div>

      {data.error && !deals.length ? <ErrorState message={data.error} onRetry={data.reload} />
        : !data.loading && !deals.length && !isFiltered ? (
          <div className="surface-card grid flex-1 place-items-center">
            <EmptyState
              illustration="pipeline"
              title="No deals in the pipeline"
              description="Add a deal, or convert a qualified lead, and it will show up here."
              action={<Link to="/deals?new=1" className="btn-primary">Add deal</Link>}
            />
          </div>
        ) : (
          <div className="thin-scrollbar flex flex-1 gap-3 overflow-x-auto pb-2">
            {DEAL_STAGES.map((stage) => {
              const items = deals.filter((d) => d.stage === stage.value)
              const totals = sumByCurrency(items)
              const st = STAGE_STYLE[stage.value] || STAGE_STYLE.lead_in
              const pct = deals.length ? Math.round((items.length / deals.length) * 100) : 0
              return (
                <section
                  key={stage.value}
                  aria-label={`${stage.label} stage`}
                  onDragOver={(e) => { e.preventDefault(); setOverStage(stage.value) }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverStage(null) }}
                  onDrop={(e) => onDrop(e, stage.value)}
                  className={`flex min-h-[340px] w-[250px] shrink-0 flex-col rounded-2xl border border-t-4 transition duration-150 xl:min-w-[215px] xl:flex-1 ${st.top} ${overStage === stage.value ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-200' : 'border-ink-100 bg-ink-50/70'}`}
                >
                  <header className="p-2.5 pb-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-900">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} aria-hidden />
                        <span className="truncate">{stage.label}</span>
                      </h2>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${st.pill}`}>{items.length}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-1 text-[11px] font-medium text-ink-500">
                      <span className="truncate">{totals.length ? totals.join(' · ') : '—'}</span>
                      <span className="shrink-0 text-[10px] text-ink-400">{pct}%</span>
                    </div>
                  </header>
                  <div className="flex flex-1 flex-col gap-2 px-2 pb-2.5">
                    {data.loading && !deals.length && <div className="h-24 animate-pulse rounded-xl bg-ink-100" />}
                    {items.map((deal) => <DealCard key={deal.id} deal={deal} dragging={dragId === deal.id} onDragStart={setDragId} onDragEnd={() => { setDragId(null); setOverStage(null) }} onMove={move} />)}
                    {!data.loading && !items.length && (
                      <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-ink-200/80 bg-white/40 py-6 text-center">
                        <KanbanSquare className="mb-1 h-4 w-4 text-ink-300" aria-hidden />
                        <p className="px-2 text-[11px] font-medium text-ink-400">{isFiltered ? 'No match' : 'Drop here'}</p>
                      </div>
                    )}
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
