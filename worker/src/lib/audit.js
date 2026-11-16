import { adminClient } from './supabase.js'

const IP = /^(\d{1,3}(\.\d{1,3}){3}|[0-9a-fA-F:.]{2,45})$/

// Everything here comes from Cloudflare itself (not from request headers a visitor could set).
export function requestOrigin(request) {
  const cf = request.cf || {}
  const ip = request.headers.get('CF-Connecting-IP')
  return { ip: ip && IP.test(ip) ? ip : null, ua: request.headers.get('User-Agent') || null, country: cf.country || null, region: cf.region || null, city: cf.city || null, isp: cf.asOrganization || null }
}

// Best effort: a logging problem must never block what the person was doing.
export async function writeAudit(env, request, { userId = null, username, action, module, record = null, description = '', status = 'success', metadata = {} }) {
  try {
    const o = requestOrigin(request)
    const r = await adminClient(env).rest('rpc/log_event_service', {
      method: 'POST',
      body: JSON.stringify({ p_user: userId, p_username: username || 'Unknown', p_action: action, p_module: module, p_record: record, p_description: description, p_status: status, p_metadata: metadata,
        p_ip: o.ip, p_ua: o.ua, p_country: o.country, p_region: o.region, p_city: o.city, p_isp: o.isp }),
    })
    if (!r.ok) console.error('audit write failed', r.status)
  } catch (e) { console.error('audit write failed', e) }
}
