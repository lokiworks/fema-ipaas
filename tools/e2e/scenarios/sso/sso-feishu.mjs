import { ADMIN, FEISHU_PORT, WEB, adminSession, apiRequest, assert, check, launchBrowser, openContext, shot, startProcess, stopPort, summary, waitPort } from './sso-kit.mjs'
import { memberByEmail, resetTenant, signInWithSso } from './sso-flows.mjs'

const APP_ID = 'cli_e2e_login'
const APP_SECRET = 'feishu-login-secret'
const TENANT_KEY = 'tenant-acme'

const browser = await launchBrowser()
const open = (options = {}) => openContext({ browser, ...options })
const admin = await adminSession()
const token = admin.token

stopPort({ port: FEISHU_PORT })
startProcess({ name: 'feishu-login', args: ['tools/e2e/scenarios/sso/mock-feishu-login.mjs'] })
await waitPort({ port: FEISHU_PORT })
await resetTenant({ token })

const control = (path, body) => fetch(`http://127.0.0.1:${FEISHU_PORT}${path}`, { method: 'POST', body: JSON.stringify(body) })
const noPicker = async () => undefined
const signIn = (options) => signInWithSso({ open, provider: 'feishu', pickUser: noPicker, ...options })

try {
  await check('F1 在界面里配置飞书登录并测试登录：保存后未测试不能启用，测试通过后可以启用', async () => {
    await control('/__admin/next', { email: ADMIN.email })
    const { context, page } = await open()
    try {
      await page.goto(`${WEB}/sign-in`)
      await page.getByTestId('sign-in-email').fill(ADMIN.email)
      await page.getByTestId('sign-in-password').fill(ADMIN.password)
      await page.getByTestId('sign-in-button').click()
      await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'))
      await page.goto(`${WEB}/tenant/security/authentication`)
      await page.getByTestId('sso-configure-FEISHU').click()
      await page.getByTestId('sso-field-appId').fill(APP_ID)
      await page.getByTestId('sso-field-appSecret').fill(APP_SECRET)
      await page.getByTestId('sso-field-allowedEnterpriseKey').fill(TENANT_KEY)
      await page.getByTestId('sso-allowed-domains').fill('acme.test\nap.com')
      await shot({ page, name: 'f1-feishu-dialog' })
      await page.getByTestId('sso-save').click()
      await page.getByTestId('sso-status-FEISHU').waitFor()
      assert(await page.getByTestId('login-method-FEISHU').getByRole('switch').isDisabled(), '未测试时开关应不可用')
      await page.getByTestId('sso-test-FEISHU').click()
      await page.getByTestId('sso-test-result').waitFor({ timeout: 30000 })
      assert((await page.getByTestId('sso-test-result').getAttribute('data-result')) === 'ok', '飞书测试登录应通过')
      await page.waitForFunction(() => !document.querySelector('[data-testid="login-method-FEISHU"] [role="switch"]')?.hasAttribute('disabled'))
      await page.getByTestId('login-method-FEISHU').getByRole('switch').click()
      await page.getByTestId('login-method-FEISHU').getByText('打开').waitFor()
      await shot({ page, name: 'f1-feishu-enabled' })
    }
    finally {
      await context.close()
    }
  })

  await check('F2 登录页出现「使用飞书登录」，飞书账号首次登录自动创建账号', async () => {
    await control('/__admin/next', { email: 'newhire@acme.test' })
    const result = await signIn({ email: 'newhire@acme.test' })
    try {
      assert(result.ok, `应登录成功：${result.code} ${result.message}`)
      const member = await memberByEmail({ token, email: 'newhire@acme.test' })
      assert(member !== null && member.tenantRole === 'MEMBER', '应创建成员账号')
    }
    finally {
      await result.context.close()
    }
    const { context, page } = await open({ theme: 'dark', width: 390 })
    try {
      await page.goto(`${WEB}/sign-in`)
      const button = page.getByTestId('sso-start-feishu')
      await button.waitFor()
      assert((await button.innerText()).includes('使用飞书登录'), `按钮文案不对 ${await button.innerText()}`)
      await shot({ page, name: 'f2-login-feishu-dark-390' })
    }
    finally {
      await context.close()
    }
  })

  const rejected = (name, next, code) => check(name, async () => {
    await control('/__admin/next', next)
    const before = await memberByEmail({ token, email: next.email })
    const result = await signIn({ email: next.email })
    try {
      assert(!result.ok && result.code === code, `应被拒绝为 ${code}，实际 ${JSON.stringify({ ok: result.ok, code: result.code })}`)
      assert((await result.page.evaluate(() => window.localStorage.getItem('token'))) === null, '不应有会话令牌')
      const after = await memberByEmail({ token, email: next.email })
      assert((before === null) === (after === null), '账号数量不应变化')
      await shot({ page: result.page, name: `f-${code.toLowerCase()}` })
    }
    finally {
      await result.context.close()
    }
  })

  await rejected('F3 飞书账号属于另一个企业（tenant_key 不一致）被拒绝', { email: 'ops@acme.test', tenantKey: 'tenant-other' }, 'ENTERPRISE_MISMATCH')
  await rejected('F4 飞书没有返回邮箱（应用没开邮箱权限）被拒绝并提示', { email: 'ops@acme.test', omitEmail: true }, 'EMAIL_MISSING')
  await rejected('F5 邮箱域名不在允许列表被拒绝', { email: 'outsider@other.test' }, 'DOMAIN_NOT_ALLOWED')
  await rejected('F6 用户在飞书授权页点了拒绝', { email: 'ops@acme.test', deny: true }, 'IDP_DENIED')

  await check('F7 飞书那边应用密钥被换掉：被拒绝并提示管理员检查', async () => {
    await control('/__admin/secret', { secret: 'rotated-secret' })
    await control('/__admin/next', { email: 'ops@acme.test' })
    const result = await signIn({ email: 'ops@acme.test' })
    await control('/__admin/secret', { secret: APP_SECRET })
    try {
      assert(!result.ok && result.code === 'CLIENT_REJECTED', `应得到 CLIENT_REJECTED，实际 ${result.code}`)
    }
    finally {
      await result.context.close()
    }
  })

  await check('F8 飞书用户被停用后无法登录', async () => {
    await control('/__admin/next', { email: 'newhire@acme.test' })
    const member = await memberByEmail({ token, email: 'newhire@acme.test' })
    await apiRequest({ method: 'POST', url: `/v1/tenant-access/members/${member.id}/disable`, token })
    const result = await signIn({ email: 'newhire@acme.test' })
    try {
      assert(!result.ok && result.code === 'USER_DISABLED', `应得到 USER_DISABLED，实际 ${result.code}`)
    }
    finally {
      await result.context.close()
    }
  })
}
finally {
  await resetTenant({ token })
  stopPort({ port: FEISHU_PORT })
  await browser.close()
}
summary()
