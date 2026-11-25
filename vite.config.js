import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { forwardWebsiteRequest, getWebsiteEnv, pickPatchBody, sanitizeId, verifySupabaseAuth } from './api/_lib/websiteProxy.js'

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, status, data) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(data))
}

function websiteApiProxyPlugin(env) {
  const handle = async (req, res, next) => {
    const url = new URL(req.url, 'http://localhost')
    if (!url.pathname.startsWith('/api/website/')) return next()

    const auth = await verifySupabaseAuth(req.headers.authorization, env)
    if (!auth.ok) return sendJson(res, auth.status, { error: auth.error })

    const cfg = getWebsiteEnv(env)
    if (req.method === 'GET' && url.pathname === '/api/website/sync') {
      if (!cfg.syncEndpoint || !cfg.apiKey) {
        return sendJson(res, 500, { error: 'Website API integration is not configured in .env.' })
      }
      const target = new URL(cfg.syncEndpoint)
      for (const key of ['type', 'enquiryStatus', 'contactStatus', 'search', 'since', 'limit']) {
        const val = url.searchParams.get(key)
        if (val) target.searchParams.set(key, val)
      }
      const out = await forwardWebsiteRequest(target.toString(), { method: 'GET', apiKey: cfg.apiKey })
      return sendJson(res, out.status, out.data)
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/api/website/project-enquiries/')) {
      const id = sanitizeId(decodeURIComponent(url.pathname.slice('/api/website/project-enquiries/'.length)))
      if (!id) return sendJson(res, 400, { error: 'Invalid enquiry ID.' })
      const body = await readJsonBody(req)
      const out = await forwardWebsiteRequest(`${cfg.enquiriesEndpoint}/${encodeURIComponent(id)}`, {
        method: 'PATCH', apiKey: cfg.apiKey, body: pickPatchBody(body),
      })
      return sendJson(res, out.status, out.data)
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/api/website/contact-messages/')) {
      const id = sanitizeId(decodeURIComponent(url.pathname.slice('/api/website/contact-messages/'.length)))
      if (!id) return sendJson(res, 400, { error: 'Invalid message ID.' })
      const body = await readJsonBody(req)
      const out = await forwardWebsiteRequest(`${cfg.contactsEndpoint}/${encodeURIComponent(id)}`, {
        method: 'PATCH', apiKey: cfg.apiKey, body: pickPatchBody(body),
      })
      return sendJson(res, out.status, out.data)
    }

    return sendJson(res, 404, { error: 'Not found' })
  }

  return {
    name: 'website-api-proxy',
    configureServer(server) { server.middlewares.use(handle) },
    configurePreviewServer(server) { server.middlewares.use(handle) },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), websiteApiProxyPlugin(env)],
    build: {
      // The biggest bundles (Excel export, PDF, charts) are loaded only when those screens open, so the first page stays small.
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          // Long-lived vendor chunks cache well between deployments. Match exact package folders only.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'react'
            if (id.includes('@supabase')) return 'supabase'
            if (/[\\/]node_modules[\\/](react-hook-form|@hookform|zod)[\\/]/.test(id)) return 'forms'
            return undefined
          },
        },
      },
    },
  }
})
