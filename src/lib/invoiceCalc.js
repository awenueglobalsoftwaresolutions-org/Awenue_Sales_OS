// Invoice arithmetic. Mirrors the database trigger exactly (exact decimal maths, halves rounded up), so the live preview,
// the PDF and the saved invoice always agree. The database remains the source of truth.

const big = (value, decimals) => BigInt(Math.round(Number(value || 0) * 10 ** decimals))
const roundDiv = (num, den) => (num + den / 2n) / den                 // inputs are never negative
const toNumber = (cents) => Number(cents) / 100

export function calcLine({ quantity, unit_price, discount_type = 'percent', discount_value = 0, tax_rate = 0 }) {
  const qty = big(quantity, 3), price = big(unit_price, 2)
  const subtotal = roundDiv(qty * price, 1000n)                         // cents
  const dv = big(discount_value, 2)
  const discount = discount_type === 'percent' ? roundDiv(subtotal * dv, 10000n) : (dv < subtotal ? dv : subtotal)
  const tax = roundDiv((subtotal - discount) * big(tax_rate, 2), 10000n)
  return { subtotal: toNumber(subtotal), discount: toNumber(discount), tax: toNumber(tax), total: toNumber(subtotal - discount + tax),
           _c: { subtotal, discount, tax } }
}

export function calcInvoice(items) {
  let s = 0n, d = 0n, x = 0n
  const lines = items.map((it) => { const l = calcLine(it); s += l._c.subtotal; d += l._c.discount; x += l._c.tax; return l })
  // tax broken down by rate, for the PDF
  const byRate = new Map()
  items.forEach((it, i) => { const r = Number(it.tax_rate || 0); if (r > 0) byRate.set(r, (byRate.get(r) || 0n) + lines[i]._c.tax) })
  return {
    lines, subtotal: toNumber(s), discount: toNumber(d), tax: toNumber(x), total: toNumber(s - d + x),
    taxBreakdown: [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, cents]) => ({ rate, amount: toNumber(cents) })),
  }
}

// Sent invoices that are past their due date and still have a balance count as overdue.
export function effectiveStatus(inv, today = new Date().toISOString().slice(0, 10)) {
  return (inv.status === 'sent' || inv.status === 'partially_paid') && inv.due_date < today ? 'overdue' : inv.status
}
