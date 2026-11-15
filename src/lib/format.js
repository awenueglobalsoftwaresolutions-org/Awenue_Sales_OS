import { format, parseISO } from 'date-fns'

export const fmtDate = (d) => (d ? format(new Date(d), 'dd MMM yyyy') : '—')
export const fmtDateTime = (d) => (d ? format(new Date(d), 'dd MMM yyyy, h:mm a') : '—')
export const fullName = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ')
export const leadCode = (n) => `LD-${String(n).padStart(4, '0')}`
export const fmtMoney = (v, currency = 'USD') => {
  if (v === null || v === undefined || v === '') return '—'
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v) }
  catch { return `${currency} ${v}` }
}
export const location = (r) => [r?.city, r?.state, r?.country].filter(Boolean).join(', ') || '—'

export const fmtBytes = (n) => {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  const u = ['KB', 'MB', 'GB']; let i = -1; let v = n
  do { v /= 1024; i++ } while (v >= 1024 && i < u.length - 1)
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}

// date-only strings (yyyy-MM-dd) are parsed as local dates so they never shift a day
export const fmtDay = (d) => (d ? format(parseISO(d), 'dd MMM yyyy') : '—')
export const todayStr = () => format(new Date(), 'yyyy-MM-dd')
export const fmtTime = (t) => (t ? format(new Date(`2000-01-01T${t}`), 'h:mm a') : '')
export const isTaskOverdue = (t) => {
  if (!['pending', 'in_progress'].includes(t.status) || !t.due_date) return false
  const today = todayStr()
  if (t.due_date < today) return true
  return t.due_date === today && Boolean(t.due_time) && t.due_time.slice(0, 5) < format(new Date(), 'HH:mm')
}
// Totals per currency, e.g. ["$12,000", "₹40,000"] — deals can be in different currencies, so never add them together.
export const sumByCurrency = (deals) => {
  const m = {}
  deals.forEach((d) => { m[d.currency] = (m[d.currency] || 0) + Number(d.value || 0) })
  return Object.entries(m).map(([c, v]) => fmtMoney(v, c))
}

// Where an activity row should take you when clicked (most specific record first).
export const activityLink = (a) =>
  a.deal_id ? `/deals/${a.deal_id}` : a.lead_id ? `/leads/${a.lead_id}` : a.contact_id ? `/contacts/${a.contact_id}` : a.organization_id ? `/organizations/${a.organization_id}` : null
