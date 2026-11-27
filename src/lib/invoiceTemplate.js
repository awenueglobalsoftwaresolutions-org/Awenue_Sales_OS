// The invoice PDF layout. It reproduces the "black and white minimalist" design (A4, Poppins + Public Sans, black table header
// and grand-total bar) and is plain drawing code with no browser APIs, so it can be rendered and tested in Node as well.
import { calcInvoice, effectiveStatus } from './invoiceCalc.js'

export const FONT_FILES = [
  ['Poppins-Regular.ttf', 'Poppins', 'normal'], ['Poppins-Bold.ttf', 'Poppins', 'bold'],
  ['Poppins-ExtraBold.ttf', 'PoppinsXB', 'normal'], ['PublicSans-Regular.ttf', 'PublicSans', 'normal'],
]
export function registerFonts(doc, base64ByFile) {
  for (const [file, family, style] of FONT_FILES) { doc.addFileToVFS(file, base64ByFile[file]); doc.addFont(file, family, style) }
}

// Measurements (points, from the top-left) taken from the original design.
const X0 = 60.3, X1 = 536.5, COL_RIGHT = 298.4, DESC = 73.1, QTY = 301.8, PRICE = 376.0, TOTAL = 469.1, LABEL = 307.1
const PAGE_H = 841.89, FOOT_TOP = 752.9, FOOT_BOTTOM = 794.5, LIMIT = 744, TOP_NEXT = 70
const ROW_H = 33.4, SUM_H = 34.1, BAR_H = 27.8
const INK = [0, 0, 0], RULE = [61, 59, 58], MUTED = [90, 90, 90]
const EM_TRACK = 0.052

const SYMBOL = { USD: '$', EUR: '€', GBP: '£', INR: '₹' }
export function money(n, currency = 'USD', spaced = false) {
  const body = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(Number(n) || 0))
  const sym = SYMBOL[currency]
  return (n < 0 ? '−' : '') + (sym ? `${sym}${spaced ? ' ' : ''}${body}` : `${currency} ${body}`)
}
export function ordinalDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const suffix = d % 100 >= 11 && d % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[d % 10] || 'th')
  return `${d}${suffix} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`
}
const qtyText = (q) => String(parseFloat(Number(q).toFixed(3)))
const STATUS_TAG = { draft: 'DRAFT', partially_paid: 'PARTIALLY PAID', paid: 'PAID', cancelled: 'CANCELLED', overdue: 'OVERDUE' }

export function renderInvoice(doc, invoice, items, assets = {}) {
  const issuer = invoice.issuer || {}
  const cur = invoice.currency || 'USD'
  const calc = calcInvoice(items)
  const W = doc.internal.pageSize.getWidth()
  const text = (str, x, y, { font = 'Poppins', style = 'normal', size = 10, color = INK, track = 0, align = 'left' } = {}) => {
    doc.setFont(font, style); doc.setFontSize(size); doc.setTextColor(...color)
    const w = doc.getTextWidth(str) + track * size * Math.max(0, str.length - 1)
    const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x
    doc.text(str, px, y, track ? { charSpace: track * size } : undefined)
    return w
  }
  const rule = (x1, x2, y) => { doc.setDrawColor(...RULE); doc.setLineWidth(0.5); doc.line(x1, y, x2, y) }
  const wrap = (str, width, size = 10, font = 'Poppins', style = 'normal') => { doc.setFont(font, style); doc.setFontSize(size); return String(str).split('\n').flatMap((l) => (l.trim() ? doc.splitTextToSize(l, width) : [''])) }

  // ----- footer (on every page) -----
  const footer = () => {
    rule(60.6, 536.1, FOOT_TOP); rule(60.8, 536.3, FOOT_BOTTOM)
    const site = (issuer.website || '').replace(/^https?:\/\//i, '').replace(/\/$/, '')
    const parts = [issuer.phone, issuer.email, site].filter(Boolean)
    if (!parts.length) return

    // Dynamically calculate font size and spacing so parts never collide or overlap
    let size = 11, track = 0.083
    const testWidths = (s, tr) => {
      doc.setFont('PublicSans', 'normal'); doc.setFontSize(s)
      return parts.map((p) => doc.getTextWidth(p) + tr * s * Math.max(0, p.length - 1))
    }

    let widths = testWidths(size, track)
    let totalW = widths.reduce((a, b) => a + b, 0)
    const availW = 536.5 - 63.9
    const minGap = (parts.length - 1) * 16

    if (totalW + minGap > availW) { size = 9.5; track = 0.04; widths = testWidths(size, track); totalW = widths.reduce((a, b) => a + b, 0); }
    if (totalW + minGap > availW) { size = 8.5; track = 0.02; widths = testWidths(size, track); totalW = widths.reduce((a, b) => a + b, 0); }
    if (totalW + minGap > availW) { size = 7.5; track = 0.01; widths = testWidths(size, track); totalW = widths.reduce((a, b) => a + b, 0); }

    const o = { font: 'PublicSans', size, track }
    const y = 777.1

    if (parts.length === 3) {
      if (totalW + minGap <= availW) {
        text(parts[0], 63.9, y, o)
        const midX = (63.9 + widths[0] + 536.5 - widths[2]) / 2
        text(parts[1], midX, y, { ...o, align: 'center' })
        text(parts[2], 536.5, y, { ...o, align: 'right' })
      } else {
        const y1 = 769.5, y2 = 784.5
        const o2 = { font: 'PublicSans', size: 8, track: 0.02 }
        text(parts[0], 63.9, y1, o2)
        text(parts[2], 536.5, y1, { ...o2, align: 'right' })
        text(parts[1], (63.9 + 536.5) / 2, y2, { ...o2, align: 'center' })
      }
    } else if (parts.length === 2) {
      text(parts[0], 63.9, y, o)
      text(parts[1], 536.5, y, { ...o, align: 'right' })
    } else if (parts.length === 1) {
      text(parts[0], 63.9, y, o)
    }
  }

  // later pages: footer plus the invoice number, so a loose sheet can still be identified
  const newPage = () => { doc.addPage(); footer(); text(invoice.invoice_number || '', 60.4, 44, { style: 'bold', size: 12, track: EM_TRACK }); text(`Page ${doc.getNumberOfPages()}`, 532.1, 44, { size: 9, color: MUTED, align: 'right' }) }

  // ----- page one header -----
  if (assets.logo) {
    const l = assets.logo
    if (l.template) doc.addImage(l.data, l.format, 43.2, 18, 248.2, 124.1)
    else { const s = Math.min(220 / l.w, 64 / l.h); doc.addImage(l.data, l.format, X0, 76 - (l.h * s) / 2, l.w * s, l.h * s) }
  }
  text('INVOICE', 532.1, 92.1, { font: 'PoppinsXB', size: 35.8, track: 0.041, align: 'right' })
  const status = effectiveStatus(invoice)
  if (STATUS_TAG[status]) text(STATUS_TAG[status], 532.1, 114, { style: 'bold', size: 10, track: 0.1, color: status === 'cancelled' || status === 'overdue' ? [190, 30, 30] : RULE, align: 'right' })

  text(invoice.invoice_number || '', 60.4, 159.8, { style: 'bold', size: 12, track: EM_TRACK })
  const meta = (label, value, y) => { const w = text(label, 60.4, y, { style: 'bold' }); text(value, 60.4 + w + 2.5, y) }
  meta('DATE :', ordinalDate(invoice.issue_date), 176.2)
  meta('DUE DATE:', ordinalDate(invoice.due_date), 192.0)

  // ----- from / bill to -----
  const block = (x, heading, name, lines, width) => {
    text(heading, x, 227.0, { style: 'bold', size: 12, track: EM_TRACK })
    text(name || '', x, 242.9, { style: 'bold' })
    const out = lines.flatMap((l) => wrap(l, width)); out.forEach((l, i) => text(l, x, 258.6 + i * 15.75)); return 242.9 + (out.length ? 15.7 + (out.length - 1) * 15.75 : 0)
  }
  const fromEnd = block(X0, 'FROM:', issuer.company_name, [issuer.address, issuer.tax_id && `Tax ID: ${issuer.tax_id}`].filter(Boolean), 225)
  const toEnd = block(COL_RIGHT, 'BILL TO:', invoice.bill_to_name, [invoice.bill_to_address, invoice.bill_to_email, invoice.bill_to_phone, invoice.bill_to_tax_id && `Tax ID: ${invoice.bill_to_tax_id}`].filter(Boolean), 232)
  let tableTop = Math.max(304.8, Math.max(fromEnd, toEnd) + 29.8)
  footer()

  // ----- items table -----
  const tableHeader = (top) => {
    doc.setFillColor(...INK); doc.rect(X0, top, X1 - X0, BAR_H, 'F')
    const o = { style: 'bold', size: 12, track: EM_TRACK, color: [255, 255, 255] }, by = top + 17.7
    text('ITEM DESCRIPTION', DESC, by, o); text('QTY', COL_RIGHT, by, o); text('PRICE', PRICE, by, o); text('TOTAL', TOTAL, by, o)
    return top + BAR_H
  }
  let y = tableHeader(tableTop)
  items.forEach((it, i) => {
    const c = calc.lines[i]
    const desc = wrap(it.description, 205)
    // Tax is shown once, in the totals block (per rate). Only a discount needs a note under its line.
    const notes = Number(it.discount_value) > 0 ? `Discount ${it.discount_type === 'percent' ? `${parseFloat(Number(it.discount_value))}%` : money(it.discount_value, cur)} (−${money(c.discount, cur)})` : ''
    const contentH = desc.length * 13 + (notes ? 11 : 0)
    const last = i === items.length - 1
    const rowH = Math.max(ROW_H, contentH + 20.4) + (last ? 0.6 : 0)   // the design's last row is a hair taller
    if (y + rowH > LIMIT) { newPage(); y = tableHeader(TOP_NEXT) }
    const base = y + (rowH - contentH) / 2 + 9.2 + (last ? 0.3 : 0)
    desc.forEach((l, k) => text(l, DESC, base + k * 13))
    if (notes) text(notes, DESC, base + desc.length * 13 + 1, { size: 7.5, color: MUTED })
    text(qtyText(it.quantity), QTY, base); text(money(it.unit_price, cur), PRICE, base); text(money(c.subtotal, cur), TOTAL, base)
    y += rowH; rule(X0 + 0.3, X1 - 0.4, y)
  })

  // ----- totals -----
  const rows = [['SUB TOTAL', money(calc.subtotal, cur, true)]]
  if (calc.discount > 0) rows.push(['DISCOUNT', money(-calc.discount, cur, true)])
  calc.taxBreakdown.forEach((t) => rows.push([`TAX (${parseFloat(t.rate)}%)`, money(t.amount, cur, true)]))
  const paid = Number(invoice.amount_paid) || 0
  const after = paid > 0 ? [['AMOUNT PAID', money(-paid, cur, true)], ['BALANCE DUE', money(calc.total - paid, cur, true)]] : []
  const totalsH = rows.length * SUM_H + BAR_H + after.length * SUM_H

  // payment info, notes, terms (measured first so the page break is decided before drawing)
  const terms = String(invoice.terms || '').split('\n').map((t) => t.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean)
  const paymentLines = invoice.payment_instructions ? wrap(invoice.payment_instructions, 225) : []
  const noteLines = invoice.notes ? wrap(invoice.notes, 225) : []
  const termLines = terms.map((t) => wrap(t, 202))
  const sections = []
  if (paymentLines.length) sections.push({ title: 'PAYMENT INFO:', lines: paymentLines, first: 13.2, pitch: 13.5 })
  if (noteLines.length) sections.push({ title: 'Notes:', lines: noteLines, first: 15.7, pitch: 13.5 })
  if (termLines.length) sections.push({ title: 'Terms and conditions:', bullets: termLines, first: 15.7, pitch: 15 })
  const measure = () => { let cy = 14.3, last = cy; sections.forEach((s) => { const n = s.bullets ? s.bullets.reduce((a, b) => a + b.length, 0) : s.lines.length; last = cy + s.first + (n - 1) * s.pitch; cy = last + 41.8 }); return sections.length ? last + 5 : 0 }
  const infoH = Math.max(measure(), assets.signature ? 160 : 0)

  if (y + totalsH > LIMIT) { newPage(); y = TOP_NEXT }
  rows.forEach(([label, value]) => { text(label, LABEL, y + 20.7, { style: 'bold', track: EM_TRACK }); text(value, TOTAL, y + 20.7); y += SUM_H; rule(298.7, 536.1, y) })
  doc.setFillColor(...INK); doc.rect(COL_RIGHT, y + 0.4, X1 - COL_RIGHT, BAR_H, 'F')
  text('GRAND TOTAL', LABEL, y + 0.4 + 17.1, { style: 'bold', size: 12, track: EM_TRACK, color: [255, 255, 255] })
  text(money(calc.total, cur, true), TOTAL, y + 0.4 + 17.1, { style: 'bold', size: 12, color: [255, 255, 255] })
  y += 0.4 + BAR_H
  after.forEach(([label, value], i) => { text(label, LABEL, y + 20.7, { style: 'bold', track: EM_TRACK }); text(value, TOTAL, y + 20.7, i === 1 ? { style: 'bold' } : {}); y += SUM_H; rule(298.7, 536.1, y) })

  if (infoH > 0) {
    if (y + infoH > LIMIT) { newPage(); y = TOP_NEXT - 14 }
    let cy = y + 14.3
    sections.forEach((s) => {
      text(s.title, X0, cy, { style: 'bold', size: 12 })
      let b = cy + s.first, last = b
      if (s.bullets) s.bullets.forEach((lines) => { doc.setFillColor(...INK); doc.circle(66.1, b - 3.7, 2.0, 'F'); lines.forEach((l, k) => { text(l, 77.3, b); last = b; b += s.pitch }) })
      else s.lines.forEach((l) => { text(l, X0, b); last = b; b += s.pitch })
      cy = last + 41.8
    })
    if (assets.signature) {
      const g = assets.signature, box = { x: 318, y: y + 28, w: 200, h: 128 }, sc = Math.min(box.w / g.w, box.h / g.h)
      doc.addImage(g.data, g.format, box.x + (box.w - g.w * sc) / 2, box.y + (box.h - g.h * sc) / 2, g.w * sc, g.h * sc)
    }
  }
  return doc
}
