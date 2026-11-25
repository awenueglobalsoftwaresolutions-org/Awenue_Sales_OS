export const LEAD_SOURCES = [
  { value: 'linkedin', label: 'LinkedIn' }, { value: 'cold_email', label: 'Cold Email' }, { value: 'website', label: 'Website' },
  { value: 'google_maps', label: 'Google Maps' }, { value: 'referral', label: 'Referral' },
  { value: 'advertisement', label: 'Advertisement' }, { value: 'other', label: 'Other' },
]
export const LEAD_STATUSES = [
  { value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' }, { value: 'qualified', label: 'Qualified' },
  { value: 'unqualified', label: 'Unqualified' }, { value: 'converted', label: 'Converted' }, { value: 'lost', label: 'Lost' },
]
export const PRIORITIES = [{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]
export const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'].map((v) => ({ value: v, label: `${v} employees` }))
export const ACTIVITY_TYPES = [
  { value: 'email', label: 'Email' }, { value: 'call', label: 'Call' }, { value: 'meeting', label: 'Meeting' }, { value: 'note', label: 'Note' },
  { value: 'status_update', label: 'Status update' }, { value: 'task_completion', label: 'Task completion' },
]
export const MANUAL_ACTIVITY_TYPES = ACTIVITY_TYPES.filter((a) => ['email', 'call', 'meeting', 'note'].includes(a.value))
export const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'AUD', 'CAD', 'SGD']

export const STATUS_TONE = { new: 'blue', contacted: 'indigo', qualified: 'amber', unqualified: 'gray', converted: 'green', lost: 'red' }
export const PRIORITY_TONE = { low: 'gray', medium: 'amber', high: 'red' }

export const STAGE_STYLES = {
  new: {
    badge: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    bar: 'bg-sky-500',
    border: 'border-sky-200/80 hover:border-sky-300',
    text: 'text-sky-700',
  },
  contacted: {
    badge: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
    bar: 'bg-indigo-500',
    border: 'border-indigo-200/80 hover:border-indigo-300',
    text: 'text-indigo-700',
  },
  qualified: {
    badge: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    bar: 'bg-amber-500',
    border: 'border-amber-200/80 hover:border-amber-300',
    text: 'text-amber-700',
  },
  unqualified: {
    badge: 'bg-ink-100 text-ink-700 ring-ink-400/20',
    bar: 'bg-ink-400',
    border: 'border-ink-200 hover:border-ink-300',
    text: 'text-ink-600',
  },
  converted: {
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    bar: 'bg-emerald-500',
    border: 'border-emerald-200/80 hover:border-emerald-300',
    text: 'text-emerald-700',
  },
  lost: {
    badge: 'bg-red-50 text-red-700 ring-red-600/20',
    bar: 'bg-red-500',
    border: 'border-red-200/80 hover:border-red-300',
    text: 'text-red-700',
  },
}

export const labelOf = (list, value) => list.find((o) => o.value === value)?.label ?? value ?? '—'

export const DEAL_STAGES = [
  { value: 'new_lead', label: 'New Lead', probability: 10 },
  { value: 'contacted', label: 'Contacted', probability: 20 },
  { value: 'interested', label: 'Interested', probability: 40 },
  { value: 'meeting_scheduled', label: 'Meeting Scheduled', probability: 50 },
  { value: 'proposal_sent', label: 'Proposal Sent', probability: 60 },
  { value: 'negotiation', label: 'Negotiation', probability: 80 },
  { value: 'won', label: 'Won', probability: 100 },
  { value: 'lost', label: 'Lost', probability: 0 },
]
export const STAGE_TONE = { new_lead: 'gray', contacted: 'blue', interested: 'indigo', meeting_scheduled: 'indigo', proposal_sent: 'amber', negotiation: 'amber', won: 'green', lost: 'red' }
export const stageProbability = (s) => DEAL_STAGES.find((x) => x.value === s)?.probability ?? 10
export const isClosedStage = (s) => s === 'won' || s === 'lost'
export const CLOSING_FILTERS = [
  { value: 'overdue', label: 'Overdue' }, { value: 'month', label: 'This month' }, { value: '30d', label: 'Next 30 days' },
  { value: '90d', label: 'Next 90 days' }, { value: 'none', label: 'No date set' },
]

export const TASK_TYPES = [
  { value: 'email', label: 'Email' }, { value: 'phone_call', label: 'Phone Call' }, { value: 'meeting', label: 'Meeting' },
  { value: 'follow_up', label: 'Follow-up' }, { value: 'general', label: 'General Task' },
]
export const TASK_STATUSES = [
  { value: 'pending', label: 'Pending' }, { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' },
]
export const TASK_STATUS_TONE = { pending: 'gray', in_progress: 'blue', completed: 'green', cancelled: 'gray' }
export const OPEN_TASK_STATUSES = ['pending', 'in_progress']
export const TASK_DUE_FILTERS = [
  { value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Due today' }, { value: 'week', label: 'Next 7 days' }, { value: 'none', label: 'No due date' },
]
