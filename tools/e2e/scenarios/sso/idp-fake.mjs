import http from 'node:http'

import { claimsFor } from './idp-users.mjs'

const SLOT = Number(process.env.E2E_SLOT ?? 3)
const PORT = Number(process.env.FAKE_IDP_PORT ?? 19023 + (SLOT - 3) * 100)
const CONTROL_PORT = PORT + 1
const WEB_PORT = 4200 + SLOT

const fakeModule = await import('../../../../packages/server/api/test/helpers/fake-oidc-idp.ts')
const startFakeIdp = fakeModule.startFakeIdp ?? fakeModule.default.startFakeIdp
const idp = await startFakeIdp({ port: PORT, clientId: 'fema-e2e-fake', clientSecret: 'fake-secret-value' })
idp.allowRedirect(`http://localhost:${WEB_PORT}/api/v1/authn/sso/callback`)

http.createServer(async (req, res) => {
  let data = ''
  for await (const chunk of req) {
    data += chunk
  }
  const body = data.length > 0 ? JSON.parse(data) : {}
  if (req.url === '/discovery-issuer') {
    idp.setDiscoveryIssuer(body.issuer ?? null)
  }
  if (req.url === '/next') {
    const claims = claimsFor({ email: body.email })
    if (claims) {
      idp.setUser({ email: body.email, claims })
    }
    idp.setNext(body)
  }
  res.setHeader('content-type', 'application/json')
  res.end('{"ok":true}')
}).listen(CONTROL_PORT, '127.0.0.1')

process.stdout.write(`fake idp on ${idp.issuer}, control on ${CONTROL_PORT}\n`)
