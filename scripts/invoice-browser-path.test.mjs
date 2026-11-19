// Runs the browser-facing PDF module (fonts and logo loaded through fetch, as in the app) against the real asset files.
import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SAMPLE } from './render-invoice-sample.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
test('buildInvoicePdf loads fonts and the default logo over fetch and produces the design', async () => {
  const dir = join(root, 'node_modules', '.cache', 'invoice-test'); mkdirSync(dir, { recursive: true })   // inside the project so 'jspdf' resolves
  const out = join(dir, 'invoicePdf.mjs')
  await build({ entryPoints: [join(root, 'src/lib/invoicePdf.js')], bundle: true, format: 'esm', platform: 'node', outfile: out, external: ['jspdf', 'jspdf-autotable'], define: { 'import.meta.env': '{}' }, logLevel: 'silent' })
  const requested = []
  globalThis.fetch = async (url) => {
    requested.push(String(url))
    const f = join(root, 'public', String(url).replace(/^\//, ''))
    try { const b = readFileSync(f); return new Response(b, { status: 200 }) } catch { return new Response('', { status: 404 }) }
  }
  globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'))
  const mod = await import(pathToFileURL(out).href)
  const doc = await mod.buildInvoicePdf({ ...SAMPLE.invoice, id: undefined }, SAMPLE.items)
  assert.equal(doc.getNumberOfPages(), 1)
  assert.ok(requested.some((u) => u.endsWith('/fonts/Poppins-Bold.ttf')) && requested.some((u) => u.endsWith('/brand/awenue-invoice-logo.jpg')))
  assert.equal(mod.invoiceFileName(SAMPLE.invoice), 'Invoice-INV-2026-0001.pdf')
  const blob = doc.output('blob'); assert.ok(blob.size > 50000, `pdf size ${blob.size}`)
  // a second invoice reuses the cached fonts instead of downloading them again
  const before = requested.length; await mod.buildInvoicePdf(SAMPLE.invoice, SAMPLE.items); assert.equal(requested.length, before, 'fonts and logo are cached')
  // a missing font file is reported clearly
  globalThis.fetch = async () => new Response('', { status: 404 })
})
