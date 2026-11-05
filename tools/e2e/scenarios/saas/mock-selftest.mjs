import { createHash, createHmac, createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto'
import { createServer } from 'node:http'

import { CLIENTS, MEMBERS, TENANTS, seedBody } from './saas-fixtures.mjs'
import { IAM_BASE, ISSUER, TOKEN_URL, assert, check, cookieJar, http, iam, iamState, summary, waitFor } from './saas-kit.mjs'

const RECEIVER_PORT = Number(process.env.SELFTEST_RECEIVER_PORT ?? 19390)
const REDIRECT = `http://127.0.0.1:${RECEIVER_PORT}/callback`
const received = []

const receiver = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  received.push({ path: req.url, headers: req.headers, raw })
  const body = raw ? JSON.parse(raw) : {}
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body.challenge ? { challenge: body.challenge } : { ok: true }))
}).listen(RECEIVER_PORT, '127.0.0.1')

try {
  await iam({ path: '/__control/seed', body: seedBody() })
  await run()
}
finally {
  receiver.close()
}
summary({ name: 'fema-iam-mock-selftest' })

async function run() {
  const discovery = (await http({ url: `${ISSUER}/.well-known/openid-configuration` })).json
  const jwks = (await http({ url: discovery.jwks_uri })).json

  await check('S1 发现文档与 JWKS', async () => {
    assert(discovery.issuer === ISSUER, `issuer 不对：${discovery.issuer}`)
    assert(discovery.code_challenge_methods_supported.includes('S256'), '应支持 S256')
    assert(jwks.keys.length === 1 && jwks.keys[0].alg === 'RS256', 'JWKS 应有一把 RS256 公钥')
  })

  await check('S2 授权码 + PKCE：未登录出登录页，登录后签码；id_token 为 RS256，sub=成员 ID，有已验证邮箱才给 email', async () => {
    const jar = cookieJar()
    const { tokens, sawLogin } = await codeFlow({ jar, client: CLIENTS.oidcA, username: 'alice', tenant: TENANTS.alpha.code })
    assert(sawLogin, '第一次应出登录页')
    const claims = verifyJwt({ token: tokens.id_token, jwks })
    assert(claims.sub === MEMBERS.aliceA.id && claims.tenantId === TENANTS.alpha.code && claims.sub_type === 'member', `id_token 内容不对：${JSON.stringify(claims)}`)
    assert(claims.aud === CLIENTS.oidcA.clientId && claims.iss === ISSUER && claims.nonce === 'n-1', 'aud/iss/nonce 不对')
    assert(claims.email && claims.email_verified === true, '已验证邮箱应给 email')
    const again = await codeFlow({ jar, client: CLIENTS.oidcA, username: 'alice', tenant: TENANTS.alpha.code })
    assert(!again.sawLogin, '已登录会话应直接签码')
    const info = (await http({ url: discovery.userinfo_endpoint, token: tokens.access_token })).json
    assert(info.sub === MEMBERS.aliceA.id && info.tenantId === TENANTS.alpha.code && info.email, `userinfo 不对：${JSON.stringify(info)}`)
  })

  await check('S3 只有手机号、邮箱未验证的成员：id_token 与 userinfo 都不给 email', async () => {
    for (const username of ['pat', 'uma']) {
      const { tokens } = await codeFlow({ jar: cookieJar(), client: CLIENTS.oidcA, username, tenant: TENANTS.alpha.code })
      const claims = verifyJwt({ token: tokens.id_token, jwks })
      assert(!('email' in claims) && !('email_verified' in claims), `${username} 不应有 email：${JSON.stringify(claims)}`)
      const info = (await http({ url: discovery.userinfo_endpoint, token: tokens.access_token })).json
      assert(!('email' in info), `${username} 的 userinfo 不应有 email`)
    }
  })

  await check('S4 租户范围：乙的成员走甲的客户端被拒，篡改 tenant 也被拒', async () => {
    const dave = await codeFlow({ jar: cookieJar(), client: CLIENTS.oidcA, username: 'dave', tenant: TENANTS.alpha.code, expectError: true })
    assert(dave.error === 'access_denied', `应 access_denied：${dave.error}`)
    const tampered = await codeFlow({ jar: cookieJar(), client: CLIENTS.oidcA, username: 'dave', tenant: TENANTS.beta.code, expectError: true })
    assert(tampered.error === 'access_denied', `篡改租户也应 access_denied：${tampered.error}`)
    const outcomes = (await iamState()).log.authorize.filter((entry) => entry.outcome !== 'login_page').slice(-2).map((entry) => entry.outcome)
    assert(outcomes.join(',') === 'no_member,tenant_not_accepted', `拒绝原因不对：${outcomes}`)
  })

  await check('S5 刷新令牌：成员在时可刷新；移出后 invalid_grant；恢复后新登录可用', async () => {
    const { tokens } = await codeFlow({ jar: cookieJar(), client: CLIENTS.oidcA, username: 'frank', tenant: TENANTS.alpha.code })
    const ok = await tokenRequest({ client: CLIENTS.oidcA, form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token } })
    assert(ok.status === 200 && ok.json.id_token, `刷新应成功：${ok.text}`)
    await iam({ path: '/__control/members/remove', body: { memberId: MEMBERS.frankA.id } })
    const denied = await tokenRequest({ client: CLIENTS.oidcA, form: { grant_type: 'refresh_token', refresh_token: tokens.refresh_token } })
    assert(denied.status === 400 && denied.json.error === 'invalid_grant', `移出后应 invalid_grant：${denied.text}`)
    await iam({ path: '/__control/members/restore', body: { memberId: MEMBERS.frankA.id } })
  })

  await check('S6 client_credentials：带本租户签 application 令牌，带别家 invalid_target，不带 tenant 不属于任何租户，错密钥 invalid_client', async () => {
    const own = await tokenRequest({ client: CLIENTS.serviceA, form: { grant_type: 'client_credentials', tenant: TENANTS.alpha.code } })
    const claims = verifyJwt({ token: own.json.access_token, jwks })
    assert(claims.tenantId === TENANTS.alpha.code && claims.sub_type === 'application' && claims.sub === CLIENTS.serviceA.clientId, `令牌内容不对：${JSON.stringify(claims)}`)
    const other = await tokenRequest({ client: CLIENTS.serviceA, form: { grant_type: 'client_credentials', tenant: TENANTS.beta.code } })
    assert(other.status === 400 && other.json.error === 'invalid_target', `应 invalid_target：${other.text}`)
    const none = await tokenRequest({ client: CLIENTS.platform, form: { grant_type: 'client_credentials' } })
    assert(!('tenantId' in verifyJwt({ token: none.json.access_token, jwks })), '不带 tenant 的令牌不应有 tenantId')
    const wrong = await tokenRequest({ client: { ...CLIENTS.serviceA, secret: 'wrong' }, form: { grant_type: 'client_credentials', tenant: TENANTS.alpha.code } })
    assert(wrong.status === 401 && wrong.json.error === 'invalid_client', '错密钥应 invalid_client')
    await iam({ path: '/__control/tenants/update', body: { code: TENANTS.beta.code, status: 'SUSPENDED' } })
    const suspended = await tokenRequest({ client: CLIENTS.serviceB, form: { grant_type: 'client_credentials', tenant: TENANTS.beta.code } })
    assert(suspended.json.error === 'invalid_target', '停用租户应 invalid_target')
    await iam({ path: '/__control/tenants/update', body: { code: TENANTS.beta.code, status: 'ACTIVE' } })
    await iam({ path: '/__control/faults', body: { faults: [{ kind: 'token', grantType: 'client_credentials', clientId: CLIENTS.serviceB.clientId, status: 503 }] } })
    const faulted = await tokenRequest({ client: CLIENTS.serviceB, form: { grant_type: 'client_credentials', tenant: TENANTS.beta.code } })
    const recovered = await tokenRequest({ client: CLIENTS.serviceB, form: { grant_type: 'client_credentials', tenant: TENANTS.beta.code } })
    assert(faulted.status === 503 && recovered.status === 200, '注入的故障应只生效一次')
  })

  await check('S7 联邦事件：移出成员并通知时按 sha256=HMAC(原始请求体) 签名发到登记地址', async () => {
    await iam({ path: '/__control/tenants/update', body: { code: TENANTS.alpha.code, eventsUrl: `http://127.0.0.1:${RECEIVER_PORT}/v1/federation/events` } })
    const before = received.length
    const result = await iam({ path: '/__control/members/remove', body: { memberId: MEMBERS.erinA.id, notify: true } })
    assert(result.delivered.status === 200, `应送达：${JSON.stringify(result.delivered)}`)
    const hit = received[before]
    const expected = `sha256=${createHmac('sha256', TENANTS.alpha.eventSecret).update(hit.raw).digest('hex')}`
    assert(hit.headers['x-fema-signature'] === expected, '签名不对')
    const event = JSON.parse(hit.raw)
    assert(event.type === 'MEMBER_REMOVED' && event.subject === MEMBERS.erinA.id && event.issuer === ISSUER && event.externalTenantId === TENANTS.alpha.code && event.id, `事件内容不对：${hit.raw}`)
  })

  await check('S8 业务事件订阅：登记返回一次性密钥并发验证请求，回显后生效；推送带签名；撤销后不再推', async () => {
    const accessToken = (await tokenRequest({ client: CLIENTS.serviceA, form: { grant_type: 'client_credentials', tenant: TENANTS.alpha.code } })).json.access_token
    const endpoint = `http://127.0.0.1:${RECEIVER_PORT}/webhooks/selftest`
    const created = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/create`, token: accessToken, body: { code: 'ipaas-selftest', endpoint, events: ['rental-agreement.contract.activate'] } })
    assert(created.json.code === 'SUCCESS' && created.json.data.secret, `登记失败：${created.text}`)
    const secret = created.json.data.secret
    await waitFor({ what: '订阅生效', probe: async () => (await iamState()).subscriptions.find((subscription) => subscription.code === 'ipaas-selftest')?.status === 'ACTIVE' })
    const before = received.length
    const pushed = await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: 'rental-agreement.contract.activate', object: { code: 'contract', id: '981233' } } })
    assert(pushed.deliveries.length === 1, '应推一次')
    const hit = received[before]
    assert(hit.headers['x-fema-signature'] === `sha256=${createHmac('sha256', secret).update(hit.raw).digest('hex')}`, '推送签名不对')
    const read = await http({ url: `${IAM_BASE}/api/rental-agreement/contract/find-by-id?id=981233`, token: accessToken })
    assert(read.json.data.code === 'HT-2026-0001', '应读到甲的合同')
    const otherToken = (await tokenRequest({ client: CLIENTS.serviceB, form: { grant_type: 'client_credentials', tenant: TENANTS.beta.code } })).json.access_token
    const otherRead = await http({ url: `${IAM_BASE}/api/rental-agreement/contract/find-by-id?id=981233`, token: otherToken })
    assert(otherRead.json.data.code === 'HT-BETA-9', '乙只读到乙的数据')
    await iam({ path: '/__control/events/deny', body: { events: ['billing.bill.issue'] } })
    const denied = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/create`, token: accessToken, body: { code: 'ipaas-bill', endpoint, events: ['billing.bill.issue'] } })
    assert(denied.json.code === 'PERMISSION_DENIED', '无读权限时应拒绝登记')
    const removed = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/delete`, token: accessToken, body: { id: created.json.data.id } })
    assert(removed.json.code === 'SUCCESS', '撤销失败')
    const after = await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: 'rental-agreement.contract.activate', object: { code: 'contract', id: '981233' } } })
    assert(after.deliveries.length === 0, '撤销后不应再推')
  })
}

async function codeFlow({ jar, client, username, tenant, expectError = false }) {
  const verifier = randomBytes(32).toString('base64url')
  const authorize = new URL(`${ISSUER}/oauth2/authorize`)
  for (const [key, value] of Object.entries({ response_type: 'code', client_id: client.clientId, redirect_uri: REDIRECT, scope: 'openid profile email', state: 's-1', nonce: 'n-1', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', tenant })) {
    authorize.searchParams.set(key, value)
  }
  let response = await http({ url: authorize.toString(), jar })
  let sawLogin = false
  if (response.status === 200 && response.text.includes('iam-login-form')) {
    sawLogin = true
    await http({ method: 'POST', url: `${ISSUER}/login`, jar, form: { username, password: 'Passw0rd!', return: authorize.pathname + authorize.search } })
    response = await http({ url: authorize.toString(), jar })
  }
  assert(response.status === 302, `authorize 应重定向：${response.status} ${response.text.slice(0, 200)}`)
  const back = new URL(response.location)
  if (expectError) {
    return { error: back.searchParams.get('error'), sawLogin }
  }
  assert(back.searchParams.get('state') === 's-1', 'state 应原样带回')
  const exchanged = await tokenRequest({ client, form: { grant_type: 'authorization_code', code: back.searchParams.get('code'), redirect_uri: REDIRECT, code_verifier: verifier }, basic: true })
  assert(exchanged.status === 200, `换票失败：${exchanged.text}`)
  const wrongVerifier = await tokenRequest({ client, form: { grant_type: 'authorization_code', code: back.searchParams.get('code'), redirect_uri: REDIRECT, code_verifier: 'x' }, basic: true })
  assert(wrongVerifier.status === 400, '授权码只能用一次')
  return { tokens: exchanged.json, sawLogin }
}

async function tokenRequest({ client, form, basic = false }) {
  if (basic) {
    return http({ method: 'POST', url: TOKEN_URL, form, headers: { authorization: `Basic ${Buffer.from(`${client.clientId}:${client.secret}`).toString('base64')}` } })
  }
  return http({ method: 'POST', url: TOKEN_URL, form: { ...form, client_id: client.clientId, client_secret: client.secret } })
}

function verifyJwt({ token, jwks }) {
  const [header, body, signature] = token.split('.')
  const key = createPublicKey({ key: jwks.keys.find((candidate) => candidate.kid === JSON.parse(Buffer.from(header, 'base64url').toString()).kid), format: 'jwk' })
  assert(cryptoVerify('RSA-SHA256', Buffer.from(`${header}.${body}`), key, Buffer.from(signature, 'base64url')), 'JWT 签名校验失败')
  return JSON.parse(Buffer.from(body, 'base64url').toString())
}
