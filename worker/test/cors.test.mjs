// Browsers only accept Worker responses from origins listed in ALLOWED_ORIGINS. Local dev and production must both be listed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import worker from '../src/index.js'

const env = { ALLOWED_ORIGINS: 'http://localhost:5173,https://awenuesalesos.vercel.app', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' }
const preflight = (origin) => worker.fetch(new Request('https://api.test/users/create', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } }), env)

test('local development and production origins get CORS headers on preflight', async () => {
  for (const origin of ['http://localhost:5173', 'https://awenuesalesos.vercel.app']) {
    const r = await preflight(origin)
    assert.equal(r.headers.get('Access-Control-Allow-Origin'), origin, `${origin} allowed`)
    assert.match(r.headers.get('Access-Control-Allow-Methods'), /POST/)
  }
})

test('an unlisted origin gets no CORS header', async () => {
  assert.equal((await preflight('https://evil.example')).headers.get('Access-Control-Allow-Origin'), null)
})

test('the deployed config lists localhost and production', () => {
  const toml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'wrangler.toml'), 'utf8')
  const line = toml.split('\n').find((l) => l.startsWith('ALLOWED_ORIGINS'))
  assert.ok(line.includes('http://localhost:5173') && line.includes('https://awenuesalesos.vercel.app'), line)
})
