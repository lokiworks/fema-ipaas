import http from 'node:http'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { claimsFor, IDP_USERS } from './idp-users.mjs'

const SLOT = Number(process.env.E2E_SLOT ?? 3)
const PORT = Number(process.env.IDP_PORT ?? 19000 + SLOT)
const ISSUER = process.env.IDP_ISSUER ?? `http://127.0.0.1:${PORT}`
const WEB_PORT = 4200 + SLOT
const CLIENT_ID = process.env.IDP_CLIENT_ID ?? 'fema-e2e'
const CLIENT_SECRET = process.env.IDP_CLIENT_SECRET ?? 'e2e-secret-value'
const CODE_TTL = Number(process.env.IDP_CODE_TTL ?? 60)
const IDP_DIR = `${process.env.E2E_STATE_ROOT ?? '/tmp/fema-e2e'}/slot-${SLOT}/idp`

const require = createRequire(`${IDP_DIR}/`)
const { default: Provider } = await import(pathToFileURL(require.resolve('oidc-provider')).href)

const provider = new Provider(ISSUER, {
  clients: [
    {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uris: [`http://localhost:${WEB_PORT}/api/v1/authn/sso/callback`],
      grant_types: ['authorization_code'],
      response_types: ['code'],
      token_endpoint_auth_method: 'client_secret_basic',
    },
  ],
  scopes: ['openid', 'email', 'profile', 'groups'],
  claims: {
    openid: ['sub'],
    email: ['email', 'email_verified'],
    profile: ['name', 'given_name', 'family_name'],
    groups: ['groups'],
  },
  features: { devInteractions: { enabled: false } },
  ttl: { AuthorizationCode: CODE_TTL, Session: 600, Interaction: 600, IdToken: 600, AccessToken: 600, Grant: 600 },
  cookies: { keys: ['e2e-idp-cookie-key'] },
  interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
  async findAccount(_ctx, id) {
    const claims = claimsFor({ email: id })
    if (!claims) {
      return undefined
    }
    return { accountId: id, claims: async () => claims }
  },
})

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, ISSUER)
  const match = url.pathname.match(/^\/interaction\/([^/]+)(?:\/(login))?$/)
  if (!match) {
    return provider.callback()(req, res)
  }
  const details = await provider.interactionDetails(req, res)
  if (req.method === 'GET' && details.prompt.name === 'login') {
    const options = Object.keys(IDP_USERS).map((email) => `<option value="${email}">${email}</option>`).join('')
    res.setHeader('content-type', 'text/html; charset=utf-8')
    res.end(`<!doctype html><html><body><h1>Mock company sign-in</h1><form method="post" action="/interaction/${details.uid}/login"><select name="email" id="email">${options}</select><button type="submit" id="signin">Sign in</button></form></body></html>`)
    return
  }
  if (req.method === 'POST' && match[2] === 'login') {
    const body = await readBody(req)
    const email = new URLSearchParams(body).get('email')
    await provider.interactionFinished(req, res, { login: { accountId: email } }, { mergeWithLastSubmission: false })
    return
  }
  if (details.prompt.name === 'consent') {
    const grant = details.grantId ? await provider.Grant.find(details.grantId) : new provider.Grant({ accountId: details.session.accountId, clientId: details.params.client_id })
    if (details.prompt.details.missingOIDCScope) {
      grant.addOIDCScope(details.prompt.details.missingOIDCScope.join(' '))
    }
    if (details.prompt.details.missingOIDCClaims) {
      grant.addOIDCClaims(details.prompt.details.missingOIDCClaims)
    }
    const grantId = await grant.save()
    await provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true })
    return
  }
  res.statusCode = 400
  res.end('unsupported interaction')
})

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`mock oidc idp listening on ${ISSUER}\n`)
})

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => resolve(data))
  })
}
