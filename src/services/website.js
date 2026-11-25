import { API_URL, accessToken, apiConfigured } from './api'

export const ENQUIRY_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'CONVERTED',
  'ON_HOLD',
  'REJECTED',
]

export const CONTACT_STATUSES = [
  'NEW',
  'READ',
  'IN_PROGRESS',
  'RESOLVED',
  'SPAM',
]

export const CONTACT_SUBJECTS = [
  'General Enquiry',
  'Business Enquiry',
  'Service Information',
  'Partnership Opportunity',
  'Technical Support',
  'Product Enquiry',
  'Feedback',
  'Other',
]

export const WEBSITE_STATUS_TONE = {
  NEW: 'blue',
  CONTACTED: 'indigo',
  READ: 'indigo',
  QUALIFIED: 'amber',
  PROPOSAL_SENT: 'amber',
  NEGOTIATION: 'amber',
  IN_PROGRESS: 'amber',
  CONVERTED: 'green',
  RESOLVED: 'green',
  ON_HOLD: 'gray',
  REJECTED: 'red',
  SPAM: 'red',
}

export function formatWebsiteStatus(status) {
  if (!status) return '—'
  return String(status)
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

async function requestWebsiteProxy(localPath, workerPath, { method = 'GET', body } = {}) {
  const token = await accessToken()
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const init = {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(18000),
  }

  let res = await fetch(localPath, init)
  if (res.status === 404 && apiConfigured) {
    res = await fetch(`${API_URL}${workerPath}`, init)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed (${res.status}).`)
  }
  return data
}

export async function syncWebsiteData(params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  return requestWebsiteProxy(`/api/website/sync${suffix}`, `/website/sync${suffix}`, { method: 'GET' })
}

export async function updateWebsiteEnquiry(id, patch) {
  const encoded = encodeURIComponent(id)
  return requestWebsiteProxy(
    `/api/website/project-enquiries/${encoded}`,
    `/website/project-enquiries/${encoded}`,
    { method: 'PATCH', body: patch },
  )
}

export async function updateWebsiteContactMessage(id, patch) {
  const encoded = encodeURIComponent(id)
  return requestWebsiteProxy(
    `/api/website/contact-messages/${encoded}`,
    `/website/contact-messages/${encoded}`,
    { method: 'PATCH', body: patch },
  )
}
