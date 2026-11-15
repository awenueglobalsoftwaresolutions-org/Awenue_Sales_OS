import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { leadCode } from '../lib/format'
import { COMPANY_SIZES, LEAD_SOURCES, LEAD_STATUSES, PRIORITIES, labelOf } from '../constants/options'
import { listOrganizations } from './organizations'
import { listContacts } from './contacts'
import { listLeads } from './leads'
import { listProfiles, listServiceNames } from './lookups'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const s = (v) => (String(v ?? '').trim() || null)
const lower = (v) => String(v ?? '').trim().toLowerCase()
const matchOption = (list, v) => { const x = lower(v); return list.find((o) => o.value === x || o.label.toLowerCase() === x || o.value === x.replace(/\s+/g, '_')) }

async function fetchAll(table, columns) {
  const out = []
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(page * 1000, page * 1000 + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}
const orgMap = async () => new Map((await fetchAll('organizations', 'id,name')).map((o) => [lower(o.name), o.id]))
const emailSet = async (table) => new Set((await fetchAll(table, 'id,email')).map((r) => lower(r.email)).filter(Boolean))

const f = (key, label, extra = {}) => ({ key, label, ...extra })

// ---------------- Organizations ----------------
const organizations = {
  label: 'organizations', table: 'organizations',
  fields: [
    f('name', 'Organization name', { required: true, aliases: ['name', 'organization', 'organisation', 'company', 'company name'] }),
    f('website', 'Website', { aliases: ['url'] }), f('industry', 'Industry'), f('company_size', 'Company size', { aliases: ['size'] }),
    f('country', 'Country'), f('state', 'State'), f('city', 'City'), f('address', 'Full address', { aliases: ['address'] }),
    f('linkedin_url', 'LinkedIn URL', { aliases: ['linkedin'] }), f('description', 'Description'),
  ],
  template: { 'Organization name': 'Acme Corp', Website: 'https://acme.com', Industry: 'Manufacturing', 'Company size': '51-200', Country: 'India', State: 'Uttar Pradesh', City: 'Varanasi' },
  async loadContext() { const names = new Map((await fetchAll('organizations', 'id,name')).map((o) => [lower(o.name), o.id])); return { existing: new Set(names.keys()) } },
  convert(r) {
    const errors = []
    if (!r.name) errors.push('Organization name is required')
    const size = r.company_size && (matchOption(COMPANY_SIZES, r.company_size)?.value || r.company_size)
    return {
      values: { name: s(r.name), website: s(r.website), industry: s(r.industry), company_size: s(size), country: s(r.country), state: s(r.state), city: s(r.city), address: s(r.address), linkedin_url: s(r.linkedin_url), description: s(r.description) },
      errors, dupKey: r.name ? lower(r.name) : null, label: r.name,
    }
  },
}

// ---------------- Contacts ----------------
const contacts = {
  label: 'contacts', table: 'contacts',
  fields: [
    f('first_name', 'First name', { required: true, aliases: ['first', 'firstname', 'given name'] }), f('last_name', 'Last name', { aliases: ['last', 'surname', 'family name'] }),
    f('designation', 'Designation', { aliases: ['job title', 'title', 'position'] }), f('email', 'Email', { aliases: ['email address', 'e-mail'] }),
    f('phone', 'Phone', { aliases: ['phone number', 'mobile', 'telephone'] }), f('linkedin_url', 'LinkedIn profile', { aliases: ['linkedin', 'linkedin url'] }),
    f('organization', 'Organization', { aliases: ['organisation', 'company', 'company name'] }), f('country', 'Country'), f('notes', 'Notes'),
  ],
  template: { 'First name': 'Asha', 'Last name': 'Verma', Designation: 'CTO', Email: 'asha@acme.com', Phone: '+91 98765 43210', Organization: 'Acme Corp', Country: 'India' },
  async loadContext() { return { orgs: await orgMap(), existing: await emailSet('contacts') } },
  convert(r, ctx) {
    const errors = []
    if (!r.first_name) errors.push('First name is required')
    if (r.email && !EMAIL.test(r.email)) errors.push(`Invalid email “${r.email}”`)
    let organization_id = null
    if (r.organization) { organization_id = ctx.orgs.get(lower(r.organization)) || null; if (!organization_id) errors.push(`Organization “${r.organization}” not found`) }
    return {
      values: { first_name: s(r.first_name), last_name: s(r.last_name), designation: s(r.designation), email: s(r.email), phone: s(r.phone), linkedin_url: s(r.linkedin_url), organization_id, country: s(r.country), notes: s(r.notes) },
      errors, dupKey: r.email && EMAIL.test(r.email) ? lower(r.email) : null, label: [r.first_name, r.last_name, r.email].filter(Boolean).join(' · '),
    }
  },
}

// ---------------- Leads ----------------
const leads = {
  label: 'leads', table: 'leads',
  fields: [
    f('first_name', 'First name', { required: true, aliases: ['first', 'firstname', 'given name'] }), f('last_name', 'Last name', { aliases: ['last', 'surname', 'family name'] }),
    f('job_title', 'Job title', { aliases: ['title', 'designation', 'position'] }), f('email', 'Email', { aliases: ['email address', 'e-mail'] }),
    f('phone', 'Phone', { aliases: ['phone number', 'mobile', 'telephone'] }), f('organization', 'Organization', { aliases: ['organisation', 'company', 'company name'] }),
    f('website', 'Website', { aliases: ['url'] }), f('industry', 'Industry'), f('country', 'Country'), f('state', 'State'), f('city', 'City'),
    f('source', 'Source', { aliases: ['lead source'] }), f('interested_service', 'Interested service', { aliases: ['service'] }),
    f('status', 'Status'), f('priority', 'Priority'), f('assigned_to', 'Assigned to', { aliases: ['owner', 'assignee', 'salesperson'] }),
    f('estimated_budget', 'Estimated budget', { aliases: ['budget'] }), f('notes', 'Notes'),
  ],
  template: { 'First name': 'Ravi', 'Last name': 'Kumar', 'Job title': 'Founder', Email: 'ravi@example.com', Phone: '+91 90000 00000', Organization: 'Acme Corp', Country: 'India', Source: 'LinkedIn', 'Interested service': 'Web Development', Status: 'New', Priority: 'Medium', 'Estimated budget': '5000' },
  async loadContext() {
    const [orgs, existing, services, users] = await Promise.all([orgMap(), emailSet('leads'), listServiceNames(), listProfiles()])
    const people = new Map()
    users.forEach((u) => { if (u.email) people.set(lower(u.email), u.id); if (u.full_name) people.set(lower(u.full_name), u.id) })
    return { orgs, existing, services: new Map(services.map((x) => [lower(x.name), x.name])), people }
  },
  convert(r, ctx) {
    const errors = []
    if (!r.first_name) errors.push('First name is required')
    if (r.email && !EMAIL.test(r.email)) errors.push(`Invalid email “${r.email}”`)
    let organization_id = null
    if (r.organization) { organization_id = ctx.orgs.get(lower(r.organization)) || null; if (!organization_id) errors.push(`Organization “${r.organization}” not found`) }
    let source = null
    if (r.source) { source = matchOption(LEAD_SOURCES, r.source)?.value; if (!source) errors.push(`Unknown source “${r.source}”`) }
    let status = 'new'
    if (r.status) {
      status = matchOption(LEAD_STATUSES, r.status)?.value
      if (!status) { errors.push(`Unknown status “${r.status}”`); status = 'new' }
      else if (status === 'converted') { errors.push('Converted leads can’t be imported (convert a qualified lead instead)'); status = 'new' }
    }
    let priority = 'medium'
    if (r.priority) { priority = matchOption(PRIORITIES, r.priority)?.value; if (!priority) { errors.push(`Unknown priority “${r.priority}”`); priority = 'medium' } }
    let interested_service = null
    if (r.interested_service) { interested_service = ctx.services.get(lower(r.interested_service)) || null; if (!interested_service) errors.push(`Unknown service “${r.interested_service}”`) }
    let assigned_to = null
    if (r.assigned_to) { assigned_to = ctx.people.get(lower(r.assigned_to)) || null; if (!assigned_to) errors.push(`No user matches “${r.assigned_to}”`) }
    let estimated_budget = null
    if (r.estimated_budget) {
      const cleaned = r.estimated_budget.replace(/[^0-9.\-]/g, '')
      const n = cleaned === '' ? NaN : Number(cleaned)
      if (!Number.isFinite(n) || n < 0) errors.push(`Invalid budget “${r.estimated_budget}”`); else estimated_budget = n
    }
    return {
      values: { first_name: s(r.first_name), last_name: s(r.last_name), job_title: s(r.job_title), email: s(r.email), phone: s(r.phone), organization_id, website: s(r.website), industry: s(r.industry),
        country: s(r.country), state: s(r.state), city: s(r.city), source, interested_service, status, priority, assigned_to, estimated_budget, notes: s(r.notes) },
      errors, dupKey: r.email && EMAIL.test(r.email) ? lower(r.email) : null, label: [r.first_name, r.last_name, r.email].filter(Boolean).join(' · '),
    }
  },
}
export const IMPORT_ENTITIES = { organizations, contacts, leads }

// Insert in batches of 100. A failed batch is retried row by row so only the bad rows are reported.
export async function importRows(entity, rows, profile, onProgress) {
  const result = { imported: 0, duplicates: 0, failed: [] }
  const make = (r) => ({ ...r.values, workspace_id: profile.workspace_id, created_by: profile.id })
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const { error } = await supabase.from(entity.table).insert(batch.map(make))
    if (!error) result.imported += batch.length
    else for (const r of batch) {
      const { error: e } = await supabase.from(entity.table).insert(make(r))
      if (!e) result.imported++
      else if (e.code === '23505') { result.duplicates++; result.failed.push({ ...r, status: 'duplicate', reason: friendlyError(e) }) }
      else result.failed.push({ ...r, status: 'failed', reason: friendlyError(e) })
    }
    onProgress?.(Math.min(i + 100, rows.length), rows.length)
  }
  return result
}

// ---------------- Export (same columns the importer understands, so export → edit → import round-trips) ----------------
const day = (v) => (v ? String(v).slice(0, 10) : '')
export const EXPORT_ENTITIES = {
  organizations: {
    fetcher: listOrganizations, filename: 'organizations',
    columns: ['Organization name', 'Website', 'Industry', 'Company size', 'Country', 'State', 'City', 'Full address', 'LinkedIn URL', 'Description', 'Created'],
    toRow: (o) => ({ 'Organization name': o.name, Website: o.website, Industry: o.industry, 'Company size': o.company_size, Country: o.country, State: o.state, City: o.city, 'Full address': o.address, 'LinkedIn URL': o.linkedin_url, Description: o.description, Created: day(o.created_at) }),
  },
  contacts: {
    fetcher: listContacts, filename: 'contacts',
    columns: ['First name', 'Last name', 'Designation', 'Email', 'Phone', 'LinkedIn profile', 'Organization', 'Country', 'Notes', 'Created'],
    toRow: (c) => ({ 'First name': c.first_name, 'Last name': c.last_name, Designation: c.designation, Email: c.email, Phone: c.phone, 'LinkedIn profile': c.linkedin_url, Organization: c.organization?.name, Country: c.country, Notes: c.notes, Created: day(c.created_at) }),
  },
  leads: {
    fetcher: listLeads, filename: 'leads',
    columns: ['Lead ID', 'First name', 'Last name', 'Job title', 'Email', 'Phone', 'Organization', 'Website', 'Industry', 'Country', 'State', 'City', 'Source', 'Interested service', 'Status', 'Priority', 'Assigned to', 'Estimated budget', 'Notes', 'Created'],
    toRow: (l) => ({ 'Lead ID': leadCode(l.lead_number), 'First name': l.first_name, 'Last name': l.last_name, 'Job title': l.job_title, Email: l.email, Phone: l.phone, Organization: l.organization?.name, Website: l.website, Industry: l.industry,
      Country: l.country, State: l.state, City: l.city, Source: l.source ? labelOf(LEAD_SOURCES, l.source) : '', 'Interested service': l.interested_service, Status: labelOf(LEAD_STATUSES, l.status), Priority: labelOf(PRIORITIES, l.priority),
      'Assigned to': l.assignee?.full_name, 'Estimated budget': l.estimated_budget, Notes: l.notes, Created: day(l.created_at) }),
  },
}
