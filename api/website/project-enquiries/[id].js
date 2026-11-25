import { forwardWebsiteRequest, getWebsiteEnv, pickPatchBody, sanitizeId, verifySupabaseAuth } from '../../_lib/websiteProxy.js'

export default async function handler(req, res) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })
  const auth = await verifySupabaseAuth(req.headers.authorization, process.env, 'leads.edit')
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error })

  const id = sanitizeId(Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id)
  if (!id) return res.status(400).json({ error: 'Invalid enquiry ID.' })

  const { enquiriesEndpoint, apiKey } = getWebsiteEnv()
  if (!enquiriesEndpoint || !apiKey) {
    return res.status(500).json({ error: 'Website API integration is not configured on the server.' })
  }

  const out = await forwardWebsiteRequest(`${enquiriesEndpoint}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    apiKey,
    body: pickPatchBody(req.body || {}),
  })
  return res.status(out.status).json(out.data)
}
