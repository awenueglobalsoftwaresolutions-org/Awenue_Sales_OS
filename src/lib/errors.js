const DUPLICATES = {
  organizations_name_uq: 'An organization with this name already exists.',
  contacts_email_uq: 'A contact with this email already exists.',
  leads_email_uq: 'A lead with this email already exists.',
  services_workspace_id_name_key: 'A service with this name already exists.',
  roles_workspace_id_key_key: 'A role with this name already exists.',
  deals_lead_id_key: 'This lead has already been converted to a deal.',
}

export function friendlyError(err) {
  const msg = err?.message || String(err || '')
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Could not reach the server. Check your connection and try again.'
  if (err?.code === '23505') {
    const hit = Object.keys(DUPLICATES).find((k) => msg.includes(k) || err?.details?.includes?.(k))
    return hit ? DUPLICATES[hit] : 'This record already exists.'
  }
  if (err?.code === '23503') return 'This record is linked to other records and cannot be changed this way.'
  if (err?.code === '42501' || /row-level security/i.test(msg)) return "You don't have permission to do that."
  return msg || 'Something went wrong. Please try again.'
}
