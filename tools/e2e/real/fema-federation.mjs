import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import {
  API,
  ROUTES,
  WEB,
  addPlatformMember,
  adminSession,
  api,
  assert,
  check,
  cookieJar,
  http,
  issueApiKey,
  provision,
  sessionAlive,
  summary,
  waitFor,
} from '../scenarios/saas/saas-kit.mjs'

const FIXTURES = JSON.parse(readFileSync(process.env.E2E_FEMA_REAL_FIXTURES ?? '/srv/dev/tmp/loki/fema-real/fixtures.json', 'utf8'))
const ISSUER = FIXTURES.issuer
const IAM_ORIGIN = new URL(FIXTURES.oidc.authorize).origin
const FEMA_API = FIXTURES.apiBase
const TOKEN_URL = FIXTURES.oidc.token
const IAM_LOG = FIXTURES.processes.logs.replace(/<[^>]+>/, 'iam')
const CONSOLE = { clientId: 'iam-console', redirectUri: FIXTURES.scriptedLogin.console.redirectUri }
const EVENT_TYPE = 'work-task.task-instance.create'
const { tenants: TENANTS, members: MEMBERS, applications: APPS } = FIXTURES

assert(WEB.startsWith('https://'), `ipaas 的对外地址必须是 fema 能推送的 https 地址，当前 SAAS_WEB_URL=${WEB}`)
assert(!/127\.0\.0\.1:193\d\d/.test(ISSUER), '这是真 fema 联调，不能指向模拟服务')

const ctx = { tenants: {}, sessions: {} }

await check('RF0 前置：联调用的 fema 成员处于正常状态（上一轮中断时可能停在停用或已移出）', async () => {
  const admin = await femaUserToken({ credentials: passwordOf({ member: MEMBERS.ownerJia, tenant: 'jia' }) })
  await ensureMemberActive({ token: admin, memberId: MEMBERS.shared.memberIdJia })
})

await check('RF1 开通甲：用 fema-iam 登记的两个应用建租户、OIDC、连接，成员事件订阅在 fema 生效', async () => {
  ctx.admin = await adminSession()
  ctx.provisionKey = (await issueApiKey({ token: ctx.admin.token, name: `real-fema-${Date.now()}`, scopes: ['TENANT_PROVISION', 'TENANT_MEMBERS', 'USAGE_READ'] })).secret
  ctx.tenants.jia = await provisionTenant({ key: 'jia', owner: MEMBERS.ownerJia, login: APPS.loginJia, service: APPS.serviceJia })
})

await check('RF2 开通乙：同上，与甲互不相干', async () => {
  ctx.tenants.yi = await provisionTenant({ key: 'yi', owner: MEMBERS.ownerYi, login: APPS.loginYi, service: APPS.serviceYi })
  assert(ctx.tenants.yi.tenantId !== ctx.tenants.jia.tenantId, '甲乙应是两个 ipaas 租户')
})

await check('RF3 甲属主经真 fema-iam 登录甲：只看到甲的租户与项目', async () => {
  const result = await ipaasLogin({ tenant: ctx.tenants.jia, credentials: passwordOf({ member: MEMBERS.ownerJia, tenant: 'jia' }) })
  assert(result.ok, `甲属主登录失败：${result.code}\n${result.trail.join('\n')}`)
  ctx.sessions.ownerJia = result
  await expectOnlyTenant({ session: result, tenant: ctx.tenants.jia, name: TENANTS.jia.name })
})

await check('RF4 乙属主登录乙：只看到乙，和甲属主是不同的用户', async () => {
  const result = await ipaasLogin({ tenant: ctx.tenants.yi, credentials: passwordOf({ member: MEMBERS.ownerYi, tenant: 'yi' }) })
  assert(result.ok, `乙属主登录失败：${result.code}\n${result.trail.join('\n')}`)
  await expectOnlyTenant({ session: result, tenant: ctx.tenants.yi, name: TENANTS.yi.name })
  assert(result.session.id !== ctx.sessions.ownerJia.session.id, '两家属主应是不同的用户')
})

await check('RF5 只有手机号的成员被邀请后，用短信一次性码登录甲，账号邮箱为空', async () => {
  await addPlatformMember({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.jia.tenantId, member: { subject: MEMBERS.phoneOnly.memberId, phone: MEMBERS.phoneOnly.phone, firstName: 'Phone', role: 'MEMBER' } })
  const result = await ipaasLogin({ tenant: ctx.tenants.jia, credentials: { kind: 'otp', phone: MEMBERS.phoneOnly.phone, tenant: 'jia' } })
  assert(result.ok, `只有手机号的成员登录失败：${result.code}\n${result.trail.join('\n')}`)
  assert(!result.session.email, `账号邮箱应为空：${result.session.email}`)
})

await check('RF6 甲家没被邀请的成员登录被拒，ipaas 里不建用户', async () => {
  const result = await ipaasLogin({ tenant: ctx.tenants.jia, credentials: passwordOf({ member: MEMBERS.notInvited, tenant: 'jia' }) })
  assert(!result.ok, `没被邀请的成员不应登进来：${result.trail.join('\n')}`)
})

await check('RF7 乙属主用甲的入口登录被拒：甲的客户端只接纳甲的成员', async () => {
  const result = await ipaasLogin({ tenant: ctx.tenants.jia, credentials: passwordOf({ member: MEMBERS.ownerYi, tenant: 'jia' }) })
  assert(!result.ok, `乙属主不应登进甲：${result.trail.join('\n')}`)
})

await check('RF8 同一个人在甲乙各有成员：已登录 fema-iam 时第二家直接签码，在 ipaas 是两个用户', async () => {
  await addPlatformMember({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.jia.tenantId, member: { subject: MEMBERS.shared.memberIdJia, firstName: 'Shared', role: 'MEMBER' } })
  await addPlatformMember({ apiKey: ctx.provisionKey, tenantId: ctx.tenants.yi.tenantId, member: { subject: MEMBERS.shared.memberIdYi, firstName: 'Shared', role: 'MEMBER' } })
  const jar = cookieJar()
  const first = await ipaasLogin({ tenant: ctx.tenants.jia, credentials: passwordOf({ member: MEMBERS.shared, tenant: 'jia' }), jar })
  assert(first.ok, `第一家登录失败：${first.code}\n${first.trail.join('\n')}`)
  const second = await ipaasLogin({ tenant: ctx.tenants.yi, credentials: passwordOf({ member: MEMBERS.shared, tenant: 'yi' }), jar })
  assert(second.ok, `第二家登录失败：${second.code}\n${second.trail.join('\n')}`)
  assert(!second.sawLoginPage, '已登录 fema-iam 时第二家不应再出登录页')
  assert(first.session.id !== second.session.id, '在 ipaas 应是两个用户')
  ctx.sessions.sharedJia = first
})

await check('RF9 甲的集成服务应用带乙的租户编码换票被拒（invalid_target），在甲里建这样的连接失败', async () => {
  const direct = await serviceTokenResponse({ app: APPS.serviceJia, tenant: 'yi' })
  assert(direct.status === 400 && direct.json?.error === 'invalid_target', `直接换票应 invalid_target：${direct.status} ${direct.text.slice(0, 200)}`)
  const created = await api({
    method: 'POST',
    path: ROUTES.createConnection,
    token: ctx.sessions.ownerJia.token,
    body: {
      projectId: ctx.tenants.jia.projectId,
      externalId: `fema-cross-${randomUUID().slice(0, 8)}`,
      displayName: '越权连接',
      connectorName: '@fema-ipaas/connector-fema',
      type: 'OAUTH2',
      value: {
        type: 'OAUTH2',
        client_id: APPS.serviceJia.clientId,
        client_secret: APPS.serviceJia.plainSecret,
        code: 'FAKE_CODE',
        scope: '',
        grant_type: 'client_credentials',
        redirect_url: `${API}/v1/connections/oauth2/callback`,
        props: { tokenUrl: TOKEN_URL, apiUrl: FEMA_API, tenant: TENANTS.yi.code },
      },
    },
  })
  assert(created.status >= 400, `带乙的编码建连接应失败：${created.status} ${created.text.slice(0, 300)}`)
})

await check('RF10 在 fema 停用成员：签名推送送达，ipaas 会话失效；恢复后能再登录', async () => {
  const session = ctx.sessions.sharedJia
  assert(session, '前置：RF8 未登录')
  const admin = await femaUserToken({ credentials: passwordOf({ member: MEMBERS.ownerJia, tenant: 'jia' }) })
  await femaCall({ token: admin, path: FIXTURES.memberLifecycle.suspend.url, body: { id: MEMBERS.shared.memberIdJia } })
  await waitFor({ what: '停用后 ipaas 会话失效', timeoutMs: 120000, intervalMs: 2000, probe: async () => !(await sessionAlive({ token: session.token })) })
  const refused = await ipaasLogin({ tenant: ctx.tenants.jia, credentials: passwordOf({ member: MEMBERS.shared, tenant: 'jia' }) })
  assert(!refused.ok, '停用期间不应登进来')
  await femaCall({ token: admin, path: FIXTURES.memberLifecycle.activate.url, body: { id: MEMBERS.shared.memberIdJia } })
  const back = await waitFor({
    what: '恢复后能再登录',
    timeoutMs: 120000,
    intervalMs: 3000,
    probe: async () => {
      const attempt = await ipaasLogin({ tenant: ctx.tenants.jia, credentials: passwordOf({ member: MEMBERS.shared, tenant: 'jia' }) })
      return attempt.ok ? attempt : null
    },
  })
  ctx.sessions.sharedJia = back
})

await check('RF11 在 fema 移出成员：会话失效、不能再登录；找回后自动恢复', async () => {
  const session = ctx.sessions.sharedJia
  assert(session, '前置：RF10 未恢复登录')
  const admin = await femaUserToken({ credentials: passwordOf({ member: MEMBERS.ownerJia, tenant: 'jia' }) })
  await femaCall({ token: admin, path: FIXTURES.memberLifecycle.remove.url, body: { id: MEMBERS.shared.memberIdJia } })
  await waitFor({ what: '移出后 ipaas 会话失效', timeoutMs: 120000, intervalMs: 2000, probe: async () => !(await sessionAlive({ token: session.token })) })
  await femaCall({ token: admin, path: FIXTURES.memberLifecycle.restore.url, body: { id: MEMBERS.shared.memberIdJia } })
  await waitFor({
    what: '找回后能再登录',
    timeoutMs: 120000,
    intervalMs: 3000,
    probe: async () => (await ipaasLogin({ tenant: ctx.tenants.jia, credentials: passwordOf({ member: MEMBERS.shared, tenant: 'jia' }) })).ok,
  })
})

await check('RF12 FEMA 业务事件触发器：启用工作流即到 fema 登记并通过验证；新建任务实例触发一次运行，读回的是甲的任务', async () => {
  const session = ctx.sessions.ownerJia
  const projectId = ctx.tenants.jia.projectId
  const created = await api({ method: 'POST', path: '/v1/workflows', token: session.token, body: { displayName: '任务创建同步', projectId } })
  assert(created.status < 300, `建工作流失败：${created.status} ${created.text.slice(0, 300)}`)
  ctx.workflowId = created.json.id
  const imported = await api({ method: 'POST', path: `/v1/workflows/${ctx.workflowId}?projectId=${projectId}`, token: session.token, body: { type: 'IMPORT_WORKFLOW', request: { displayName: '任务创建同步', trigger: workflowTrigger(), schemaVersion: null, notes: null } } })
  assert(imported.status === 200, `导入工作流失败：${imported.status} ${imported.text.slice(0, 500)}`)
  const published = await api({ method: 'POST', path: `/v1/workflows/${ctx.workflowId}?projectId=${projectId}`, token: session.token, body: { type: 'LOCK_AND_PUBLISH', request: { status: 'ENABLED' } } })
  assert(published.status === 200, `发布失败：${published.status} ${published.text.slice(0, 500)}`)
  const service = await serviceToken({ app: APPS.serviceJia, tenant: 'jia' })
  const registration = await waitFor({
    what: 'fema 里出现本工作流的登记并通过验证',
    timeoutMs: 180000,
    intervalMs: 3000,
    probe: async () => (await subscriptionsOf({ token: service })).find((subscription) => String(subscription.endpoint).includes(ctx.workflowId) && subscription.activatedAt),
  })
  assert(JSON.stringify(registration.events?.value ?? registration.events) === JSON.stringify([EVENT_TYPE]), `登记的事件不对：${JSON.stringify(registration.events)}`)
  const before = await runCount({ session, projectId })
  const owner = await femaUserToken({ credentials: passwordOf({ member: MEMBERS.ownerJia, tenant: 'jia' }) })
  const task = await femaCall({ token: owner, path: FIXTURES.businessObject.create.url, body: { ...FIXTURES.businessObject.create.body, title: `ipaas 联调 ${Date.now()}`, ownership: { owner: { id: MEMBERS.ownerJia.memberId } } } })
  ctx.taskId = String(task.id)
  const run = await waitFor({ what: '运行结束', timeoutMs: 240000, intervalMs: 3000, probe: async () => finishedRunAfter({ session, projectId, count: before }) })
  const detail = await api({ path: `/v1/executions/${run.id}?projectId=${projectId}`, token: session.token })
  const steps = detail.json?.steps ?? {}
  assert(run.status === 'SUCCEEDED', `运行应成功：${run.status} 触发器 ${JSON.stringify(steps.trigger?.output ?? null).slice(0, 600)} 读取 ${JSON.stringify(steps.read_task ?? null).slice(0, 800)}`)
  const read = steps.read_task?.output
  assert(read?.found === true && String(read.data?.id) === ctx.taskId, `应读回刚建的任务：${JSON.stringify(read).slice(0, 600)}`)
})

await check('RF13 停用工作流时撤销 fema 里的登记', async () => {
  assert(ctx.workflowId, '前置：RF12 未建工作流')
  const session = ctx.sessions.ownerJia
  const projectId = ctx.tenants.jia.projectId
  const disabled = await api({ method: 'POST', path: `/v1/workflows/${ctx.workflowId}?projectId=${projectId}`, token: session.token, body: { type: 'CHANGE_STATUS', request: { status: 'DISABLED' } } })
  assert(disabled.status === 200, `停用失败：${disabled.status} ${disabled.text.slice(0, 300)}`)
  const service = await serviceToken({ app: APPS.serviceJia, tenant: 'jia' })
  await waitFor({
    what: 'fema 里的登记被撤销',
    timeoutMs: 120000,
    intervalMs: 3000,
    probe: async () => !(await subscriptionsOf({ token: service })).some((subscription) => String(subscription.endpoint).includes(ctx.workflowId)),
  })
})

summary({ name: 'real-fema-federation' })

async function provisionTenant({ key, owner, login, service }) {
  const tenant = TENANTS[key]
  const body = {
    externalRef: { issuer: ISSUER, tenantId: tenant.code },
    name: tenant.name,
    owner: { subject: owner.memberId, ...(owner.emailVerified ? { email: owner.email } : {}), firstName: owner.username.split('@')[0] },
    oidc: { issuer: ISSUER, clientId: login.clientId, clientSecret: login.plainSecret, scopes: 'openid profile email', extraAuthParams: { tenant: tenant.code }, displayName: 'FEMA', sessionRecheckMinutes: 5 },
    memberEvents: { connectionExternalId: 'fema', apiUrl: FEMA_API },
    connections: [{
      externalId: 'fema',
      connectorName: '@fema-ipaas/connector-fema',
      displayName: 'FEMA 业务接口',
      auth: { type: 'OAUTH2_CLIENT_CREDENTIALS', tokenUrl: TOKEN_URL, clientId: service.clientId, clientSecret: service.plainSecret, props: { apiUrl: FEMA_API, tenant: tenant.code } },
    }],
  }
  const result = await provision({ apiKey: ctx.provisionKey, body })
  assert(result.status === 200 || result.status === 201, `开通${tenant.name}失败：${result.status} ${result.text.slice(0, 500)}`)
  const provisioned = result.json
  assert(provisioned.ssoStartUrl, `应返回登录起点：${JSON.stringify(provisioned).slice(0, 300)}`)
  assert(provisioned.memberEvents?.subscriptionId, `应登记成员事件订阅：${JSON.stringify(provisioned.memberEvents)}`)
  assert((provisioned.memberEvents.withheldEvents ?? []).length === 0, `集成服务应用应能读成员，不应有被扣下的事件：${JSON.stringify(provisioned.memberEvents.withheldEvents)}`)
  const token = await serviceToken({ app: service, tenant: tenant.code })
  await waitFor({
    what: `${tenant.name}的成员事件订阅通过验证`,
    timeoutMs: 60000,
    intervalMs: 2000,
    probe: async () => {
      const found = await http({ url: `${FEMA_API}/webhook/subscription/find-by-id?id=${provisioned.memberEvents.subscriptionId}`, token })
      return found.json?.data?.activatedAt ? found.json.data : null
    },
  })
  return provisioned
}

async function expectOnlyTenant({ session, tenant, name }) {
  assert(session.session.tenantId === tenant.tenantId, `应进入${tenant.tenantId}，实际 ${session.session.tenantId}`)
  const mine = await api({ path: ROUTES.myTenants, token: session.token })
  assert(mine.status === 200 && Array.isArray(mine.json), `列我的租户失败：${mine.status} ${mine.text.slice(0, 200)}`)
  const names = mine.json.map((entry) => entry.tenantName)
  assert(names.length === 1 && names[0] === name, `只应看到本家租户：${JSON.stringify(names)}`)
  const foreign = mine.json.flatMap((entry) => entry.projects).filter((project) => project.tenantId !== tenant.tenantId)
  assert(foreign.length === 0, `不应看到别家的项目：${JSON.stringify(foreign.map((project) => project.id))}`)
}

function passwordOf({ member, tenant }) {
  return { kind: 'password', username: member.username, password: member.password, tenant }
}

async function ipaasLogin({ tenant, credentials, jar = cookieJar() }) {
  const trail = []
  const start = await http({ url: new URL(tenant.ssoStartUrl, WEB).toString(), jar })
  trail.push(`start ${start.status}`)
  if (start.status !== 302 || !start.location?.startsWith(IAM_ORIGIN)) {
    return { ok: false, code: `START_${start.status}`, trail }
  }
  const authorizeUrl = start.location
  trail.push(`authorize tenant=${new URL(authorizeUrl).searchParams.get('tenant')}`)
  const signedIn = await femaSignIn({ authorizeUrl, credentials, jar, trail })
  if (!signedIn.location) {
    return { ok: false, code: signedIn.code, trail, sawLoginPage: signedIn.sawLoginPage }
  }
  const denial = new URL(signedIn.location, IAM_ORIGIN).searchParams
  if (denial.get('error')) {
    trail.push(`iam error=${denial.get('error')} ${denial.get('error_description') ?? ''}`)
  }
  if (!signedIn.location.startsWith(WEB)) {
    return { ok: false, code: `IAM_REDIRECT ${new URL(signedIn.location, IAM_ORIGIN).pathname}${new URL(signedIn.location, IAM_ORIGIN).searchParams.get('error') ? ` error=${new URL(signedIn.location, IAM_ORIGIN).searchParams.get('error')}` : ''}`, trail, sawLoginPage: signedIn.sawLoginPage }
  }
  const callback = await http({ url: signedIn.location, jar })
  trail.push(`callback ${callback.status}`)
  const landing = new URL(callback.location ?? '/', WEB)
  const ticket = landing.searchParams.get('ticket')
  if (!ticket) {
    return { ok: false, code: landing.searchParams.get('ssoError') ?? landing.searchParams.get('error') ?? `AT ${landing.pathname}`, trail, sawLoginPage: signedIn.sawLoginPage }
  }
  const exchanged = await api({ method: 'POST', path: ROUTES.ssoExchange, body: { ticket } })
  trail.push(`exchange ${exchanged.status}`)
  if (exchanged.status !== 200) {
    return { ok: false, code: exchanged.json?.code ?? `HTTP_${exchanged.status}`, trail, sawLoginPage: signedIn.sawLoginPage }
  }
  return { ok: true, session: exchanged.json, token: exchanged.json.token, trail, sawLoginPage: signedIn.sawLoginPage }
}

async function femaSignIn({ authorizeUrl, credentials, jar, trail }) {
  const first = await http({ url: authorizeUrl, jar })
  trail.push(`iam authorize ${first.status} -> ${pathOf(first.location)}`)
  if (first.status === 302 && first.location && !new URL(first.location, IAM_ORIGIN).pathname.startsWith('/sign-in')) {
    return { location: new URL(first.location, IAM_ORIGIN).toString(), sawLoginPage: false }
  }
  if (first.status !== 302) {
    return { code: `IAM_AUTHORIZE_${first.status}`, sawLoginPage: false }
  }
  await http({ url: `${IAM_ORIGIN}/sign-in/authenticate`, jar })
  const xsrf = decodeURIComponent(jar.valueOf({ url: IAM_ORIGIN, name: 'XSRF-TOKEN' }) ?? '')
  const headers = { 'x-xsrf-token': xsrf, accept: 'application/json' }
  const login = credentials.kind === 'otp'
    ? await otpLogin({ credentials, jar, headers })
    : await http({ method: 'POST', url: `${IAM_ORIGIN}/login`, jar, headers, form: { username: credentials.username, password: credentials.password, tenant: credentials.tenant } })
  trail.push(`iam login ${login.status}`)
  if (login.status >= 400) {
    return { code: `IAM_LOGIN_${login.status}`, sawLoginPage: true }
  }
  const again = await http({ url: authorizeUrl, jar })
  trail.push(`iam authorize ${again.status} -> ${pathOf(again.location)}`)
  if (again.status !== 302 || !again.location) {
    return { code: `IAM_AUTHORIZE_${again.status}`, sawLoginPage: true }
  }
  return { location: new URL(again.location, IAM_ORIGIN).toString(), sawLoginPage: true }
}

async function otpLogin({ credentials, jar, headers }) {
  const since = readFileSync(IAM_LOG, 'utf8').length
  const generated = await http({ method: 'POST', url: `${IAM_ORIGIN}/ott/generate`, jar, headers, form: { username: credentials.phone } })
  assert(generated.status < 400, `发送一次性码失败：${generated.status} ${generated.text.slice(0, 200)}`)
  const code = await waitFor({
    what: 'iam 日志里出现一次性码',
    timeoutMs: 20000,
    probe: async () => {
      const fresh = readFileSync(IAM_LOG, 'utf8').slice(since)
      const matches = [...fresh.matchAll(/\[Mock OTP\] code (\d+) for (\S+)/g)].filter((match) => match[2] === credentials.phone)
      return matches.length > 0 ? matches[matches.length - 1][1] : null
    },
  })
  return http({ method: 'POST', url: `${IAM_ORIGIN}/login/ott`, jar, headers, form: { token: `${credentials.phone}:${code}`, tenant: credentials.tenant } })
}

async function femaUserToken({ credentials }) {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const authorize = new URL(FIXTURES.oidc.authorize)
  authorize.search = new URLSearchParams({ response_type: 'code', client_id: CONSOLE.clientId, redirect_uri: CONSOLE.redirectUri, scope: 'openid profile', state: randomUUID(), code_challenge: challenge, code_challenge_method: 'S256', tenant: credentials.tenant }).toString()
  const trail = []
  const signedIn = await femaSignIn({ authorizeUrl: authorize.toString(), credentials, jar: cookieJar(), trail })
  assert(signedIn.location?.startsWith(CONSOLE.redirectUri), `控制台授权码登录失败：${signedIn.code ?? signedIn.location}\n${trail.join('\n')}`)
  const code = new URL(signedIn.location).searchParams.get('code')
  const token = await http({ method: 'POST', url: TOKEN_URL, form: { grant_type: 'authorization_code', code, redirect_uri: CONSOLE.redirectUri, client_id: CONSOLE.clientId, code_verifier: verifier } })
  assert(token.status === 200 && token.json?.access_token, `控制台换票失败：${token.status} ${token.text.slice(0, 200)}`)
  return token.json.access_token
}

async function serviceTokenResponse({ app, tenant }) {
  const basic = Buffer.from(`${app.clientId}:${app.plainSecret}`).toString('base64')
  return http({ method: 'POST', url: TOKEN_URL, headers: { authorization: `Basic ${basic}` }, form: { grant_type: 'client_credentials', tenant } })
}

async function serviceToken({ app, tenant }) {
  const response = await serviceTokenResponse({ app, tenant })
  assert(response.status === 200 && response.json?.access_token, `集成服务应用换票失败：${response.status} ${response.text.slice(0, 200)}`)
  return response.json.access_token
}

async function ensureMemberActive({ token, memberId }) {
  const found = await http({ url: `${FEMA_API}/iam-identity/member/find-by-id?id=${memberId}`, token })
  assert(found.json?.code === 'SUCCESS' && found.json.data, `读成员失败：${found.status} ${found.text.slice(0, 200)}`)
  const status = found.json.data.status?.code ?? found.json.data.status
  if (status === 'REMOVED') {
    await femaCall({ token, path: FIXTURES.memberLifecycle.restore.url, body: { id: memberId } })
  }
  if (status === 'SUSPENDED') {
    await femaCall({ token, path: FIXTURES.memberLifecycle.activate.url, body: { id: memberId } })
  }
}

async function femaCall({ token, path, body }) {
  const url = path.startsWith('http') ? path : `${FEMA_API}${path}`
  const response = await http({ method: 'POST', url, token, body })
  assert(response.status < 400 && response.json?.code === 'SUCCESS', `fema 调用失败 ${new URL(url).pathname}：${response.status} ${response.text.slice(0, 300)}`)
  return response.json.data
}

async function subscriptionsOf({ token }) {
  const response = await http({ method: 'POST', url: `${FEMA_API}/webhook/subscription/find-all`, token, body: {} })
  assert(response.status < 400, `读登记失败：${response.status} ${response.text.slice(0, 200)}`)
  const data = response.json?.data
  return Array.isArray(data) ? data : data?.content ?? data?.items ?? data?.records ?? []
}

function workflowTrigger() {
  const stamp = new Date().toISOString()
  return {
    name: 'trigger',
    type: 'CONNECTOR_TRIGGER',
    valid: true,
    displayName: 'FEMA 业务事件',
    lastUpdatedDate: stamp,
    settings: {
      connectorName: '@fema-ipaas/connector-fema',
      connectorVersion: '~0.0.1',
      triggerName: 'business_event',
      input: { auth: "{{connections['fema']}}", events: [EVENT_TYPE] },
      propertySettings: {},
    },
    nextAction: {
      name: 'read_task',
      type: 'CONNECTOR',
      valid: true,
      displayName: '读取任务',
      lastUpdatedDate: stamp,
      settings: {
        connectorName: '@fema-ipaas/connector-fema',
        connectorVersion: '~0.0.1',
        actionName: 'read_object',
        input: { auth: "{{connections['fema']}}", objectPath: "{{trigger['output']['objectPath']}}", objectId: "{{trigger['output']['object']['id']}}" },
        propertySettings: {},
        errorHandlingOptions: {},
      },
    },
  }
}

async function runCount({ session, projectId }) {
  const list = await api({ path: `/v1/executions?projectId=${projectId}&workflowId=${ctx.workflowId}&limit=100`, token: session.token })
  return (list.json?.data ?? []).length
}

async function finishedRunAfter({ session, projectId, count }) {
  const list = await api({ path: `/v1/executions?projectId=${projectId}&workflowId=${ctx.workflowId}&limit=100`, token: session.token })
  const runs = list.json?.data ?? []
  if (runs.length <= count) {
    return null
  }
  const run = runs[0]
  return ['RUNNING', 'QUEUED'].includes(run.status) ? null : run
}

function pathOf(location) {
  return location ? new URL(location, IAM_ORIGIN).pathname : '-'
}

