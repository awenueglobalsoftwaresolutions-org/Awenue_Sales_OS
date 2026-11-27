// Browser side of invoice PDFs: loads the fonts, logo and signature, draws the template, then downloads, previews or returns the file.
import { FONT_FILES, registerFonts, renderInvoice } from './invoiceTemplate'
import { logEvent } from '../services/audit'

const toBase64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s) }
let fonts = null
async function loadFonts() {
  if (!fonts) {
    const pairs = await Promise.all(FONT_FILES.map(async ([file]) => {
      const res = await fetch(`/fonts/${file}`)
      if (!res.ok) throw new Error('The invoice fonts could not be loaded. Check your connection and try again.')
      return [file, toBase64(await res.arrayBuffer())]
    }))
    fonts = Object.fromEntries(pairs)
  }
  return fonts
}

const imageCache = new Map()
// Any image (PNG, JPEG, WebP) becomes a PNG data URL so the PDF library can embed it. A missing image never blocks an invoice.
async function loadImage(url) {
  if (!url) return null
  if (imageCache.has(url)) return imageCache.get(url)
  const promise = (async () => {
    try {
      const blob = await (await fetch(url, { mode: 'cors' })).blob()
      const bmp = await createImageBitmap(blob)
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0)
      return { data: c.toDataURL('image/png'), format: 'PNG', w: bmp.width, h: bmp.height }
    } catch { return null }
  })()
  imageCache.set(url, promise)
  return promise
}
let defaultLogo
async function loadDefaultLogo() {
  if (!defaultLogo) {
    defaultLogo = (async () => {
      try {
        const res = await fetch('/brand/awenue-invoice-logo.jpg'); const buf = await res.arrayBuffer()
        return { template: true, format: 'JPEG', data: `data:image/jpeg;base64,${toBase64(buf)}`, w: 533, h: 267 }
      } catch { return null }
    })()
  }
  return defaultLogo
}

export async function buildInvoicePdf(invoice, items) {
  const [{ jsPDF }, fontData] = await Promise.all([import('jspdf'), loadFonts()])
  let issuer = invoice.issuer || {}
  if (!issuer.company_name) {
    try {
      const { getInvoiceSettings } = await import('../services/invoices')
      const s = await getInvoiceSettings()
      if (s) {
        issuer = {
          company_name: s.company_name || issuer.company_name || 'AWENUE Global Software Solutions',
          address: s.address || issuer.address || '',
          email: s.email || issuer.email || 'billing@awenueglobalsoftwaresolutions.in',
          phone: s.phone || issuer.phone || '',
          website: s.website || issuer.website || 'www.awenueglobalsoftwaresolutions.in',
          tax_id: s.tax_id || issuer.tax_id || '',
          logo_url: s.logo_url || issuer.logo_url || null,
          signature_url: s.signature_url || issuer.signature_url || null,
        }
      }
    } catch {
      // ignore
    }
  }
  const [uploaded, signature] = await Promise.all([loadImage(issuer.logo_url), loadImage(issuer.signature_url)])
  const logo = uploaded ? { ...uploaded, template: false } : await loadDefaultLogo()
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
  registerFonts(doc, fontData)
  renderInvoice(doc, { ...invoice, issuer }, items, { logo, signature })
  doc.setProperties({ title: `Invoice ${invoice.invoice_number}`, subject: `Invoice for ${invoice.bill_to_name}`, creator: 'Awenue Sales OS' })
  return doc
}

export const invoiceFileName = (invoice) => `Invoice-${String(invoice.invoice_number).replace(/[^A-Za-z0-9-]/g, '')}.pdf`
export async function invoicePdfBlob(invoice, items) { return (await buildInvoicePdf(invoice, items)).output('blob') }

export async function downloadInvoicePdf(invoice, items) {
  const doc = await buildInvoicePdf(invoice, items)
  doc.save(invoiceFileName(invoice))
  if (invoice.id) await logEvent({ action: 'invoice_downloaded', module: 'invoices', record_id: invoice.id, description: `Downloaded PDF for invoice ${invoice.invoice_number}`, metadata: { invoice_number: invoice.invoice_number } })
}
