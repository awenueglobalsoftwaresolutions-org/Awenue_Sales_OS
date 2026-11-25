import { forwardWebsiteRequest, getWebsiteEnv, verifySupabaseAuth } from '../_lib/websiteProxy.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await verifySupabaseAuth(req.headers.authorization)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const { syncEndpoint, apiKey } = getWebsiteEnv()
  if (!syncEndpoint || !apiKey) {
    return res.status(500).json({ error: 'Website API integration is not configured on the server.' })
  }

  const target = new URL(syncEndpoint)
  for (const key of ['type', 'enquiryStatus', 'contactStatus', 'search', 'since', 'limit']) {
    const val = req.query?.[key]
    if (val) target.searchParams.set(key, String(val))
  }

  const out = await forwardWebsiteRequest(target.toString(), { method: 'GET', apiKey })
  return res.status(out.status).json(out.data)
}
