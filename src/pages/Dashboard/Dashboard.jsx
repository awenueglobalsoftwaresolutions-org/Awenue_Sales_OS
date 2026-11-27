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
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { listActiveProjects, listOpenTickets } from '../../services/projects'
import { LifeBuoy, FolderKanban } from 'lucide-react'
import { getDashboardStats, getLeadSourceBreakdown, listRecentActivities, listRecentLeads, listUpcomingTasks } from '../../services/dashboard'
import { WEBSITE_STATUS_TONE, formatWebsiteStatus } from '../../services/website'
import { LEAD_STATUSES, PRIORITY_TONE, STAGE_STYLES, STATUS_TONE, labelOf } from '../../constants/options'
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

const LIST_ICON_TONES = {
  brand: 'bg-brand-50 text-brand-600 ring-1 ring-brand-200/80',
  amber: 'bg-amber-50 text-amber-600 ring-1 ring-amber-200/80',
  violet: 'bg-violet-50 text-violet-600 ring-1 ring-violet-200/80',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-200/80',
}

function ListCard({ title, icon: Icon, to, state, empty, iconTone = 'brand', children, className = '' }) {
  const iconCls = LIST_ICON_TONES[iconTone] || LIST_ICON_TONES.brand
  return (
    <section className={`surface-card flex h-full flex-col p-4 sm:p-5 ${className}`}>
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          {Icon && (
            <span className={`grid h-7 w-7 place-items-center rounded-lg ${iconCls}`} aria-hidden>
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
        : !state.data?.length ? <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-ink-500">{empty}</div>
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
  const openTickets = useFetch(() => listOpenTickets(6), [])
  const activeProjects = useFetch(() => listActiveProjects(6), [])
  const first = profile?.full_name?.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (stats.loading && !stats.data) return <Spinner label="Loading your dashboard" className="py-24" />
  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.reload} />
  const s = stats.data
  const empty = !s.total_leads && !s.active_deals && !s.won_deals && !s.lost_deals
  const winRate = s.won_deals + s.lost_deals > 0 ? Math.round((s.won_deals / (s.won_deals + s.lost_deals)) * 100) : null

  return (
    <div className="w-full space-y-5 animate-fade-up">
      {/* 1. Page Header & Vibrant Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-brand-600 via-indigo-600 to-sky-600 p-5 sm:p-6 lg:p-7 text-white shadow-lg shadow-brand-500/15">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-3xl">
              {greeting}{first ? `, ${first}` : ''}
            </h1>
            <p className="mt-1 text-xs text-brand-100 sm:text-sm lg:text-base">
              Live performance across sales pipeline, lead conversion, and scheduled follow-ups
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {can('leads.create') && (
              <Link to="/leads?new=1" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 hover:shadow sm:text-sm">
                <Plus className="h-4 w-4" /> Add lead
              </Link>
            )}
            {can('deals.create') && (
              <Link to="/deals?new=1" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-md ring-1 ring-white/25 transition hover:bg-white/25 sm:text-sm">
                <Handshake className="h-4 w-4" /> New deal
              </Link>
            )}
            {can('deals.view') && (
              <Link to="/pipeline" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-semibold text-white backdrop-blur-md ring-1 ring-white/25 transition hover:bg-white/25 sm:text-sm">
                <KanbanSquare className="h-4 w-4" /> Open pipeline
              </Link>
            )}
          </div>
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
        <div className="grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
          <StatTile
            icon={Users}
            label="Total leads"
            value={s.total_leads}
            sub={`${s.new_leads_month} new · ${s.qualified_leads} qualified`}
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
          <div className="col-span-2 sm:col-span-1">
            <StatTile
              icon={CalendarClock}
              label="Follow-ups (7 days)"
              value={s.upcoming_followups}
              sub={s.overdue_tasks > 0 ? `${s.overdue_tasks} overdue tasks` : '0 overdue tasks'}
              to="/tasks"
              tone="violet"
              danger={s.overdue_tasks > 0}
            />
          </div>
        </div>
      </section>

      {/* 3. Lead Stage Funnel Strip */}
      {leadBreakdown.data && leadBreakdown.data.total > 0 && (
        <section className="surface-card p-4 sm:p-5" aria-label="Lead stage breakdown">
          <div className="mb-3.5 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Lead funnel breakdown</h2>
              <p className="text-xs text-ink-500">{leadBreakdown.data.total} leads across stages</p>
            </div>
            <Link to="/leads" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
              Manage leads <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
            {LEAD_STATUSES.map((st) => {
              const count = leadBreakdown.data.byStatus[st.value] || 0
              const pct = leadBreakdown.data.total ? Math.round((count / leadBreakdown.data.total) * 100) : 0
              const style = STAGE_STYLES[st.value] || STAGE_STYLES.new
              return (
                <Link
                  key={st.value}
                  to={`/leads?status=${st.value}`}
                  className={`rounded-xl border ${style.border} bg-white p-3 shadow-card transition duration-150 hover:-translate-y-0.5 hover:shadow-card-hover`}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide">
                    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${style.badge}`}>
                      {st.label}
                    </span>
                    <span className="tabular-nums text-ink-400">{pct}%</span>
                  </div>
                  <p className="mt-2 text-xl font-bold tabular-nums text-ink-900">{count}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
                    <div className={`h-full rounded-full transition-all ${style.bar}`} style={{ width: `${pct}%` }} />
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
      {(can('tickets.view') || can('projects.view')) && (
        <section className="space-y-3" aria-label="Delivery and support">
          <SectionHeading title="Delivery & Support" subtitle="Open client issues and projects in progress" />
          <div className="grid gap-4 lg:gap-5 lg:grid-cols-2">
            {can('tickets.view') && (
              <ListCard title="Open support tickets" icon={LifeBuoy} iconTone="amber" to="/tickets" state={openTickets} empty="No open support tickets.">
                {(t) => (
                  <li key={t.id} className="py-2.5">
                    <Link to={`/tickets?q=${t.id}`} className="block min-w-0 hover:text-brand-700">
                      <p className="truncate text-sm font-medium text-ink-900">TKT-{String(t.ticket_number).padStart(4, '0')} · {t.subject}</p>
                      <p className="truncate text-xs text-ink-500">{t.organization?.name} · {t.assignee?.full_name || 'Unassigned'}</p>
                    </Link>
                  </li>)}
              </ListCard>)}
            {can('projects.view') && (
              <ListCard title="Projects in progress" icon={FolderKanban} iconTone="brand" to="/projects" state={activeProjects} empty="No projects in progress.">
                {(p) => (
                  <li key={p.id} className="py-2.5">
                    <Link to={`/projects/${p.id}`} className="block min-w-0 hover:text-brand-700">
                      <p className="truncate text-sm font-medium text-ink-900">{p.name}</p>
                      <p className="text-xs text-ink-500">{p.organization?.name} · {p.progress}% complete</p>
                    </Link>
                  </li>)}
              </ListCard>)}
          </div>
        </section>
      )}

      <section className="space-y-3" aria-label="Workspace activity">
        <SectionHeading title="Today's Workspace" subtitle="Recent leads, upcoming tasks, and live team activity" />
        <div className="grid gap-4 lg:gap-5 lg:grid-cols-3">
          <ListCard title="Recent leads" icon={UserPlus} iconTone="brand" to="/leads" state={leads} empty="No leads yet.">
            {(l) => (
              <li key={l.id} className="flex items-center justify-between gap-2.5 py-2.5">
                <Link to={l.isWebsiteLead ? '/leads' : `/leads/${l.id}`} className="group flex min-w-0 flex-1 items-center gap-2.5">
                  <Avatar person={{ full_name: fullName(l) }} size={28} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900 group-hover:text-brand-700 group-hover:underline">{fullName(l)}</p>
                    <p className="truncate text-xs text-ink-500">
                      {l.isWebsiteLead ? (l.lead_number || 'WEB') : leadCode(l.lead_number)}
                      {l.organization?.name ? ` · ${l.organization.name}` : ''}
                    </p>
                  </div>
                </Link>
                {l.isWebsiteLead
                  ? <Badge tone={WEBSITE_STATUS_TONE[l.websiteStatus] || 'gray'}>{formatWebsiteStatus(l.websiteStatus)}</Badge>
                  : <Badge tone={STATUS_TONE[l.status]}>{labelOf(LEAD_STATUSES, l.status)}</Badge>}
              </li>
            )}
          </ListCard>

          <ListCard title="Upcoming tasks" icon={CheckCircle2} iconTone="amber" to="/tasks" state={tasks} empty="No open tasks with a due date.">
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

          <section className="surface-card flex h-full flex-col p-4 sm:p-5">
            <div className="mb-3.5 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-violet-200/80" aria-hidden>
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
              <div className="flex flex-1 items-center justify-center py-8 text-center text-sm text-ink-500">No activity yet. Log a call or note on any record.</div>
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
                      <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-violet-100 bg-violet-50 text-violet-600">
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
