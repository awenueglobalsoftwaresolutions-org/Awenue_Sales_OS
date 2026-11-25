import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  KanbanSquare,
  Layers,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Trophy,
  User,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { useFetch } from '../../hooks/useFetch'
import { listDealsForPipeline, moveDeal } from '../../services/deals'
import { listLeadsForPipeline, moveLead } from '../../services/leads'
import { listProfiles, listServiceNames } from '../../services/lookups'
import { syncAndPersistWebsiteData } from '../../services/websiteSync'
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
import ConvertLeadModal from '../Leads/ConvertLeadModal'
import Modal from '../../components/common/Modal'

const DEAL_STAGE_STYLE = {
  new_lead: { top: 'border-t-sky-500', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700', bar: 'bg-sky-500' },
  contacted: { top: 'border-t-indigo-500', dot: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-700', bar: 'bg-indigo-500' },
  interested: { top: 'border-t-blue-500', dot: 'bg-blue-500', pill: 'bg-blue-50 text-blue-700', bar: 'bg-blue-500' },
  meeting_scheduled: { top: 'border-t-purple-500', dot: 'bg-purple-500', pill: 'bg-purple-50 text-purple-700', bar: 'bg-purple-500' },
  proposal_sent: { top: 'border-t-amber-500', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  negotiation: { top: 'border-t-orange-500', dot: 'bg-orange-500', pill: 'bg-orange-50 text-orange-700', bar: 'bg-orange-500' },
  won: { top: 'border-t-emerald-500', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  lost: { top: 'border-t-red-400', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700', bar: 'bg-red-400' },
}

const LEAD_PIPELINE_STAGES = [
  { value: 'new', label: 'New Inquiries', desc: 'Fresh from Website & Forms' },
  { value: 'contacted', label: 'Contacted', desc: 'Outreach & First Touch' },
  { value: 'qualified', label: 'Qualified', desc: 'Ready for Conversion' },
  { value: 'converted', label: 'Converted to Deal', desc: 'Active Deals in Pipeline' },
  { value: 'unqualified', label: 'Unqualified', desc: 'Spam or Poor Fit' },
  { value: 'lost', label: 'Lost / Closed', desc: 'Dropped Out' },
]

const LEAD_STAGE_STYLE = {
  new: { top: 'border-t-sky-500', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700', bar: 'bg-sky-500' },
  contacted: { top: 'border-t-indigo-500', dot: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-700', bar: 'bg-indigo-500' },
  qualified: { top: 'border-t-violet-500', dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700', bar: 'bg-violet-500' },
  converted: { top: 'border-t-emerald-500', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  unqualified: { top: 'border-t-ink-400', dot: 'bg-ink-400', pill: 'bg-ink-100 text-ink-700', bar: 'bg-ink-400' },
  lost: { top: 'border-t-red-400', dot: 'bg-red-500', pill: 'bg-red-50 text-red-700', bar: 'bg-red-400' },
}

function getLeadTypeInfo(lead) {
  const notes = lead.notes || ''
  const isContact = notes.includes('[Website Contact Query') || notes.includes('[Website Contact Message')
  const isProject = notes.includes('[Website Enquiry') || notes.includes('[Website Project Enquiry') || (lead.source === 'website' && !isContact)

  if (isContact) {
    return {
      type: 'contact',
      label: 'Contact Us Query',
      icon: MessageSquare,
      badgeClass: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200/80',
    }
  }
  if (isProject) {
    return {
      type: 'project',
      label: 'Project Enquiry',
      icon: Sparkles,
      badgeClass: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200/80',
    }
  }
  return {
    type: 'general',
    label: lead.source ? lead.source.replace(/_/g, ' ') : 'Lead',
    icon: User,
    badgeClass: 'bg-ink-50 text-ink-700 ring-1 ring-ink-200/80',
  }
}

function LeadCard({ lead, dragging, onDragStart, onDragEnd, onMove, onPreview, onConvert }) {
  const typeInfo = getLeadTypeInfo(lead)
  const TypeIcon = typeInfo.icon
  const leadName = fullName(lead) || 'Unnamed Lead'

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', lead.id)
        onDragStart(lead.id)
      }}
      onDragEnd={onDragEnd}
      onClick={() => onPreview(lead)}
      className={`group cursor-grab rounded-xl border border-ink-100 bg-white p-2.5 shadow-card transition duration-150 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover active:cursor-grabbing ${dragging ? 'opacity-40 scale-95' : ''}`}
    >
      {/* Top Header: Badge + Lead Number */}
      <div className="flex items-center justify-between gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${typeInfo.badgeClass}`}>
          <TypeIcon className="h-2.5 w-2.5 shrink-0" aria-hidden />
          <span className="truncate">{typeInfo.label}</span>
        </span>
        <span className="shrink-0 font-mono text-[10px] font-semibold text-ink-500">
          {lead.lead_number || '—'}
        </span>
      </div>

      {/* Name & Org */}
      <h3 className="mt-1.5 truncate text-xs font-semibold text-ink-900 group-hover:text-brand-700">
        {leadName}
      </h3>
      {lead.organization?.name ? (
        <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-ink-500">
          <Building2 className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />
          <span className="truncate">{lead.organization.name}</span>
        </p>
      ) : lead.website ? (
        <p className="mt-0.5 truncate text-[11px] text-ink-400">
          {lead.website.replace(/^https?:\/\//, '')}
        </p>
      ) : null}

      {/* Service / Subject */}
      {lead.interested_service && (
        <p className="mt-1.5 line-clamp-1 rounded bg-ink-50/90 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">
          {lead.interested_service}
        </p>
      )}

      {/* Contact Info Snippet */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-ink-500">
        {lead.email && (
          <span className="inline-flex items-center gap-1 truncate" title={lead.email}>
            <Mail className="h-2.5 w-2.5 shrink-0 text-ink-400" aria-hidden />
            <span className="truncate">{lead.email}</span>
          </span>
        )}
        {lead.phone && (
          <span className="inline-flex items-center gap-1 truncate" title={lead.phone}>
            <Phone className="h-2.5 w-2.5 shrink-0 text-ink-400" aria-hidden />
            <span className="truncate">{lead.phone}</span>
          </span>
        )}
      </div>

      {/* Value / Budget + Assignee */}
      <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-ink-100/70 pt-2 text-[11px]">
        {lead.estimated_budget != null && lead.estimated_budget > 0 ? (
          <span className="font-bold tabular-nums text-ink-900">
            {fmtMoney(lead.estimated_budget, 'USD')}
          </span>
        ) : (
          <span className="text-[10px] text-ink-400">
            {lead.created_at ? fmtDay(lead.created_at) : 'No date'}
          </span>
        )}
        {lead.assignee ? (
          <div className="flex items-center gap-1" title={lead.assignee.full_name}>
            <Avatar person={lead.assignee} size={18} />
            <span className="text-[10px] text-ink-600 truncate max-w-[70px]">
              {lead.assignee.full_name?.split(' ')[0]}
            </span>
          </div>
        ) : (
          <span className="text-[10px] text-ink-400 italic">Unassigned</span>
        )}
      </div>

      {/* Card Controls */}
      <div className="mt-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <select
          aria-label={`Move ${leadName} to another status`}
          value={lead.status}
          onChange={(e) => onMove(lead, e.target.value)}
          className="w-full rounded-lg border border-ink-100 bg-ink-50/80 px-1.5 py-1 text-[11px] font-medium text-ink-700 transition focus:border-brand-500 focus:bg-white focus:outline-none"
        >
          {LEAD_PIPELINE_STAGES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {lead.status !== 'converted' && (
          <button
            type="button"
            title="Convert to Deal"
            onClick={() => onConvert(lead)}
            className="shrink-0 rounded-lg border border-brand-200 bg-brand-50/80 px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100 transition"
          >
            Convert
          </button>
        )}
      </div>
    </article>
  )
}

function DealCard({ deal, dragging, onDragStart, onDragEnd, onMove }) {
  const overdue = deal.expected_close_date && deal.expected_close_date < todayStr() && !isClosedStage(deal.stage)
  const prob = deal.probability ?? 0
  const probColor = prob >= 70 ? 'bg-emerald-500' : prob >= 40 ? 'bg-amber-500' : 'bg-brand-500'
  const probBadge = prob >= 70 ? 'bg-emerald-50 text-emerald-700' : prob >= 40 ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', deal.id)
        onDragStart(deal.id)
      }}
      onDragEnd={onDragEnd}
      className={`group cursor-grab rounded-xl border border-ink-100 bg-white p-2.5 shadow-card transition duration-150 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-card-hover active:cursor-grabbing ${dragging ? 'opacity-40 scale-95' : ''}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <Link
          draggable={false}
          to={`/deals/${deal.id}`}
          className="min-w-0 truncate text-xs font-semibold text-ink-900 group-hover:text-brand-700 hover:underline"
        >
          {deal.title}
        </Link>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${probBadge}`}>{prob}%</span>
      </div>

      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-ink-500">
        <Building2 className="h-3 w-3 shrink-0 text-ink-400" aria-hidden />
        <span className="truncate">{deal.organization?.name || 'No organization'}</span>
      </p>
      {deal.contact && <p className="mt-0.5 truncate pl-4 text-[11px] text-ink-400">{fullName(deal.contact)}</p>}

      {deal.lead_id && (
        <span className="mt-1 inline-flex items-center gap-1 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
          <Sparkles className="h-2.5 w-2.5" /> From Website
        </span>
      )}

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

function LeadQuickDrawer({ lead, profiles, onClose, onMove, onConvert }) {
  if (!lead) return null
  const typeInfo = getLeadTypeInfo(lead)
  const TypeIcon = typeInfo.icon
  const leadName = fullName(lead) || 'Lead Details'

  return (
    <Modal
      open={Boolean(lead)}
      onClose={onClose}
      size="lg"
      title={`${lead.lead_number || 'Lead'} — ${leadName}`}
    >
      <div className="space-y-4">
        {/* Meta Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-100 bg-ink-50/70 p-3.5">
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-700">
            {lead.email && (
              <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                <Mail className="h-4 w-4" />{lead.email}
              </a>
            )}
            {lead.phone && (
              <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 font-medium text-ink-700 hover:text-brand-600">
                <Phone className="h-4 w-4 text-ink-400" />{lead.phone}
              </a>
            )}
            {lead.organization?.name && (
              <span className="inline-flex items-center gap-1 font-medium text-ink-700">
                <Building2 className="h-4 w-4 text-ink-400" />{lead.organization.name}
              </span>
            )}
          </div>
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${typeInfo.badgeClass}`}>
            <TypeIcon className="h-3.5 w-3.5" />{typeInfo.label}
          </span>
        </div>

        {/* Status & Assignee Controls */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Pipeline Status</label>
            <select
              value={lead.status}
              onChange={(e) => onMove(lead, e.target.value)}
              className="input text-sm font-semibold text-brand-700"
            >
              {LEAD_PIPELINE_STAGES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Assigned Representative</label>
            <div className="input flex items-center justify-between bg-ink-50/50">
              <span>{lead.assignee?.full_name || 'Unassigned'}</span>
            </div>
          </div>
        </div>

        {/* Service & Scope */}
        {lead.interested_service && (
          <div className="rounded-xl border border-ink-100 bg-white p-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Requested Service</p>
            <p className="mt-1 font-semibold text-ink-900">{lead.interested_service}</p>
          </div>
        )}

        {/* Full Enquiry / Message Notes */}
        <div className="rounded-xl border border-ink-100 bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Inquiry Content & Scope</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
            {lead.notes || 'No extra message details provided.'}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
          <Link
            to={`/leads/${lead.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800 hover:underline"
          >
            Open Full Lead Record <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <div className="flex items-center gap-2">
            <button type="button" className="btn-outline" onClick={onClose}>Close</button>
            {lead.status !== 'converted' && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  onClose()
                  onConvert(lead)
                }}
              >
                <UserCheck className="h-4 w-4" /> Convert to Deal
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function PipelinePage() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [viewMode, setViewMode] = useState(tabParam === 'leads' ? 'leads' : 'deals')

  // Deals State
  const [dealFilters, setDealFilters] = useState({ assigned_to: '', interested_service: '', closing: '' })
  const dealsData = useFetch(() => listDealsForPipeline(dealFilters), [dealFilters])
  const [deals, setDeals] = useState([])
  const [losingDeal, setLosingDeal] = useState(null)

  // Leads & Website Queries State
  const [leadFilters, setLeadFilters] = useState({ source: 'all', assigned_to: '', interested_service: '', search: '' })
  const leadsData = useFetch(() => listLeadsForPipeline(leadFilters), [leadFilters])
  const [leads, setLeads] = useState([])
  const [syncingWebsite, setSyncingWebsite] = useState(false)

  // Common Lookups
  const users = useFetch(listProfiles, [])
  const services = useFetch(listServiceNames, [])

  // Drag and Drop & Modals
  const [dragId, setDragId] = useState(null)
  const [overStage, setOverStage] = useState(null)
  const [previewLead, setPreviewLead] = useState(null)
  const [convertingLead, setConvertingLead] = useState(null)

  useEffect(() => {
    if (dealsData.data) setDeals(dealsData.data)
  }, [dealsData.data])

  useEffect(() => {
    if (leadsData.data) setLeads(leadsData.data)
  }, [leadsData.data])

  const handleTabSwitch = (mode) => {
    setViewMode(mode)
    setSearchParams({ tab: mode })
  }

  // --- DEALS PIPELINE ACTIONS ---
  const moveDealAction = async (deal, stage) => {
    if (deal.stage === stage) return
    if (stage === 'lost') {
      setLosingDeal(deal)
      return
    }
    const prev = deals
    setDeals((all) => all.map((x) => (x.id === deal.id ? { ...x, stage, probability: stageProbability(stage) } : x)))
    try {
      await moveDeal(deal, stage)
      toast.success(`Deal moved to ${DEAL_STAGES.find((s) => s.value === stage)?.label || stage}`)
    } catch (e) {
      setDeals(prev)
      toast.error(friendlyError(e))
    }
  }

  // --- LEADS & WEBSITE INQUIRIES ACTIONS ---
  const moveLeadAction = async (lead, stage) => {
    if (lead.status === stage) return
    const prev = leads
    setLeads((all) => all.map((x) => (x.id === lead.id ? { ...x, status: stage } : x)))
    try {
      await moveLead(lead, stage, profile)
      const stageLabel = LEAD_PIPELINE_STAGES.find((s) => s.value === stage)?.label || stage
      toast.success(`Inquiry moved to ${stageLabel} (Saved to Database)`)
    } catch (e) {
      setLeads(prev)
      toast.error(friendlyError(e))
    }
  }

  // Drag & Drop handlers
  const onDrop = (e, targetStage) => {
    e.preventDefault()
    setOverStage(null)
    const id = e.dataTransfer.getData('text/plain') || dragId
    setDragId(null)
    if (!id) return

    if (viewMode === 'deals') {
      const deal = deals.find((x) => x.id === id)
      if (deal) moveDealAction(deal, targetStage)
    } else {
      const lead = leads.find((x) => x.id === id)
      if (lead) moveLeadAction(lead, targetStage)
    }
  }

  // Sync latest enquiries directly from main website
  const handleWebsiteSync = async () => {
    setSyncingWebsite(true)
    try {
      const res = await syncAndPersistWebsiteData(profile, { type: 'all' })
      const created = res?.stats?.leadsCreated || 0
      const updated = res?.stats?.leadsUpdated || 0
      toast.success(`Website inquiries synced: ${created} new, ${updated} updated in database`)
      leadsData.reload()
      dealsData.reload()
    } catch (err) {
      toast.error(err?.message || 'Failed to sync with website API.')
    } finally {
      setSyncingWebsite(false)
    }
  }

  // Deals summaries
  const openDeals = deals.filter((d) => !isClosedStage(d.stage))
  const wonDeals = deals.filter((d) => d.stage === 'won')
  const openTotals = sumByCurrency(openDeals)
  const wonTotals = sumByCurrency(wonDeals)

  // Leads summaries
  const websiteProjectLeads = leads.filter((l) => l.notes?.includes('[Website Enquiry') || l.notes?.includes('[Website Project Enquiry'))
  const contactMessagesLeads = leads.filter((l) => l.notes?.includes('[Website Contact Query') || l.notes?.includes('[Website Contact Message'))
  const newInquiries = leads.filter((l) => l.status === 'new')
  const qualifiedLeads = leads.filter((l) => l.status === 'qualified')
  const convertedLeads = leads.filter((l) => l.status === 'converted')

  return (
    <div className="w-full flex min-h-full flex-col gap-4 animate-fade-up">
      {/* Header */}
      <PageHeader
        title="Sales Pipeline"
        subtitle={
          viewMode === 'deals'
            ? 'Manage active deals and move opportunities from New Lead through Closed-Won'
            : 'Track incoming website project inquiries, contact messages, and leads through stages'
        }
        icon={KanbanSquare}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleWebsiteSync}
              disabled={syncingWebsite}
              className="btn-outline !py-1.5 text-xs inline-flex items-center gap-1.5"
              title="Sync latest inquiries from the Main Website API"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncingWebsite ? 'animate-spin' : ''}`} />
              {syncingWebsite ? 'Syncing...' : 'Sync Website Queries'}
            </button>
            {viewMode === 'deals' ? (
              <Link to="/deals?new=1" className="btn-primary">
                <Plus className="h-4 w-4" /> Add deal
              </Link>
            ) : (
              <Link to="/leads?new=1" className="btn-primary">
                <Plus className="h-4 w-4" /> Add lead
              </Link>
            )}
          </div>
        }
      />

      {/* View Switcher: Deals Pipeline vs Leads & Inquiries Pipeline */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 pb-2">
        <div className="flex items-center gap-2 rounded-xl bg-ink-100/70 p-1">
          <button
            type="button"
            onClick={() => handleTabSwitch('deals')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'deals'
                ? 'bg-white text-ink-900 shadow-sm'
                : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Deals Pipeline
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${viewMode === 'deals' ? 'bg-brand-50 text-brand-700' : 'bg-ink-200 text-ink-700'}`}>
              {deals.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabSwitch('leads')}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === 'leads'
                ? 'bg-white text-ink-900 shadow-sm'
                : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-brand-600" />
            Website & Leads Pipeline
            <span className={`rounded-full px-1.5 py-0.2 text-[10px] ${viewMode === 'leads' ? 'bg-brand-50 text-brand-700' : 'bg-ink-200 text-ink-700'}`}>
              {leads.length}
            </span>
          </button>
        </div>

        {viewMode === 'leads' && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink-400">Live Breakdown:</span>
            <span className="inline-flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 font-medium text-sky-700">
              <Sparkles className="h-3 w-3" /> {websiteProjectLeads.length} Enquiries
            </span>
            <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700">
              <MessageSquare className="h-3 w-3" /> {contactMessagesLeads.length} Contact Msgs
            </span>
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* VIEW MODE: DEALS PIPELINE                                      */}
      {/* ============================================================== */}
      {viewMode === 'deals' && (
        <>
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
                  <span className="font-semibold text-ink-700">Deal Stage Distribution</span>
                  <div className="flex flex-wrap items-center gap-3">
                    {DEAL_STAGES.map((st) => {
                      const count = deals.filter((d) => d.stage === st.value).length
                      if (!count) return null
                      const s = DEAL_STAGE_STYLE[st.value] || DEAL_STAGE_STYLE.new_lead
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
                    const s = DEAL_STAGE_STYLE[st.value] || DEAL_STAGE_STYLE.new_lead
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

          {/* Deal Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              label="Any salesperson"
              value={dealFilters.assigned_to}
              onChange={(v) => setDealFilters((f) => ({ ...f, assigned_to: v }))}
              options={(users.data || []).map((u) => ({ value: u.id, label: u.full_name || u.email }))}
            />
            <FilterSelect
              label="Any service"
              value={dealFilters.interested_service}
              onChange={(v) => setDealFilters((f) => ({ ...f, interested_service: v }))}
              options={(services.data || []).map((s) => ({ value: s.name, label: s.name }))}
            />
            <FilterSelect
              label="Any closing date"
              value={dealFilters.closing}
              onChange={(v) => setDealFilters((f) => ({ ...f, closing: v }))}
              options={CLOSING_FILTERS}
            />
            {Object.values(dealFilters).some(Boolean) && (
              <button className="btn-ghost" onClick={() => setDealFilters({ assigned_to: '', interested_service: '', closing: '' })}>
                Clear filters
              </button>
            )}
          </div>

          {/* Deals Kanban Board */}
          {dealsData.error && !deals.length ? (
            <ErrorState message={dealsData.error} onRetry={dealsData.reload} />
          ) : !dealsData.loading && !deals.length ? (
            <div className="surface-card grid flex-1 place-items-center">
              <EmptyState
                illustration="pipeline"
                title="No deals in the pipeline"
                description="Add a deal, or convert a website inquiry into a deal to see it here."
                action={
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => handleTabSwitch('leads')} className="btn-secondary">
                      View Website Inquiries
                    </button>
                    <Link to="/deals?new=1" className="btn-primary">Add deal</Link>
                  </div>
                }
              />
            </div>
          ) : (
            <div className="thin-scrollbar flex flex-1 gap-3 overflow-x-auto pb-2">
              {DEAL_STAGES.map((stage) => {
                const items = deals.filter((d) => d.stage === stage.value)
                const totals = sumByCurrency(items)
                const st = DEAL_STAGE_STYLE[stage.value] || DEAL_STAGE_STYLE.new_lead
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
                      {dealsData.loading && !deals.length && <div className="h-24 animate-pulse rounded-xl bg-ink-100" />}
                      {items.map((deal) => (
                        <DealCard
                          key={deal.id}
                          deal={deal}
                          dragging={dragId === deal.id}
                          onDragStart={setDragId}
                          onDragEnd={() => { setDragId(null); setOverStage(null) }}
                          onMove={moveDealAction}
                        />
                      ))}
                      {!dealsData.loading && !items.length && (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-ink-200/80 bg-white/40 py-6 text-center">
                          <KanbanSquare className="mb-1 h-4 w-4 text-ink-300" aria-hidden />
                          <p className="px-2 text-[11px] font-medium text-ink-400">Drop here</p>
                        </div>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* VIEW MODE: LEADS & WEBSITE INQUIRIES PIPELINE                  */}
      {/* ============================================================== */}
      {viewMode === 'leads' && (
        <>
          {leads.length > 0 && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile icon={Layers} label="Total Inquiries" value={leads.length} sub={`${websiteProjectLeads.length + contactMessagesLeads.length} from website`} tone="brand" />
                <StatTile icon={Sparkles} label="New Inquiries" value={newInquiries.length} sub="Awaiting response" tone="sky" />
                <StatTile icon={CheckCircle2} label="Qualified" value={qualifiedLeads.length} sub="Ready for deal conversion" tone="violet" />
                <StatTile icon={Trophy} label="Converted" value={convertedLeads.length} sub="Won into sales pipeline" tone="emerald" />
              </div>

              <div className="surface-card p-3">
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-ink-700">Inquiry Pipeline Funnel</span>
                  <div className="flex flex-wrap items-center gap-3">
                    {LEAD_PIPELINE_STAGES.map((st) => {
                      const count = leads.filter((l) => l.status === st.value).length
                      if (!count) return null
                      const s = LEAD_STAGE_STYLE[st.value] || LEAD_STAGE_STYLE.new
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
                  {LEAD_PIPELINE_STAGES.map((st) => {
                    const count = leads.filter((l) => l.status === st.value).length
                    if (!count) return null
                    const pct = (count / leads.length) * 100
                    const s = LEAD_STAGE_STYLE[st.value] || LEAD_STAGE_STYLE.new
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

          {/* Lead Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                type="text"
                placeholder="Search inquiries, names, emails..."
                value={leadFilters.search}
                onChange={(e) => setLeadFilters((f) => ({ ...f, search: e.target.value }))}
                className="input !pl-9 !py-1 text-xs"
              />
              {leadFilters.search && (
                <button
                  type="button"
                  onClick={() => setLeadFilters((f) => ({ ...f, search: '' }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <FilterSelect
              label="Filter by Source"
              value={leadFilters.source}
              onChange={(v) => setLeadFilters((f) => ({ ...f, source: v }))}
              options={[
                { value: 'all', label: 'All Inquiries & Leads' },
                { value: 'website_project', label: '⚡ Website Project Enquiries' },
                { value: 'website_contact', label: '💬 Contact Us Messages' },
                { value: 'website', label: '🌐 All Website Sourced' },
                { value: 'linkedin', label: 'LinkedIn' },
                { value: 'referral', label: 'Referral' },
                { value: 'cold_email', label: 'Cold Email' },
              ]}
            />
            <FilterSelect
              label="Any salesperson"
              value={leadFilters.assigned_to}
              onChange={(v) => setLeadFilters((f) => ({ ...f, assigned_to: v }))}
              options={(users.data || []).map((u) => ({ value: u.id, label: u.full_name || u.email }))}
            />
            <FilterSelect
              label="Any service"
              value={leadFilters.interested_service}
              onChange={(v) => setLeadFilters((f) => ({ ...f, interested_service: v }))}
              options={(services.data || []).map((s) => ({ value: s.name, label: s.name }))}
            />
            {Object.values(leadFilters).some((v) => v && v !== 'all') && (
              <button className="btn-ghost" onClick={() => setLeadFilters({ source: 'all', assigned_to: '', interested_service: '', search: '' })}>
                Clear filters
              </button>
            )}
          </div>

          {/* Leads Kanban Board */}
          {leadsData.error && !leads.length ? (
            <ErrorState message={leadsData.error} onRetry={leadsData.reload} />
          ) : !leadsData.loading && !leads.length ? (
            <div className="surface-card grid flex-1 place-items-center">
              <EmptyState
                illustration="pipeline"
                title="No inquiries found"
                description="Click 'Sync Website Queries' above or submit a test form on the main website to see live inquiries here."
                action={
                  <button type="button" onClick={handleWebsiteSync} className="btn-primary inline-flex items-center gap-1.5">
                    <RefreshCw className="h-4 w-4" /> Sync from Website
                  </button>
                }
              />
            </div>
          ) : (
            <div className="thin-scrollbar flex flex-1 gap-3 overflow-x-auto pb-2">
              {LEAD_PIPELINE_STAGES.map((stage) => {
                const items = leads.filter((l) => l.status === stage.value)
                const st = LEAD_STAGE_STYLE[stage.value] || LEAD_STAGE_STYLE.new
                const pct = leads.length ? Math.round((items.length / leads.length) * 100) : 0

                return (
                  <section
                    key={stage.value}
                    aria-label={`${stage.label} column`}
                    onDragOver={(e) => { e.preventDefault(); setOverStage(stage.value) }}
                    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverStage(null) }}
                    onDrop={(e) => onDrop(e, stage.value)}
                    className={`flex min-h-[380px] w-[270px] shrink-0 flex-col rounded-2xl border border-t-4 transition duration-150 xl:min-w-[220px] xl:flex-1 ${st.top} ${overStage === stage.value ? 'border-brand-500 bg-brand-50/70 ring-2 ring-brand-200' : 'border-ink-100 bg-ink-50/70'}`}
                  >
                    <header className="p-2.5 pb-2">
                      <div className="flex items-center justify-between gap-1.5">
                        <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-900">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${st.dot}`} aria-hidden />
                          <span className="truncate">{stage.label}</span>
                        </h2>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${st.pill}`}>{items.length}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-1 text-[11px] text-ink-400">
                        <span className="truncate">{stage.desc}</span>
                        <span className="shrink-0">{pct}%</span>
                      </div>
                    </header>
                    <div className="flex flex-1 flex-col gap-2 px-2 pb-2.5">
                      {leadsData.loading && !leads.length && <div className="h-24 animate-pulse rounded-xl bg-ink-100" />}
                      {items.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          dragging={dragId === lead.id}
                          onDragStart={setDragId}
                          onDragEnd={() => { setDragId(null); setOverStage(null) }}
                          onMove={moveLeadAction}
                          onPreview={setPreviewLead}
                          onConvert={setConvertingLead}
                        />
                      ))}
                      {!leadsData.loading && !items.length && (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-ink-200/80 bg-white/40 py-6 text-center">
                          <KanbanSquare className="mb-1 h-4 w-4 text-ink-300" aria-hidden />
                          <p className="px-2 text-[11px] font-medium text-ink-400">Drop inquiry here</p>
                        </div>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {losingDeal && (
        <LostReasonModal
          deal={losingDeal}
          onClose={() => setLosingDeal(null)}
          onSubmit={async (reason) => {
            await moveDeal(losingDeal, 'lost', reason)
            toast.success('Moved to Lost')
            setLosingDeal(null)
            dealsData.reload()
          }}
        />
      )}

      {previewLead && (
        <LeadQuickDrawer
          lead={previewLead}
          profiles={users.data || []}
          onClose={() => setPreviewLead(null)}
          onMove={async (lead, stage) => {
            await moveLeadAction(lead, stage)
            setPreviewLead((prev) => (prev ? { ...prev, status: stage } : null))
          }}
          onConvert={(lead) => {
            setConvertingLead(lead)
          }}
        />
      )}

      {convertingLead && (
        <ConvertLeadModal
          lead={convertingLead}
          onClose={() => setConvertingLead(null)}
          onDone={() => {
            setConvertingLead(null)
            leadsData.reload()
            dealsData.reload()
          }}
        />
      )}
    </div>
  )
}
