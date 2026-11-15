import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { DEAL_STAGES } from '../../constants/options'

function ChartCard({ title, subtitle, children, empty }) {
  return (
    <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="text-xs text-ink-500">{subtitle}</p>}
      <div className="mt-3 h-60">{empty ? <p className="grid h-full place-items-center text-sm text-ink-500">{empty}</p> : children}</div>
    </section>
  )
}

export default function DashboardCharts({ stats }) {
  const leads = stats.leads_by_month || []
  const won = stats.won_deals, lost = stats.lost_deals, active = stats.active_deals
  const outcome = [{ name: 'Won', value: won, color: '#10b981' }, { name: 'Lost', value: lost, color: '#f87171' }, { name: 'Active', value: active, color: '#5b5bd6' }].filter((x) => x.value > 0)
  const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null
  const byStage = DEAL_STAGES.map((st) => ({ stage: st.label, count: (stats.deals_by_stage || []).filter((r) => r.stage === st.value).reduce((n, r) => n + r.count, 0) }))

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <ChartCard title="Lead acquisition" subtitle="New leads per month, last 6 months" empty={leads.every((m) => m.count === 0) && 'No leads yet'}>
        <ResponsiveContainer><BarChart data={leads}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tickLine={false} fontSize={12} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} /><Tooltip /><Bar dataKey="count" name="Leads" fill="#5b5bd6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Deal conversion" subtitle={winRate === null ? 'Win rate appears once a deal is won or lost' : `Win rate ${winRate}% of closed deals`} empty={!outcome.length && 'No deals yet'}>
        <ResponsiveContainer><PieChart><Pie data={outcome} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>{outcome.map((o) => <Cell key={o.name} fill={o.color} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
      </ChartCard>
      <ChartCard title="Sales pipeline" subtitle="Deals per stage" empty={byStage.every((s) => s.count === 0) && 'No deals yet'}>
        <ResponsiveContainer><BarChart data={byStage} layout="vertical" margin={{ left: 24 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} fontSize={12} /><YAxis type="category" dataKey="stage" width={110} tickLine={false} axisLine={false} fontSize={12} /><Tooltip /><Bar dataKey="count" name="Deals" fill="#5b5bd6" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer>
      </ChartCard>
    </div>
  )
}
