// Starting points for a new invoice, taken from the record you are looking at.
const addr = (o) => [o?.address, [o?.city, o?.state].filter(Boolean).join(', '), o?.country].filter(Boolean).join('\n')
const name = (p) => [p?.first_name, p?.last_name].filter(Boolean).join(' ')

export function fromOrganization(org, contacts = []) {
  const c = contacts.find((x) => x.email) || contacts[0]
  return { bill_to_name: org.name, bill_to_address: addr(org), bill_to_email: c?.email || '', bill_to_phone: c?.phone || '', organization_id: org.id, contact_id: c?.id || '' }
}
export function fromContact(contact) {
  return { bill_to_name: name(contact), bill_to_address: addr(contact.organization), bill_to_email: contact.email || '', bill_to_phone: contact.phone || '', organization_id: contact.organization?.id || '', contact_id: contact.id }
}
export function fromLead(lead) {
  return { bill_to_name: name(lead), bill_to_email: lead.email || '', bill_to_phone: lead.phone || '', organization_id: lead.organization?.id || '', lead_id: lead.id, _lead_label: `LD-${String(lead.lead_number).padStart(4, '0')} · ${name(lead)}` }
}
export function fromDeal(deal) {
  return {
    bill_to_name: deal.organization?.name || name(deal.contact) || deal.title, bill_to_email: deal.contact?.email || '', organization_id: deal.organization?.id || '', contact_id: deal.contact?.id || '',
    deal_id: deal.id, _deal_label: deal.title, currency: deal.currency || 'USD',
    items: [{ description: deal.interested_service || deal.title, quantity: '1', unit_price: String(Number(deal.value) || ''), discount_type: 'percent', discount_value: '0', tax_rate: '0' }],
  }
}
