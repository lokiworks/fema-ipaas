import { ADMIN, API, WEB, REAL_IDP, apiRequest, assert, sleep } from './sso-kit.mjs'

export async function interceptCallbackRedirect({ page, handler }) {
  const session = await page.context().newCDPSession(page)
  await session.send('Fetch.enable', { patterns: [{ urlPattern: '*/api/v1/authn/sso/callback*', requestStage: 'Request' }] })
  session.on('Fetch.requestPaused', (event) => {
    const requestId = event.requestId
    void handler({
      location: event.request.url,
      fulfill: (target) => session.send('Fetch.continueRequest', { requestId, url: target }),
      abort: () => session.send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }),
    })
  })
}

export async function resetTenant({ token }) {
  await apiRequest({ method: 'POST', url: '/v1/tenant-access/login-security', token, body: { emailAuthEnabled: true } })
  for (const provider of ['OIDC', 'FEISHU']) {
    await apiRequest({ method: 'POST', url: `/v1/tenant-access/sso/${provider}/enabled`, token, body: { enabled: false } })
  }
  const members = await apiRequest({ url: '/v1/tenant-access/members', token })
  const admin = members.json.members.find((member) => member.email === ADMIN.email)
  for (const member of members.json.members) {
    if (member.kind === 'USER' && !member.isOwner && member.email !== ADMIN.email) {
      await apiRequest({ method: 'DELETE', url: `/v1/tenant-access/members/${member.id}?transferToUserId=${admin.id}`, token })
    }
  }
}

export async function idpLogin({ page, email }) {
  await page.waitForURL((url) => url.href.startsWith(REAL_IDP), { timeout: 30000 })
  await page.selectOption('#email', email)
  await page.click('#signin')
}

export async function signInWithSso({ open, email, provider = 'oidc', pickUser, intercept, waitMs = 30000 }) {
  const { context, page } = await open()
  await page.goto(`${WEB}/sign-in`)
  await page.getByTestId(`sso-start-${provider}`).waitFor()
  if (intercept !== undefined) {
    await interceptCallbackRedirect({ page, handler: intercept })
  }
  await page.getByTestId(`sso-start-${provider}`).click()
  if (pickUser !== undefined) {
    await pickUser({ page, email })
  }
  else {
    await idpLogin({ page, email })
  }
  const outcome = await waitForOutcome({ page, waitMs })
  return { ...outcome, context, page }
}

export async function waitForOutcome({ page, waitMs }) {
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    const errorBox = page.getByTestId('sso-error')
    if (await errorBox.count() > 0) {
      return { ok: false, code: await errorBox.first().getAttribute('data-code'), message: await errorBox.first().innerText() }
    }
    const url = new URL(page.url())
    const token = await page.evaluate(() => window.localStorage.getItem('token')).catch(() => null)
    if (token && !url.pathname.startsWith('/sign-in') && !url.pathname.startsWith('/sso/')) {
      return { ok: true, token, url: page.url() }
    }
    await sleep(300)
  }
  return { ok: false, code: 'TIMEOUT', message: `no outcome, stuck at ${page.url()}` }
}

export async function memberByEmail({ token, email }) {
  const members = await apiRequest({ url: '/v1/tenant-access/members', token })
  return members.json.members.find((member) => member.email === email) ?? null
}

export async function saveOidcConfig({ token, issuer, clientId = 'fema-e2e', clientSecret, extra = {} }) {
  return apiRequest({
    method: 'POST',
    url: '/v1/tenant-access/sso/oidc',
    token,
    body: {
      enabled: false,
      displayName: '',
      allowedDomains: ['acme.test', 'ap.com'],
      autoCreateUsers: true,
      defaultRole: 'MEMBER',
      roleMapping: { claim: 'groups', rules: [{ value: 'fema-admins', role: 'ADMIN' }, { value: 'fema-ops', role: 'OPERATOR' }], syncOnLogin: false },
      defaultProject: null,
      issuer,
      clientId,
      ...(clientSecret === undefined ? {} : { clientSecret }),
      scopes: 'openid email profile groups',
      emailClaim: 'email',
      requireVerifiedEmail: true,
      ...extra,
    },
  })
}

export async function verifyAndEnable({ open, token, provider, startTestIdp }) {
  const { context, page } = await open()
  const response = await context.request.post(`${API}/v1/tenant-access/sso/${provider}/test`, { headers: { authorization: `Bearer ${token}` } })
  assert(response.status() === 200, `test start failed: ${await response.text()}`)
  const { url } = await response.json()
  await page.goto(url)
  await startTestIdp({ page, email: ADMIN.email })
  await page.waitForURL((u) => u.pathname.startsWith('/tenant/security/authentication'), { timeout: 30000 })
  const result = new URL(page.url()).searchParams.get('ssoTest')
  await context.close()
  assert(result === 'ok', `test sign-in result was ${result}`)
  const enabled = await apiRequest({ method: 'POST', url: `/v1/tenant-access/sso/${provider}/enabled`, token, body: { enabled: true } })
  assert(enabled.status === 200, `enable failed: ${enabled.text}`)
}
