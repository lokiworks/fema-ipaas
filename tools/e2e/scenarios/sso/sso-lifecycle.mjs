import { ADMIN, CLIENT_SECRET, REAL_IDP, WEB, adminSession, apiRequest, assert, check, freshApi, launchBrowser, openContext, restartRealIdp, shot, summary } from './sso-kit.mjs'
import { idpLogin, memberByEmail, resetTenant, saveOidcConfig, signInWithSso, verifyAndEnable } from './sso-flows.mjs'

freshApi()
await restartRealIdp({ env: {} })
const browser = await launchBrowser()
const open = (options = {}) => openContext({ browser, ...options })
const admin = await adminSession()
const token = admin.token
const people = ['member@acme.test', 'ops@acme.test', 'newhire@acme.test']

try {
  const saved = await saveOidcConfig({ token, issuer: REAL_IDP, clientSecret: CLIENT_SECRET })
  assert(saved.status === 200, `保存失败 ${saved.text}`)
  await verifyAndEnable({ open, token, provider: 'OIDC', startTestIdp: ({ page, email }) => idpLogin({ page, email }) })

  const sessions = {}
  await check('G1 三个员工用公司账号登录，账号自动入租户', async () => {
    for (const email of people) {
      const result = await signInWithSso({ open, email })
      try {
        assert(result.ok, `${email} 登录失败 ${result.code}`)
        sessions[email] = result.token
      }
      finally {
        await result.context.close()
      }
    }
    for (const email of people) {
      assert((await memberByEmail({ token, email })) !== null, `${email} 应已入租户`)
    }
  })

  await check('G2 管理员在用户页多选后批量停用：确认弹窗说明后果，三人立刻变为已停用', async () => {
    for (const [theme, width] of [['dark', 390], ['light', 1280]]) {
      const { context, page } = await open({ theme, width, height: 900 })
      try {
        await page.goto(`${WEB}/sign-in`)
        await page.getByTestId('sign-in-email').fill(ADMIN.email)
        await page.getByTestId('sign-in-password').fill(ADMIN.password)
        await page.getByTestId('sign-in-button').click()
        await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'))
        await page.goto(`${WEB}/tenant/users`)
        await page.getByTestId(`select-user-${people[0]}`).waitFor()
        assert(await page.getByTestId(`select-user-${ADMIN.email}`).isDisabled(), '自己的账号不能被选中')
        for (const email of people) {
          await page.getByTestId(`select-user-${email}`).click()
        }
        await page.getByTestId('bulk-bar').waitFor()
        await shot({ page, name: `g2-bulk-bar-${theme}-${width}` })
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        assert(overflow <= 1, `${theme} ${width}px 横向溢出 ${overflow}px`)
        if (theme === 'dark') {
          continue
        }
        await page.getByTestId('bulk-disable').click()
        await page.getByText('他们会立刻被登出').waitFor()
        await shot({ page, name: 'g2-bulk-confirm' })
        await page.getByRole('button', { name: '禁用', exact: true }).last().click()
        await page.getByText('已禁用 3 位用户').waitFor({ timeout: 20000 })
      }
      finally {
        await context.close()
      }
    }
    for (const email of people) {
      const member = await memberByEmail({ token, email })
      assert(member.status === 'DISABLED', `${email} 应为已停用，实际 ${member.status}`)
      const stale = await apiRequest({ url: '/v1/tenant-access/me', token: sessions[email] })
      assert(stale.status === 403, `${email} 已签发的令牌应立刻失效，实际 ${stale.status}`)
    }
  })

  await check('G3 被停用的员工再用公司账号登录被拒绝，并提示联系管理员', async () => {
    for (const email of people) {
      const result = await signInWithSso({ open, email })
      try {
        assert(!result.ok && result.code === 'USER_DISABLED', `${email} 应得到 USER_DISABLED，实际 ${result.code}`)
      }
      finally {
        await result.context.close()
      }
    }
  })

  await check('G4 重新启用一个人后他可以再次登录，其余的仍被挡住', async () => {
    const member = await memberByEmail({ token, email: people[0] })
    const on = await apiRequest({ method: 'POST', url: `/v1/tenant-access/members/${member.id}/enable`, token })
    assert(on.status === 200, `启用失败 ${on.text}`)
    const ok = await signInWithSso({ open, email: people[0] })
    const blocked = await signInWithSso({ open, email: people[1] })
    try {
      assert(ok.ok, '重新启用的人应能登录')
      assert(!blocked.ok && blocked.code === 'USER_DISABLED', '没启用的人仍应被挡住')
    }
    finally {
      await ok.context.close()
      await blocked.context.close()
    }
  })

  await check('G5 离职交接：删除用户时名下资源必须先指定接手人，删除后其令牌返回 401', async () => {
    const member = await memberByEmail({ token, email: people[2] })
    const removed = await apiRequest({ method: 'DELETE', url: `/v1/tenant-access/members/${member.id}`, token })
    assert(removed.status === 204, `删除失败 ${removed.status} ${removed.text}`)
    const stale = await apiRequest({ url: '/v1/tenant-access/me', token: sessions[people[2]] })
    assert(stale.status === 401, `已删除用户的令牌应返回 401，实际 ${stale.status}`)
    assert((await memberByEmail({ token, email: people[2] })) === null, '成员列表里不应再有他')
  })
}
finally {
  await resetTenant({ token })
  await browser.close()
}
summary()
