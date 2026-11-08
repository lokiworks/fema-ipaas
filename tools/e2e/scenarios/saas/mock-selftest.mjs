import { createHash, createHmac, createPublicKey, randomBytes, verify as cryptoVerify } from 'node:crypto'
import { createServer } from 'node:http'

import { CLIENTS, MEMBERS, TENANTS, seedBody } from './saas-fixtures.mjs'
import { IAM_BASE, ISSUER, TOKEN_URL, assert, check, cookieJar, http, iam, iamState, summary, waitFor } from './saas-kit.mjs'

const RECEIVER_PORT = Number(process.env.SELFTEST_RECEIVER_PORT ?? 19390)
const REDIRECT = `http://127.0.0.1:${RECEIVER_PORT}/callback`
const received = []
const state = {}

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

  await check('S7 业务事件订阅：登记返回一次性 plainSecret；验证请求带签名与 id，回显 challenge 后才生效；推送带签名、不带 businessKey', async () => {
    const accessToken = (await tokenRequest({ client: CLIENTS.serviceA, form: { grant_type: 'client_credentials', tenant: TENANTS.alpha.code } })).json.access_token
    const endpoint = `http://127.0.0.1:${RECEIVER_PORT}/webhooks/selftest`
    const before = received.length
    const created = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/create`, token: accessToken, body: { code: 'ipaas-selftest-1', endpoint, events: { value: ['rental-agreement.contract.activate'] } } })
    assert(created.json.code === 'SUCCESS' && created.json.data.plainSecret && !('secret' in created.json.data), `登记应返回 plainSecret：${created.text}`)
    const secret = created.json.data.plainSecret
    await waitFor({ what: '订阅生效', probe: async () => (await iamState()).subscriptions.find((subscription) => subscription.code === 'ipaas-selftest-1')?.status === 'ACTIVE' })
    const verification = received[before]
    const body = JSON.parse(verification.raw)
    assert(body.type === 'webhook.verification' && body.id && body.challenge, `验证请求体不对：${verification.raw}`)
    assert(verification.headers['x-fema-signature'] === `sha256=${createHmac('sha256', secret).update(verification.raw).digest('hex')}`, '验证请求应带签名')
    const pushedAt = received.length
    const pushed = await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: 'rental-agreement.contract.activate', object: { code: 'contract', id: '981233' } } })
    assert(pushed.deliveries.length === 1, '应推一次')
    const hit = received[pushedAt]
    assert(hit.headers['x-fema-signature'] === `sha256=${createHmac('sha256', secret).update(hit.raw).digest('hex')}`, '推送签名不对')
    assert(hit.headers['x-fema-event-id'] === pushed.event.id && hit.headers['x-fema-event-type'] === 'rental-agreement.contract.activate', '应带事件 id 与类型头')
    assert(!('businessKey' in JSON.parse(hit.raw).object), '推送体不应带 businessKey')
    const read = await http({ url: `${IAM_BASE}/api/rental-agreement/contract/find-by-id?id=981233`, token: accessToken })
    assert(read.json.data.code === 'HT-2026-0001', '应读到甲的合同')
    const otherToken = (await tokenRequest({ client: CLIENTS.serviceB, form: { grant_type: 'client_credentials', tenant: TENANTS.beta.code } })).json.access_token
    const otherRead = await http({ url: `${IAM_BASE}/api/rental-agreement/contract/find-by-id?id=981233`, token: otherToken })
    assert(otherRead.json.data.code === 'HT-BETA-9', '乙只读到乙的数据')
    state.selftest = { accessToken, endpoint, id: created.json.data.id }
  })

  await check('S8 订阅编码永久占位：重复即 ALREADY_EXISTS（撤销后也是）；按编码查得到；撤销只认 id，不存在的返回 NOT_FOUND；无权限 OPERATION_FORBIDDEN；部分权限给 withheldEvents', async () => {
    const { accessToken, endpoint, id } = state.selftest
    const bareList = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/create`, token: accessToken, body: { code: 'ipaas-selftest-bare', endpoint, events: ['rental-agreement.contract.activate'] } })
    assert(bareList.status === 400 && bareList.json?.code === 'FEMA_RUNTIME_REQUEST_BODY_MALFORMED', `events 写成裸数组应被拒（fema 的列表字段是 {value:[...]}）：${bareList.status} ${bareList.text.slice(0, 200)}`)
    const duplicate = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/create`, token: accessToken, body: { code: 'ipaas-selftest-1', endpoint, events: { value: ['rental-agreement.contract.activate'] } } })
    assert(duplicate.status === 409 && duplicate.json.code === 'ALREADY_EXISTS', `重复编码应 ALREADY_EXISTS：${duplicate.text}`)
    const found = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/find-one`, token: accessToken, body: { filter: { code: 'ipaas-selftest-1' } } })
    assert(found.json.data.id === id && !('plainSecret' in found.json.data), `按编码应查到且不带密钥：${found.text}`)
    assert(found.json.data.status.code === 'ENABLED' && found.json.data.activatedAt, `查回的登记应带 status 与 activatedAt：${found.text}`)
    const flat = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/find-one`, token: accessToken, body: { code: 'ipaas-selftest-1' } })
    assert(flat.status === 400, `find-one 只接受查询规格 {filter:{code}}：${flat.status}`)
    const missing = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/find-one`, token: accessToken, body: { filter: { code: 'ipaas-no-such' } } })
    assert(missing.status === 200 && missing.json.code === 'SUCCESS' && missing.json.data === null, `查不到应返回 SUCCESS + data:null：${missing.text}`)
    const removed = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/delete`, token: accessToken, body: { id } })
    assert(removed.json.code === 'SUCCESS', '撤销失败')
    const again = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/delete`, token: accessToken, body: { id } })
    assert(again.status === 404 && again.json.code === 'NOT_FOUND', `撤销不存在的应 NOT_FOUND：${again.text}`)
    const reused = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/create`, token: accessToken, body: { code: 'ipaas-selftest-1', endpoint, events: { value: ['rental-agreement.contract.activate'] } } })
    assert(reused.json.code === 'ALREADY_EXISTS', '撤销后编码也不回收')
    const after = await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: 'rental-agreement.contract.activate', object: { code: 'contract', id: '981233' } } })
    assert(after.deliveries.length === 0, '撤销后不应再推')
    await iam({ path: '/__control/events/deny', body: { events: ['billing.bill.issue'] } })
    const denied = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/create`, token: accessToken, body: { code: 'ipaas-bill', endpoint, events: { value: ['billing.bill.issue'] } } })
    assert(denied.status === 403 && denied.json.code === 'OPERATION_FORBIDDEN', '无读权限时应拒绝登记')
    await iam({ path: '/__control/events/withhold', body: { events: ['rental-agreement.contract.terminate'] } })
    const partial = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/create`, token: accessToken, body: { code: 'ipaas-partial', endpoint, events: { value: ['rental-agreement.contract.activate', 'rental-agreement.contract.terminate'] } } })
    assert(JSON.stringify(partial.json.data.withheldEvents) === JSON.stringify(['rental-agreement.contract.terminate']), `应返回 withheldEvents：${partial.text}`)
    await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/delete`, token: accessToken, body: { id: partial.json.data.id } })
  })

  await check('S9 成员事件走业务事件通道：停用/恢复/移出/找回各推一条 iam-identity.member.*，object.id=成员 ID；成员详情返回当前状态；不回显 challenge 的登记不生效', async () => {
    const accessToken = (await tokenRequest({ client: CLIENTS.serviceA, form: { grant_type: 'client_credentials', tenant: TENANTS.alpha.code } })).json.access_token
    const endpoint = `http://127.0.0.1:${RECEIVER_PORT}/members/alpha`
    const events = ['iam-identity.member.suspend', 'iam-identity.member.activate', 'iam-identity.member.remove', 'iam-identity.member.restore']
    const created = await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/create`, token: accessToken, body: { code: 'ipaas-members-1', endpoint, events: { value: events } } })
    await waitFor({ what: '成员订阅生效', probe: async () => (await iamState()).subscriptions.find((subscription) => subscription.code === 'ipaas-members-1')?.status === 'ACTIVE' })
    const secret = created.json.data.plainSecret
    const steps = [['suspend', 'SUSPENDED'], ['activate', 'ACTIVE'], ['remove', 'REMOVED'], ['restore', 'ACTIVE']]
    for (const [ability, status] of steps) {
      const before = received.length
      const result = await iam({ path: `/__control/members/${ability}`, body: { memberId: MEMBERS.erinA.id } })
      assert(result.deliveries.length === 1 && result.deliveries[0].status === 200, `${ability} 应推送一次`)
      const hit = received[before]
      const event = JSON.parse(hit.raw)
      assert(event.type === `iam-identity.member.${ability}` && event.object.code === 'member' && event.object.id === MEMBERS.erinA.id && event.tenantId === TENANTS.alpha.code, `事件不对：${hit.raw}`)
      assert(hit.headers['x-fema-signature'] === `sha256=${createHmac('sha256', secret).update(hit.raw).digest('hex')}`, '签名不对')
      const member = await http({ url: `${IAM_BASE}/api/iam-identity/member/find-by-id?id=${MEMBERS.erinA.id}`, token: accessToken })
      assert(member.json.data.status.code === status, `成员状态应为 ${status}：${member.text}`)
    }
    const otherToken = (await tokenRequest({ client: CLIENTS.serviceB, form: { grant_type: 'client_credentials', tenant: TENANTS.beta.code } })).json.access_token
    const foreign = await http({ url: `${IAM_BASE}/api/iam-identity/member/find-by-id?id=${MEMBERS.erinA.id}`, token: otherToken })
    assert(foreign.status === 200 && foreign.json.data === null, `别家读不到这个成员（默认 SUCCESS + data:null）：${foreign.text}`)
    await iam({ path: '/__control/not-found-mode', body: { mode: '404' } })
    const foreign404 = await http({ url: `${IAM_BASE}/api/iam-identity/member/find-by-id?id=${MEMBERS.erinA.id}`, token: otherToken })
    const object404 = await http({ url: `${IAM_BASE}/api/rental-agreement/contract/find-by-id?id=no-such`, token: accessToken })
    await iam({ path: '/__control/not-found-mode', body: { mode: 'null' } })
    assert(foreign404.status === 404 && foreign404.json.code === 'NOT_FOUND' && object404.status === 404, '切到 404 模式后查不到应返回 404 NOT_FOUND')
    const objectNull = await http({ url: `${IAM_BASE}/api/rental-agreement/contract/find-by-id?id=no-such`, token: accessToken })
    assert(objectNull.status === 200 && objectNull.json.data === null, '对象查不到默认 SUCCESS + data:null')
    await iam({ path: '/__control/members/suspend', body: { memberId: MEMBERS.frankA.id, notify: false } })
    const suspended = await codeFlow({ jar: cookieJar(), client: CLIENTS.oidcA, username: 'frank', tenant: TENANTS.alpha.code, expectError: true })
    assert(suspended.error === 'access_denied', '停用的成员不能登录')
    await iam({ path: '/__control/members/activate', body: { memberId: MEMBERS.frankA.id, notify: false } })
    const silent = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    }).listen(RECEIVER_PORT + 1, '127.0.0.1')
    try {
      await http({ method: 'POST', url: `${IAM_BASE}/api/webhook/subscription/create`, token: accessToken, body: { code: 'ipaas-silent', endpoint: `http://127.0.0.1:${RECEIVER_PORT + 1}/x`, events: { value: events } } })
      await waitFor({ what: '不回显的登记被判为未验证', probe: async () => (await iamState()).subscriptions.find((subscription) => subscription.code === 'ipaas-silent')?.status === 'UNVERIFIED' })
    }
    finally {
      silent.close()
    }
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
