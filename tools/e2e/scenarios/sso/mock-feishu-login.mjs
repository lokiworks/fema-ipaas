import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'

import { claimsFor } from './idp-users.mjs'

const SLOT = Number(process.env.E2E_SLOT ?? 3)
const PORT = Number(process.env.FEISHU_LOGIN_PORT ?? 19013 + (SLOT - 3) * 100)
const WEB_PORT = 4200 + SLOT
export const FEISHU_APP_ID = 'cli_e2e_login'
export const FEISHU_APP_SECRET = 'feishu-login-secret'
export const FEISHU_TENANT_KEY = 'tenant-acme'
const REDIRECT = `http://localhost:${WEB_PORT}/api/v1/authn/sso/callback`

const state = { next: { email: 'dev@ap.com' }, secret: FEISHU_APP_SECRET, codes: new Map(), tokens: new Map() }

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const route = `${req.method} ${url.pathname}`
  if (route === 'POST /__admin/next') {
    state.next = JSON.parse(await readBody(req))
    return json(res, 200, { ok: true })
  }
  if (route === 'POST /__admin/secret') {
    state.secret = JSON.parse(await readBody(req)).secret ?? FEISHU_APP_SECRET
    return json(res, 200, { ok: true })
  }
  if (route === 'GET /feishu/open-apis/authen/v1/authorize') {
    if (url.searchParams.get('client_id') !== FEISHU_APP_ID || url.searchParams.get('redirect_uri') !== REDIRECT) {
      return json(res, 400, { error: 'invalid_client' })
    }
    const target = new URL(REDIRECT)
    target.searchParams.set('state', url.searchParams.get('state') ?? '')
    if (state.next.deny === true) {
      target.searchParams.set('error', 'access_denied')
    }
    else {
      const code = randomBytes(12).toString('hex')
      state.codes.set(code, { next: state.next, challenge: url.searchParams.get('code_challenge') ?? '', used: false })
      target.searchParams.set('code', code)
    }
    res.statusCode = 302
    res.setHeader('location', target.toString())
    return res.end()
  }
  if (route === 'POST /feishu/open-apis/authen/v2/oauth/token') {
    const body = JSON.parse(await readBody(req))
    if (body.client_id !== FEISHU_APP_ID || body.client_secret !== state.secret) {
      return json(res, 400, { code: 20024, error: 'invalid_client', error_description: 'app secret is wrong' })
    }
    const record = state.codes.get(body.code)
    if (!record || record.used || createHash('sha256').update(body.code_verifier ?? '').digest('base64url') !== record.challenge) {
      return json(res, 400, { code: 20003, error: 'invalid_grant', error_description: 'code is invalid or already used' })
    }
    record.used = true
    const accessToken = `u-${randomBytes(12).toString('hex')}`
    state.tokens.set(accessToken, record.next)
    return json(res, 200, { code: 0, access_token: accessToken, expires_in: 7200 })
  }
  if (route === 'GET /feishu/open-apis/authen/v1/user_info') {
    const next = state.tokens.get((req.headers.authorization ?? '').replace(/^Bearer /, ''))
    const claims = next ? claimsFor({ email: next.email }) : null
    if (!claims) {
      return json(res, 401, { code: 99991668, msg: 'invalid access token' })
    }
    return json(res, 200, {
      code: 0,
      msg: 'success',
      data: {
        name: claims.name,
        open_id: `ou_${claims.sub}`,
        union_id: `on_${claims.sub}`,
        tenant_key: next.tenantKey ?? FEISHU_TENANT_KEY,
        ...(next.omitEmail === true ? {} : { enterprise_email: claims.email }),
      },
    })
  }
  return json(res, 404, { error: 'not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`mock feishu login listening on http://127.0.0.1:${PORT}\n`)
})

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
  })
}
