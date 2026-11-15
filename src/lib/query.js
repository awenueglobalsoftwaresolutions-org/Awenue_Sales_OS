export const PAGE_SIZE = 10

export const pageRange = (page, size = PAGE_SIZE) => [(page - 1) * size, page * size - 1]

// Strip characters that break PostgREST filter syntax.
export const cleanTerm = (t) => String(t).trim().replace(/[,()*%\\]/g, ' ').replace(/\s+/g, ' ')

export const searchFilter = (term, cols) => {
  const t = cleanTerm(term)
  return cols.map((c) => `${c}.ilike.*${t}*`).join(',')
}

// Trim strings and turn empty strings into null so optional fields are stored as NULL.
export const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v]))

export const toFormValues = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k] ?? '']))

export const NO_ACCESS = 'That change wasn’t saved. You may not have permission, or the record no longer exists.'
// Row level security silently skips rows a person may not change, so confirm at least one row was affected.
export async function mustAffect(builder, column = 'id') {
  const { data, error } = await builder.select(column)
  if (error) throw error
  if (!data?.length) throw new Error(NO_ACCESS)
}
