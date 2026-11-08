import { createHash, createHmac, generateKeyPairSync, randomBytes, randomUUID, sign as cryptoSign } from 'node:crypto'
import { createServer } from 'node:http'

const SLOT = Number(process.env.E2E_SLOT ?? 3)
const PORT = Number(process.env.FEMA_IAM_PORT ?? 19300 + SLOT)
const HOST = process.env.FEMA_IAM_HOST ?? '127.0.0.1'
const BASE = process.env.FEMA_IAM_BASE ?? `http://${HOST}:${PORT}`
const ISSUER = `${BASE}/iam`
const API = `${BASE}/api`
const SESSION_COOKIE = 'fema_iam_sid'
const CODE_TTL_MS = 60_000
const MEMBER_STATUS_NAMES = { PENDING: '待激活', ACTIVE: '正常', SUSPENDED: '停用', REMOVED: '已移出' }
const ACCESS_TTL_SECONDS = Number(process.env.FEMA_IAM_ACCESS_TTL ?? 300)

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = `mock-${randomBytes(4).toString('hex')}`
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }

const state = freshState()

function freshState() {
  return {
    tenants: new Map(),
    persons: new Map(),
    members: new Map(),
    clients: new Map(),
    sessions: new Map(),
    codes: new Map(),
    refreshTokens: new Map(),
    accessTokens: new Map(),
    subscriptions: new Map(),
    objects: new Map(),
    deniedEvents: new Set(),
    withheldEvents: new Set(),
    usedCodes: new Set(),
    notFoundMode: 'null',
    faults: [],
    log: { authorize: [], token: [], userinfo: [], subscriptions: [], deliveries: [], api: [] },
  }
}

function resetState() {
  const next = freshState()
  for (const key of Object.keys(next)) {
    state[key] = next[key]
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', BASE)
  const raw = await readRaw(req)
  const route = `${req.method} ${url.pathname}`
  try {
    const handler = ROUTES[route] ?? dynamicRoute({ method: req.method ?? 'GET', pathname: url.pathname })
    if (!handler) {
      return send({ res, status: 404, payload: { error: 'not_found', path: url.pathname } })
    }
    const result = await handler({ req, url, raw, body: parseBody({ raw, contentType: req.headers['content-type'] }) })
    return reply({ res, result })
  }
  catch (error) {
    return send({ res, status: 500, payload: { error: 'server_error', error_description: String(error?.message ?? error) } })
  }
})

server.listen(PORT, HOST, () => {
  process.stdout.write(`fema-iam mock on ${BASE} (issuer ${ISSUER}, api ${API})\n`)
})

const ROUTES = {
  'GET /': () => json({ payload: { ok: true, issuer: ISSUER, api: API } }),
  'GET /iam/.well-known/openid-configuration': () => json({ payload: discovery() }),
  'GET /iam/oauth2/jwks': () => json({ payload: { keys: [JWK] } }),
  'GET /iam/oauth2/authorize': ({ req, url }) => authorize({ req, url }),
  'POST /iam/login': ({ body }) => login({ body }),
  'POST /iam/logout': ({ req }) => logout({ req }),
  'POST /iam/oauth2/token': ({ req, body }) => token({ req, body }),
  'GET /iam/userinfo': ({ req }) => userinfo({ req }),
  'POST /iam/userinfo': ({ req }) => userinfo({ req }),
  'POST /api/webhook/subscription/create': ({ req, body }) => createSubscription({ req, body }),
  'POST /api/webhook/subscription/delete': ({ req, body }) => deleteSubscription({ req, body }),
  'POST /__control/reset': () => {
    resetState()
    return json({ payload: { ok: true } })
  },
  'POST /__control/seed': ({ body }) => seed({ body }),
  'GET /__control/state': () => json({ payload: snapshot() }),
  'POST /__control/faults': ({ body }) => {
    state.faults = Array.isArray(body.faults) ? body.faults.map((fault) => ({ remaining: 1, ...fault })) : []
    return json({ payload: { ok: true, faults: state.faults } })
  },
  'POST /__control/clients/rotate': ({ body }) => rotateClient({ body }),
  'POST /__control/tenants/update': ({ body }) => updateTenant({ body }),
  'POST /__control/members/suspend': ({ body }) => changeMembership({ body, status: 'SUSPENDED', ability: 'suspend' }),
  'POST /__control/members/activate': ({ body }) => changeMembership({ body, status: 'ACTIVE', ability: 'activate' }),
  'POST /__control/members/remove': ({ body }) => changeMembership({ body, status: 'REMOVED', ability: 'remove' }),
  'POST /__control/members/restore': ({ body }) => changeMembership({ body, status: 'ACTIVE', ability: 'restore' }),
  'POST /__control/members/forget': ({ body }) => {
    const member = state.members.get(body.memberId)
    state.members.delete(body.memberId)
    return json({ payload: { ok: Boolean(member), member: member ?? null } })
  },
  'POST /api/webhook/subscription/find-one': ({ req, body }) => findSubscription({ req, body }),
  'POST /api/iam-identity/member/find-all': ({ req, body }) => findAllMembers({ req, body }),
  'POST /__control/objects': ({ body }) => putObject({ body }),
  'POST /__control/events/push': ({ body }) => pushBusinessEvent(body),
  'POST /__control/events/deny': ({ body }) => {
    state.deniedEvents = new Set(Array.isArray(body.events) ? body.events : [])
    return json({ payload: { ok: true } })
  },
  'POST /__control/not-found-mode': ({ body }) => {
    state.notFoundMode = body.mode === '404' ? '404' : 'null'
    return json({ payload: { ok: true, mode: state.notFoundMode } })
  },
  'POST /__control/events/withhold': ({ body }) => {
    state.withheldEvents = new Set(Array.isArray(body.events) ? body.events : [])
    return json({ payload: { ok: true } })
  },
}

function dynamicRoute({ method, pathname }) {
  if (pathname === '/api/iam-identity/member/find-by-id' && method === 'GET') {
    return ({ req, url }) => findMember({ req, id: url.searchParams.get('id') ?? '' })
  }
  const read = pathname.match(/^\/api\/([a-z0-9-]+)\/([a-z0-9-]+)\/find-by-id$/)
  if (read && method === 'GET') {
    return ({ req, url }) => findById({ req, app: read[1], object: read[2], id: url.searchParams.get('id') ?? '' })
  }
  if (pathname.startsWith('/api/')) {
    return ({ req, url, body }) => echoApi({ req, url, body, method })
  }
  return null
}

function discovery() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth2/authorize`,
    token_endpoint: `${ISSUER}/oauth2/token`,
    userinfo_endpoint: `${ISSUER}/userinfo`,
    jwks_uri: `${ISSUER}/oauth2/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile', 'email'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    code_challenge_methods_supported: ['S256'],
    claims_supported: ['sub', 'tenantId', 'sub_type', 'sid', 'name', 'preferred_username', 'email', 'email_verified'],
  }
}

function seed({ body }) {
  if (body.reset !== false) {
    resetState()
  }
  for (const tenant of body.tenants ?? []) {
    state.tenants.set(tenant.code, { status: 'ACTIVE', name: tenant.code, ...tenant })
  }
  for (const person of body.persons ?? []) {
    state.persons.set(person.username, { password: 'Passw0rd!', name: person.username, email: null, emailVerified: false, phone: null, phoneVerified: false, ...person })
  }
  for (const member of body.members ?? []) {
    state.members.set(member.id, { status: 'ACTIVE', ...member })
  }
  for (const client of body.clients ?? []) {
    state.clients.set(client.clientId, { kind: 'oidc', acceptsAnyTenant: false, redirectUris: [], ...client })
  }
  for (const object of body.objects ?? []) {
    putObject({ body: object })
  }
  return json({ payload: snapshot() })
}

function snapshot() {
  return {
    issuer: ISSUER,
    api: API,
    tenants: [...state.tenants.values()],
    persons: [...state.persons.values()].map(({ password: _password, ...person }) => person),
    members: [...state.members.values()],
    clients: [...state.clients.values()].map(({ secret: _secret, ...client }) => client),
    sessions: state.sessions.size,
    subscriptions: [...state.subscriptions.values()].map(({ secret: _secret, ...subscription }) => subscription),
    faults: state.faults,
    log: state.log,
  }
}

function rotateClient({ body }) {
  const client = state.clients.get(body.clientId)
  if (!client) {
    return json({ status: 404, payload: { error: 'unknown_client' } })
  }
  client.secret = body.secret ?? `rotated-${randomBytes(12).toString('hex')}`
  return json({ payload: { clientId: client.clientId, secret: client.secret } })
}

function updateTenant({ body }) {
  const tenant = state.tenants.get(body.code)
  if (!tenant) {
    return json({ status: 404, payload: { error: 'unknown_tenant' } })
  }
  Object.assign(tenant, Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'code')))
  return json({ payload: tenant })
}

async function changeMembership({ body, status, ability }) {
  const member = state.members.get(body.memberId)
  if (!member) {
    return json({ status: 404, payload: { error: 'unknown_member' } })
  }
  member.status = status
  member.removedAt = status === 'REMOVED' ? new Date().toISOString() : null
  if (body.notify === false) {
    return json({ payload: { member, deliveries: [] } })
  }
  const pushed = await deliverEvent({
    tenant: member.tenant,
    type: `iam-identity.member.${ability}`,
    object: { code: 'member', id: member.id },
    id: body.eventId,
    times: body.times,
    tamper: body.tamper,
    includeUnverified: body.includeUnverified,
  })
  return json({ payload: { member, event: pushed.event, deliveries: pushed.deliveries } })
}

function isActiveMember(member) {
  return Boolean(member) && member.status === 'ACTIVE'
}

function authorize({ req, url }) {
  const query = Object.fromEntries(url.searchParams)
  const client = state.clients.get(query.client_id)
  const entry = { at: new Date().toISOString(), clientId: query.client_id ?? null, tenant: query.tenant ?? null, scope: query.scope ?? null, outcome: null }
  state.log.authorize.push(entry)
  if (!client || client.kind !== 'oidc') {
    entry.outcome = 'unknown_client'
    return html({ status: 400, body: page({ title: '无法登录', content: `<p data-testid="iam-error">未知的应用：${escapeHtml(query.client_id ?? '')}</p>` }) })
  }
  if (!query.redirect_uri || (client.redirectUris.length > 0 && !client.redirectUris.includes(query.redirect_uri))) {
    entry.outcome = 'invalid_redirect_uri'
    return html({ status: 400, body: page({ title: '无法登录', content: '<p data-testid="iam-error">回跳地址未登记</p>' }) })
  }
  if (query.response_type !== 'code') {
    entry.outcome = 'unsupported_response_type'
    return redirectError({ query, error: 'unsupported_response_type', description: 'only code is supported' })
  }
  if (!query.code_challenge || query.code_challenge_method !== 'S256') {
    entry.outcome = 'pkce_required'
    return redirectError({ query, error: 'invalid_request', description: 'PKCE with S256 is required' })
  }
  const session = sessionOf({ req })
  if (!session) {
    entry.outcome = 'login_page'
    return html({ body: loginPage({ returnTo: url.pathname + url.search, error: null }) })
  }
  const person = state.persons.get(session.username)
  const requestedTenant = query.tenant ?? (client.acceptsAnyTenant ? null : client.tenant)
  const candidates = [...state.members.values()].filter((member) => member.username === person.username && isActiveMember(member))
  const chosen = requestedTenant ? candidates.filter((member) => member.tenant === requestedTenant) : candidates
  if (chosen.length === 0) {
    entry.outcome = 'no_member'
    return redirectError({ query, error: 'access_denied', description: `${person.username} is not a member of ${requestedTenant ?? 'any tenant'}` })
  }
  if (chosen.length > 1) {
    entry.outcome = 'choose_tenant'
    return html({ body: chooseTenantPage({ url, members: chosen }) })
  }
  const member = chosen[0]
  if (!client.acceptsAnyTenant && member.tenant !== client.tenant) {
    entry.outcome = 'tenant_not_accepted'
    return redirectError({ query, error: 'access_denied', description: `client ${client.clientId} only accepts members of ${client.tenant}` })
  }
  const tenant = state.tenants.get(member.tenant)
  if (!tenant || tenant.status !== 'ACTIVE') {
    entry.outcome = 'tenant_inactive'
    return redirectError({ query, error: 'access_denied', description: `tenant ${member.tenant} is not active` })
  }
  const code = `code-${randomBytes(16).toString('hex')}`
  state.codes.set(code, {
    clientId: client.clientId,
    redirectUri: query.redirect_uri,
    memberId: member.id,
    sid: session.sid,
    authTime: session.authTime,
    scope: query.scope ?? 'openid',
    nonce: query.nonce ?? null,
    codeChallenge: query.code_challenge,
    expiresAt: Date.now() + CODE_TTL_MS,
  })
  entry.outcome = 'code'
  entry.memberId = member.id
  return redirect({ location: withParams({ base: query.redirect_uri, params: { code, ...(query.state ? { state: query.state } : {}), iss: ISSUER } }) })
}

function login({ body }) {
  const returnTo = typeof body.return === 'string' && body.return.startsWith('/iam/oauth2/authorize') ? body.return : null
  const person = state.persons.get(String(body.username ?? '').trim())
  if (!person || person.password !== body.password) {
    return html({ status: 401, body: loginPage({ returnTo: returnTo ?? '', error: '账号或密码不对' }) })
  }
  const sid = `sid-${randomBytes(12).toString('hex')}`
  state.sessions.set(sid, { sid, username: person.username, authTime: Math.floor(Date.now() / 1000) })
  const cookie = `${SESSION_COOKIE}=${sid}; Path=/iam; HttpOnly; SameSite=Lax`
  if (!returnTo) {
    return json({ payload: { ok: true, sid }, headers: { 'set-cookie': cookie } })
  }
  return redirect({ location: returnTo, headers: { 'set-cookie': cookie } })
}

function logout({ req }) {
  const session = sessionOf({ req })
  if (session) {
    state.sessions.delete(session.sid)
  }
  return json({ payload: { ok: true }, headers: { 'set-cookie': `${SESSION_COOKIE}=; Path=/iam; Max-Age=0` } })
}

function token({ req, body }) {
  const credentials = clientCredentialsOf({ req, body })
  const grantType = body.grant_type
  const extras = Object.fromEntries(Object.entries(body).filter(([key]) => !['client_secret', 'code', 'code_verifier', 'refresh_token', 'grant_type', 'client_id'].includes(key)))
  const entry = { at: new Date().toISOString(), grantType: grantType ?? null, clientId: credentials.clientId, authMethod: credentials.method, params: extras, status: null, error: null, memberId: null }
  state.log.token.push(entry)
  const finish = (result) => {
    entry.status = result.status ?? 200
    entry.error = result.payload?.error ?? null
    return result
  }
  const fault = takeFault({ kind: 'token', grantType, clientId: credentials.clientId })
  if (fault) {
    return finish(json({ status: fault.status ?? 503, payload: { error: fault.error ?? 'temporarily_unavailable', error_description: fault.description ?? 'injected fault' } }))
  }
  const client = state.clients.get(credentials.clientId)
  if (!client || client.secret !== credentials.clientSecret) {
    return finish(json({ status: 401, payload: { error: 'invalid_client', error_description: 'client authentication failed' } }))
  }
  if (grantType === 'authorization_code') {
    return finish(exchangeCode({ client, body, entry }))
  }
  if (grantType === 'refresh_token') {
    return finish(refresh({ client, body, entry }))
  }
  if (grantType === 'client_credentials') {
    return finish(clientCredentials({ client, body }))
  }
  return finish(json({ status: 400, payload: { error: 'unsupported_grant_type' } }))
}

function exchangeCode({ client, body, entry }) {
  const grant = state.codes.get(body.code)
  state.codes.delete(body.code)
  if (!grant || grant.expiresAt < Date.now() || grant.clientId !== client.clientId) {
    return json({ status: 400, payload: { error: 'invalid_grant', error_description: 'unknown or expired code' } })
  }
  if (grant.redirectUri !== body.redirect_uri) {
    return json({ status: 400, payload: { error: 'invalid_grant', error_description: 'redirect_uri mismatch' } })
  }
  const challenge = createHash('sha256').update(String(body.code_verifier ?? '')).digest('base64url')
  if (challenge !== grant.codeChallenge) {
    return json({ status: 400, payload: { error: 'invalid_grant', error_description: 'PKCE verification failed' } })
  }
  entry.memberId = grant.memberId
  const refreshToken = `rt-${randomBytes(16).toString('hex')}`
  state.refreshTokens.set(refreshToken, { clientId: client.clientId, memberId: grant.memberId, scope: grant.scope, sid: grant.sid, authTime: grant.authTime })
  return json({ payload: memberTokens({ client, memberId: grant.memberId, scope: grant.scope, sid: grant.sid, authTime: grant.authTime, nonce: grant.nonce, refreshToken }) })
}

function refresh({ client, body, entry }) {
  const grant = state.refreshTokens.get(body.refresh_token)
  if (!grant || grant.clientId !== client.clientId) {
    return json({ status: 400, payload: { error: 'invalid_grant', error_description: 'unknown refresh token' } })
  }
  entry.memberId = grant.memberId
  const member = state.members.get(grant.memberId)
  const tenant = member ? state.tenants.get(member.tenant) : null
  if (!isActiveMember(member) || !tenant || tenant.status !== 'ACTIVE') {
    state.refreshTokens.delete(body.refresh_token)
    return json({ status: 400, payload: { error: 'invalid_grant', error_description: 'member is no longer active in the tenant' } })
  }
  return json({ payload: memberTokens({ client, memberId: grant.memberId, scope: grant.scope, sid: grant.sid, authTime: grant.authTime, nonce: null, refreshToken: body.refresh_token }) })
}

function clientCredentials({ client, body }) {
  if (client.kind !== 'service') {
    return json({ status: 400, payload: { error: 'unauthorized_client', error_description: 'client_credentials is not allowed for this client' } })
  }
  const tenantCode = typeof body.tenant === 'string' && body.tenant.length > 0 ? body.tenant : null
  if (tenantCode) {
    const tenant = state.tenants.get(tenantCode)
    if (!client.acceptsAnyTenant && client.tenant !== tenantCode) {
      return json({ status: 400, payload: { error: 'invalid_target', error_description: `client ${client.clientId} may not act for tenant ${tenantCode} (invalid_target)` } })
    }
    if (!tenant || tenant.status !== 'ACTIVE') {
      return json({ status: 400, payload: { error: 'invalid_target', error_description: `tenant ${tenantCode} is not active (invalid_target)` } })
    }
  }
  const claims = {
    sub: client.clientId,
    sub_type: 'application',
    client_id: client.clientId,
    ...(tenantCode ? { tenantId: tenantCode } : {}),
  }
  const accessToken = issueAccessToken({ claims, audience: client.clientId })
  return json({ payload: { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL_SECONDS } })
}

function memberTokens({ client, memberId, scope, sid, authTime, nonce, refreshToken }) {
  const member = state.members.get(memberId)
  const person = state.persons.get(member.username)
  const scopes = String(scope ?? '').split(/\s+/)
  const base = { sub: memberId, tenantId: member.tenant, sub_type: 'member', sid, auth_time: authTime }
  const accessToken = issueAccessToken({ claims: { ...base, client_id: client.clientId }, audience: client.clientId, scope })
  const idToken = signJwt({
    payload: {
      ...base,
      iss: ISSUER,
      aud: client.clientId,
      azp: client.clientId,
      iat: now(),
      exp: now() + ACCESS_TTL_SECONDS,
      ...(nonce ? { nonce } : {}),
      ...(scopes.includes('profile') ? profileClaims({ person }) : {}),
      ...(scopes.includes('email') ? emailClaims({ person }) : {}),
    },
  })
  return { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL_SECONDS, refresh_token: refreshToken, id_token: idToken, scope }
}

function profileClaims({ person }) {
  return { preferred_username: person.username, name: person.name }
}

function emailClaims({ person }) {
  return person.email && person.emailVerified ? { email: person.email, email_verified: true } : {}
}

function issueAccessToken({ claims, audience, scope = null }) {
  const accessToken = signJwt({ payload: { ...claims, iss: ISSUER, aud: audience, iat: now(), exp: now() + ACCESS_TTL_SECONDS, jti: randomUUID() } })
  state.accessTokens.set(accessToken, { ...claims, scope, expiresAt: Date.now() + ACCESS_TTL_SECONDS * 1000 })
  return accessToken
}

function userinfo({ req }) {
  const grant = bearerOf({ req })
  state.log.userinfo.push({ at: new Date().toISOString(), sub: grant?.sub ?? null })
  if (!grant || grant.sub_type !== 'member') {
    return json({ status: 401, payload: { error: 'invalid_token' } })
  }
  const member = state.members.get(grant.sub)
  if (!isActiveMember(member)) {
    return json({ status: 401, payload: { error: 'invalid_token', error_description: 'member is not active' } })
  }
  const person = state.persons.get(member.username)
  const scopes = String(grant.scope ?? 'openid profile email').split(/\s+/)
  return json({ payload: { sub: member.id, ...(scopes.includes('profile') ? { ...profileClaims({ person }), tenantId: member.tenant } : {}), ...(scopes.includes('email') ? emailClaims({ person }) : {}) } })
}

function createSubscription({ req, body }) {
  const grant = applicationOf({ req })
  if (grant.error) {
    return grant.error
  }
  const entry = { at: new Date().toISOString(), action: 'create', clientId: grant.claims.client_id, tenant: grant.claims.tenantId, code: body.code ?? null, endpoint: body.endpoint ?? null, events: body.events?.value ?? [], outcome: null }
  state.log.subscriptions.push(entry)
  if (body.events !== undefined && !Array.isArray(body.events?.value)) {
    entry.outcome = 'malformed'
    return json({ status: 400, payload: { code: 'FEMA_RUNTIME_REQUEST_BODY_MALFORMED', message: 'events 是列表字段，wire 形状为 {"value":[...]}' } })
  }
  const fault = takeFault({ kind: 'subscription-create', clientId: grant.claims.client_id })
  const events = Array.isArray(body.events?.value) ? body.events.value.map(String) : []
  if (typeof body.code !== 'string' || body.code.length === 0 || body.code.length > 64 || events.length === 0) {
    entry.outcome = 'invalid'
    return json({ status: 400, payload: { code: 'INVALID_ARGUMENT', message: 'code（不超过 64 个字符）与 events 必填' } })
  }
  if (typeof body.endpoint !== 'string' || !/^https?:\/\//.test(body.endpoint)) {
    entry.outcome = 'invalid_endpoint'
    return json({ status: 400, payload: { code: 'INVALID_ARGUMENT', message: '推送地址必须是 http(s) 地址' } })
  }
  const denied = events.find((event) => state.deniedEvents.has(event))
  if (denied) {
    entry.outcome = 'forbidden'
    return json({ status: 403, payload: { code: 'OPERATION_FORBIDDEN', message: `没有读取 ${denied.split('.').slice(0, 2).join('.')} 的权限，收不到 ${denied} 的通知` } })
  }
  const key = `${grant.claims.client_id}|${grant.claims.tenantId}|${body.code}`
  if (state.usedCodes.has(key)) {
    entry.outcome = 'already_exists'
    return json({ status: 409, payload: { code: 'ALREADY_EXISTS', message: `订阅编码 ${body.code} 已被占用` } })
  }
  state.usedCodes.add(key)
  const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const secret = `whsec_${randomBytes(24).toString('hex')}`
  const withheldEvents = events.filter((event) => state.withheldEvents.has(event))
  const subscription = { id, key, code: body.code, endpoint: body.endpoint, events, withheldEvents, tenant: grant.claims.tenantId, clientId: grant.claims.client_id, secret, status: 'PENDING', createdAt: new Date().toISOString(), verification: null }
  state.subscriptions.set(id, subscription)
  entry.outcome = 'created'
  entry.id = id
  setTimeout(() => {
    void verifySubscription({ subscription })
  }, Number(process.env.FEMA_IAM_VERIFY_DELAY_MS ?? 300))
  if (fault) {
    return new Promise((resolve) => setTimeout(() => resolve(json({ status: fault.status ?? 504, payload: { code: 'TIMEOUT', message: 'injected fault after the subscription was saved' } })), fault.delayMs ?? 0))
  }
  return json({ payload: { code: 'SUCCESS', message: null, data: { ...publicSubscription({ subscription }), plainSecret: secret, ...(withheldEvents.length > 0 ? { withheldEvents } : {}) } } })
}

function publicSubscription({ subscription }) {
  const enabled = subscription.status !== 'DISABLED'
  return {
    id: subscription.id,
    code: subscription.code,
    endpoint: subscription.endpoint,
    events: { value: subscription.events },
    status: { '@type': 'SubscriptionStatus', code: enabled ? 'ENABLED' : 'DISABLED', name: enabled ? '启用' : '停用' },
    activatedAt: subscription.activatedAt ?? null,
    createdAt: subscription.createdAt,
  }
}

async function verifySubscription({ subscription }) {
  const challenge = `chl-${randomBytes(8).toString('hex')}`
  const payload = JSON.stringify({ id: `vrf-${randomBytes(6).toString('hex')}`, type: 'webhook.verification', challenge })
  try {
    const response = await fetch(subscription.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fema-signature': signBody({ secret: subscription.secret, payload }) }, body: payload, signal: AbortSignal.timeout(15000) })
    const text = await response.text()
    const echoed = text.includes(challenge)
    subscription.verification = { status: response.status, echoed, body: text.slice(0, 300) }
    if (state.subscriptions.get(subscription.id) === subscription) {
      subscription.status = response.ok && echoed ? 'ACTIVE' : 'UNVERIFIED'
      subscription.activatedAt = response.ok && echoed ? new Date().toISOString() : null
    }
  }
  catch (error) {
    subscription.verification = { status: null, echoed: false, error: String(error?.message ?? error) }
    subscription.status = 'UNVERIFIED'
  }
}

function ownSubscriptions({ claims }) {
  return [...state.subscriptions.values()].filter((subscription) => subscription.clientId === claims.client_id && subscription.tenant === claims.tenantId)
}

function findSubscription({ req, body }) {
  const grant = applicationOf({ req })
  if (grant.error) {
    return grant.error
  }
  const filter = body?.filter
  if (!filter || typeof filter !== 'object' || typeof filter.code !== 'string') {
    state.log.subscriptions.push({ at: new Date().toISOString(), action: 'find-one', clientId: grant.claims.client_id, tenant: grant.claims.tenantId, code: null, bodyKeys: Object.keys(body ?? {}), outcome: 'invalid_query' })
    return json({ status: 400, payload: { code: 'INVALID_ARGUMENT', message: 'find-one 的请求体是查询规格 {"filter":{...}}' } })
  }
  const match = ownSubscriptions({ claims: grant.claims }).find((subscription) => subscription.code === filter.code)
  state.log.subscriptions.push({ at: new Date().toISOString(), action: 'find-one', clientId: grant.claims.client_id, tenant: grant.claims.tenantId, code: filter.code, outcome: match ? 'found' : 'not_found' })
  if (!match) {
    return json({ payload: { code: 'SUCCESS', message: null, data: null } })
  }
  return json({ payload: { code: 'SUCCESS', message: null, data: publicSubscription({ subscription: match }) } })
}

function deleteSubscription({ req, body }) {
  const grant = applicationOf({ req })
  if (grant.error) {
    return grant.error
  }
  const match = ownSubscriptions({ claims: grant.claims }).find((subscription) => subscription.id === String(body.id ?? ''))
  state.log.subscriptions.push({ at: new Date().toISOString(), action: 'delete', clientId: grant.claims.client_id, tenant: grant.claims.tenantId, id: body.id ?? null, bodyKeys: Object.keys(body ?? {}), outcome: match ? 'deleted' : 'not_found' })
  if (!match) {
    return json({ status: 404, payload: { code: 'NOT_FOUND', message: '登记不存在' } })
  }
  state.subscriptions.delete(match.id)
  return json({ payload: { code: 'SUCCESS', message: null, data: publicSubscription({ subscription: match }) } })
}

async function pushBusinessEvent(body) {
  return json({ payload: await deliverEvent({ ...body }) })
}

async function deliverEvent({ tenant, type, object, id, occurredAt, times, tamper, includeUnverified }) {
  const event = {
    id: id ?? `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    type,
    tenantId: tenant,
    occurredAt: occurredAt ?? new Date().toISOString(),
    object: { code: object?.code ?? type.split('.')[1], id: String(object?.id ?? '') },
  }
  const targets = [...state.subscriptions.values()].filter((subscription) => subscription.tenant === tenant && subscription.events.includes(type) && !subscription.withheldEvents.includes(type) && (includeUnverified || subscription.status === 'ACTIVE'))
  const deliveries = []
  for (const subscription of targets) {
    for (let attempt = 0; attempt < (times ?? 1); attempt += 1) {
      const payload = JSON.stringify(event)
      const signature = tamper ? signBody({ secret: 'not-the-secret', payload }) : signBody({ secret: subscription.secret, payload })
      const delivery = { at: new Date().toISOString(), subscription: subscription.id, eventId: event.id, type: event.type, endpoint: subscription.endpoint, tampered: Boolean(tamper), status: null, response: null }
      try {
        const response = await fetch(subscription.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fema-signature': signature, 'x-fema-event-id': event.id, 'x-fema-event-type': event.type }, body: payload, signal: AbortSignal.timeout(15000) })
        delivery.status = response.status
        delivery.response = (await response.text()).slice(0, 300)
      }
      catch (error) {
        delivery.error = String(error?.message ?? error)
      }
      state.log.deliveries.push(delivery)
      deliveries.push(delivery)
    }
  }
  return { event, deliveries }
}

function findMember({ req, id }) {
  const grant = applicationOf({ req })
  if (grant.error) {
    return grant.error
  }
  state.log.api.push({ at: new Date().toISOString(), path: 'iam-identity/member/find-by-id', id, tenant: grant.claims.tenantId })
  const member = state.members.get(id)
  if (!member || member.tenant !== grant.claims.tenantId) {
    return notFound({ message: '成员不存在' })
  }
  const person = state.persons.get(member.username)
  return json({
    payload: {
      code: 'SUCCESS',
      message: null,
      data: {
        id: member.id,
        status: { '@type': 'MemberStatus', code: member.status, name: MEMBER_STATUS_NAMES[member.status] ?? member.status },
        displayName: person?.name ?? member.username,
        removedAt: member.removedAt ?? null,
      },
    },
  })
}

function findAllMembers({ req, body }) {
  const grant = applicationOf({ req })
  if (grant.error) {
    return grant.error
  }
  const page = Number(body.page ?? 1)
  const size = Number(body.size ?? 20)
  state.log.api.push({ at: new Date().toISOString(), path: 'iam-identity/member/find-all', filter: body.filter ?? null, page, size, tenant: grant.claims.tenantId })
  const rows = [...state.members.values()]
    .filter((member) => member.tenant === grant.claims.tenantId)
    .map((member) => memberRow({ member }))
    .filter((row) => memberMatches({ row, filter: body.filter }))
  const items = rows.slice((page - 1) * size, page * size)
  return json({ payload: { code: 'SUCCESS', message: null, data: { items, page, pageSize: size, hasNext: page * size < rows.length, total: rows.length } } })
}

function memberRow({ member }) {
  const person = state.persons.get(member.username)
  return {
    id: member.id,
    userId: member.username,
    status: { '@type': 'MemberStatus', code: member.status, name: MEMBER_STATUS_NAMES[member.status] ?? member.status },
    card: { displayName: person?.name ?? member.username, username: member.username, accountStatus: { code: 'ACTIVE' } },
    removedAt: member.removedAt ?? null,
  }
}

function memberMatches({ row, filter }) {
  if (!filter) {
    return true
  }
  if (filter.id?.in) {
    return filter.id.in.map(String).includes(row.id)
  }
  if (Array.isArray(filter.$or)) {
    return filter.$or.some((condition) => {
      const name = condition['card.displayName']?.like
      const username = condition['card.username']?.like
      return (name && row.card.displayName.includes(name)) || (username && row.card.username.includes(username))
    })
  }
  return true
}

function putObject({ body }) {
  state.objects.set(`${body.tenant}|${body.app}/${body.object}/${body.id}`, body.data)
  return json({ payload: { ok: true } })
}

function findById({ req, app, object, id }) {
  const grant = applicationOf({ req })
  if (grant.error) {
    return grant.error
  }
  state.log.api.push({ at: new Date().toISOString(), path: `${app}/${object}/find-by-id`, id, tenant: grant.claims.tenantId })
  const data = state.objects.get(`${grant.claims.tenantId}|${app}/${object}/${id}`)
  if (data === undefined) {
    return notFound({ message: '对象不存在' })
  }
  return json({ payload: { code: 'SUCCESS', message: null, data } })
}

function notFound({ message }) {
  if (state.notFoundMode === '404') {
    return json({ status: 404, payload: { code: 'NOT_FOUND', message } })
  }
  return json({ payload: { code: 'SUCCESS', message: null, data: null } })
}

function echoApi({ req, url, body, method }) {
  const grant = applicationOf({ req })
  if (grant.error) {
    return grant.error
  }
  const entry = { at: new Date().toISOString(), method, path: url.pathname.slice('/api/'.length), query: Object.fromEntries(url.searchParams), body, tenant: grant.claims.tenantId }
  state.log.api.push(entry)
  return json({ payload: { code: 'SUCCESS', message: null, data: entry } })
}

function applicationOf({ req }) {
  const claims = bearerOf({ req })
  if (!claims) {
    return { error: json({ status: 401, payload: { code: 'UNAUTHORIZED', message: '令牌无效或已过期' } }) }
  }
  if (!claims.tenantId) {
    return { error: json({ status: 403, payload: { code: 'FORBIDDEN', message: '令牌不属于任何租户' } }) }
  }
  return { claims }
}

function bearerOf({ req }) {
  const header = String(req.headers.authorization ?? '')
  if (!header.toLowerCase().startsWith('bearer ')) {
    return null
  }
  const grant = state.accessTokens.get(header.slice(7).trim())
  if (!grant || grant.expiresAt < Date.now()) {
    return null
  }
  return grant
}

function clientCredentialsOf({ req, body }) {
  const header = String(req.headers.authorization ?? '')
  if (header.toLowerCase().startsWith('basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
    const index = decoded.indexOf(':')
    return { clientId: decodeURIComponent(decoded.slice(0, index)), clientSecret: decodeURIComponent(decoded.slice(index + 1)), method: 'client_secret_basic' }
  }
  return { clientId: body.client_id ?? null, clientSecret: body.client_secret ?? null, method: 'client_secret_post' }
}

function takeFault({ kind, grantType, clientId }) {
  const fault = state.faults.find((candidate) => candidate.remaining > 0 && candidate.kind === kind && (!candidate.grantType || candidate.grantType === grantType) && (!candidate.clientId || candidate.clientId === clientId))
  if (!fault) {
    return null
  }
  fault.remaining -= 1
  return fault
}

function sessionOf({ req }) {
  const cookies = String(req.headers.cookie ?? '').split(';').map((part) => part.trim().split('='))
  const sid = cookies.find(([name]) => name === SESSION_COOKIE)?.[1]
  return sid ? state.sessions.get(sid) ?? null : null
}

function signJwt({ payload }) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }))
  const body = base64url(JSON.stringify(payload))
  const signature = cryptoSign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url')
  return `${header}.${body}.${signature}`
}

function signBody({ secret, payload }) {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`
}

function base64url(text) {
  return Buffer.from(text).toString('base64url')
}

function now() {
  return Math.floor(Date.now() / 1000)
}

function redirectError({ query, error, description }) {
  return redirect({ location: withParams({ base: query.redirect_uri, params: { error, error_description: description, ...(query.state ? { state: query.state } : {}), iss: ISSUER } }) })
}

function withParams({ base, params }) {
  const target = new URL(base)
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value)
  }
  return target.toString()
}

function loginPage({ returnTo, error }) {
  return page({
    title: 'FEMA 统一登录',
    content: `
      <form method="post" action="/iam/login" data-testid="iam-login-form">
        <input type="hidden" name="return" value="${escapeHtml(returnTo)}">
        <label>账号 <input id="username" name="username" autocomplete="username"></label>
        <label>密码 <input id="password" name="password" type="password" autocomplete="current-password"></label>
        ${error ? `<p data-testid="iam-error" class="error">${escapeHtml(error)}</p>` : ''}
        <button id="signin" type="submit">登录</button>
      </form>`,
  })
}

function chooseTenantPage({ url, members }) {
  const links = members.map((member) => {
    const target = new URL(url.toString())
    target.searchParams.set('tenant', member.tenant)
    const tenant = state.tenants.get(member.tenant)
    return `<li><a data-testid="iam-tenant-${escapeHtml(member.tenant)}" href="${escapeHtml(target.pathname + target.search)}">${escapeHtml(tenant?.name ?? member.tenant)}</a></li>`
  }).join('')
  return page({ title: '选择以哪家租户的身份登录', content: `<ul>${links}</ul>` })
}

function page({ title, content }) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:360px;margin:64px auto;color:#111}label{display:block;margin:12px 0}input{display:block;width:100%;padding:8px;margin-top:4px}button{padding:8px 16px}.error{color:#b00020}</style>
</head><body><h1>${escapeHtml(title)}</h1>${content}</body></html>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
}

function json({ status = 200, payload, headers = {} }) {
  return { status, payload, headers }
}

function html({ status = 200, body, headers = {} }) {
  return { status, html: body, headers }
}

function redirect({ location, headers = {} }) {
  return { status: 302, headers: { location, ...headers } }
}

function reply({ res, result }) {
  if (result.html !== undefined) {
    res.writeHead(result.status, { 'content-type': 'text/html; charset=utf-8', ...result.headers })
    return res.end(result.html)
  }
  if (result.payload === undefined) {
    res.writeHead(result.status, result.headers)
    return res.end()
  }
  return send({ res, status: result.status, payload: result.payload, headers: result.headers })
}

function send({ res, status, payload, headers = {} }) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers })
  res.end(JSON.stringify(payload))
}

async function readRaw(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

function parseBody({ raw, contentType }) {
  if (raw.length === 0) {
    return {}
  }
  if (String(contentType ?? '').includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw))
  }
  try {
    return JSON.parse(raw)
  }
  catch {
    return {}
  }
}
