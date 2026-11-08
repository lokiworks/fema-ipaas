import { randomUUID } from 'node:crypto'

import { CLIENTS, MEMBERS, TENANTS, provisionBody, seedBody } from './saas-fixtures.mjs'
import {
  ADMIN,
  API,
  ISSUER,
  ROUTES,
  STATE_FILE,
  TOKEN_URL,
  addPlatformMember,
  adminSession,
  api,
  assert,
  check,
  cookieJar,
  http,
  iam,
  iamState,
  issueApiKey,
  platformMembers,
  provision,
  saveState,
  sessionAlive,
  ssoLogin,
  summary,
  waitFor,
} from './saas-kit.mjs'
import { connectorPhase } from './saas-connector.mjs'

const ctx = { admin: null, provisionKey: null, usageKey: null, tenants: {}, sessions: {} }

await iam({ path: '/__control/seed', body: seedBody() })
ctx.admin = await adminSession()

await zeroConfig()
await platform()
await multiTenantEntry()
await loginAndIsolation()
await crossTenant()
await removalByEvent()
if (process.env.SAAS_WITH_WORKER === '1') {
  await connectorPhase({ ctx })
}
saveState({ tenants: ctx.tenants, admin: ADMIN })
process.stdout.write(`state written to ${STATE_FILE}\n`)
if (process.env.SAAS_SKIP_RECHECK !== '1') {
  await removalByRecheck()
}
summary({ name: 'saas-federation' })

async function zeroConfig() {
  await check('Z1 单租户实例：密码登录直接拿到会话，不要求选择租户', async () => {
    const response = await api({ method: 'POST', path: ROUTES.signIn, body: ADMIN })
    assert(response.status === 200, `密码登录应直接成功：${response.status} ${response.text.slice(0, 300)}`)
    assert(typeof response.json?.token === 'string' && response.json.token.length > 0, '应返回会话令牌')
    assert(response.json?.code !== 'TENANT_SELECTION_REQUIRED', '单租户实例不应要求选择租户')
  })

  await check('Z2 单租户实例：未指定租户时登录页仍能取到唯一租户的登录方式，多租户标记为关', async () => {
    const providers = await api({ path: ROUTES.ssoProviders })
    assert(providers.status === 200, `取登录方式失败：${providers.status} ${providers.text.slice(0, 200)}`)
    const flags = await api({ path: ROUTES.flags })
    assert(flags.status === 200, `取标记失败：${flags.status}`)
    const multiTenant = flags.json?.MULTI_TENANT
    assert(multiTenant === undefined || multiTenant === false, `单租户实例 MULTI_TENANT 应为 false，实际 ${JSON.stringify(multiTenant)}`)
  })

  await check('Z3 单租户实例：运营者看到的租户只有一个，迁移把最早租户的属主设为了实例运营者', async () => {
    const tenants = await api({ path: ROUTES.operatorTenants(), token: ctx.admin.token })
    assert(tenants.status === 200, `默认属主应是实例运营者，可列租户：${tenants.status} ${tenants.text.slice(0, 300)}`)
    const rows = tenants.json?.data ?? []
    assert(rows.length === 1, `全新实例应只有 1 个租户，实际 ${rows.length}；请用全新库运行（run.sh 会清库）`)
  })
}

async function platform() {
  await check('P1 运营者签发平台调用方 API 密钥（只返回一次，fpk_ 开头）', async () => {
    ctx.provisionKey = (await issueApiKey({ token: ctx.admin.token, name: 'rental-saas 租户初始化', scopes: ['TENANT_PROVISION', 'TENANT_MEMBERS'] })).secret
    ctx.usageKey = (await issueApiKey({ token: ctx.admin.token, name: '只读用量', scopes: ['USAGE_READ'] })).secret
  })

  await check('P2 平台接口拒绝：不带凭证 401、伪造密钥 401、缺少 TENANT_PROVISION 权限 403', async () => {
    const body = provisionBody({ tenant: TENANTS.alpha, owner: MEMBERS.aliceA, oidcClient: CLIENTS.oidcA, serviceClient: CLIENTS.serviceA })
    const anonymous = await provision({ apiKey: undefined, body })
    assert(anonymous.status === 401, `不带凭证应 401，实际 ${anonymous.status}`)
    const forged = await provision({ apiKey: 'fpk_forged.not-a-real-secret', body })
    assert(forged.status === 401, `伪造密钥应 401，实际 ${forged.status}`)
    const usageOnly = await provision({ apiKey: ctx.usageKey, body })
    assert(usageOnly.status === 403 && usageOnly.json?.code === 'AUTHORIZATION', `只有 USAGE_READ 的密钥开通应 403 AUTHORIZATION，实际 ${usageOnly.status} ${usageOnly.text.slice(0, 200)}`)
    const tenants = await api({ path: ROUTES.operatorTenants(), token: ctx.admin.token })
    assert((tenants.json?.data ?? []).length === 1, '被拒的调用不应建出租户')
  })

  await check('P3 开通甲：建租户、默认项目、OIDC 配置、属主预绑、业务连接；连接换票带 tenant=t_alpha', async () => {
    const before = (await iamState()).log.token.length
    const response = await provision({ apiKey: ctx.provisionKey, body: provisionBody({ tenant: TENANTS.alpha, owner: MEMBERS.aliceA, oidcClient: CLIENTS.oidcA, serviceClient: CLIENTS.serviceA }) })
    assert(response.status === 200 || response.status === 201, `开通甲失败：${response.status} ${response.text.slice(0, 500)}`)
    const result = response.json
    assert(result.created === true, `第一次开通 created 应为 true：${JSON.stringify(result)}`)
    assert(result.ssoStartUrl, `开通了 OIDC 应返回 ssoStartUrl：${JSON.stringify(result)}`)
    assert(result.connections?.length === 1 && result.connections[0].externalId === 'fema', `应建出 1 条 fema 连接：${JSON.stringify(result.connections)}`)
    ctx.tenants.alpha = { ...result, name: TENANTS.alpha.name, code: TENANTS.alpha.code, connectionId: result.connections[0].connectionId }
    assert(result.memberEvents?.subscriptionId && result.memberEvents.endpoint, `开通应为成员事件登记订阅：${JSON.stringify(result.memberEvents)}`)
    assert(new URL(result.memberEvents.endpoint, API).pathname.endsWith(`/v1/federation/members/${result.tenantId}`), `成员事件推送地址不对：${result.memberEvents.endpoint}`)
    await waitMemberSubscription({ subscriptionId: result.memberEvents.subscriptionId })
    const claims = (await iamState()).log.token.slice(before).filter((entry) => entry.grantType === 'client_credentials' && entry.clientId === CLIENTS.serviceA.clientId)
    assert(claims.length > 0, '开通时应以集成服务应用换一次票')
    assert(claims.every((entry) => entry.params.tenant === TENANTS.alpha.code), `换票请求应带 tenant=${TENANTS.alpha.code}：${JSON.stringify(claims.map((entry) => entry.params))}`)
    assert(claims.some((entry) => entry.status === 200), '换票应成功')
  })

  await check('P4 重复开通甲：按外部引用幂等，租户、项目、连接都是同一个', async () => {
    const response = await provision({ apiKey: ctx.provisionKey, body: provisionBody({ tenant: TENANTS.alpha, owner: MEMBERS.aliceA, oidcClient: CLIENTS.oidcA, serviceClient: CLIENTS.serviceA }) })
    assert(response.status === 200 || response.status === 201, `重复开通失败：${response.status} ${response.text.slice(0, 300)}`)
    assert(response.json.created === false, '重复开通 created 应为 false')
    assert(response.json.tenantId === ctx.tenants.alpha.tenantId, '应是同一个租户')
    assert(response.json.projectId === ctx.tenants.alpha.projectId, '应是同一个默认项目')
    assert(response.json.connections[0].connectionId === ctx.tenants.alpha.connectionId, '应是同一条连接')
    const byRef = await api({ path: ROUTES.platformByRef({ issuer: ISSUER, tenantId: TENANTS.alpha.code }), token: ctx.provisionKey })
    assert(byRef.status === 200 && byRef.json.id === ctx.tenants.alpha.tenantId, `按外部引用查回应是甲：${byRef.status} ${byRef.text.slice(0, 200)}`)
  })

  await check('P5 开通乙在连接换票那一步失败（租户已建）→ fema-iam 轮换密钥后重试成功，乙只有一个租户、一条连接', async () => {
    await iam({ path: '/__control/faults', body: { faults: [{ kind: 'token', grantType: 'client_credentials', clientId: CLIENTS.serviceB.clientId, status: 401, error: 'invalid_client', description: 'client secret is not active yet', remaining: 3 }] } })
    const failed = await provision({ apiKey: ctx.provisionKey, body: provisionBody({ tenant: TENANTS.beta, owner: MEMBERS.bobB, oidcClient: CLIENTS.oidcB, serviceClient: CLIENTS.serviceB }) })
    assert(failed.status >= 400, `换票失败时开通应报错（否则说明连接凭据没有被校验）：${failed.status} ${failed.text.slice(0, 300)}`)
    await iam({ path: '/__control/faults', body: { faults: [] } })
    const rotated = await iam({ path: '/__control/clients/rotate', body: { clientId: CLIENTS.serviceB.clientId } })
    const retried = await provision({ apiKey: ctx.provisionKey, body: provisionBody({ tenant: TENANTS.beta, owner: MEMBERS.bobB, oidcClient: CLIENTS.oidcB, serviceClient: CLIENTS.serviceB, serviceSecret: rotated.secret }) })
    assert(retried.status === 200 || retried.status === 201, `重试开通乙失败：${retried.status} ${retried.text.slice(0, 500)}`)
    ctx.tenants.beta = { ...retried.json, name: TENANTS.beta.name, code: TENANTS.beta.code, connectionId: retried.json.connections[0]?.connectionId }
    ctx.serviceBSecret = rotated.secret
    assert(retried.json.memberEvents?.subscriptionId, `重试后应有成员事件订阅：${JSON.stringify(retried.json.memberEvents)}`)
    await waitFor({ what: '乙的成员事件订阅通过验证', timeoutMs: 20000, probe: async () => (await iamState()).subscriptions.some((subscription) => subscription.id === retried.json.memberEvents.subscriptionId && subscription.activatedAt) })
    const again = await provision({ apiKey: ctx.provisionKey, body: provisionBody({ tenant: TENANTS.beta, owner: MEMBERS.bobB, oidcClient: CLIENTS.oidcB, serviceClient: CLIENTS.serviceB, serviceSecret: rotated.secret }) })
    assert(again.status < 300 && again.json.tenantId === ctx.tenants.beta.tenantId && again.json.connections[0].connectionId === ctx.tenants.beta.connectionId, '再次开通应取回同一个乙和同一条连接')
    assert(again.json.memberEvents?.reused === true && again.json.memberEvents.subscriptionId === retried.json.memberEvents.subscriptionId, `再次开通应沿用已生效的成员事件订阅：${JSON.stringify(again.json.memberEvents)}`)
    const betaSubscriptions = (await iamState()).subscriptions.filter((subscription) => subscription.tenant === TENANTS.beta.code && subscription.events.includes('iam-identity.member.remove'))
    assert(betaSubscriptions.length === 1, `乙在 fema 只应有一条成员事件订阅，实际 ${betaSubscriptions.length}`)
    const tenants = (await api({ path: ROUTES.operatorTenants(), token: ctx.admin.token })).json?.data ?? []
    const betas = tenants.filter((tenant) => tenant.externalRef?.tenantId === TENANTS.beta.code)
    assert(betas.length === 1, `乙应只有 1 个租户，实际 ${betas.length}`)
    assert(tenants.length === 3, `实例应有 3 个租户（默认、甲、乙），实际 ${tenants.length}`)
  })

  await check('P6 受信 issuer 的业务应用（fema-iam client_credentials 令牌）可调平台接口，名单外的应用被拒', async () => {
    const created = await api({ method: 'POST', path: ROUTES.operatorPlatformClients, token: ctx.admin.token, body: { kind: 'TRUSTED_ISSUER', name: 'fema-iam 平台应用', issuer: ISSUER, allowedSubjects: [CLIENTS.platform.clientId], scopes: ['TENANT_PROVISION', 'TENANT_MEMBERS'] } })
    assert(created.status < 300, `登记受信 issuer 失败：${created.status} ${created.text.slice(0, 300)}`)
    const allowed = await clientCredentialsToken({ client: CLIENTS.platform })
    const read = await api({ path: ROUTES.platformByRef({ issuer: ISSUER, tenantId: TENANTS.alpha.code }), token: allowed })
    assert(read.status === 200 && read.json.id === ctx.tenants.alpha.tenantId, `名单内的应用应能读：${read.status} ${read.text.slice(0, 300)}`)
    const outsider = await clientCredentialsToken({ client: CLIENTS.serviceA, tenant: TENANTS.alpha.code })
    const refused = await api({ path: ROUTES.platformByRef({ issuer: ISSUER, tenantId: TENANTS.alpha.code }), token: outsider })
    assert(refused.status === 401 || refused.status === 403, `名单外的应用应被拒：${refused.status}`)
  })
}

async function multiTenantEntry() {
  await check('M1 多租户后：未指定租户的登录起点不再落到最早的租户，密码登录的单租户账号仍直接进入', async () => {
    const start = await http({ url: `${API}${ROUTES.ssoStart}?provider=OIDC` })
    assert(start.status === 302, `应重定向：${start.status}`)
    assert(!String(start.location).startsWith(ISSUER), `未指定租户时不应把人送去任何一家的身份源：${start.location}`)
    const providers = await api({ path: ROUTES.ssoProviders })
    assert(providers.status === 200 && (providers.json?.providers ?? []).length === 0, `未指定租户时不应返回某家的登录方式：${providers.text.slice(0, 200)}`)
    const signIn = await api({ method: 'POST', path: ROUTES.signIn, body: ADMIN })
    assert(signIn.status === 200 && signIn.json?.token, `只属于一个租户的账号应直接登录：${signIn.status} ${signIn.text.slice(0, 200)}`)
    const flags = await api({ path: ROUTES.flags })
    assert(flags.json?.MULTI_TENANT === true, `MULTI_TENANT 应为 true，实际 ${JSON.stringify(flags.json?.MULTI_TENANT)}`)
  })
}

async function loginAndIsolation() {
  await check('L1 甲属主经 fema-iam 登录甲：登录页 → 签码 → 进入甲；只看到甲的租户与项目，读不到乙', async () => {
    assert(ctx.tenants.alpha, '前置：甲未开通')
    const result = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'alice' })
    assert(result.ok, `甲属主登录失败：${result.code} ${result.detail ?? ''}\n${result.trail.join('\n')}`)
    assert(result.sawLoginPage, '第一次应看到 fema-iam 登录页')
    assert(new URL(result.authorizeUrl).searchParams.get('tenant') === TENANTS.alpha.code, `授权请求应带 tenant=${TENANTS.alpha.code}：${result.authorizeUrl}`)
    ctx.sessions.alice = result
    await assertOnlyOwnTenant({ token: result.token, own: ctx.tenants.alpha, other: ctx.tenants.beta, session: result.session })
  })

  await check('L2 乙属主登录乙：只看到乙；与甲属主是不同的用户', async () => {
    const result = await ssoLogin({ startUrl: ctx.tenants.beta.ssoStartUrl, username: 'bob' })
    assert(result.ok, `乙属主登录失败：${result.code} ${result.detail ?? ''}\n${result.trail.join('\n')}`)
    ctx.sessions.bob = result
    await assertOnlyOwnTenant({ token: result.token, own: ctx.tenants.beta, other: ctx.tenants.alpha, session: result.session })
    assert(result.session.id !== ctx.sessions.alice.session.id, '甲乙属主应是不同用户')
    const connections = await api({ path: ROUTES.connections(ctx.tenants.beta.projectId), token: result.token })
    assert(connections.status === 200, `列乙的连接失败：${connections.status} ${connections.text.slice(0, 200)}`)
    const femaConnections = (connections.json?.data ?? []).filter((connection) => connection.externalId === 'fema')
    assert(femaConnections.length === 1, `乙在失败重试后应只有 1 条 fema 连接，实际 ${femaConnections.length}`)
  })

  await check('L3 同一个人在两家各有成员：已登录 fema-iam 时第二家直接签码，在 iPaaS 是两个用户', async () => {
    for (const [tenant, member] of [[ctx.tenants.alpha, MEMBERS.carolA], [ctx.tenants.beta, MEMBERS.carolB]]) {
      await addPlatformMember({ apiKey: ctx.provisionKey, tenantId: tenant.tenantId, member: { subject: member.id, firstName: 'Carol', role: 'MEMBER' } })
    }
    const jar = cookieJar()
    const first = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'carol', jar })
    assert(first.ok && first.sawLoginPage, `Carol 登录甲失败：${first.code}\n${first.trail.join('\n')}`)
    const second = await ssoLogin({ startUrl: ctx.tenants.beta.ssoStartUrl, username: 'carol', jar })
    assert(second.ok, `Carol 登录乙失败：${second.code}\n${second.trail.join('\n')}`)
    assert(!second.sawLoginPage, '已有 fema-iam 会话时第二家应直接签码，不再出登录页')
    assert(first.session.id !== second.session.id, '两家的 Carol 应是两个 iPaaS 用户')
    assert(first.session.tenantId === ctx.tenants.alpha.tenantId && second.session.tenantId === ctx.tenants.beta.tenantId, '两个会话应各自落在自家租户')
  })

  await check('L4 只有手机号的成员（无邮箱）经平台接口加为成员后能登录，账号邮箱为空', async () => {
    await addPlatformMember({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId, member: { subject: MEMBERS.patA.id, phone: '+8613800000001', firstName: 'Pat', role: 'MEMBER' } })
    const result = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'pat' })
    assert(result.ok, `只有手机号的成员登录失败：${result.code} ${result.detail ?? ''}\n${result.trail.join('\n')}`)
    assert(!result.session.email, `账号邮箱应为空，实际 ${result.session.email}`)
    assert(result.session.tenantId === ctx.tenants.alpha.tenantId, '应进入甲')
    const members = await platformMembers({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId })
    const pat = members.find((member) => member.subject === MEMBERS.patA.id)
    assert(pat && pat.status === 'ACTIVE' && pat.userId, `平台成员列表里 Pat 应为 ACTIVE 且已绑定用户：${JSON.stringify(pat)}`)
  })

  await check('L5 邮箱未验证的成员能登录，但未验证的邮箱不会被当作账号邮箱', async () => {
    await addPlatformMember({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId, member: { subject: MEMBERS.umaA.id, firstName: 'Uma', role: 'MEMBER' } })
    const result = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'uma' })
    assert(result.ok, `邮箱未验证的成员登录失败：${result.code}\n${result.trail.join('\n')}`)
    assert(!result.session.email, `未验证邮箱不应出现在账号上，实际 ${result.session.email}`)
  })

  await check('L6 甲家没被邀请的成员登录被拒（开通的配置不自动建用户），且不会建出用户', async () => {
    const result = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'gina' })
    assert(!result.ok, '未受邀成员不应登录成功')
    const members = await platformMembers({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId })
    assert(!members.some((member) => member.subject === MEMBERS.ginaA.id), '不应为未受邀成员建用户或绑定')
  })
}

async function crossTenant() {
  await check('X1 乙家成员用甲家入口登录被拒：fema-iam 的租户范围检查不签码，iPaaS 不建用户', async () => {
    const before = (await iamState()).log.authorize.length
    const result = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'dave' })
    assert(!result.ok, `乙家成员不应进入甲：${result.trail.join('\n')}`)
    const outcomes = (await iamState()).log.authorize.slice(before).map((entry) => entry.outcome)
    assert(outcomes.includes('no_member') || outcomes.includes('tenant_not_accepted'), `fema-iam 应拒绝签码：${outcomes.join(',')}`)
    const members = await platformMembers({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId })
    assert(!members.some((member) => member.subject === MEMBERS.daveB.id), '甲里不应出现乙家成员')
  })

  await check('X2 乙家成员把授权请求改成 tenant=t_beta 仍被拒：甲的客户端只接纳甲的成员', async () => {
    const before = (await iamState()).log.authorize.length
    const result = await ssoLogin({
      startUrl: ctx.tenants.alpha.ssoStartUrl,
      username: 'dave',
      tamperAuthorize: (url) => {
        url.searchParams.set('tenant', TENANTS.beta.code)
        return url
      },
    })
    assert(!result.ok, '篡改租户参数后也不应进入甲')
    const outcomes = (await iamState()).log.authorize.slice(before).map((entry) => entry.outcome)
    assert(outcomes.includes('tenant_not_accepted'), `应被客户端的租户范围检查拒绝：${outcomes.join(',')}`)
  })

  await check('X3 甲的集成服务应用带乙的 tenant 换票返回 invalid_target；在甲里建这样的连接失败', async () => {
    const direct = await http({ method: 'POST', url: TOKEN_URL, form: { grant_type: 'client_credentials', client_id: CLIENTS.serviceA.clientId, client_secret: CLIENTS.serviceA.secret, tenant: TENANTS.beta.code } })
    assert(direct.status === 400 && direct.json?.error === 'invalid_target', `直接换票应 invalid_target：${direct.status} ${direct.text}`)
    const before = (await iamState()).log.token.length
    const created = await api({
      method: 'POST',
      path: ROUTES.createConnection,
      token: ctx.sessions.alice.token,
      body: {
        projectId: ctx.tenants.alpha.projectId,
        externalId: `fema-cross-${randomUUID().slice(0, 8)}`,
        displayName: '越权连接',
        connectorName: '@fema-ipaas/connector-fema',
        type: 'OAUTH2',
        value: {
          type: 'OAUTH2',
          client_id: CLIENTS.serviceA.clientId,
          client_secret: CLIENTS.serviceA.secret,
          code: 'FAKE_CODE',
          scope: '',
          grant_type: 'client_credentials',
          redirect_url: `${API}/v1/connections/oauth2/callback`,
          props: { tokenUrl: TOKEN_URL, apiUrl: `${ISSUER.replace(/\/iam$/, '')}/api`, tenant: TENANTS.beta.code },
        },
      },
    })
    assert(created.status >= 400, `带乙的 tenant 建连接应失败：${created.status} ${created.text.slice(0, 300)}`)
    const attempts = (await iamState()).log.token.slice(before).filter((entry) => entry.clientId === CLIENTS.serviceA.clientId)
    assert(attempts.some((entry) => entry.params.tenant === TENANTS.beta.code && entry.error === 'invalid_target'), `fema-iam 应以 invalid_target 拒绝这次换票：${JSON.stringify(attempts)}`)
  })
}

async function removalByEvent() {
  await check('R1 成员在 fema-iam 被停用（事件路径）：签名推送送达后读成员详情，会话立即失效；恢复正常后能再登录', async () => {
    await addPlatformMember({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId, member: { subject: MEMBERS.erinA.id, firstName: 'Erin', role: 'MEMBER' } })
    const login = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'erin' })
    assert(login.ok, `Erin 登录失败：${login.code}\n${login.trail.join('\n')}`)
    assert(await sessionAlive({ token: login.token }), '停用前会话应有效')
    const suspended = await iam({ path: '/__control/members/suspend', body: { memberId: MEMBERS.erinA.id } })
    assertDelivered({ result: suspended, what: '停用事件' })
    ctx.erinSuspendEventId = suspended.event.id
    await waitFor({ what: 'Erin 的会话失效', timeoutMs: 30000, probe: async () => !(await sessionAlive({ token: login.token })) })
    await waitMemberStatus({ subject: MEMBERS.erinA.id, active: false })
    assert(memberReads({ state: await iamState(), subject: MEMBERS.erinA.id }) > 0, '收到推送后应读一次成员详情')
    const activated = await iam({ path: '/__control/members/activate', body: { memberId: MEMBERS.erinA.id } })
    assertDelivered({ result: activated, what: '恢复事件' })
    await waitMemberStatus({ subject: MEMBERS.erinA.id, active: true })
    const again = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'erin' })
    assert(again.ok, `恢复后应能再登录：${again.code}`)
  })

  await check('R2 成员被移出（事件路径）：会话失效、不能再登录；fema 找回成员后自动恢复', async () => {
    const login = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'erin' })
    assert(login.ok, `Erin 登录失败：${login.code}`)
    const removed = await iam({ path: '/__control/members/remove', body: { memberId: MEMBERS.erinA.id } })
    assertDelivered({ result: removed, what: '移出事件' })
    await waitFor({ what: 'Erin 的会话失效', timeoutMs: 30000, probe: async () => !(await sessionAlive({ token: login.token })) })
    await waitMemberStatus({ subject: MEMBERS.erinA.id, active: false })
    const blocked = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'erin' })
    assert(!blocked.ok, '被移出的成员不应能登录')
    const restored = await iam({ path: '/__control/members/restore', body: { memberId: MEMBERS.erinA.id } })
    assertDelivered({ result: restored, what: '找回事件' })
    await waitMemberStatus({ subject: MEMBERS.erinA.id, active: true })
  })

  await check('R3 乱序：成员当前是停用，却先收到「恢复」再收到「停用」——按读到的当前状态处理，始终停用', async () => {
    await addPlatformMember({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId, member: { subject: MEMBERS.hankA.id, firstName: 'Hank', role: 'MEMBER' } })
    const login = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'hank' })
    assert(login.ok, `Hank 登录失败：${login.code}`)
    await iam({ path: '/__control/members/suspend', body: { memberId: MEMBERS.hankA.id, notify: false } })
    const late = await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: 'iam-identity.member.activate', object: { code: 'member', id: MEMBERS.hankA.id } } })
    assertDelivered({ result: late, what: '迟到的恢复事件' })
    await waitFor({ what: 'Hank 的会话因读到停用而失效', timeoutMs: 30000, probe: async () => !(await sessionAlive({ token: login.token })) })
    const suspended = await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: 'iam-identity.member.suspend', object: { code: 'member', id: MEMBERS.hankA.id } } })
    assertDelivered({ result: suspended, what: '停用事件' })
    await waitMemberStatus({ subject: MEMBERS.hankA.id, active: false })
  })

  await check('R4 签名错误、跨租户、重复事件：签名不对的不生效；同一事件 id 重复送达只处理一次', async () => {
    const forged = await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: 'iam-identity.member.suspend', object: { code: 'member', id: MEMBERS.aliceA.id }, tamper: true } })
    assert(forged.deliveries.length === 1, '伪造推送应送达 iPaaS')
    await new Promise((resolve) => setTimeout(resolve, 3000))
    assert(await sessionAlive({ token: ctx.sessions.alice.token }), `签名不对的停用事件不应让甲属主掉线（iPaaS 应答 ${forged.deliveries[0].status}）`)
    const raw = JSON.stringify({ id: `cross-${randomUUID()}`, type: 'iam-identity.member.suspend', tenantId: TENANTS.beta.code, occurredAt: new Date().toISOString(), object: { code: 'member', id: MEMBERS.aliceA.id } })
    const foreign = await http({ method: 'POST', url: absolute(ctx.tenants.alpha.memberEvents.endpoint), body: raw, headers: { 'x-fema-signature': 'sha256=0000' } })
    assert(foreign.status < 500, `跨租户的伪造推送不应让 iPaaS 出错：${foreign.status}`)
    assert(await sessionAlive({ token: ctx.sessions.alice.token }), '跨租户推送不应生效')
    const before = memberReads({ state: await iamState(), subject: MEMBERS.erinA.id })
    const twice = await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: 'iam-identity.member.restore', id: `dup-${randomUUID()}`, object: { code: 'member', id: MEMBERS.erinA.id }, times: 3 } })
    assert(twice.deliveries.length === 3 && twice.deliveries.every((delivery) => delivery.status < 300), `重复送达都应被接受：${JSON.stringify(twice.deliveries.map((delivery) => delivery.status))}`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const reads = memberReads({ state: await iamState(), subject: MEMBERS.erinA.id }) - before
    assert(reads <= 1, `同一事件重复送达应只处理一次（读成员详情 ${reads} 次）`)
  })

  await check('R5a 成员在 fema 已查不到（find-by-id 返回 SUCCESS + data:null，或切到 404 NOT_FOUND）时按已移出处理，两种应答都停用', async () => {
    for (const [member, username, mode] of [[MEMBERS.umaA, 'uma', 'null'], [MEMBERS.patA, 'pat', '404']]) {
      const login = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username })
      assert(login.ok, `${username} 登录失败：${login.code}`)
      await iam({ path: '/__control/not-found-mode', body: { mode } })
      try {
        const removed = await iam({ path: '/__control/members/remove', body: { memberId: member.id, notify: false } })
        assert(removed.member, '模拟服务里应有这个成员')
        await iam({ path: '/__control/members/forget', body: { memberId: member.id } })
        const pushed = await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: 'iam-identity.member.remove', object: { code: 'member', id: member.id } } })
        assertDelivered({ result: pushed, what: `${username} 的移出事件（${mode} 模式）` })
        await waitFor({ what: `${username} 的会话失效（${mode} 模式）`, timeoutMs: 30000, probe: async () => !(await sessionAlive({ token: login.token })) })
        await waitMemberStatus({ subject: member.id, active: false })
      }
      finally {
        await iam({ path: '/__control/not-found-mode', body: { mode: 'null' } })
      }
    }
  })

  await check('R5 管理员在 iPaaS 手动停用的成员，不会被 fema 的「恢复」事件重新启用', async () => {
    await addPlatformMember({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId, member: { subject: MEMBERS.ottoA.id, firstName: 'Otto', role: 'MEMBER' } })
    const login = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'otto' })
    assert(login.ok, `Otto 登录失败：${login.code}`)
    const disabled = await api({ method: 'POST', path: `/v1/tenant-access/members/${login.session.id}/disable`, token: ctx.sessions.alice.token })
    assert(disabled.status === 200, `管理员停用失败：${disabled.status} ${disabled.text.slice(0, 200)}`)
    const activated = await iam({ path: '/__control/members/activate', body: { memberId: MEMBERS.ottoA.id } })
    assertDelivered({ result: activated, what: '恢复事件' })
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const members = await platformMembers({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId })
    const otto = members.find((member) => member.subject === MEMBERS.ottoA.id)
    assert(otto && otto.status !== 'ACTIVE', `管理员手动停用的不应被事件恢复：${JSON.stringify(otto)}`)
    const relogin = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'otto' })
    assert(!relogin.ok, '管理员手动停用的成员经 fema-iam 登录也不应恢复')
  })
}

async function removalByRecheck() {
  await check('R6 成员被移出但没有事件（复核路径，开通时把复核间隔设为 5 分钟）：iPaaS 定期用刷新令牌复核，收到 invalid_grant 后会话失效', async () => {
    await addPlatformMember({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId, member: { subject: MEMBERS.frankA.id, firstName: 'Frank', role: 'MEMBER' } })
    const login = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'frank' })
    assert(login.ok, `Frank 登录失败：${login.code}\n${login.trail.join('\n')}`)
    await iam({ path: '/__control/members/remove', body: { memberId: MEMBERS.frankA.id, notify: false } })
    assert(await sessionAlive({ token: login.token }), '没有事件时会话暂时仍有效（等待复核）')
    const timeoutMs = Number(process.env.SAAS_RECHECK_TIMEOUT_MS ?? 12 * 60 * 1000)
    await waitFor({ what: 'Frank 的会话经复核失效', timeoutMs, intervalMs: 15000, probe: async () => !(await sessionAlive({ token: login.token })) })
    const refreshes = (await iamState()).log.token.filter((entry) => entry.grantType === 'refresh_token' && entry.memberId === MEMBERS.frankA.id)
    assert(refreshes.some((entry) => entry.error === 'invalid_grant'), `应看到对 Frank 的刷新复核并得到 invalid_grant：${JSON.stringify(refreshes)}`)
    assert(await sessionAlive({ token: ctx.sessions.alice.token }), '复核不应影响仍在租户里的成员')
  })

  await check('R7 因复核被停用的成员，在 fema 恢复后再次经 fema-iam 登录成功即恢复', async () => {
    await iam({ path: '/__control/members/restore', body: { memberId: MEMBERS.frankA.id, notify: false } })
    const login = await ssoLogin({ startUrl: ctx.tenants.alpha.ssoStartUrl, username: 'frank' })
    assert(login.ok, `复核停用后再次登录应成功并恢复：${login.code} ${login.detail ?? ''}`)
    await waitMemberStatus({ subject: MEMBERS.frankA.id, active: true })
  })
}

async function assertOnlyOwnTenant({ token, own, other, session }) {
  assert(other, '前置：另一家未开通，无法验证隔离')
  assert(session.tenantId === own.tenantId, `会话应落在 ${own.name}：${session.tenantId}`)
  const tenants = await api({ path: ROUTES.myTenants, token })
  assert(tenants.status === 200, `列我的租户失败：${tenants.status} ${tenants.text.slice(0, 200)}`)
  const names = tenants.json.map((entry) => entry.tenantName)
  assert(names.length === 1 && names[0] === own.name, `只应看到自家租户：${JSON.stringify(names)}`)
  const projects = await api({ path: ROUTES.projects, token })
  assert(projects.status === 200, `列项目失败：${projects.status}`)
  const rows = projects.json.data ?? []
  assert(rows.some((project) => project.id === own.projectId), '应看到开通建的默认项目')
  assert(rows.every((project) => project.tenantId === own.tenantId), `项目都应属于自家租户：${JSON.stringify(rows.map((project) => project.tenantId))}`)
  assert(!rows.some((project) => project.id === other.projectId), '不应看到别家的项目')
  const otherTenant = await api({ path: ROUTES.tenantById(other.tenantId), token })
  assert([401, 403, 404].includes(otherTenant.status), `读别家租户应被拒：${otherTenant.status}`)
  const otherWorkflows = await api({ path: ROUTES.workflows(other.projectId), token })
  assert([401, 403, 404].includes(otherWorkflows.status), `读别家项目的工作流应被拒：${otherWorkflows.status}`)
}

async function clientCredentialsToken({ client, tenant }) {
  const response = await http({ method: 'POST', url: TOKEN_URL, form: { grant_type: 'client_credentials', client_id: client.clientId, client_secret: client.secret, ...(tenant ? { tenant } : {}) } })
  assert(response.status === 200, `换票失败：${response.status} ${response.text}`)
  return response.json.access_token
}

async function waitMemberSubscription({ subscriptionId }) {
  return waitFor({
    what: `成员事件订阅 ${subscriptionId} 生效`,
    timeoutMs: 30000,
    probe: async () => (await iamState()).subscriptions.find((subscription) => subscription.id === subscriptionId && subscription.status === 'ACTIVE'),
  })
}

async function waitMemberStatus({ subject, active }) {
  return waitFor({
    what: `成员 ${subject} 变为${active ? '在用' : '停用'}`,
    timeoutMs: 30000,
    probe: async () => {
      const members = await platformMembers({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.alpha.tenantId })
      const member = members.find((entry) => entry.subject === subject)
      return member && (member.status === 'ACTIVE') === active ? member : null
    },
  })
}

function assertDelivered({ result, what }) {
  assert(result.deliveries?.length === 1 && result.deliveries[0].status < 300, `${what}应被 iPaaS 接受：${JSON.stringify(result.deliveries)}`)
}

function memberReads({ state, subject }) {
  return state.log.api.filter((entry) => entry.path === 'iam-identity/member/find-by-id' && entry.id === subject).length
}

function absolute(url) {
  return new URL(url, API).toString()
}
