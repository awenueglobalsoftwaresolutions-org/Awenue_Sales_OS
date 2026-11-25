import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Compass, KanbanSquare, PieChart as PieIcon } from 'lucide-react'
import { DEAL_STAGES, LEAD_SOURCES, labelOf } from '../../constants/options'
import { EmptyIllustration } from '../../components/common/Graphics'
import { SOURCE_COLORS, STAGE_COLORS, THEME_COLORS } from '../../constants/themeColors'

const TOOLTIP_STYLE = {
  borderRadius: '10px',
  border: '1px solid #eceef3',
  backgroundColor: 'rgba(255, 255, 255, 0.98)',
  boxShadow: '0 10px 28px -6px rgba(20,22,31,.16)',
  fontSize: '11px',
  padding: '6px 10px',
}

const CHART_TONES = {
  brand: { icon: 'border-brand-200 bg-brand-50 text-brand-600', badge: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' },
  violet: { icon: 'border-violet-200 bg-violet-50 text-violet-600', badge: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
  emerald: { icon: 'border-emerald-200 bg-emerald-50 text-emerald-600', badge: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
  sky: { icon: 'border-sky-200 bg-sky-50 text-sky-600', badge: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200' },
}

function ChartCard({ title, subtitle, badge, icon: Icon, children, empty, tone = 'brand' }) {
  const t = CHART_TONES[tone] || CHART_TONES.brand
  return (
    <section className="surface-card flex h-full flex-col p-4 transition hover:shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink-900">
            {Icon && (
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border ${t.icon}`} aria-hidden>
                <Icon className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="truncate">{title}</span>
          </h3>
          {subtitle && <p className="mt-0.5 truncate text-[11px] text-ink-500">{subtitle}</p>}
        </div>
        {badge && (
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.badge}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-1 flex-col justify-center">
        {empty ? (
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <EmptyIllustration type="reports" className="h-20 w-28 opacity-80" />
            <p className="mt-1 text-xs font-medium text-ink-500">{empty}</p>
          </div>
        ) : children}
      </div>
    </section>
  )
}

export default function DashboardCharts({ stats, leadBreakdown }) {
  const leads = stats.leads_by_month || []
  const total6m = leads.reduce((n, m) => n + (m.count || 0), 0)
  const won = stats.won_deals || 0
  const lost = stats.lost_deals || 0
  const active = stats.active_deals || 0
  const outcomeTotal = won + lost + active
  const outcome = [
    { name: 'Won', value: won, color: '#10b981' },
    { name: 'Active', value: active, color: '#5b5bd6' },
    { name: 'Lost', value: lost, color: '#f43f5e' },
  ].filter((x) => x.value > 0)
  const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null
  const byStage = DEAL_STAGES.map((st, idx) => ({
    stage: st.label,
    count: (stats.deals_by_stage || []).filter((r) => r.stage === st.value).reduce((n, r) => n + r.count, 0),
    color: STAGE_COLORS[idx % STAGE_COLORS.length],
  }))

  const sourceTotal = leadBreakdown?.total || 0
  const sources = (leadBreakdown?.bySource || []).slice(0, 6).map((x, idx) => ({
    name: x.source === 'other' ? 'Other' : labelOf(LEAD_SOURCES, x.source),
    count: x.count,
    color: SOURCE_COLORS[idx % SOURCE_COLORS.length],
  }))
  const topSource = sources[0]

  return (
    <div className="grid gap-4 lg:gap-5 md:grid-cols-2 xl:grid-cols-4">
      {/* 1. Lead Acquisition Bar Chart */}
      <ChartCard
        tone="brand"
        title="Lead acquisition"
        subtitle="Last 6 months"
        badge={total6m > 0 ? `${total6m} total` : null}
        icon={BarChart3}
        empty={leads.every((m) => m.count === 0) && 'No leads yet'}
      >
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={leads} margin={{ top: 16, right: 4, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="leadBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4b4bc4" stopOpacity={1} />
                  <stop offset="100%" stopColor="#818cf8" stopOpacity={0.75} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eceef3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={10} stroke="#6b7185" />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} width={30} stroke="#6b7185" />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#eef2ff', opacity: 0.5 }} />
              <Bar dataKey="count" name="Leads" fill="url(#leadBarGrad)" radius={[5, 5, 0, 0]} maxBarSize={28}>
                <LabelList dataKey="count" position="top" fontSize={10} fontWeight={600} fill="#4b4bc4" formatter={(v) => (v > 0 ? v : '')} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* 2. Lead Sources Pie / Donut Chart */}
      <ChartCard
        tone="emerald"
        title="Lead sources"
        subtitle={topSource ? `Top: ${topSource.name}` : 'Where leads come from'}
        badge={sourceTotal > 0 ? `${sourceTotal}` : null}
        icon={Compass}
        empty={!sources.length && 'No lead sources yet'}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-36 w-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sources} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={3} cornerRadius={4} stroke="none">
                  {sources.map((s) => <Cell key={s.name} fill={s.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-base font-bold tabular-nums leading-none text-ink-900">{sourceTotal}</p>
                <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-500">Leads</p>
              </div>
            </div>
          </div>
          <ul className="grid w-full grid-cols-2 gap-1.5 text-[11px]">
            {sources.map((x) => {
              const pct = sourceTotal ? Math.round((x.count / sourceTotal) * 100) : 0
              return (
                <li key={x.name} className="flex items-center justify-between gap-1.5 rounded-lg bg-ink-50/80 px-2 py-1">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium text-ink-700">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.color }} />
                    <span className="truncate">{x.name}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink-900">{pct}%</span>
                </li>
              )
            })}
          </ul>
        </div>
      </ChartCard>

      {/* 3. Deal Conversion Donut */}
      <ChartCard
        tone="violet"
        title="Deal conversion"
        subtitle={winRate === null ? 'Win rate once closed' : `${winRate}% win rate`}
        badge={outcomeTotal > 0 ? `${outcomeTotal}` : null}
        icon={PieIcon}
        empty={!outcome.length && 'No deals yet'}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-36 w-36 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={outcome} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={4} cornerRadius={4} stroke="none">
                  {outcome.map((o) => <Cell key={o.name} fill={o.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <p className="text-base font-bold tabular-nums leading-none text-ink-900">{winRate !== null ? `${winRate}%` : outcomeTotal}</p>
                <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-ink-500">{winRate !== null ? 'Win rate' : 'Deals'}</p>
              </div>
            </div>
          </div>
          <ul className="grid w-full grid-cols-3 gap-1.5 text-[11px]">
            {outcome.map((o) => {
              const pct = outcomeTotal ? Math.round((o.value / outcomeTotal) * 100) : 0
              return (
                <li key={o.name} className="flex flex-col items-center rounded-lg bg-ink-50/80 px-1.5 py-1 text-center">
                  <span className="flex items-center gap-1 font-medium text-ink-600">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.color }} />
                    {o.name}
                  </span>
                  <span className="mt-0.5 font-semibold tabular-nums text-ink-900">
                    {pct}% <span className="font-normal text-ink-400">({o.value})</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </ChartCard>

      {/* 4. Sales Pipeline Stage Distribution */}
      <ChartCard
        tone="sky"
        title="Sales pipeline"
        subtitle="Deals per stage"
        icon={KanbanSquare}
        empty={byStage.every((s) => s.count === 0) && 'No deals yet'}
      >
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byStage} layout="vertical" margin={{ top: 2, right: 22, left: 0, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eceef3" />
              <XAxis type="number" allowDecimals={false} fontSize={10} stroke="#6b7185" axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="stage" width={96} tickLine={false} axisLine={false} fontSize={10} stroke="#3b4050" />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#f6f7fa' }} />
              <Bar dataKey="count" name="Deals" radius={[0, 5, 5, 0]} maxBarSize={14} background={{ fill: '#f6f7fa', radius: 5 }}>
                {byStage.map((s) => <Cell key={s.stage} fill={s.color} />)}
                <LabelList dataKey="count" position="right" fontSize={10} fontWeight={600} fill="#3b4050" formatter={(v) => (v > 0 ? v : '')} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  )
}
