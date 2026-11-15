import Papa from 'papaparse'

export const MAX_CSV_BYTES = 5 * 1024 * 1024
export const MAX_CSV_ROWS = 5000

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    if (!/\.csv$/i.test(file.name) && !/csv|text\/plain/.test(file.type || '')) return reject(new Error('Please choose a .csv file.'))
    if (file.size > MAX_CSV_BYTES) return reject(new Error('That file is larger than 5 MB.'))
    Papa.parse(file, {
      header: true, skipEmptyLines: 'greedy', transformHeader: (h) => h.trim(),
      complete: ({ data, meta }) => {
        if (!meta.fields?.length) return reject(new Error('The file has no header row.'))
        if (!data.length) return reject(new Error('The file has a header but no data rows.'))
        if (data.length > MAX_CSV_ROWS) return reject(new Error(`Import up to ${MAX_CSV_ROWS} rows at a time. This file has ${data.length}.`))
        resolve({ headers: meta.fields, rows: data })
      },
      error: (e) => reject(new Error(e.message || 'Could not read that file.')),
    })
  })
}

// Spreadsheet apps run cells starting with = + - @ as formulas. Prefix those with an apostrophe (phone numbers and plain numbers are left alone).
const guard = (v) => {
  if (typeof v !== 'string') return v ?? ''
  return /^[=+\-@\t\r]/.test(v) && !/^[+-]?[\d\s().-]+$/.test(v) ? `'${v}` : v
}

export function toCsv(columns, rows) {
  return '\uFEFF' + Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => guard(r[c]))) })
}

export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const normalizeHeader = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '')

// Guess which CSV column feeds each field, using the field's key, label and aliases. Each column is used once.
export function autoMap(fields, headers) {
  const used = new Set(); const mapping = {}
  for (const f of fields) {
    const wanted = [f.key, f.label, ...(f.aliases || [])].map(normalizeHeader)
    const hit = headers.find((h) => !used.has(h) && wanted.includes(normalizeHeader(h)))
    if (hit) { mapping[f.key] = hit; used.add(hit) }
  }
  return mapping
}
