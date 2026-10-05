import { ADMIN, API, CLIENT_SECRET, REAL_IDP, WEB, adminSession, freshApi, apiRequest, assert, check, launchBrowser, listAudit, openContext, restartRealIdp, shot, sleep, summary } from './sso-kit.mjs'
import { idpLogin, interceptCallbackRedirect, memberByEmail, resetTenant, saveOidcConfig, signInWithSso, verifyAndEnable, waitForOutcome } from './sso-flows.mjs'

freshApi()
const browser = await launchBrowser()
const open = (options = {}) => openContext({ browser, ...options })
const admin = await adminSession()
const token = admin.token

await restartRealIdp({ env: { IDP_CODE_TTL: '60' } })
await resetTenant({ token })

try {
  await configure()
  await signIns()
  await rejections()
  await enforcement()
  await audit()
}
finally {
  await resetTenant({ token })
  await browser.close()
}
summary()

async function configure() {
  await check('A1 管理员在设置页看到 OIDC 行：未配置时只有「配置」，开关关闭', async () => {
    await restartRealIdp({ env: {} })
    const { context, page } = await open()
    try {
      await signIn({ page })
      await page.goto(`${WEB}/tenant/security/authentication`)
      const row = page.getByTestId('login-method-OIDC')
      await row.waitFor()
      await shot({ page, name: 'a01-settings-before' })
      assert(await row.getByRole('switch').isDisabled(), '没配置时开关应不可用')
    }
    finally {
      await context.close()
    }
  })

  await check('A2 在界面里配置 OIDC：颁发者写错时给出可读原因，写对后保存成功，保存后还没测试过所以不能直接启用', async () => {
    const { context, page } = await open()
    try {
      await signIn({ page })
      await page.goto(`${WEB}/tenant/security/authentication`)
      await page.getByTestId('sso-configure-OIDC').click()
      await fillOidc({ page, issuer: `${REAL_IDP}/not-an-issuer` })
      await page.getByTestId('sso-save').click()
      await page.getByText(/discovery document|发现文档|HTTP 404/i).first().waitFor({ timeout: 20000 })
      await shot({ page, name: 'a02-issuer-error' })
      await page.getByTestId('sso-field-issuer').fill(REAL_IDP)
      await page.getByTestId('sso-save').click()
      await page.getByTestId('sso-status-OIDC').waitFor()
      const status = await page.getByTestId('sso-status-OIDC').innerText()
      assert(status.includes('还没测试过'), `状态行应提示还没测试：${status}`)
      assert(await page.getByTestId('login-method-OIDC').getByRole('switch').isDisabled(), '未测试通过时开关应不可用')
    }
    finally {
      await context.close()
    }
  })

  await check('A3 测试登录：跳到身份提供方，用管理员自己的账号登录后回到设置页并显示通过，之后才能启用', async () => {
    const { context, page } = await open()
    try {
      await signIn({ page })
      await page.goto(`${WEB}/tenant/security/authentication`)
      await page.getByTestId('sso-test-OIDC').click()
      await idpLogin({ page, email: ADMIN.email })
      await page.getByTestId('sso-test-result').waitFor()
      assert((await page.getByTestId('sso-test-result').getAttribute('data-result')) === 'ok', '测试结果应为 ok')
      await shot({ page, name: 'a03-test-passed' })
      const sw = page.getByTestId('login-method-OIDC').getByRole('switch')
      await sw.waitFor()
      await page.waitForFunction(() => !document.querySelector('[data-testid="login-method-OIDC"] [role="switch"]')?.hasAttribute('disabled'))
      await sw.click()
      await page.getByTestId('login-method-OIDC').getByText('打开').waitFor()
      await shot({ page, name: 'a03-enabled' })
    }
    finally {
      await context.close()
    }
  })

  await check('A4 登录页出现「使用公司账号登录」，亮色、暗色、窄屏都能看到并且不横向溢出', async () => {
    for (const [theme, width] of [['light', 1280], ['dark', 1280], ['light', 390], ['dark', 390]]) {
      const { context, page } = await open({ theme, width, height: 900 })
      try {
        await page.goto(`${WEB}/sign-in`)
        const button = page.getByTestId('sso-start-oidc')
        await button.waitFor()
        assert((await button.innerText()).includes('使用公司账号登录'), `按钮文案不对：${await button.innerText()}`)
        const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
        assert(isDark === (theme === 'dark'), `主题应为 ${theme}`)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        assert(overflow <= 1, `${theme} ${width}px 横向溢出 ${overflow}px`)
        await shot({ page, name: `a04-login-${theme}-${width}` })
      }
      finally {
        await context.close()
      }
    }
  })

  await check('A5 配置对话框和设置页在暗色、窄屏下可读且不溢出', async () => {
    for (const [theme, width] of [['dark', 1280], ['dark', 390], ['light', 390]]) {
      const { context, page } = await open({ theme, width, height: 900 })
      try {
        await signIn({ page })
        await page.goto(`${WEB}/tenant/security/authentication`)
        await page.getByTestId('login-method-OIDC').waitFor()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        assert(overflow <= 1, `设置页 ${theme} ${width}px 横向溢出 ${overflow}px`)
        await shot({ page, name: `a05-settings-${theme}-${width}` })
        await page.getByTestId('sso-configure-OIDC').click()
        await page.getByTestId('sso-field-issuer').waitFor()
        await shot({ page, name: `a05-dialog-${theme}-${width}` })
      }
      finally {
        await context.close()
      }
    }
  })
}

async function signIns() {
  await check('B1 公司账号首次登录：自动创建账号并进入产品，角色按分组映射（普通员工、运维分组、管理员分组）', async () => {
    const cases = [['member@acme.test', 'MEMBER'], ['ops@acme.test', 'OPERATOR'], ['newhire@acme.test', 'MEMBER']]
    for (const [email, role] of cases) {
      const result = await signInWithSso({ open, email })
      try {
        assert(result.ok, `${email} 应登录成功：${result.code} ${result.message}`)
        const member = await memberByEmail({ token, email })
        assert(member !== null && member.tenantRole === role, `${email} 的角色应为 ${role}，实际 ${member?.tenantRole}`)
        if (email === 'member@acme.test') {
          await shot({ page: result.page, name: 'b01-signed-in' })
        }
      }
      finally {
        await result.context.close()
      }
    }
  })

  await check('B2 同一个人再次登录匹配已有账号，不会重复创建', async () => {
    const before = (await apiRequest({ url: '/v1/tenant-access/members', token })).json.members.filter((member) => member.email === 'member@acme.test').length
    const result = await signInWithSso({ open, email: 'member@acme.test' })
    try {
      assert(result.ok, `应登录成功：${result.code}`)
      const after = (await apiRequest({ url: '/v1/tenant-access/members', token })).json.members.filter((member) => member.email === 'member@acme.test').length
      assert(before === 1 && after === 1, `成员数应保持 1，前 ${before} 后 ${after}`)
    }
    finally {
      await result.context.close()
    }
  })
}

async function rejections() {
  const expectRejected = async ({ name, email, code, intercept, prepare, restore }) => {
    await check(name, async () => {
      if (prepare !== undefined) {
        await prepare()
      }
      const before = await memberByEmail({ token, email })
      const result = await signInWithSso({ open, email, intercept })
      try {
        assert(!result.ok && result.code === code, `应被拒绝为 ${code}，实际 ${JSON.stringify({ ok: result.ok, code: result.code })}`)
        assert(result.message.length > 8, '应给出可读原因')
        const stored = await result.page.evaluate(() => window.localStorage.getItem('token'))
        assert(stored === null, '被拒绝后不应有会话令牌')
        const after = await memberByEmail({ token, email })
        assert(before === null ? after === null : after !== null, `账号数量不应变化：前 ${before?.id} 后 ${after?.id}`)
        await shot({ page: result.page, name: `c-${code.toLowerCase()}` })
      }
      finally {
        await result.context.close()
        if (restore !== undefined) {
          await restore()
        }
      }
    })
  }

  await expectRejected({ name: 'C1 邮箱未验证的身份提供方用户被拒绝，且不创建账号', email: 'unverified@acme.test', code: 'EMAIL_NOT_VERIFIED' })
  await expectRejected({ name: 'C2 邮箱域名不在允许列表被拒绝，且不创建账号', email: 'outsider@other.test', code: 'DOMAIN_NOT_ALLOWED' })

  await check('C3 已停用用户被拒绝，已签发的令牌也立刻失效', async () => {
    const first = await signInWithSso({ open, email: 'disabled@acme.test' })
    assert(first.ok, `先要能登录：${first.code}`)
    const issued = first.token
    await first.context.close()
    const member = await memberByEmail({ token, email: 'disabled@acme.test' })
    const off = await apiRequest({ method: 'POST', url: `/v1/tenant-access/members/${member.id}/disable`, token })
    assert(off.status === 200, `停用失败 ${off.text}`)
    const stale = await apiRequest({ url: '/v1/tenant-access/me', token: issued })
    assert(stale.status === 403 && stale.json?.code === 'SESSION_EXPIRED', `已签发令牌应立刻失效，实际 ${stale.status} ${stale.text}`)
    const second = await signInWithSso({ open, email: 'disabled@acme.test' })
    try {
      assert(!second.ok && second.code === 'USER_DISABLED', `应被拒绝为 USER_DISABLED，实际 ${second.code}`)
      await shot({ page: second.page, name: 'c3-disabled' })
    }
    finally {
      await second.context.close()
    }
    await apiRequest({ method: 'POST', url: `/v1/tenant-access/members/${member.id}/enable`, token })
  })

  await expectRejected({
    name: 'C4 授权码过期被拒绝（回调被拖到授权码失效之后）',
    email: 'member@acme.test',
    code: 'CODE_REJECTED',
    prepare: () => restartRealIdp({ env: { IDP_CODE_TTL: '2' } }),
    restore: () => restartRealIdp({ env: { IDP_CODE_TTL: '60' } }),
    intercept: async ({ location, fulfill }) => {
      await sleep(4500)
      await fulfill(location)
    },
  })

  await expectRejected({
    name: 'C5 state 被篡改被拒绝',
    email: 'member@acme.test',
    code: 'STATE_INVALID',
    intercept: async ({ location, fulfill }) => {
      const url = new URL(location)
      url.searchParams.set('state', `${url.searchParams.get('state')}x`)
      await fulfill(url.toString())
    },
  })

  await check('C6 重放同一个回调链接被拒绝', async () => {
    let captured = null
    const result = await signInWithSso({
      open,
      email: 'member@acme.test',
      intercept: async ({ location, fulfill }) => {
        captured = location
        await fulfill(location)
      },
    })
    try {
      assert(result.ok, `首次应成功：${result.code}`)
      const replay = await result.context.request.get(captured, { maxRedirects: 0 })
      const location = replay.headers().location ?? ''
      assert(location.includes('ssoError=STATE_REPLAYED'), `重放应得到 STATE_REPLAYED，实际 ${replay.status()} ${location}`)
    }
    finally {
      await result.context.close()
    }
  })

  await check('C7 回调在另一个浏览器里完成（没有发起登录时的绑定 Cookie）被拒绝', async () => {
    let captured = null
    const first = await open()
    await first.page.goto(`${WEB}/sign-in`)
    await interceptCallbackRedirect({
      page: first.page,
      handler: async ({ location, abort }) => {
        captured = location
        await abort()
      },
    })
    await first.page.getByTestId('sso-start-oidc').click()
    await idpLogin({ page: first.page, email: 'member@acme.test' })
    await sleep(1500)
    await first.context.close()
    assert(captured !== null, '应截获回调链接')
    const other = await open()
    try {
      const response = await other.context.request.get(captured, { maxRedirects: 0 })
      const location = response.headers().location ?? ''
      assert(location.includes('ssoError=BROWSER_MISMATCH'), `应得到 BROWSER_MISMATCH，实际 ${response.status()} ${location}`)
    }
    finally {
      await other.context.close()
    }
  })

  await expectRejected({
    name: 'C8 身份提供方那边客户端密钥被换掉，登录被拒绝且给出管理员可读的原因',
    email: 'member@acme.test',
    code: 'CLIENT_REJECTED',
    prepare: () => restartRealIdp({ env: { IDP_CLIENT_SECRET: 'rotated-at-the-provider' } }),
    restore: () => restartRealIdp({ env: {} }),
  })

  await check('C9 颁发者与配置不一致：保存被拒绝，并同时写出两个地址', async () => {
    const response = await saveOidcConfig({ token, issuer: `${REAL_IDP}/`, clientSecret: CLIENT_SECRET })
    assert(response.status === 409, `应被拒绝，实际 ${response.status} ${response.text}`)
    const message = response.json?.params?.message ?? ''
    assert(message.includes(REAL_IDP), `提示里应包含身份提供方报告的颁发者：${message}`)
  })

  await check('C10 关掉登录方式后，登录页不再出现按钮，直接访问发起地址被带回登录页并提示', async () => {
    await apiRequest({ method: 'POST', url: '/v1/tenant-access/sso/OIDC/enabled', token, body: { enabled: false } })
    const { context, page } = await open()
    try {
      await page.goto(`${WEB}/sign-in`)
      await page.waitForTimeout(2000)
      assert(await page.getByTestId('sso-start-oidc').count() === 0, '关掉后不应有按钮')
      await page.goto(`${API}/v1/authn/sso/start?provider=OIDC`)
      await page.getByTestId('sso-error').waitFor()
      assert((await page.getByTestId('sso-error').getAttribute('data-code')) === 'PROVIDER_NOT_ENABLED', '应提示没有启用')
    }
    finally {
      await context.close()
    }
    const on = await apiRequest({ method: 'POST', url: '/v1/tenant-access/sso/OIDC/enabled', token, body: { enabled: true } })
    assert(on.status === 200, `重新启用失败 ${on.text}`)
  })
}

async function enforcement() {
  await check('D1 强制单点登录：关闭密码登录后，密码登录接口被拒绝，登录页只剩公司账号按钮，公司账号仍能登录', async () => {
    const off = await apiRequest({ method: 'POST', url: '/v1/tenant-access/login-security', token, body: { emailAuthEnabled: false } })
    assert(off.status === 200, `关闭密码登录失败 ${off.text}`)
    const attempt = await apiRequest({ method: 'POST', url: '/v1/authentication/sign-in', body: ADMIN })
    assert(attempt.status === 403 && attempt.json?.code === 'EMAIL_AUTH_DISABLED', `密码登录应被拒绝，实际 ${attempt.status} ${attempt.text}`)
    const { context, page } = await open()
    try {
      await page.goto(`${WEB}/sign-in`)
      await page.getByTestId('sso-start-oidc').waitFor()
      assert(await page.getByTestId('sign-in-password').count() === 0, '不应再出现密码输入框')
      await shot({ page, name: 'd1-sso-only' })
    }
    finally {
      await context.close()
    }
    const result = await signInWithSso({ open, email: 'member@acme.test' })
    try {
      assert(result.ok, `公司账号仍应能登录：${result.code}`)
    }
    finally {
      await result.context.close()
    }
    const sso = await signInWithSsoAdminToken()
    const back = await apiRequest({ method: 'POST', url: '/v1/tenant-access/login-security', token: sso, body: { emailAuthEnabled: true } })
    assert(back.status === 200, `恢复密码登录失败 ${back.text}`)
  })
}

async function audit() {
  await check('E1 审计日志：登录失败、单点登录配置变更、单点登录成功都能按动作筛到', async () => {
    const failed = await listAudit({ token, action: 'user.sign.in.failed' })
    assert(failed.length >= 5, `登录失败至少应有 5 条，实际 ${failed.length}`)
    const codes = failed.map((event) => event.data.detail).join(' ')
    for (const code of ['EMAIL_NOT_VERIFIED', 'DOMAIN_NOT_ALLOWED', 'USER_DISABLED', 'STATE_INVALID', 'STATE_REPLAYED', 'BROWSER_MISMATCH', 'CLIENT_REJECTED', 'CODE_REJECTED', 'EMAIL_AUTH_DISABLED']) {
      assert(codes.includes(code), `审计里应有 ${code}`)
    }
    const config = await listAudit({ token, action: 'tenant.sso.settings.updated' })
    assert(config.length >= 2, `配置变更应有记录，实际 ${config.length}`)
    assert(!JSON.stringify(config).includes(CLIENT_SECRET), '审计里不应出现密钥')
    const signedIn = await listAudit({ token, action: 'user.signed.in' })
    assert(signedIn.some((event) => event.data.method === 'sso'), '应有单点登录成功的记录')
  })

  await check('E2 审计日志页能筛到登录失败，并显示可读的中文动作名', async () => {
    const { context, page } = await open()
    try {
      await signIn({ page })
      await page.goto(`${WEB}/tenant/audit?action=user.sign.in.failed`)
      await page.getByText('登录失败').first().waitFor({ timeout: 30000 })
      await page.getByText('DOMAIN_NOT_ALLOWED').first().waitFor()
      await shot({ page, name: 'e2-audit-failed' })
    }
    finally {
      await context.close()
    }
  })
}

async function signIn({ page }) {
  await page.goto(`${WEB}/sign-in`)
  await page.getByTestId('sign-in-email').fill(ADMIN.email)
  await page.getByTestId('sign-in-password').fill(ADMIN.password)
  await page.getByTestId('sign-in-button').click()
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 60000 })
}

async function fillOidc({ page, issuer }) {
  await page.getByTestId('sso-field-issuer').fill(issuer)
  await page.getByTestId('sso-field-clientId').fill('fema-e2e')
  await page.getByTestId('sso-field-clientSecret').fill(CLIENT_SECRET)
  await page.getByTestId('sso-field-scopes').fill('openid email profile groups')
  await page.getByTestId('sso-allowed-domains').fill('acme.test\nap.com')
  await page.getByTestId('sso-switch-mapRoles').click()
  await page.getByRole('button', { name: '添加规则' }).click()
  await page.getByPlaceholder('分组值').first().fill('fema-admins')
  await ruleRoleTrigger({ page, index: 0 }).click()
  await page.getByRole('option', { name: '管理员' }).click()
  await page.getByRole('button', { name: '添加规则' }).click()
  await page.getByPlaceholder('分组值').nth(1).fill('fema-ops')
  await ruleRoleTrigger({ page, index: 1 }).click()
  await page.getByRole('option', { name: '操作员' }).click()
}

function ruleRoleTrigger({ page, index }) {
  return page.getByPlaceholder('分组值').nth(index).locator('xpath=following-sibling::*[@role="combobox"][1]')
}

async function signInWithSsoAdminToken() {
  const session = await adminSessionViaSso()
  return session
}

async function adminSessionViaSso() {
  const result = await signInWithSso({ open, email: ADMIN.email })
  try {
    assert(result.ok, `管理员用公司账号登录失败：${result.code}`)
    return result.token
  }
  finally {
    await result.context.close()
  }
}

void waitForOutcome
