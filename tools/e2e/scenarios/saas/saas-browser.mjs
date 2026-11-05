import { chromium } from '@playwright/test'

import { PASSWORD } from './saas-fixtures.mjs'
import { ADMIN, ISSUER, SHOTS, WEB, assert, check, loadState, sleep, summary } from './saas-kit.mjs'

const phase = process.env.SAAS_BROWSER_PHASE ?? 'federation'
const browser = await chromium.launch()

try {
  if (phase === 'zero') {
    await zeroConfig()
  }
  else {
    await federation({ state: loadState() })
  }
}
finally {
  await browser.close()
}
summary({ name: `saas-browser-${phase}` })

async function zeroConfig() {
  await check('ZB 单租户实例：浏览器里用邮箱密码登录直接进入工作台，不出现选择租户', async () => {
    const { context, page } = await open()
    try {
      await page.goto(`${WEB}/sign-in`)
      await page.getByTestId('sign-in-email').fill(ADMIN.email)
      await page.getByTestId('sign-in-password').fill(ADMIN.password)
      await page.getByTestId('sign-in-button').click()
      await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 60000 })
      await sleep(1500)
      assert(!/select-tenant|choose-tenant/.test(page.url()), `不应出现选择租户：${page.url()}`)
      assert(await page.getByTestId('tenant-selection').count() === 0, '不应出现选择租户界面')
      await page.screenshot({ path: `${SHOTS}/zb-single-tenant-home.png` })
    }
    finally {
      await context.close()
    }
  })
}

async function federation({ state }) {
  await check('B1 甲属主在浏览器里从「集成」入口登录：fema-iam 登录页 → 回到 iPaaS 工作台，页面里没有乙', async () => {
    const { context, page } = await open()
    try {
      await page.goto(state.tenants.alpha.ssoStartUrl)
      await iamLogin({ page, username: 'alice' })
      const outcome = await waitForOutcome({ page })
      assert(outcome.ok, `登录没有完成：${outcome.message}`)
      await sleep(2000)
      await page.screenshot({ path: `${SHOTS}/b1-alpha-owner-home.png` })
      const text = await page.locator('body').innerText()
      assert(!text.includes(state.tenants.beta.name), '甲的页面里不应出现乙的租户名')
    }
    finally {
      await context.close()
    }
  })

  await check('B2 乙家成员从甲的入口登录：回到登录页并提示失败原因，没有进入工作台', async () => {
    const { context, page } = await open()
    try {
      await page.goto(state.tenants.alpha.ssoStartUrl)
      await iamLogin({ page, username: 'dave' })
      const outcome = await waitForOutcome({ page })
      assert(!outcome.ok, `乙家成员不应进入甲：${page.url()}`)
      assert(new URL(page.url()).pathname.startsWith('/sign-in'), `应停在登录页：${page.url()}`)
      const notice = page.getByTestId('sso-error')
      await notice.first().waitFor({ timeout: 20000 })
      await sleep(500)
      await page.screenshot({ path: `${SHOTS}/b2-cross-tenant-rejected.png` })
      assert((await notice.first().innerText()).trim().length > 0, '登录页应写明失败原因')
    }
    finally {
      await context.close()
    }
  })

  await check('B3 同一浏览器已登录 fema-iam：先进甲，再从乙的入口进入时不再输入密码', async () => {
    const { context, page } = await open()
    try {
      await page.goto(state.tenants.alpha.ssoStartUrl)
      await iamLogin({ page, username: 'carol' })
      assert((await waitForOutcome({ page })).ok, 'Carol 登录甲失败')
      await page.evaluate(() => window.localStorage.clear())
      await page.goto(state.tenants.beta.ssoStartUrl)
      const sawLogin = await page.waitForURL((url) => url.href.startsWith(ISSUER), { timeout: 5000 }).then(() => page.locator('#username').count()).catch(() => 0)
      assert(sawLogin === 0, '第二家不应再出现 fema-iam 登录页')
      const outcome = await waitForOutcome({ page })
      assert(outcome.ok, `Carol 进入乙失败：${outcome.message}`)
      await page.screenshot({ path: `${SHOTS}/b3-second-tenant-silent.png` })
    }
    finally {
      await context.close()
    }
  })
}

async function open() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' })
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'vite-error-overlay,vite-plugin-checker-error-overlay{display:none!important}'
      document.head.appendChild(style)
    })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(45000)
  return { context, page }
}

async function iamLogin({ page, username }) {
  await page.waitForURL((url) => url.href.startsWith(ISSUER), { timeout: 30000 })
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(PASSWORD)
  await page.locator('#signin').click()
}

async function waitForOutcome({ page, waitMs = 45000 }) {
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    const url = new URL(page.url())
    if (url.pathname.startsWith('/sign-in') && url.searchParams.has('ssoError')) {
      return { ok: false, message: url.searchParams.get('ssoError') }
    }
    if (await page.getByTestId('sso-error').count() > 0) {
      return { ok: false, message: await page.getByTestId('sso-error').first().innerText() }
    }
    const token = await page.evaluate(() => window.localStorage.getItem('token')).catch(() => null)
    if (token && !url.pathname.startsWith('/sign-in') && !url.pathname.startsWith('/sso/') && !url.href.startsWith(ISSUER)) {
      return { ok: true, token }
    }
    await sleep(300)
  }
  return { ok: false, message: `no outcome, stuck at ${page.url()}` }
}
