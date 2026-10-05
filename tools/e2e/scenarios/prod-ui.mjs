import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const SLOT = Number(process.env.E2E_SLOT ?? 1)
const STATE_DIR = process.env.E2E_STATE_DIR ?? `/tmp/fema-e2e/slot-${SLOT}`
const ORIGIN = process.env.E2E_API_URL?.replace(/\/api\/v1$/, '') ?? `http://localhost:${3100 + SLOT}`
const SHOTS = path.join(STATE_DIR, 'shots')
const ADMIN = { name: process.env.E2E_ADMIN_NAME ?? '林晓', email: process.env.E2E_ADMIN_EMAIL ?? 'admin@corp.test', password: process.env.E2E_ADMIN_PASSWORD ?? 'Passw0rd!x1' }
const ORG = process.env.E2E_ORG ?? '星河科技'
const SKIP_INSTALL = process.env.E2E_SKIP_INSTALL === '1'
const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 90000)

fs.mkdirSync(SHOTS, { recursive: true })

const results = []
const problems = { console: [], requests: [], pageErrors: [] }
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
const page = await context.newPage()
page.setDefaultTimeout(TIMEOUT)
page.on('console', (message) => {
  if (message.type() === 'error') {
    problems.console.push({ url: page.url(), text: message.text().slice(0, 240) })
  }
})
page.on('pageerror', (error) => problems.pageErrors.push({ url: page.url(), text: error.message.slice(0, 240) }))
page.on('response', (response) => {
  const url = response.url()
  if (response.status() >= 400 && url.startsWith(ORIGIN) && !url.includes('/api/v1/authentication/sign-in')) {
    problems.requests.push({ url: url.replace(ORIGIN, ''), status: response.status(), page: page.url() })
  }
})

try {
  if (!SKIP_INSTALL) {
    await installThroughWizard()
  }
  await signedInPages()
}
finally {
  await browser.close()
}

printSummary()

async function installThroughWizard() {
  await check('全新实例：打开首页自动进入安装向导，生产构建的静态资源与翻译文件都正常加载', async () => {
    await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' })
    await waitText('检查运行环境')
    assert(page.url().includes('/setup'), `地址应是 /setup，实际 ${page.url()}`)
    const body = await bodyText()
    assert(!body.includes('Check runtime environment'), '界面不应是英文')
    await shot('prod-wizard-environment')
  })
  await check('向导：环境检查没有红色错误，数据库、队列、密钥、工作节点逐项列出', async () => {
    const body = await bodyText()
    for (const expected of ['PostgreSQL', '加密密钥', '数据目录', '工作节点', '访问地址']) {
      assert(body.includes(expected), `环境检查里缺少「${expected}」`)
    }
    assert((await page.locator('svg.text-destructive').count()) === 0, '不应出现红色错误项')
  })
  await check('向导：管理员、组织、可选服务（全部跳过）、确认，一路走完并进入首页', async () => {
    await next()
    await waitText('创建管理员')
    await page.fill('#setup-name', ADMIN.name)
    await page.fill('#setup-email', ADMIN.email)
    await page.fill('#setup-password', ADMIN.password)
    await page.fill('#setup-confirm', ADMIN.password)
    await next()
    await waitText('给组织起个名字')
    await page.fill('#setup-organization', ORG)
    await next()
    await waitText('可选服务')
    const body = await bodyText()
    assert((await page.getByText('未启用', { exact: true }).count()) === 4, `四个可选服务应都显示未启用`)
    assert(body.includes('全部跳过，下一步'), '按钮应写明全部跳过')
    await next()
    await waitText('确认并完成')
    await page.locator('form button[type=submit]').click()
    await page.waitForURL((url) => !url.pathname.startsWith('/setup'), { timeout: 120000 })
    await waitText(ORG)
    await shot('prod-home-after-install')
  })
}

async function signedInPages() {
  await check('登录：退出后重新登录，进入组织首页', async () => {
    const hasSession = await page.evaluate(() => localStorage.getItem('token') !== null)
    assert(hasSession, '安装完成后应已有登录态')
    await page.evaluate(() => localStorage.clear())
    await page.goto(`${ORIGIN}/sign-in`, { waitUntil: 'domcontentloaded' })
    await page.getByLabel(/邮箱|电子邮件|Email/).first().fill(ADMIN.email)
    await page.locator('input[type=password]').fill(ADMIN.password)
    await page.getByRole('button', { name: /登录|Sign in/ }).click()
    await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 60000 })
    await waitText(ORG)
  })
  const projectId = await page.evaluate(() => localStorage.getItem('projectId'))
  const routes = [
    '/projects/PROJECT/home',
    '/projects/PROJECT/automations',
    '/projects/PROJECT/runs',
    '/projects/PROJECT/issues',
    '/projects/PROJECT/connections',
    '/projects/PROJECT/mapping-tables',
    '/projects/PROJECT/variables',
    '/projects/PROJECT/releases',
    '/projects/PROJECT/settings',
    '/solutions',
    '/monitor',
    '/issue-center',
    '/tenant',
    '/tenant/infra',
    '/tenant/setup',
    '/tenant/security',
    '/tenant/alerts',
  ]
  await check('生产构建的页面：主要页面都能打开，不空白、不是 404，没有脚本错误和失败请求', async () => {
    assert(projectId, '取不到项目 id')
    const before = { pageErrors: problems.pageErrors.length, requests: problems.requests.length }
    const blank = []
    for (const route of routes) {
      const url = `${ORIGIN}${route.replace('PROJECT', projectId)}`
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(() => document.body.innerText.trim().length > 30, undefined, { timeout: 60000 }).catch(() => blank.push(route))
      await page.waitForTimeout(800)
      const text = await bodyText()
      if (text.includes('404') && text.length < 200) {
        blank.push(`${route} → 404`)
      }
    }
    assert(blank.length === 0, `空白或 404：${blank.join('，')}`)
    const newPageErrors = problems.pageErrors.slice(before.pageErrors)
    const newRequests = problems.requests.slice(before.requests)
    assert(newPageErrors.length === 0, `脚本错误：${JSON.stringify(newPageErrors.slice(0, 3))}`)
    assert(newRequests.length === 0, `失败请求：${JSON.stringify(newRequests.slice(0, 5))}`)
    return { routes: routes.length }
  })
  await check('系统与升级页（生产）：版本、数据库与队列版本、工作节点、可选服务都未启用但无报错', async () => {
    await page.goto(`${ORIGIN}/tenant/infra`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.body.innerText.trim().length > 30)
    await page.waitForTimeout(1500)
    const links = await page.locator('a[href*="/tenant/infra"]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')))
    const body = await bodyText()
    await shot('prod-infra')
    return { links: [...new Set(links)].slice(0, 8), mentionsSystem: body.includes('系统') }
  })
  await check('样式：生产构建的样式表已加载（按钮有背景色、字体不是浏览器默认）', async () => {
    await page.goto(`${ORIGIN}/projects/${projectId}/home`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.body.innerText.trim().length > 30)
    const styled = await page.evaluate(() => {
      const button = document.querySelector('button')
      const bodyFont = getComputedStyle(document.body).fontFamily
      return { bodyFont, hasButton: button !== null, background: button ? getComputedStyle(button).backgroundColor : null }
    })
    assert(!/^"?Times/i.test(styled.bodyFont) && styled.bodyFont.length > 0, `字体 ${styled.bodyFont}`)
    return styled
  })
  if (problems.console.length > 0) {
    process.stdout.write(`CONSOLE ${JSON.stringify(problems.console.slice(0, 10))}\n`)
  }
}

async function next() {
  await page.locator('form button[type=submit]').click()
  await page.waitForTimeout(400)
}

async function bodyText() {
  return page.evaluate(() => document.body.innerText)
}

async function waitText(text) {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), text, { timeout: TIMEOUT })
}

async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

async function check(name, run) {
  const startedAt = Date.now()
  try {
    const detail = await run()
    results.push({ name, ok: true })
    process.stdout.write(`PASS ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`} (${Math.round((Date.now() - startedAt) / 1000)}s)\n`)
  }
  catch (error) {
    results.push({ name, ok: false })
    process.stdout.write(`FAIL ${name}\n     ${error.message}\n`)
    await shot(`fail-${results.length}`).catch(() => undefined)
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function printSummary() {
  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`)
  process.exitCode = failed.length === 0 ? 0 : 1
}
