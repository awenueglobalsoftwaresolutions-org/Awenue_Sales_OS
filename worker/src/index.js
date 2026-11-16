// Awenue API — Cloudflare Worker. Modules live in ./routes; shared helpers in ./lib.
import { HttpError, corsHeaders, json } from './lib/http.js'
import * as files from './routes/files.js'
import * as users from './routes/users.js'
import * as auth from './routes/auth.js'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = corsHeaders(request, env)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    try {
      const route = `${request.method} ${url.pathname}`
      switch (route) {
        case 'GET /file': return await files.serveFile(url, env)
        case 'POST /upload': case 'POST /files/upload': return json(await files.upload(request, url, env), 201, cors)
        case 'POST /sign': case 'POST /files/sign': return json(await files.signUrl(request, url, env), 200, cors)
        case 'POST /delete': case 'POST /files/delete': return json(await files.remove(request, env), 200, cors)
        case 'POST /auth/login': return json(await auth.login(request, env), 200, cors)
        case 'POST /audit/event': return json(await auth.event(request, env), 200, cors)
        case 'POST /audit/session': return json(await auth.session(request, env), 200, cors)
        case 'POST /users/create': return json(await users.createUser(request, env), 201, cors)
        case 'POST /users/remove': return json(await users.removeUser(request, env), 200, cors)
        default: throw new HttpError(404, 'Not found')
      }
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors)
      console.error(e)
      return json({ error: 'Unexpected server error' }, 500, cors)
    }
  },
}
