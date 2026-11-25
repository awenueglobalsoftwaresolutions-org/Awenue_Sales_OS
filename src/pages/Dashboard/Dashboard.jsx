import { lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity as ActivityIcon,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Handshake,
  KanbanSquare,
  Plus,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { getDashboardStats, getLeadSourceBreakdown, listRecentActivities, listRecentLeads, listUpcomingTasks } from '../../services/dashboard'
import { LEAD_STATUSES, PRIORITY_TONE, STATUS_TONE, labelOf } from '../../constants/options'
import { activityLink, fmtDateTime, fmtDay, fmtMoney, fmtTime, fullName, isTaskOverdue, leadCode } from '../../lib/format'
import { ICONS } from '../../components/common/ActivityTimeline'
import { DashboardHeroArt, EmptyIllustration } from '../../components/common/Graphics'
import StatTile from '../../components/common/StatTile'
import Avatar from '../../components/common/Avatar'
import Spinner from '../../components/common/Spinner'
import ErrorState from '../../components/common/ErrorState'
import Badge from '../../components/common/Badge'

const DashboardCharts = lazy(() => import('./DashboardCharts'))
const money = (obj) => { const e = Object.entries(obj || {}); return e.length ? e.map(([c, v]) => fmtMoney(v, c)).join(' · ') : '—' }

function SectionHeading({ title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-500">{title}</h2>
        {subtitle && <p className="text-xs text-ink-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

function ListCard({ title, icon: Icon, to, state, empty, children, className = '' }) {
  return (
    <section className={`surface-card flex flex-col p-5 ${className}`}>
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          {Icon && (
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600" aria-hidden>
              <Icon className="h-4 w-4" />
            </span>
          )}
          {title}
        </h3>
        <Link to={to} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {state.loading && !state.data ? <Spinner className="py-6" /> : state.error ? <ErrorState message={state.error} onRetry={state.reload} />
        : !state.data?.length ? <p className="py-8 text-center text-sm text-ink-500">{empty}</p>
        : <ul className="divide-y divide-ink-100">{state.data.map(children)}</ul>}
    </section>
  )
}

export default function Dashboard() {
  const { profile, can } = useAuth()
  const stats = useFetch(getDashboardStats, [])
  const leadBreakdown = useFetch(getLeadSourceBreakdown, [])
  const activities = useFetch(listRecentActivities, [])
  const tasks = useFetch(listUpcomingTasks, [])
  const leads = useFetch(listRecentLeads, [])
  const first = profile?.full_name?.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (stats.loading && !stats.data) return <Spinner label="Loading your dashboard" className="py-24" />
  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.reload} />
  const s = stats.data
  const empty = !s.total_leads && !s.active_deals && !s.won_deals && !s.lost_deals
  const winRate = s.won_deals + s.lost_deals > 0 ? Math.round((s.won_deals / (s.won_deals + s.lost_deals)) * 100) : null

  return (
    <div className="mx-auto max-w-7xl space-y-4 animate-fade-up">
      {/* 1. Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-700 via-brand-600 to-indigo-500 p-4 text-white shadow-card sm:px-6 sm:py-4">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white/95 backdrop-blur-sm">
              <Sparkles className="h-3 w-3" /> Sales Command Center
            </span>
            <h1 className="mt-1.5 text-xl font-bold tracking-tight sm:text-2xl">
              {greeting}{first ? `, ${first}` : ''}
            </h1>
            <p className="mt-0.5 text-xs text-brand-100 sm:text-sm">
              Your pipeline health, lead conversion, and daily follow-ups in one place.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {can('leads.create') && (
                <Link to="/leads?new=1" className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50">
                  <Plus className="h-3.5 w-3.5" /> Add lead
                </Link>
              )}
              {can('deals.create') && (
                <Link to="/deals?new=1" className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25">
                  <Handshake className="h-3.5 w-3.5" /> New deal
                </Link>
              )}
              {can('deals.view') && (
                <Link to="/pipeline" className="inline-flex items-center gap-1.5 rounded-xl bg-white/15 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-white/25">
                  <KanbanSquare className="h-3.5 w-3.5" /> Open pipeline
                </Link>
              )}
            </div>
          </div>
          <DashboardHeroArt className="hidden h-20 w-44 shrink-0 md:block" />
        </div>
      </div>

      {empty && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-brand-200 bg-white p-6 text-center shadow-card sm:flex-row sm:text-left">
          <EmptyIllustration type="leads" className="h-24 w-32 shrink-0" />
          <div className="sm:ml-4">
            <p className="font-semibold text-ink-900">Your dashboard is ready for your first records</p>
            <p className="mt-1 text-sm text-ink-500">Add your first lead or organization and these charts and metrics will fill in automatically.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Link to="/leads?new=1" className="btn-primary !py-1.5 !text-xs">Add a lead</Link>
              <Link to="/organizations?new=1" className="btn-outline !py-1.5 !text-xs">Add an organization</Link>
            </div>
          </div>
        </div>
      )}

      {/* 2. Key Performance Indicators (5 consolidated high-signal cards) */}
      <section className="space-y-3" aria-label="Key metrics">
        <SectionHeading title="Key Metrics" subtitle="Live totals across leads, deals, revenue, and tasks" />
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <StatTile
            icon={Users}
            label="Total leads"
            value={s.total_leads}
            sub={`${s.new_leads_month} new this mo · ${s.qualified_leads} qualified`}
            to="/leads"
            tone="brand"
          />
          <StatTile
            icon={Handshake}
            label="Active deals"
            value={s.active_deals}
            sub={`${s.won_deals} won · ${s.lost_deals} lost`}
            to="/pipeline"
            tone="amber"
          />
          <StatTile
            icon={TrendingUp}
            label="Pipeline value"
            value={money(s.pipeline_value)}
            sub={winRate !== null ? `${winRate}% deal win rate` : 'Open deal value'}
            to="/pipeline"
            tone="sky"
          />
          <StatTile
            icon={Wallet}
            label="Closed revenue"
            value={money(s.closed_revenue)}
            sub={`${s.won_deals} closed-won deals`}
            to="/deals"
            tone="emerald"
          />
          <StatTile
            icon={CalendarClock}
            label="Follow-ups (7 days)"
            value={s.upcoming_followups}
            sub={s.overdue_tasks > 0 ? `${s.overdue_tasks} overdue tasks` : '0 overdue tasks'}
            to="/tasks"
            danger={s.overdue_tasks > 0}
            tone="violet"
          />
        </div>
      </section>

      {/* 3. Lead Stage Funnel Strip */}
      {leadBreakdown.data && leadBreakdown.data.total > 0 && (
        <section className="surface-card p-4" aria-label="Lead stage breakdown">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Lead funnel breakdown</h2>
              <p className="text-xs text-ink-500">{leadBreakdown.data.total} leads across stages</p>
            </div>
            <Link to="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
              Manage leads <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {LEAD_STATUSES.map((st) => {
              const count = leadBreakdown.data.byStatus[st.value] || 0
              const pct = Math.round((count / leadBreakdown.data.total) * 100)
              return (
                <Link
                  key={st.value}
                  to={`/leads?status=${st.value}`}
                  className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 transition hover:border-brand-300 hover:bg-brand-50/30"
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                    <span className="truncate">{st.label}</span>
                    <span className="tabular-nums text-ink-400">{pct}%</span>
                  </div>
                  <p className="mt-1.5 text-lg font-bold tabular-nums text-ink-900">{count}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* 4. Analytics & Charts */}
      <section className="space-y-3" aria-label="Analytics">
        <SectionHeading title="Analytics & Conversion" subtitle="Trends, lead sources, win rate, and stage distribution" />
        <Suspense fallback={<Spinner label="Loading charts" className="py-16" />}>
          <DashboardCharts stats={s} leadBreakdown={leadBreakdown.data} />
        </Suspense>
      </section>

      {/* 5. Today's Workspace (3 columns in one row) */}
      <section className="space-y-3" aria-label="Workspace activity">
        <SectionHeading title="Today's Workspace" subtitle="Recent leads, upcoming tasks, and live team activity" />
        <div className="grid gap-4 lg:grid-cols-3">
          <ListCard title="Recent leads" icon={UserPlus} to="/leads" state={leads} empty="No leads yet.">
            {(l) => (
              <li key={l.id} className="flex items-center justify-between gap-2.5 py-2.5">
                <Link to={`/leads/${l.id}`} className="group flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar person={{ full_name: fullName(l) }} size={28} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900 group-hover:text-brand-700 group-hover:underline">{fullName(l)}</p>
                    <p className="truncate text-xs text-ink-500">{leadCode(l.lead_number)}{l.organization?.name ? ` · ${l.organization.name}` : ''}</p>
                  </div>
                </Link>
                <Badge tone={STATUS_TONE[l.status]}>{labelOf(LEAD_STATUSES, l.status)}</Badge>
              </li>
            )}
          </ListCard>

          <ListCard title="Upcoming tasks" icon={CheckCircle2} to="/tasks" state={tasks} empty="No open tasks with a due date.">
            {(t) => {
              const od = isTaskOverdue(t)
              return (
                <li key={t.id} className="flex items-center justify-between gap-2.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{t.title}</p>
                    <p className={`text-xs ${od ? 'font-semibold text-red-600' : 'text-ink-500'}`}>
                      {fmtDay(t.due_date)} {fmtTime(t.due_time)}{od && ' · Overdue'}
                    </p>
                  </div>
                  <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                </li>
              )
            }}
          </ListCard>

          <section className="surface-card flex flex-col p-5">
            <div className="mb-3.5 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600" aria-hidden>
                  <ActivityIcon className="h-4 w-4" />
                </span>
                Recent activities
              </h3>
              <Link to="/activities" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {activities.loading && !activities.data ? (
              <Spinner className="py-6" />
            ) : activities.error ? (
              <ErrorState message={activities.error} onRetry={activities.reload} />
            ) : !activities.data?.length ? (
              <p className="py-8 text-center text-sm text-ink-500">No activity yet. Log a call or note on any record.</p>
            ) : (
              <ol className="relative space-y-3.5 before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-px before:bg-ink-100">
                {activities.data.map((a) => {
                  const Icon = ICONS[a.activity_type] || ActivityIcon
                  const to = activityLink(a)
                  const body = (
                    <>
                      <p className="truncate text-sm font-medium text-ink-900">{a.title}</p>
                      <p className="text-xs text-ink-500">{a.user?.full_name || 'Someone'} · {fmtDateTime(a.created_at)}</p>
                    </>
                  )
                  return (
                    <li key={a.id} className="relative flex items-start gap-3 pl-0.5">
                      <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brand-100 bg-brand-50 text-brand-600">
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      {to ? (
                        <Link to={to} className="min-w-0 flex-1 pt-0.5 hover:text-brand-700 hover:underline">{body}</Link>
                      ) : (
                        <div className="min-w-0 flex-1 pt-0.5">{body}</div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}
