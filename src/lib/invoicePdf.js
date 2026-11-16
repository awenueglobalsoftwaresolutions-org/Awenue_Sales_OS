// Invoice PDF — browser-side, no server round-trip needed.
import { calcInvoice } from './invoiceCalc'
import { logEvent } from '../services/audit'

const FMT = (n, cur) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD', minimumFractionDigits: 2 }).format(Number(n) || 0) } catch { return `${cur || ''} ${Number(n || 0).toFixed(2)}` } }
const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
async function loadLogo(url) {
  try {
    const blob = await (await fetch(url, { mode: 'cors' })).blob(); const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0)
    return { data: c.toDataURL('image/png'), w: bmp.width, h: bmp.height }
  } catch { return null }                                    // a missing logo should never block the invoice
}
const blue = '#4b4bc4', dark = '#14161f', gray = '#6b7185', light = '#f6f7fa', border = [200, 202, 214]

export async function downloadInvoicePdf(invoice, items) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'a4' }); const W = doc.internal.pageSize.getWidth(); const M = 40; const Right = W - M

  // Header
  doc.setFillColor(blue); doc.rect(0, 0, W, 70, 'F')
  const issuer = invoice.issuer || {}
  const logo = issuer.logo_url ? await loadLogo(issuer.logo_url) : null
  if (logo) { const scale = Math.min(110 / logo.w, 44 / logo.h); doc.addImage(logo.data, 'PNG', M, 13 + (44 - logo.h * scale) / 2, logo.w * scale, logo.h * scale) }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(255, 255, 255); doc.text('INVOICE', Right, 30, { align: 'right' })
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(invoice.invoice_number, Right, 46, { align: 'right' })

  // Issuer and billed-to
  doc.setTextColor(dark)
  let y = 90
  const col2 = W / 2
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(issuer.company_name || 'Awenue Global', M, y)
  doc.text('Bill to', col2, y)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(gray)
  const issuerLines = [issuer.address, issuer.email, issuer.phone, issuer.website, issuer.tax_id ? `Tax ID: ${issuer.tax_id}` : null].filter(Boolean)
  const billLines = [invoice.bill_to_name, invoice.bill_to_address, invoice.bill_to_email, invoice.bill_to_phone, invoice.bill_to_tax_id ? `Tax ID: ${invoice.bill_to_tax_id}` : null].filter(Boolean)
  issuerLines.forEach((l, i) => doc.text(l, M, y + 14 + i * 13))
  billLines.forEach((l, i) => doc.text(l, col2, y + 14 + i * 13))
  y += 14 + Math.max(issuerLines.length, billLines.length) * 13 + 16

  // Dates row
  doc.setFillColor(light); doc.roundedRect(M, y, W - 2 * M, 36, 4, 4, 'F')
  const datesMeta = [['Issue date', fmtDate(invoice.issue_date)], ['Due date', fmtDate(invoice.due_date)], ['Status', String(invoice.status).replace('_', ' ').toUpperCase()], ['Currency', invoice.currency]]
  const seg = (W - 2 * M) / datesMeta.length
  datesMeta.forEach(([k, v], i) => { doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(gray); doc.text(k, M + i * seg + 10, y + 11); doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(dark); doc.text(v, M + i * seg + 10, y + 26) })
  y += 52

  // Line items
  const calc = calcInvoice(items)
  autoTable(doc, {
    startY: y, head: [['#', 'Description', 'Qty', 'Unit price', 'Discount', 'Tax rate', 'Total']],
    body: items.map((it, i) => {
      const l = calc.lines[i]; const disc = it.discount_value > 0 ? `${it.discount_type === 'percent' ? it.discount_value + '%' : FMT(it.discount_value, invoice.currency)} (−${FMT(l.discount, invoice.currency)})` : '—'
      return [i + 1, it.description, Number(it.quantity), FMT(it.unit_price, invoice.currency), disc, it.tax_rate > 0 ? `${it.tax_rate}%` : '—', FMT(l.total, invoice.currency)]
    }),
    styles: { fontSize: 8.5, cellPadding: 5 }, headStyles: { fillColor: [75, 75, 196], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 24, halign: 'center' }, 2: { cellWidth: 36, halign: 'right' }, 3: { cellWidth: 70, halign: 'right' }, 4: { cellWidth: 100 }, 5: { cellWidth: 48, halign: 'right' }, 6: { cellWidth: 72, halign: 'right', fontStyle: 'bold' } },
    alternateRowStyles: { fillColor: [246, 247, 250] }, margin: { left: M, right: M },
  })
  y = doc.lastAutoTable.finalY + 8

  // Totals block
  const tots = [['Subtotal', calc.subtotal]]
  if (calc.discount > 0) tots.push(['Discount', -calc.discount])
  calc.taxBreakdown.forEach((t) => tots.push([`Tax (${t.rate}%)`, t.amount]))
  if (calc.taxBreakdown.length === 0 && calc.tax > 0) tots.push(['Tax', calc.tax])
  tots.push(null, ['Total', calc.total])
  if (Number(invoice.amount_paid) > 0) { tots.push(['Amount paid', -Number(invoice.amount_paid)]); tots.push(['Balance due', Number(invoice.balance)]) }
  const totX = W - M - 220
  tots.forEach((row) => {
    if (!row) { doc.setDrawColor(...border); doc.line(totX, y, Right, y); y += 6; return }
    const [label, val] = row; const isTotal = label === 'Total'; const isBalance = label === 'Balance due'
    if (isTotal) { doc.setFillColor(...[246, 247, 250]); doc.rect(totX - 6, y - 10, 220 + 6, 20, 'F') }
    doc.setFont('helvetica', isTotal || isBalance ? 'bold' : 'normal'); doc.setFontSize(isTotal ? 11 : 9)
    doc.setTextColor(isBalance && Number(invoice.balance) > 0 ? [200, 40, 40] : dark)
    doc.text(label, totX, y); doc.text(FMT(Math.abs(val), invoice.currency), Right, y, { align: 'right' })
    y += 18
  })

  // Notes / payment / terms
  y += 12; const noteLines = [[invoice.payment_instructions, 'Payment instructions'], [invoice.notes, 'Notes'], [invoice.terms, 'Terms & conditions']].filter(([v]) => v)
  noteLines.forEach(([text, title]) => {
    doc.setFillColor(light); doc.setDrawColor(...border); doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, 'F')
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(gray); doc.text(title.toUpperCase(), M + 8, y + 9)
    y += 16; doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(dark)
    const wrapped = doc.splitTextToSize(text, W - 2 * M - 10); doc.text(wrapped, M + 8, y + 9)
    y += wrapped.length * 11 + 14
  })

  // Page number
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(7.5); doc.setTextColor(gray); doc.text(`${invoice.invoice_number} · Page ${i} of ${pages}`, W / 2, doc.internal.pageSize.getHeight() - 18, { align: 'center' }) }

  const fileName = `invoice-${invoice.invoice_number}.pdf`
  doc.save(fileName)
  await logEvent({ action: 'invoice_downloaded', module: 'invoices', record_id: invoice.id, description: `Downloaded PDF for invoice ${invoice.invoice_number}`, metadata: { invoice_number: invoice.invoice_number } })
}
