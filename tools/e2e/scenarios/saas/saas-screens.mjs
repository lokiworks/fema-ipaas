import { createHash, createHmac } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { chromium } from '@playwright/test'

import { ADMIN, FEMA_API, ISSUER, STATE_DIR, TOKEN_URL, WEB, api, assert, cookieJar, iam, sleep, ssoLogin } from './saas-kit.mjs'

const OUT = process.env.SAAS_SCREENS_DIR ?? `${STATE_DIR}/ui-shots`
const THEMES = (process.env.SAAS_SCREENS_THEMES ?? 'light,dark').split(',')
const ONLY = process.env.SAAS_SCREENS_ONLY ? new Set(process.env.SAAS_SCREENS_ONLY.split(',')) : null
const PASSWORD = 'Passw0rd!x1'
const VIEWPORT = { width: 1440, height: 900 }
const PRODUCT_NAMES = /Activepieces|FEMA Integration Platform|Integration Platform/i

mkdirSync(OUT, { recursive: true })

const findings = []
const shots = []
const world = await seed()
const browser = await chromium.launch()

try {
  await operatorScreens()
  await tenantScreens()
  await signInScreens()
  await accountScreens()
  await captchaScreens()
}
finally {
  await browser.close()
  writeFileSync(`${OUT}/report.json`, JSON.stringify({ shots, findings, world: summaryOf(world) }, null, 2))
  process.stdout.write(`\n${shots.length} screenshots in ${OUT}\n`)
  for (const finding of findings) {
    process.stdout.write(`NOTE  ${finding.shot}: ${finding.kind} ${finding.detail}\n`)
  }
}

function memberEventsFor({ code }) {
  return {
    memberEvents: { connectionExternalId: 'fema', apiUrl: FEMA_API },
    connections: [{
      externalId: 'fema',
      connectorName: '@fema-ipaas/connector-fema',
      displayName: 'FEMA 业务接口',
      auth: { type: 'OAUTH2_CLIENT_CREDENTIALS', tokenUrl: TOKEN_URL, clientId: `svc-${code}`, clientSecret: 'svc-alpha-secret', props: { apiUrl: FEMA_API, tenant: code } },
    }],
  }
}

async function seed() {
  await iam({
    path: '/__control/seed',
    body: {
      reset: true,
      tenants: [
        { code: 't_alpha', name: '甲租赁', eventSecret: 'evt-alpha-screens-0000000000000000' },
        { code: 't_beta', name: '乙设备', eventSecret: 'evt-beta-screens-00000000000000000' },
        { code: 't_gamma', name: '丙物流', eventSecret: 'evt-gamma-screens-0000000000000000' },
      ],
      persons: [
        { username: 'alice', password: 'Passw0rd!', name: '王丽', email: 'alice@alpha.test', emailVerified: true },
        { username: 'bob', password: 'Passw0rd!', name: '李博', email: 'bob@beta.test', emailVerified: true },
        { username: 'gus', password: 'Passw0rd!', name: '高山', email: 'gus@gamma.test', emailVerified: true },
      ],
      members: [
        { id: 'm-alpha-alice', tenant: 't_alpha', username: 'alice' },
        { id: 'm-beta-bob', tenant: 't_beta', username: 'bob' },
        { id: 'm-gamma-gus', tenant: 't_gamma', username: 'gus' },
      ],
      clients: [
        { clientId: 'ipaas-t_alpha', secret: 'oidc-alpha-secret', kind: 'oidc', tenant: 't_alpha' },
        { clientId: 'ipaas-t_beta', secret: 'oidc-beta-secret', kind: 'oidc', tenant: 't_beta' },
        { clientId: 'ipaas-t_gamma', secret: 'oidc-gamma-secret', kind: 'oidc', tenant: 't_gamma' },
        { clientId: 'ipaas-dev', secret: 'oidc-dev-secret', kind: 'oidc', tenant: 't_alpha' },
        { clientId: 'svc-t_alpha', secret: 'svc-alpha-secret', kind: 'service', tenant: 't_alpha' },
      ],
    },
  })
  const dev = await signIn({ email: ADMIN.email, password: ADMIN.password })
  const apiKey = await must(api({ method: 'POST', path: '/v1/operator/platform-clients', token: dev.token, body: { kind: 'API_KEY', name: 'rental-saas 租户初始化', scopes: ['TENANT_PROVISION', 'TENANT_MEMBERS', 'USAGE_READ'] } }), 'issue api key')
  await must(api({ method: 'POST', path: '/v1/operator/platform-clients', token: dev.token, body: { kind: 'TRUSTED_ISSUER', name: 'fema-iam 平台应用', issuer: ISSUER, allowedSubjects: ['svc-platform'], scopes: ['TENANT_MEMBERS'] } }), 'trusted issuer client')
  await iam({ path: '/__control/events/withhold', body: { events: ['iam-identity.member.remove'] } })
  const tenants = {}
  for (const [key, code, name, owner, ownerEmail] of [['alpha', 't_alpha', '甲租赁', 'm-alpha-alice', 'alice@alpha.test'], ['beta', 't_beta', '乙设备', 'm-beta-bob', 'bob@beta.test'], ['gamma', 't_gamma', '丙物流', 'm-gamma-gus', 'gus@gamma.test']]) {
    const provisioned = await must(api({
      method: 'POST',
      path: '/v1/platform/tenants',
      token: apiKey.secret,
      body: {
        externalRef: { issuer: ISSUER, tenantId: code },
        name,
        slug: key,
        owner: { subject: owner, email: ownerEmail },
        oidc: { issuer: ISSUER, clientId: `ipaas-${code}`, clientSecret: `oidc-${key}-secret`, scopes: 'openid profile email', extraAuthParams: { tenant: code }, displayName: 'FEMA' },
        eventSigningSecret: `evt-${key}-screens-0000000000000000`.slice(0, 40),
        limits: { usersLimit: 50, projectsLimit: 10, activeWorkflowsLimit: 100, concurrentExecutionsLimit: 5 },
        ...(key === 'alpha' ? memberEventsFor({ code }) : {}),
      },
    }), `provision ${key}`)
    tenants[key] = provisioned
  }
  const alice = await federatedSession({ tenant: tenants.alpha, username: 'alice' })
  const bob = await federatedSession({ tenant: tenants.beta, username: 'bob' })
  const gus = await federatedSession({ tenant: tenants.gamma, username: 'gus' })
  await configureTenantSso({ token: alice.token })
  await must(api({ method: 'POST', path: '/v1/tenant-domains', token: alice.token, body: { domain: 'alpha.test', purpose: 'LOGIN_DISCOVERY' } }), 'login domain')
  await must(api({ method: 'POST', path: '/v1/tenant-domains', token: alice.token, body: { domain: 'ipaas.alpha.test', purpose: 'HOST' } }), 'host domain')
  await soft(api({ method: 'POST', path: `/v1/tenants/${tenants.alpha.tenantId}`, token: alice.token, body: { primaryColor: '#0F766E', welcomeText: '甲租赁 · 集成中心' } }), 'branding alpha')
  await configureInstance({ token: dev.token })
  const devTenant = await must(api({ path: `/v1/tenants/${dev.tenantId}`, token: dev.token }), 'dev tenant')
  await soft(api({ method: 'POST', path: '/v1/tenant-access/sso/oidc', token: dev.token, body: { ...ssoCommon(), issuer: ISSUER, clientId: 'ipaas-dev', clientSecret: 'oidc-dev-secret', scopes: 'openid profile email', emailClaim: 'email', requireVerifiedEmail: true, matchBy: 'EMAIL', extraAuthParams: { tenant: 't_alpha', prompt: 'login' }, sessionRecheckMinutes: 30 } }), 'dev oidc with extra params')
  const users = {}
  users.ivy = await passwordUser({ inviter: dev.token, slug: devTenant.slug, email: 'ivy@dev.test', first: '艾薇' })
  users.tess = await passwordUser({ inviter: dev.token, slug: devTenant.slug, email: 'tess@multi.test', first: '谭思', alsoInvite: [bob.token] })
  for (const theme of THEMES) {
    users[`mia-${theme}`] = await passwordUser({ inviter: bob.token, slug: tenants.beta.slug, email: `mia-${theme}@beta.test`, first: '米娅' })
  }
  users.sam = await passwordUser({ inviter: gus.token, slug: tenants.gamma.slug, email: 'sam@gamma.test', first: '沈默' })
  const ivySecret = await enableMfa({ token: users.ivy.token })
  await must(api({ method: 'POST', path: '/v1/tenant-access/login-security/mfa-policy', token: bob.token, body: { mfaPolicy: 'REQUIRED', phoneAuthEnabled: false } }), 'beta mfa required')
  await soft(api({ method: 'POST', path: '/v1/operator/operators', token: dev.token, body: { email: 'tess@multi.test' } }), 'grant operator')
  await must(api({ method: 'POST', path: `/v1/operator/tenants/${tenants.gamma.tenantId}/suspend`, token: dev.token }), 'suspend gamma')
  const alphaPublic = await must(api({ path: `/v1/tenants/public/${tenants.alpha.slug}` }), 'public alpha')
  return { dev, devTenant, tenants, alice, bob, users, ivySecret, alphaPublic }
}

async function operatorScreens() {
  const session = world.dev
  await shoot({ name: 'operator-tenants', session, go: async (page) => {
    await page.goto(`${WEB}/operator/tenants`)
    await page.getByTestId(`tenant-row-${world.tenants.alpha.slug}`).waitFor()
  } })
  await shoot({ name: 'operator-tenant-new', session, full: false, go: async (page, theme) => {
    await page.goto(`${WEB}/operator/tenants`)
    await page.getByTestId('create-tenant').click()
    await page.getByTestId('tenant-name').fill(theme === 'light' ? '丁贸易' : '戊科技')
    await page.getByTestId('tenant-owner').fill(`owner-${theme}@new.test`)
    await page.getByTestId('limit-usersLimit').fill('20')
  } })
  await shoot({ name: 'operator-tenant-created', session, full: false, go: async (page, theme) => {
    await page.goto(`${WEB}/operator/tenants`)
    await page.getByTestId('create-tenant').click()
    await page.getByTestId('tenant-name').fill(theme === 'light' ? '己咨询' : '庚制造')
    await page.getByTestId('tenant-owner').fill(`founder-${theme}@new.test`)
    await page.getByTestId('tenant-create-submit').click()
    await page.getByTestId('tenant-created').waitFor()
  } })
  await shoot({ name: 'operator-tenant-detail', session, go: async (page) => {
    await page.goto(`${WEB}/operator/tenants/${world.tenants.alpha.tenantId}`)
    await page.getByTestId('tenant-limits-edit').waitFor()
  } })
  await shoot({ name: 'operator-tenant-limits', session, full: false, go: async (page) => {
    await page.goto(`${WEB}/operator/tenants/${world.tenants.alpha.tenantId}`)
    await page.getByTestId('tenant-limits-edit').click()
    await page.getByTestId('limits-save').waitFor()
  } })
  await shoot({ name: 'operator-tenant-suspend', session, full: false, go: async (page) => {
    await page.goto(`${WEB}/operator/tenants/${world.tenants.alpha.tenantId}`)
    await page.getByTestId('tenant-suspend').click()
    await page.getByRole('alertdialog').or(page.getByRole('dialog')).first().waitFor()
  } })
  await shoot({ name: 'operator-tenant-suspended', session, go: async (page) => {
    await page.goto(`${WEB}/operator/tenants/${world.tenants.gamma.tenantId}`)
    await page.getByTestId('tenant-resume').waitFor()
  } })
  await shoot({ name: 'operator-platform-clients', session, go: async (page) => {
    await page.goto(`${WEB}/operator/platform-clients`)
    await page.getByTestId('create-platform-client').waitFor()
  } })
  await shoot({ name: 'operator-platform-client-new', session, full: false, go: async (page, theme) => {
    await page.goto(`${WEB}/operator/platform-clients`)
    await page.getByTestId('create-platform-client').click()
    await page.getByTestId('client-name').fill(`运营对账 ${theme}`)
    await page.getByTestId('scope-USAGE_READ').check()
  } })
  await shoot({ name: 'operator-platform-client-secret', session, full: false, go: async (page, theme) => {
    await page.goto(`${WEB}/operator/platform-clients`)
    await page.getByTestId('create-platform-client').click()
    await page.getByTestId('client-name').fill(`租户初始化 ${theme}`)
    await page.getByTestId('scope-TENANT_PROVISION').check()
    await page.getByTestId('client-submit').click()
    await page.getByTestId('client-created').waitFor()
  } })
  await shoot({ name: 'operator-settings', session, go: async (page) => {
    await page.goto(`${WEB}/operator/settings`)
    await page.getByTestId('switch-self-signup').waitFor()
    await page.getByTestId('login-app-FEISHU').waitFor()
  } })
  await shoot({ name: 'operator-settings-login-app', session, full: false, go: async (page) => {
    await page.goto(`${WEB}/operator/settings`)
    await page.getByTestId('login-app-edit-WECOM').click()
    await page.getByTestId('login-app-save').waitFor()
  } })
  await shoot({ name: 'operator-operators', session, go: async (page) => {
    await page.goto(`${WEB}/operator/operators`)
    await page.getByTestId('operator-grant').waitFor()
  } })
}

async function tenantScreens() {
  const alice = world.alice
  await shoot({ name: 'tenant-sso', session: alice, go: async (page) => {
    await page.goto(`${WEB}/tenant/security/authentication`)
    await page.getByTestId('login-method-OIDC').waitFor()
    await page.getByTestId('sso-member-events-withheld').waitFor()
    await page.getByTestId('login-domains').waitFor()
  } })
  await shoot({ name: 'tenant-sso-oidc-provisioned', session: alice, full: false, go: async (page) => {
    await page.goto(`${WEB}/tenant/security/authentication`)
    await page.getByTestId('sso-configure-OIDC').click()
    await page.getByTestId('sso-save').waitFor()
  } })
  await shoot({ name: 'tenant-sso-oidc-extra-params', session: world.dev, full: false, go: async (page) => {
    await page.goto(`${WEB}/tenant/security/authentication`)
    await page.getByTestId('sso-configure-OIDC').click()
    const extra = page.getByTestId('sso-extra-params')
    await extra.waitFor()
    await extra.scrollIntoViewIfNeeded()
  } })
  await shoot({ name: 'tenant-sso-saml', session: alice, full: false, go: async (page) => {
    await page.goto(`${WEB}/tenant/security/authentication`)
    await page.getByTestId('sso-configure-SAML').click()
    await page.getByTestId('saml-sp-info').waitFor()
  } })
  await shoot({ name: 'tenant-sso-wecom', session: alice, full: false, go: async (page) => {
    await page.goto(`${WEB}/tenant/security/authentication`)
    await page.getByTestId('sso-configure-WECOM').click()
    await page.getByTestId('sso-save').waitFor()
  } })
  await shoot({ name: 'tenant-login-security', session: alice, full: false, go: async (page) => {
    await page.goto(`${WEB}/tenant/security/authentication`)
    const card = page.getByTestId('switch-mfa-required')
    await card.waitFor()
    await card.scrollIntoViewIfNeeded()
    await page.mouse.wheel(0, 200)
  } })
  await shoot({ name: 'tenant-login-domains', session: alice, full: false, go: async (page) => {
    await page.goto(`${WEB}/tenant/security/authentication`)
    const card = page.getByTestId('login-domains')
    await card.waitFor()
    await card.scrollIntoViewIfNeeded()
  } })
  await shoot({ name: 'tenant-members', session: alice, go: async (page) => {
    await page.goto(`${WEB}/tenant/users`)
    await page.getByRole('button', { name: /添加成员|Add members/ }).first().waitFor()
  } })
  await shoot({ name: 'tenant-members-invite', session: alice, full: false, go: async (page, theme) => {
    await page.goto(`${WEB}/tenant/users`)
    await page.getByRole('button', { name: /添加成员|Add members/ }).first().click()
    await page.locator('[role=dialog] textarea').fill(`lily-${theme}@alpha.test\n+86139000000${theme === 'light' ? '01' : '02'}\nnot-an-address`)
  } })
  await shoot({ name: 'tenant-members-invite-result', session: alice, full: false, go: async (page, theme) => {
    await page.goto(`${WEB}/tenant/users`)
    await page.getByRole('button', { name: /添加成员|Add members/ }).first().click()
    await page.locator('[role=dialog] textarea').fill(`rose-${theme}@alpha.test\n+86139000001${theme === 'light' ? '1' : '2'}`)
    const dialog = page.locator('[role=dialog]')
    await dialog.getByRole('button', { name: /添加|邀请|Add|Invite/ }).last().click()
    await dialog.locator('input[readonly]').first().waitFor({ timeout: 20000 })
  } })
}

async function signInScreens() {
  await shoot({ name: 'signin-discovery', go: async (page) => {
    await page.route('**/api/v1/tenants/discover', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tenants: [world.alphaPublic] }) }))
    await page.goto(`${WEB}/sign-in`)
    await page.getByTestId('sign-in-email').fill('someone@alpha.test')
    await page.getByTestId('sign-in-password').click()
    await page.getByTestId('tenant-discovery').waitFor()
  }, note: '邮箱发现的返回值用页面拦截代替：登录域名需要 DNS TXT 验证，测试环境验证不了；返回的是甲租户真实的公开信息' })
  await shoot({ name: 'signin-tenant-page', go: async (page) => {
    await page.goto(`${WEB}/t/${world.tenants.alpha.slug}`)
    await page.getByText(/欢迎回来|Welcome back/).first().waitFor()
  } })
  await shoot({ name: 'signin-sms', go: async (page) => {
    await stubSmsAvailable({ page })
    await page.goto(`${WEB}/sign-in`)
    await page.getByTestId('auth-use-phone').click()
    await page.getByTestId('sms-phone').fill('13800001234')
    await page.getByTestId('pow-captcha').waitFor()
  }, note: '短信服务需测试发送成功才算可用，测试环境连不到阿里云/腾讯云，SMS_AUTH_AVAILABLE 由页面拦截置为 true' })
  await shoot({ name: 'signin-sms-code', go: async (page) => {
    await stubSmsAvailable({ page })
    await page.route('**/api/v1/authentication/sms/request', (route) => route.fulfill({ status: 204, body: '' }))
    await page.goto(`${WEB}/sign-in`)
    await page.getByTestId('auth-use-phone').click()
    await page.getByTestId('sms-phone').fill('13800001234')
    await page.locator('[data-testid=pow-captcha][data-status=ready]').waitFor({ timeout: 30000 })
    await page.getByTestId('sms-send').click()
    await page.getByTestId('sms-code').waitFor()
  }, note: '发送验证码的请求用页面拦截返回 204' })
  await shoot({ name: 'signin-mfa', go: async (page) => {
    await passwordSignIn({ page, email: 'ivy@dev.test' })
    await page.getByTestId('mfa-code').waitFor()
  } })
  await shoot({ name: 'signin-mfa-enroll', go: async (page, theme) => {
    await passwordSignIn({ page, email: `mia-${theme}@beta.test` })
    await page.getByTestId('mfa-start').click()
    await page.getByTestId('qr-code').waitFor()
  } })
  await shoot({ name: 'signin-mfa-recovery-codes', go: async (page, theme) => {
    await passwordSignIn({ page, email: `mia-${theme}@beta.test` })
    await page.getByTestId('mfa-start').click()
    await page.getByTestId('qr-code').waitFor()
    const secret = await page.evaluate(() => [...document.querySelectorAll('input')].map((input) => input.value).find((value) => /^[A-Z2-7]{16,}$/.test(value.replace(/\s+/g, ''))) ?? null)
    assert(secret, '页面上找不到手动输入用的密钥')
    await typeOtp({ page, testId: 'mfa-enroll-code', code: totp({ secret: secret.replace(/\s+/g, '') }) })
    await page.getByTestId('mfa-recovery-codes').waitFor()
  } })
  await shoot({ name: 'signin-select-tenant', go: async (page) => {
    await passwordSignIn({ page, email: 'tess@multi.test' })
    await page.getByTestId('tenant-selection-list').waitFor()
  } })
  await shoot({ name: 'signin-tenant-suspended', go: async (page) => {
    await passwordSignIn({ page, email: 'sam@gamma.test' })
    await page.getByText(/已被停用|suspended/i).first().waitFor()
  } })
}

async function accountScreens() {
  await shoot({ name: 'account-security', session: world.alice, go: async (page) => {
    await page.goto(`${WEB}/account`)
    await page.getByTestId('account-security-card').waitFor()
  } })
  const ivy = await mfaSignIn({ email: 'ivy@dev.test', secret: world.ivySecret })
  await shoot({ name: 'account-security-mfa-on', session: ivy, go: async (page) => {
    await page.goto(`${WEB}/account`)
    await page.getByTestId('security-mfa-recovery').waitFor()
  } })
  await shoot({ name: 'account-security-phone-dialog', session: ivy, full: false, go: async (page) => {
    await page.goto(`${WEB}/account`)
    await page.getByTestId('security-phone-action').click()
    await page.getByTestId('phone-binding-input').fill('13800005678')
  } })
}

async function captchaScreens() {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await api({ method: 'POST', path: '/v1/authentication/sign-in', body: { email: 'ivy@dev.test', password: 'wrong-password-1' } })
  }
  await shoot({ name: 'signin-captcha', go: async (page) => {
    await page.route('**/api/v1/authentication/captcha/challenge', async (route) => {
      await sleep(20000)
      await route.continue().catch(() => undefined)
    })
    await page.goto(`${WEB}/sign-in`)
    await page.getByTestId('sign-in-email').fill('ivy@dev.test')
    await page.getByTestId('sign-in-password').fill('wrong-password-2')
    await page.getByTestId('sign-in-button').click()
    await page.locator('[data-testid=pow-captcha][data-status=working]').waitFor({ timeout: 20000 })
  }, note: '连续 5 次密码错误后出现人机验证；为了拍到「正在验证」状态，取题请求被页面拦截延迟 20 秒' })
}

async function shoot({ name, session, go, full = true, note }) {
  if (ONLY && !ONLY.has(name)) {
    return
  }
  for (const theme of THEMES) {
    const file = `${name}-${theme}.png`
    const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
    await context.addInitScript(({ mode, token, projectId }) => {
      window.localStorage.setItem('fema.theme', mode)
      window.localStorage.setItem('fema.language', 'zh')
      if (token) {
        window.localStorage.setItem('token', token)
      }
      if (projectId) {
        window.localStorage.setItem('projectId', projectId)
      }
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = 'vite-error-overlay,vite-plugin-checker-error-overlay{display:none!important}'
        document.head.appendChild(style)
      })
    }, { mode: theme, token: session?.token ?? null, projectId: session?.projectId ?? null })
    const page = await context.newPage()
    page.setDefaultTimeout(30000)
    const problems = []
    page.on('pageerror', (error) => problems.push({ kind: 'pageerror', detail: String(error.message).slice(0, 300) }))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        problems.push({ kind: 'console', detail: message.text().slice(0, 300) })
      }
    })
    page.on('response', (response) => {
      if (response.url().includes('/api/v1/') && response.status() >= 400) {
        problems.push({ kind: `http ${response.status()}`, detail: `${response.request().method()} ${new URL(response.url()).pathname}` })
      }
    })
    try {
      await go(page, theme)
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined)
      await sleep(900)
      await page.screenshot({ path: `${OUT}/${file}`, fullPage: full })
      const text = await page.locator('body').innerText().catch(() => '')
      const english = untranslated({ text })
      shots.push({ file, ok: true, note: note ?? null })
      for (const problem of dedupe(problems)) {
        findings.push({ shot: file, ...problem })
      }
      if (english.length > 0) {
        findings.push({ shot: file, kind: 'english', detail: english.join(' | ') })
      }
      const product = text.match(PRODUCT_NAMES)
      if (product) {
        findings.push({ shot: file, kind: 'product-name', detail: product[0] })
      }
      process.stdout.write(`SHOT  ${file}\n`)
    }
    catch (error) {
      await page.screenshot({ path: `${OUT}/FAILED-${file}`, fullPage: false }).catch(() => undefined)
      shots.push({ file, ok: false, error: String(error?.message ?? error).split('\n')[0] })
      findings.push({ shot: file, kind: 'failed', detail: String(error?.message ?? error).split('\n')[0] })
      for (const problem of dedupe(problems)) {
        findings.push({ shot: file, ...problem })
      }
      process.stdout.write(`FAIL  ${file}: ${String(error?.message ?? error).split('\n')[0]}\n`)
    }
    finally {
      await context.close()
    }
  }
}

function untranslated({ text }) {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
  const english = lines.filter((line) => !/[一-鿿]/.test(line) && /[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(line) && !/@|https?:\/\/|\/|_/.test(line))
  return [...new Set(english)].slice(0, 12)
}

function dedupe(problems) {
  const seen = new Set()
  return problems.filter((problem) => {
    const key = `${problem.kind}|${problem.detail}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

async function stubSmsAvailable({ page }) {
  await page.route('**/api/v1/flags', async (route) => {
    const response = await route.fetch()
    const flags = await response.json()
    await route.fulfill({ response, json: { ...flags, SMS_AUTH_AVAILABLE: true } })
  })
}

async function passwordSignIn({ page, email }) {
  await page.goto(`${WEB}/sign-in`)
  await page.getByTestId('sign-in-email').fill(email)
  await page.getByTestId('sign-in-password').fill(PASSWORD)
  await page.getByTestId('sign-in-button').click()
}

async function typeOtp({ page, testId, code }) {
  const target = page.getByTestId(testId)
  const inner = target.locator('input')
  const input = (await inner.count()) > 0 ? inner.first() : target
  await input.click()
  await page.keyboard.type(code, { delay: 60 })
}

async function signIn({ email, password, tenantSlug }) {
  const response = await api({ method: 'POST', path: '/v1/authentication/sign-in', body: { email, password }, headers: tenantSlug ? { 'x-fema-tenant': tenantSlug } : {} })
  assert(response.status === 200, `sign-in ${email} failed: ${response.status} ${response.text.slice(0, 300)}`)
  return response.json
}

async function mfaSignIn({ email, secret }) {
  const first = await api({ method: 'POST', path: '/v1/authentication/sign-in', body: { email, password: PASSWORD } })
  assert(first.json?.code === 'MFA_REQUIRED', `expected MFA_REQUIRED for ${email}: ${first.text.slice(0, 200)}`)
  const verified = await api({ method: 'POST', path: '/v1/authentication/mfa/verify', body: { challengeToken: first.json.params.challengeToken, code: totp({ secret }) } })
  assert(verified.status === 200, `mfa verify failed: ${verified.text.slice(0, 200)}`)
  return verified.json
}

async function federatedSession({ tenant, username }) {
  const result = await ssoLogin({ startUrl: tenant.ssoStartUrl, username, jar: cookieJar() })
  assert(result.ok, `${username} sso failed: ${result.code} ${result.trail.join(' / ')}`)
  return result.session
}

async function passwordUser({ inviter, slug, email, first, alsoInvite = [] }) {
  for (const token of [inviter, ...alsoInvite]) {
    const invited = await must(api({ method: 'POST', path: '/v1/tenant-access/members/invite', token, body: { emails: [email], phones: [], tenantRole: 'MEMBER', modules: [] } }), `invite ${email}`)
    const link = invited.invited?.[0]?.link
    assert(link, `invite ${email} returned no link: ${JSON.stringify(invited)}`)
    const invitationToken = new URL(link, WEB).searchParams.get('token')
    assert(invitationToken, `invite link has no token: ${link}`)
    await must(api({ method: 'POST', path: '/v1/user-invitations/accept', body: { invitationToken } }), `accept invitation ${email}`)
  }
  const captchaToken = await solveCaptcha()
  const response = await api({ method: 'POST', path: '/v1/authentication/sign-up', headers: { 'x-fema-tenant': slug }, body: { email, password: PASSWORD, firstName: first, lastName: '', trackEvents: false, newsLetter: false, captchaToken } })
  assert(response.status === 200, `sign-up ${email} failed: ${response.status} ${response.text.slice(0, 300)}`)
  return response.json
}

async function enableMfa({ token }) {
  const started = await must(api({ method: 'POST', path: '/v1/authentication/mfa/enroll/start', token, body: {} }), 'mfa enroll start')
  await must(api({ method: 'POST', path: '/v1/authentication/mfa/enroll/confirm', token, body: { code: totp({ secret: started.secret }) } }), 'mfa enroll confirm')
  return started.secret
}

async function configureTenantSso({ token }) {
  await must(api({ method: 'POST', path: '/v1/tenant-access/sso/feishu', token, body: { ...ssoCommon(), appId: 'cli_a5f0e3c2d1b4a987', appSecret: 'feishu-secret-value', region: 'FEISHU', allowedEnterpriseKey: null } }), 'feishu sso')
  await must(api({ method: 'POST', path: '/v1/tenant-access/sso/wecom', token, body: { ...ssoCommon(), corpId: 'ww8f2c1d0e9a7b6c5d', agentId: '1000002', secret: 'wecom-secret-value' } }), 'wecom sso')
  await must(api({ method: 'POST', path: '/v1/tenant-access/sso/dingtalk', token, body: { ...ssoCommon(), appKey: 'dingabc123xyz', appSecret: 'dingtalk-secret-value', corpId: 'ding0a1b2c3d4e5f' } }), 'dingtalk sso')
  await must(api({ method: 'POST', path: '/v1/tenant-access/sso/saml', token, body: { ...ssoCommon(), idpMetadataXml: samlMetadata(), emailAttribute: 'email', firstNameAttribute: 'givenName', lastNameAttribute: 'sn', subjectSource: 'NAME_ID', subjectAttribute: null, signAuthnRequests: false } }), 'saml sso')
}

async function configureInstance({ token }) {
  await must(api({ method: 'POST', path: '/v1/operator/sms-settings', token, body: { provider: 'ALIYUN', accessKeyId: 'LTAI5tScreensKeyId', accessKeySecret: 'screens-secret', signName: '甲租赁', templateCode: 'SMS_465300001', sdkAppId: null, region: null } }), 'sms settings')
  for (const [kind, appId] of [['FEISHU', 'cli_platform_feishu01'], ['WECOM', 'wwplatformcorp01'], ['DINGTALK', 'dingplatformapp01']]) {
    await must(api({ method: 'POST', path: `/v1/operator/platform-login-apps/${kind}`, token, body: { enabled: true, appId, appSecret: `${kind.toLowerCase()}-platform-secret`, region: kind === 'FEISHU' ? 'FEISHU' : null, allowSelfSignup: kind === 'FEISHU' } }), `platform login app ${kind}`)
  }
}

function ssoCommon() {
  return { enabled: false, displayName: '', allowedDomains: ['alpha.test'], autoCreateUsers: false, defaultRole: 'MEMBER', roleMapping: null, defaultProject: null }
}

function samlMetadata() {
  const dir = `${STATE_DIR}/saml-cert`
  mkdirSync(dir, { recursive: true })
  if (!existsSync(`${dir}/cert.der`)) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/key.pem`, '-out', `${dir}/cert.der`, '-outform', 'DER', '-days', '365', '-subj', '/CN=idp.alpha.test'], { stdio: 'ignore' })
  }
  const certificate = readFileSync(`${dir}/cert.der`).toString('base64')
  return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="https://idp.alpha.test/saml/metadata">
  <md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>${certificate}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor>
    <md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.alpha.test/saml/sso"/>
  </md:IDPSSODescriptor>
</md:EntityDescriptor>`
}

async function solveCaptcha() {
  const challenge = await must(api({ path: '/v1/authentication/captcha/challenge' }), 'captcha challenge')
  for (let number = 0; number <= challenge.maxNumber; number += 1) {
    if (createHash('sha256').update(`${challenge.salt}${number}`).digest('hex') === challenge.challenge) {
      return Buffer.from(JSON.stringify({ algorithm: challenge.algorithm, challenge: challenge.challenge, salt: challenge.salt, number, signature: challenge.signature })).toString('base64url')
    }
  }
  throw new Error('captcha could not be solved')
}

function totp({ secret, nowMs = Date.now() }) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = secret.replace(/=+$/, '').toUpperCase().split('').map((char) => alphabet.indexOf(char).toString(2).padStart(5, '0')).join('')
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => parseInt(byte, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(nowMs / 30000)))
  const digest = createHmac('sha1', key).update(counter).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3]
  return String(binary % 1000000).padStart(6, '0')
}

async function must(promise, what) {
  const response = await promise
  assert(response.status < 300, `${what} failed: ${response.status} ${response.text.slice(0, 400)}`)
  return response.json
}

async function soft(promise, what) {
  const response = await promise
  if (response.status >= 300) {
    findings.push({ shot: 'seed', kind: `seed ${response.status}`, detail: `${what}: ${response.text.slice(0, 300)}` })
  }
  return response.json
}

function summaryOf(value) {
  return {
    tenants: Object.fromEntries(Object.entries(value.tenants).map(([key, tenant]) => [key, { id: tenant.tenantId, slug: tenant.slug }])),
    devTenant: value.devTenant?.slug,
  }
}
