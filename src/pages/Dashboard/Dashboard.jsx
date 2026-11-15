import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { getDashboardStats, listRecentActivities, listRecentLeads, listUpcomingTasks } from '../../services/dashboard'
import { LEAD_STATUSES, PRIORITY_TONE, STATUS_TONE, labelOf } from '../../constants/options'
import { activityLink, fmtDateTime, fmtDay, fmtMoney, fmtTime, fullName, isTaskOverdue, leadCode } from '../../lib/format'
import { ICONS } from '../../components/common/ActivityTimeline'
import PageHeader from '../../components/common/PageHeader'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'
import Badge from '../../components/common/Badge'

const DashboardCharts = lazy(() => import('./DashboardCharts'))
const money = (obj) => { const e = Object.entries(obj || {}); return e.length ? e.map(([c, v]) => fmtMoney(v, c)).join(' · ') : '—' }

function Stat({ label, value, to, danger }) {
  return (
    <Link to={to} className="rounded-xl border border-ink-100 bg-white p-4 shadow-card transition hover:border-brand-500">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className={`mt-1 break-words text-xl font-bold leading-tight sm:text-2xl ${danger ? 'text-red-600' : ''}`}>{value}</p>
    </Link>
  )
}

function ListCard({ title, to, state, empty, children }) {
  return (
    <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">{title}</h2><Link to={to} className="text-xs font-medium text-brand-600 hover:underline">View all</Link></div>
      {state.loading && !state.data ? <Spinner className="py-6" /> : state.error ? <ErrorState message={state.error} onRetry={state.reload} />
        : !state.data?.length ? <p className="py-4 text-sm text-ink-500">{empty}</p> : <ul className="divide-y divide-ink-100">{state.data.map(children)}</ul>}
    </section>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const stats = useFetch(getDashboardStats, [])
  const activities = useFetch(listRecentActivities, [])
  const tasks = useFetch(listUpcomingTasks, [])
  const leads = useFetch(listRecentLeads, [])
  const first = profile?.full_name?.split(' ')[0]

  if (stats.loading && !stats.data) return <Spinner label="Loading your dashboard" className="py-24" />
  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.reload} />
  const s = stats.data
  const empty = !s.total_leads && !s.active_deals && !s.won_deals && !s.lost_deals

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title={first ? `Welcome back, ${first}` : 'Dashboard'} subtitle="Live numbers from your sales records" />
      {empty && (
        <div className="rounded-xl border border-dashed border-ink-300 bg-white p-6 text-center shadow-card">
          <p className="font-semibold">Your dashboard is empty for now</p>
          <p className="mt-1 text-sm text-ink-500">Add your first lead or organization and these numbers will fill in on their own.</p>
          <div className="mt-4 flex justify-center gap-2"><Link to="/leads?new=1" className="btn-primary">Add a lead</Link><Link to="/organizations?new=1" className="btn-ghost border border-ink-300">Add an organization</Link></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Total leads" value={s.total_leads} to="/leads" />
        <Stat label="New leads this month" value={s.new_leads_month} to="/leads" />
        <Stat label="Qualified leads" value={s.qualified_leads} to="/leads" />
        <Stat label="Active deals" value={s.active_deals} to="/pipeline" />
        <Stat label="Won deals" value={s.won_deals} to="/deals" />
        <Stat label="Lost deals" value={s.lost_deals} to="/deals" />
        <Stat label="Pipeline value" value={money(s.pipeline_value)} to="/pipeline" />
        <Stat label="Closed revenue" value={money(s.closed_revenue)} to="/deals" />
        <Stat label="Upcoming follow-ups (7 days)" value={s.upcoming_followups} to="/tasks" />
        <Stat label="Overdue tasks" value={s.overdue_tasks} to="/tasks" danger={s.overdue_tasks > 0} />
      </div>

      <Suspense fallback={<Spinner label="Loading charts" className="py-16" />}><DashboardCharts stats={s} /></Suspense>

      <div className="grid gap-5 lg:grid-cols-3">
        <ListCard title="Recent activities" to="/activities" state={activities} empty="No activity yet. Log a call or note on any record.">
          {(a) => { const Icon = ICONS[a.activity_type]; const to = activityLink(a); const body = (<><p className="truncate text-sm font-medium">{a.title}</p><p className="text-xs text-ink-500">{a.user?.full_name || 'Someone'} · {fmtDateTime(a.created_at)}</p></>)
            return <li key={a.id} className="flex items-start gap-2 py-2">{Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />}{to ? <Link to={to} className="min-w-0 hover:underline">{body}</Link> : <div className="min-w-0">{body}</div>}</li> }}
        </ListCard>
        <ListCard title="Upcoming tasks" to="/tasks" state={tasks} empty="No open tasks with a due date.">
          {(t) => { const od = isTaskOverdue(t); return (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{t.title}</p><p className={`text-xs ${od ? 'font-semibold text-red-600' : 'text-ink-500'}`}>{fmtDay(t.due_date)} {fmtTime(t.due_time)}{od && ' · Overdue'}</p></div><Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge></li>) }}
        </ListCard>
        <ListCard title="Recent leads" to="/leads" state={leads} empty="No leads yet.">
          {(l) => <li key={l.id} className="flex items-center justify-between gap-2 py-2"><Link to={`/leads/${l.id}`} className="min-w-0 hover:underline"><p className="truncate text-sm font-medium">{fullName(l)}</p><p className="text-xs text-ink-500">{leadCode(l.lead_number)}</p></Link><Badge tone={STATUS_TONE[l.status]}>{labelOf(LEAD_STATUSES, l.status)}</Badge></li>}
        </ListCard>
      </div>
    </div>
  )
}
