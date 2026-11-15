import { supabase } from '../lib/supabase'
import { cleanTerm, searchFilter } from '../lib/query'
import { fmtMoney, fullName, leadCode } from '../lib/format'
import { DEAL_STAGES, labelOf } from '../constants/options'

export async function globalSearch(term) {
  const t = cleanTerm(term)
  if (t.length < 2) return []
  const run = (table, select, cols) => supabase.from(table).select(select).or(searchFilter(t, cols)).limit(5)
  const [leads, orgs, contacts, deals] = await Promise.all([
    run('leads', 'id,lead_number,first_name,last_name,email,job_title', ['first_name', 'last_name', 'email', 'phone']),
    run('organizations', 'id,name,industry,city,country', ['name', 'website', 'industry']),
    run('contacts', 'id,first_name,last_name,email,designation', ['first_name', 'last_name', 'email', 'phone']),
    run('deals', 'id,title,stage,value,currency', ['title']),
  ])
  const err = leads.error || orgs.error || contacts.error || deals.error
  if (err) throw err
  return [
    ...leads.data.map((l) => ({ type: 'Lead', id: l.id, to: `/leads/${l.id}`, title: fullName(l), subtitle: [leadCode(l.lead_number), l.job_title || l.email].filter(Boolean).join(' · ') })),
    ...orgs.data.map((o) => ({ type: 'Organization', id: o.id, to: `/organizations/${o.id}`, title: o.name, subtitle: [o.industry, o.city, o.country].filter(Boolean).join(' · ') })),
    ...contacts.data.map((c) => ({ type: 'Contact', id: c.id, to: `/contacts/${c.id}`, title: fullName(c), subtitle: [c.designation, c.email].filter(Boolean).join(' · ') })),
    ...deals.data.map((d) => ({ type: 'Deal', id: d.id, to: `/deals/${d.id}`, title: d.title, subtitle: `${labelOf(DEAL_STAGES, d.stage)} · ${fmtMoney(d.value, d.currency)}` })),
  ]
}
