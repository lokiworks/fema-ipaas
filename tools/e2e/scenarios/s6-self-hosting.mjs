import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

const SLOT = Number(process.env.E2E_SLOT ?? 6)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const STATE_ROOT = process.env.E2E_STATE_ROOT ?? '/tmp/fema-e2e'
const STATE_DIR = path.join(STATE_ROOT, `slot-${SLOT}`)
const SHOTS = path.join(STATE_DIR, 'shots')
const API_PORT = 3100 + SLOT
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 4200 + SLOT)
const REGISTRY_PORT = 18900 + SLOT
const SMTP_PORT = 25000 + SLOT * 10
const WEB = `http://localhost:${WEB_PORT}`
const API = `http://localhost:${API_PORT}/api/v1`
const ADMIN = { name: '林晓', email: 'admin@corp.test', password: 'Passw0rd!x1' }
const ORG = '星河科技'
const ONLY = (process.env.E2E_ONLY ?? '').split(',').filter(Boolean)
const BROWSER_TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 120000)

let activePage = null
const results = []
const fakeSmtp = createFakeSmtp()
const fakeRegistry = createFakeRegistry()

fs.mkdirSync(SHOTS, { recursive: true })

const phases = [
  { name: 'bare', run: bareInstall },
  { name: 'configured', run: configuredServices },
  { name: 'invalid', run: invalidConfiguration },
  { name: 'upgrade', run: upgradeAvailable },
]

for (const phase of phases) {
  if (ONLY.length > 0 && !ONLY.includes(phase.name)) {
    continue
  }
  console.log(`\n== ${phase.name}`)
  await phase.run()
}

await fakeSmtp.close()
await fakeRegistry.close()
if (process.env.E2E_KEEP !== '1') {
  stopStack()
}
printSummary()
process.exit(results.some((result) => !result.ok) ? 1 : 0)

async function bareInstall() {
  const installed = process.env.E2E_SKIP_INSTALL === '1'
  if (!installed) {
    startStack({ E2E_OFFLINE: '1' })
  }
  const { browser, page } = await openBrowser({ width: 1440, height: 900 })
  try {
    await warmUp(page)
    if (!installed) {
      await firstVisit(page)
      await environmentStep(page)
      await administratorStep(page)
      await organizationStep(page)
      await servicesStepSkipped(page)
      await refreshKeepsDraft(page)
      await finishInstall(page)
      await afterInstall(page)
    }
    await affectedPagesWithoutServices(page)
    await systemPagesOffline(page)
  } finally {
    await browser.close()
  }
}

async function warmUp(page) {
  for (const route of ['/', '/setup?step=administrator', '/sign-in']) {
    await page.goto(`${WEB}${route}`, { timeout: 300000 })
    await page.waitForFunction(() => document.body.innerText.trim().length > 40, null, { timeout: 300000 })
  }
}

async function firstVisit(page) {
  await check('S1 全新实例首次打开，自动进入安装向导而不是登录页', async () => {
    await page.goto(`${WEB}/`)
    await waitText(page, '检查运行环境')
    assert(page.url().includes('/setup'), `地址应是 /setup，实际 ${page.url()}`)
    assert(page.url().includes('step=environment') || !page.url().includes('step='), '第一步应是环境检查')
    await shot(page, '10-wizard-environment')
  })
  await responsive(page, 'environment')
  await check('S2 直接打开最后一步的地址，会被退回到还没填完的第一步', async () => {
    await page.goto(`${WEB}/setup?step=review`)
    await waitText(page, '创建管理员')
    assert(page.url().includes('step=administrator'), `应退回到管理员，实际 ${page.url()}`)
  })
  await check('S3 刚装好的实例没有任何后台进程偷偷联网：注册不被外网调用拖慢（离线模式）', async () => {
    const response = await rawApi('GET', '/health/setup')
    assert(response.initialized === false, '全新实例应是未初始化')
  })
  await page.goto(`${WEB}/setup`)
}

async function environmentStep(page) {
  await check('E1 环境检查：数据库、队列、密钥、数据目录、访问地址逐项列出，没有红色错误', async () => {
    await waitText(page, '检查运行环境')
    await waitText(page, '访问地址')
    const body = await bodyText(page)
    for (const expected of ['PostgreSQL', '排队', '加密密钥', '文件', '数据目录', '工作节点', '访问地址']) {
      assert(body.includes(expected), `环境检查里缺少「${expected}」`)
    }
    assert(body.includes('还没有在线的工作节点'), '没有工作节点时应给出警告和排查命令')
    assert((await fieldValues(page)).some((value) => value.includes('docker compose logs worker')), '工作节点警告应附带排查命令')
    assert((await page.locator('svg.text-destructive').count()) === 0, '不应出现红色错误项')
  })
  await check('E2 故意让数据目录不可写：出现错误、写明怎么修、下一步被锁；照界面给的命令修复后恢复', async () => {
    const configDir = path.join(STATE_DIR, 'config')
    fs.chmodSync(configDir, 0o555)
    try {
      await page.getByRole('button', { name: '重新检查' }).click()
      await waitText(page, '平台不能写入')
      const body = await bodyText(page)
      assert(body.includes(configDir), '错误里应写明是哪个目录')
      assert(body.includes('先修复标为错误的项目'), '应提示先修复错误')
      assert(await page.locator('form button[type=submit]').isDisabled(), '数据目录不可写时，下一步应不可点')
      await shot(page, '11-wizard-environment-datadir-error')
      const command = await page.locator('input[readonly]').evaluateAll((inputs, dir) => inputs.map((input) => input.value).find((value) => value.includes(dir)), configDir)
      assert(command, '错误项里应给出可复制的修复命令')
      execFileSync('bash', ['-c', command])
    } finally {
      fs.chmodSync(configDir, 0o755)
    }
    await page.getByRole('button', { name: '重新检查' }).click()
    await waitGone(page, '平台不能写入')
    assert(!(await page.locator('form button[type=submit]').isDisabled()), '修复后下一步应可点')
  })
  await check('E3 加密密钥只存在于环境变量时，提示另存一份；点下一步进入管理员', async () => {
    assert((await bodyText(page)).includes('FEMA_ENCRYPTION_KEY'), '应提示密钥来自环境变量')
    await page.locator('form button[type=submit]').click()
    await waitText(page, '创建管理员')
  })
}

async function administratorStep(page) {
  await check('A1 管理员：什么都不填直接下一步，逐项标红并写明原因', async () => {
    await next(page)
    await waitText(page, '先修正标红的字段')
    const body = await bodyText(page)
    for (const message of ['请输入姓名', '电子邮件是必填项', '密码是必填项', '请再输入一次密码']) {
      assert(body.includes(message), `缺少提示「${message}」`)
    }
    assert(body.includes('先修正标红的字段'), '应提示先修正标红的字段')
    await shot(page, '12-wizard-admin-empty')
  })
  await responsive(page, 'admin-errors')
  await check('A2 弱密码被拦住，且逐条写明还缺什么', async () => {
    await page.fill('#setup-name', ADMIN.name)
    await page.fill('#setup-email', ADMIN.email)
    await page.fill('#setup-password', '12345678')
    await page.fill('#setup-confirm', '12345678')
    await next(page)
    assert((await bodyText(page)).includes('密码必须包含至少一个特殊字符'), '应指出缺少特殊字符')
    await shot(page, '13-wizard-admin-weak-password')
    assert(page.url().includes('step=administrator'), '不应前进')
  })
  await check('A3 两次密码不一致被拦住', async () => {
    await page.fill('#setup-password', ADMIN.password)
    await page.fill('#setup-confirm', `${ADMIN.password}x`)
    await next(page)
    assert((await bodyText(page)).includes('两次输入的密码不一致'), '应提示两次密码不一致')
    await shot(page, '14-wizard-admin-mismatch')
  })
  await check('A4 邮箱格式错误、一次性邮箱域名、姓名含斜杠都被拦住', async () => {
    await page.fill('#setup-confirm', ADMIN.password)
    await page.fill('#setup-email', 'not-an-email')
    await next(page)
    assert((await bodyText(page)).includes('电子邮件无效'), '应提示邮箱无效')
    await page.fill('#setup-email', ADMIN.email)
    await page.fill('#setup-name', 'a/b')
    await next(page)
    assert((await bodyText(page)).includes('姓名不能包含 . 或 /'), '应提示姓名不能含斜杠')
    await page.fill('#setup-name', ADMIN.name)
  })
  await check('A5 全部改对后进入组织信息', async () => {
    await next(page)
    await waitText(page, '给组织起个名字')
  })
}

async function organizationStep(page) {
  await check('O1 组织名称：留空和超过 20 个字都被拦住', async () => {
    await next(page)
    assert((await bodyText(page)).includes('请输入组织名称'), '应提示请输入组织名称')
    await page.fill('#setup-organization', '一二三四五六七八九十一二三四五六七八九十一')
    await next(page)
    assert((await bodyText(page)).includes('组织名称不能超过 20 个字'), '应提示不能超过 20 个字')
    await shot(page, '15-wizard-org-error')
  })
  await check('O2 填好组织名称后进入可选服务', async () => {
    await page.fill('#setup-organization', ORG)
    await next(page)
    await waitText(page, '可选服务')
  })
}

async function servicesStepSkipped(page) {
  await check('V1 可选服务：四项全部未启用，每项写明跳过的后果，没有任何红色报错', async () => {
    const body = await bodyText(page)
    for (const name of ['邮件（SMTP）', '对象存储', '连接器仓库', '模板仓库']) {
      assert(body.includes(name), `缺少服务「${name}」`)
    }
    assert((await page.getByText('未启用', { exact: true }).count()) === 4, '四项都应显示未启用')
    assert(body.includes('邀请邮件'), '邮件跳过后要写明后果')
    assert(body.includes('只能使用镜像内置的连接器'), '连接器仓库跳过后要写明后果')
    assert(body.includes('全部跳过，下一步'), '按钮应写明全部跳过')
    assert((await page.locator('svg.text-destructive').count()) === 0, '不应出现红色错误')
    await shot(page, '16-wizard-services-skipped')
  })
  await check('V2 「如何启用」展开后给出环境变量名，可复制', async () => {
    await page.locator('summary', { hasText: '如何启用' }).first().click()
    const values = await page.locator('input[readonly]').evaluateAll((inputs) => inputs.map((input) => input.value))
    assert(values.some((value) => value.includes('FEMA_SMTP_HOST')), `应写出 FEMA_SMTP_HOST，实际 ${values.join('|')}`)
    await shot(page, '17-wizard-services-howto')
  })
}

async function refreshKeepsDraft(page) {
  await check('R1 向导中途刷新：已填的姓名、邮箱、组织名称保留，密码不保留并明确告知', async () => {
    await next(page)
    await waitText(page, '确认并完成')
    await page.reload()
    await waitText(page, '创建管理员')
    assert(page.url().includes('step=administrator'), '刷新后密码丢了，应回到管理员步骤')
    assert((await page.inputValue('#setup-name')) === ADMIN.name, '姓名应保留')
    assert((await page.inputValue('#setup-email')) === ADMIN.email, '邮箱应保留')
    assert((await page.inputValue('#setup-password')) === '', '密码不应保留')
    assert((await bodyText(page)).includes('刷新页面后不会保留密码'), '应告知密码不保留')
    await shot(page, '18-wizard-refresh-password-discarded')
    await page.fill('#setup-password', ADMIN.password)
    await page.fill('#setup-confirm', ADMIN.password)
  })
  await check('R2 浏览器后退：确认页后退回到可选服务页，再前进回到确认页', async () => {
    await next(page)
    await waitText(page, '给组织起个名字')
    assert((await page.inputValue('#setup-organization')) === ORG, '组织名称应保留')
    await next(page)
    await waitText(page, '可选服务')
    await next(page)
    await waitText(page, '确认并完成')
    await page.goBack()
    await waitText(page, '可选服务')
    await page.goForward()
    await waitText(page, '确认并完成')
    await shot(page, '19-wizard-review')
  })
  await check('R3 确认页：汇总管理员、组织、访问地址和每个服务是否跳过', async () => {
    const body = await bodyText(page)
    assert(body.includes(ADMIN.name) && body.includes(ADMIN.email), '应汇总管理员')
    assert(body.includes(ORG), '应汇总组织名称')
    assert(body.includes('已跳过'), '应写明跳过的服务')
    assert(!body.includes(ADMIN.password), '汇总里不能出现明文密码')
  })
}

async function finishInstall(page) {
  await check('F1 完成安装：连点两次只建一个账号和一个组织，几秒内进入首页（离线也不卡）', async () => {
    const button = page.locator('form button[type=submit]')
    const started = Date.now()
    await button.dblclick()
    await page.waitForURL((url) => !url.pathname.startsWith('/setup'), { timeout: 120000 })
    const seconds = (Date.now() - started) / 1000
    assert(seconds < 60, `完成安装用了 ${seconds} 秒`)
    await waitText(page, ORG)
    await shot(page, '20-home-after-install')
    const token = await signIn(ADMIN)
    const memberships = await rawApi('GET', '/tenants', undefined, token)
    assert(Array.isArray(memberships) && memberships.length === 1 && memberships[0].projects.length === 1, `应只有一个组织和一个项目，实际 ${JSON.stringify(memberships).slice(0, 300)}`)
    assert(memberships[0].tenantName === ORG, `组织名称应是 ${ORG}，实际 ${memberships[0].tenantName}`)
    assert(!fs.readFileSync(path.join(STATE_DIR, 'api.log'), 'utf8').includes('newsletter'), '服务日志里不应再有订阅简报的调用')
  })
  await check('F2 首页显示的是填写的组织名称，而不是「某某的租户」', async () => {
    const body = await bodyText(page)
    assert(body.includes(ORG), '首页应显示组织名称')
    assert(!body.includes('的租户'), '不应出现按姓名派生的租户名')
  })
}

async function afterInstall(page) {
  await check('P1 安装完成后再访问向导地址：已登录回到首页，未登录去登录页，不会再出现向导', async () => {
    await page.goto(`${WEB}/setup`).catch(() => undefined)
    await page.waitForURL((url) => !url.pathname.startsWith('/setup'), { timeout: 30000 })
    assert(!(await bodyText(page)).includes('检查运行环境'), '已登录时不该出现向导')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.goto(`${WEB}/setup`).catch(() => undefined)
    await page.waitForURL((url) => url.pathname.startsWith('/sign-in'), { timeout: 30000 })
    assert(!(await bodyText(page)).includes('检查运行环境'), '未登录时也不该出现向导')
    await shot(page, '21-sign-in-after-install')
  })
  await check('P2 注册页在安装完成后只剩登录入口，没有第二个「创建管理员」', async () => {
    await page.goto(`${WEB}/sign-up`)
    await page.waitForURL((url) => url.pathname.startsWith('/sign-in'), { timeout: 30000 })
    assert(!(await bodyText(page)).includes('创建管理员'), '不应再能创建第二个管理员')
  })
  await check('P3 密码错误给出明确提示；正确登录进入首页', async () => {
    await page.goto(`${WEB}/sign-in`)
    await page.waitForSelector('#email', { timeout: BROWSER_TIMEOUT })
    await fillSignIn(page, ADMIN.email, 'Wrong-pass1!')
    await waitText(page, '电子邮件或密码')
    assert(page.url().includes('sign-in'), '错误密码不应登录')
    await shot(page, '22-sign-in-wrong-password')
    await fillSignIn(page, ADMIN.email, ADMIN.password)
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: 30000 })
  })
}

async function ensureSession(page) {
  const response = await rawApi('POST', '/authentication/sign-in', { email: ADMIN.email, password: ADMIN.password })
  await page.goto(`${WEB}/sign-in`)
  await page.evaluate(([token, projectId]) => {
    localStorage.setItem('token', token)
    localStorage.setItem('projectId', projectId)
  }, [response.token, response.projectId])
}

async function affectedPagesWithoutServices(page) {
  await ensureSession(page)
  await check('X1 没有邮件服务：邀请成员页写明不会发邮件、给邀请链接；找回密码页写明改由管理员重置', async () => {
    await page.goto(`${WEB}/tenant/users`)
    await page.getByRole('button', { name: '添加用户' }).click()
    await waitText(page, '未配置邮件服务，不会发送邀请')
    await shot(page, '30-invite-no-smtp')
    await page.keyboard.press('Escape')
    await page.goto(`${WEB}/forget-password`)
    await waitText(page, '没有配置邮件服务')
  })
  await check('X2 没有邮件服务：告警渠道页写明邮件渠道不可用，新建渠道时邮件选项置灰并写明先配置 SMTP', async () => {
    await page.goto(`${WEB}/issue-center?tab=alerts`)
    await waitText(page, '告警策略')
    await page.getByRole('tab', { name: '通知渠道' }).click()
    await waitText(page, '配置 SMTP 之前，邮件渠道不可用')
    await page.getByRole('button', { name: '新建通知渠道' }).click()
    await page.getByRole('combobox').first().click()
    await waitText(page, '需要先配置 SMTP')
    await shot(page, '31-alert-channel-email-disabled')
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
  })
  await check('X3 没有连接器仓库和模板仓库：连接器页只列内置连接器，模板页是空态，都不报错', async () => {
    await page.goto(`${WEB}/tenant/setup/connectors`)
    await waitText(page, '@fema-ipaas/connector-http')
    await shot(page, '32-connectors-builtin')
    await page.goto(`${WEB}/tenant/setup/templates`)
    await waitText(page, '没有找到模板')
    await shot(page, '33-templates-empty')
    await page.goto(`${WEB}/templates`)
    await page.waitForLoadState('networkidle')
    const body = await bodyText(page)
    assert(!/出错|Something went wrong|失败/.test(body), `模板中心不应报错：${body.slice(0, 200)}`)
    await shot(page, '34-template-center')
  })
  await check('X4 没有对象存储：文件保存在数据库里，系统页明确写出；备份页说明文件已包含在数据库备份里', async () => {
    await page.goto(`${WEB}/tenant/infra/backup`)
    await waitText(page, '文件保存在数据库里')
  })
}

async function systemPagesOffline(page) {
  await check('Y1 系统页：显示版本、数据库、队列、工作节点和容器类型', async () => {
    await page.goto(`${WEB}/tenant/infra/system`)
    await waitText(page, '当前版本')
    const body = await bodyText(page)
    for (const expected of ['版本', '安装时间', '数据库', '排队', '在线工作节点', '容器类型']) {
      assert(body.includes(expected), `当前版本卡片里缺少「${expected}」`)
    }
    await shot(page, '40-system-version')
  })
  await check('Y2 检查更新：外网不通时降级为警告和说明（含离线镜像做法），不是红色报错', async () => {
    await page.getByRole('button', { name: '重新检查' }).click()
    await waitText(page, '无法连接更新服务器')
    const body = await bodyText(page)
    assert((await fieldValues(page)).some((value) => value.includes('docker save')), '应给出离线拷贝镜像的做法')
    assert((await page.locator('[data-slot=alert].text-destructive').count()) === 0, '不该是红色报错')
    await shot(page, '41-system-update-offline')
  })
  await check('Y3 可选服务页：四项都是「未启用」，没有任何「需要处理」', async () => {
    await page.getByRole('tab', { name: '可选服务' }).click()
    await waitText(page, '邮件（SMTP）')
    const body = await bodyText(page)
    assert((await page.getByText('未启用', { exact: true }).count()) === 4, '四项都应显示未启用')
    assert(!body.includes('需要关注'), '不应出现需要关注')
    await shot(page, '42-system-services-none')
  })
  await check('Y4 诊断包不含密码、密钥、邮箱', async () => {
    const token = await signIn(ADMIN)
    const bundle = await rawApi('GET', '/health/diagnostics-bundle', undefined, token)
    const text = JSON.stringify(bundle)
    assert(!text.includes('0123456789abcdef0123456789abcdef'), '诊断包里出现了加密密钥')
    assert(!text.includes(ADMIN.email), '诊断包里出现了邮箱')
    assert(!text.includes(ADMIN.password), '诊断包里出现了密码')
    assert(!text.includes('e2e-slot'), '诊断包里出现了 JWT 密钥')
  })
  await check('Y5 备份与恢复页：有备份计划和立即备份，说明密钥不进备份', async () => {
    await page.goto(`${WEB}/tenant/infra/backup`)
    await waitText(page, '备份计划')
    const body = await bodyText(page)
    assert(body.includes('立即备份'), '应有立即备份入口')
    assert(body.includes('加密密钥和 JWT 密钥不会写进备份'), '应如实说明密钥不进备份')
    await shot(page, '43-backup-runbook')
  })
}

async function responsive(page, label) {
  const sizes = [
    { name: '1024 宽', width: 1024, height: 800 },
    { name: '768 宽', width: 768, height: 900 },
    { name: '手机 390 宽', width: 390, height: 844 },
  ]
  for (const size of sizes) {
    await check(`W 向导「${label}」在${size.name}下没有横向滚动，下一步按钮在页面里`, async () => {
      await page.setViewportSize({ width: size.width, height: size.height })
      await page.waitForTimeout(500)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      assert(overflow <= 1, `出现了 ${overflow}px 的横向滚动`)
      await page.locator('form button[type=submit]').waitFor({ state: 'visible' })
      await shot(page, `5${sizes.indexOf(size)}-wizard-${label}-${size.width}`)
    })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

async function configuredServices() {
  startStack({
    E2E_OFFLINE: '1',
    FEMA_SMTP_HOST: '127.0.0.1',
    FEMA_SMTP_PORT: String(SMTP_PORT),
    FEMA_SMTP_USERNAME: 'mailer',
    FEMA_SMTP_PASSWORD: 'smtp-secret-do-not-leak',
    FEMA_SMTP_SENDER_EMAIL: 'noreply@corp.test',
    FEMA_CONNECTOR_REGISTRY_URL: `http://127.0.0.1:${REGISTRY_PORT}`,
    FEMA_TEMPLATES_SOURCE_URL: `http://127.0.0.1:${REGISTRY_PORT}/templates`,
    FEMA_SSRF_ALLOW_LIST: '127.0.0.1',
  })
  await fakeSmtp.start()
  await fakeRegistry.start()
  const { browser, page } = await openBrowser({ width: 1440, height: 900 })
  try {
    await check('C1 配置了邮件、连接器仓库、模板仓库后，向导的服务步骤显示为已启用，并可逐项测试连接', async () => {
      await page.goto(`${WEB}/setup?step=services`)
      await waitText(page, '创建管理员')
      await fillAdministrator(page)
      await waitText(page, '邮件（SMTP）')
      await shot(page, '60-wizard-services-configured')
      const enabled = await page.getByText('已启用', { exact: true }).count()
      assert(enabled === 3, `应有三项已启用，实际 ${enabled}`)
    })
    await check('C2 邮件服务器正常：测试连接通过；关掉邮件服务器后再测，写明连不上以及原因', async () => {
      const smtp = page.locator('div.rounded-lg.border', { hasText: '邮件（SMTP）' })
      await smtp.getByRole('button', { name: '测试连接' }).click()
      await waitText(page, '已连上邮件服务器并通过认证')
      await fakeSmtp.stop()
      await smtp.getByRole('button', { name: '测试连接' }).click()
      await waitText(page, '连不上服务器')
      assert((await bodyText(page)).includes('ECONNREFUSED'), '应附上原始原因')
      await shot(page, '61-wizard-smtp-unreachable')
      await fakeSmtp.start()
      fakeSmtp.setMode('reject-auth')
      await smtp.getByRole('button', { name: '测试连接' }).click()
      await waitText(page, '凭据被拒绝')
      assert(!(await bodyText(page)).includes('smtp-secret-do-not-leak'), '原因里不能出现 SMTP 密码')
      await shot(page, '62-wizard-smtp-auth-failed')
      fakeSmtp.setMode('accept')
    })
    await check('C3 连接器仓库：可达通过；返回 404、返回内容不是仓库格式分别写明原因', async () => {
      const registry = page.locator('div.rounded-lg.border', { hasText: '连接器仓库' }).first()
      await registry.getByRole('button', { name: '测试连接' }).click()
      await waitText(page, '仓库有响应')
      fakeRegistry.setMode('notfound')
      await registry.getByRole('button', { name: '测试连接' }).click()
      await waitText(page, 'status code 404')
      assert((await bodyText(page)).includes('返回的内容不是仓库格式'), '404 应提示地址不是仓库')
      fakeRegistry.setMode('notarray')
      await registry.getByRole('button', { name: '测试连接' }).click()
      await waitText(page, 'not with a registry listing')
      await shot(page, '63-wizard-registry-bad-format')
      fakeRegistry.setMode('ok')
    })
    await check('C4 配置有误的服务仍然允许完成安装（可选服务不阻断），完成后进入首页', async () => {
      await page.goto(`${WEB}/setup?step=review`)
      await waitText(page, '创建管理员')
      await fillAdministrator(page)
      await page.locator('form button[type=submit]').click()
      await waitText(page, '确认并完成')
      await page.locator('form button[type=submit]').click()
      await page.waitForURL((url) => !url.pathname.startsWith('/setup'), { timeout: 30000 })
    })
    await check('C5 系统页：发送测试邮件，收件箱（假 SMTP）真的收到；失败时写明原因并在服务卡片上提示', async () => {
      await page.goto(`${WEB}/tenant/infra/system`)
      await page.getByRole('tab', { name: '可选服务' }).click()
      await waitText(page, '邮件（SMTP）')
      const smtp = page.locator('div.flex.flex-col.gap-2.py-3', { hasText: '邮件（SMTP）' })
      await smtp.getByRole('button', { name: /发送测试邮件到/ }).click()
      await waitText(page, '测试邮件已发送到')
      assert(fakeSmtp.messages().some((message) => message.to.some((recipient) => recipient.includes(ADMIN.email))), '假 SMTP 没有收到测试邮件')
      assert(!JSON.stringify(fakeSmtp.messages()).includes('smtp-secret-do-not-leak'), '邮件内容里不能出现 SMTP 密码')
      await shot(page, '64-system-smtp-test-sent')
      fakeSmtp.setMode('reject-auth')
      await smtp.getByRole('button', { name: /发送测试邮件到/ }).click()
      await waitText(page, '凭据被拒绝')
      await page.goto(`${WEB}/tenant/infra/system`)
      await page.getByRole('tab', { name: '可选服务' }).click()
      await waitText(page, '最近一封邮件没有发送成功')
      assert((await bodyText(page)).includes('需要关注'), '服务卡片上应标出需要关注')
      await shot(page, '65-system-smtp-recent-failure')
      fakeSmtp.setMode('accept')
    })
    await check('C6 对象存储未配置时，服务页上的对象存储仍是「未启用」，没有测试按钮', async () => {
      const storage = page.locator('div.flex.flex-col.gap-2.py-3', { hasText: '对象存储' })
      assert((await storage.getByRole('button', { name: '测试连接' }).count()) === 0, '未启用的服务不应有测试按钮')
    })
    await check('C7 邮件配置后，邀请成员页不再说「不会发送邀请」', async () => {
      await page.goto(`${WEB}/tenant/users`)
      await page.getByRole('button', { name: '添加用户' }).click()
      await page.waitForTimeout(1500)
      assert(!(await bodyText(page)).includes('未配置邮件服务，不会发送邀请'), '已配置邮件服务时不应再说不会发送')
    })
    await check('B1 数据库文件里没有明文密钥：管理员密码、加密密钥、JWT 密钥、SMTP 密码都搜不到（备份 pg_dump 来自同一份数据）', async () => {
      const dataDirectory = path.join(STATE_DIR, 'config', 'pglite')
      const secrets = [ADMIN.password, '0123456789abcdef0123456789abcdef', `e2e-slot-${SLOT}-secret`, 'smtp-secret-do-not-leak']
      for (const secret of secrets) {
        const hits = spawnSync('grep', ['-r', '-a', '-l', '-F', secret, dataDirectory], { encoding: 'utf8' })
        assert(hits.stdout.trim() === '', `数据库文件里出现了明文「${secret.slice(0, 6)}…」：${hits.stdout.trim()}`)
      }
    })
  } finally {
    await browser.close()
    await fakeSmtp.close()
    await fakeRegistry.close()
  }
}

async function invalidConfiguration() {
  startStack({
    E2E_OFFLINE: '1',
    FEMA_SMTP_HOST: 'smtp.corp.test',
    FEMA_SMTP_PORT: 'abc',
    FEMA_TEMPLATES_SOURCE_URL: 'not-a-url',
    FEMA_CONNECTOR_REGISTRY_URL: 'ftp://registry.corp.test',
  })
  await check('I1 配置值无效（端口不是数字、地址不是 http）：服务标为「需要处理」并写明是哪个变量，而不是显示成已启用', async () => {
    const status = await rawApi('GET', '/health/setup')
    const byKind = Object.fromEntries(status.services.map((service) => [service.kind, service]))
    assert(byKind.SMTP.enabled === false && byKind.SMTP.problem?.message.includes('FEMA_SMTP_PORT'), `SMTP 应标出端口有问题：${JSON.stringify(byKind.SMTP)}`)
    assert(byKind.TEMPLATE_REGISTRY.enabled === false && byKind.TEMPLATE_REGISTRY.problem !== null, '模板仓库地址无效应标出')
    assert(byKind.CONNECTOR_REGISTRY.enabled === false && byKind.CONNECTOR_REGISTRY.problem !== null, '连接器仓库地址无效应标出')
  })
  const { browser, page } = await openBrowser({ width: 1440, height: 900 })
  try {
    await check('I2 向导的服务步骤把无效配置标红说明原因，但仍可继续', async () => {
      await page.goto(`${WEB}/setup?step=administrator`)
      await fillAdministrator(page)
      await waitText(page, '需要关注')
      const body = await bodyText(page)
      assert(body.includes('FEMA_SMTP_PORT'), '应写出有问题的变量名')
      await shot(page, '70-wizard-services-invalid')
      assert(!(await page.locator('form button[type=submit]').isDisabled()), '无效的可选服务不应阻止继续')
    })
  } finally {
    await browser.close()
  }
}

async function upgradeAvailable() {
  const online = await canReachGithub()
  if (!online) {
    results.push({ name: 'U1 有新版本时系统页给出升级前检查和步骤', ok: true, skipped: '本机无法访问 raw.githubusercontent.com' })
    console.log('SKIP U1 本机无法访问 raw.githubusercontent.com')
    return
  }
  startStack({ E2E_FAKE_VERSION: '0.80.0', E2E_KEEP_PROXY: '1' })
  const { browser, page } = await openBrowser({ width: 1440, height: 900 })
  try {
    await fillAdministrator(page)
    await page.locator('form button[type=submit]').click()
    await waitText(page, '确认并完成')
    await page.locator('form button[type=submit]').click()
    await page.waitForURL((url) => !url.pathname.startsWith('/setup'), { timeout: 60000 })
    await check('U1 有新版本时，系统页给出升级前检查、升级步骤和回滚步骤', async () => {
      await page.goto(`${WEB}/tenant/infra/system`)
      await waitText(page, '有新版本')
      const body = await bodyText(page)
      for (const expected of ['1. 升级前检查', '2. 执行升级', '回滚预案']) {
        assert(body.includes(expected), `升级指引缺少「${expected}」`)
      }
      assert(body.includes('备份数据库'), '升级前检查应要求先备份数据库')
      await shot(page, '80-system-upgrade-guide')
    })
  } finally {
    await browser.close()
  }
}

async function fillAdministrator(page) {
  await page.goto(`${WEB}/setup?step=administrator`)
  await waitText(page, '创建管理员')
  await page.fill('#setup-name', ADMIN.name)
  await page.fill('#setup-email', ADMIN.email)
  await page.fill('#setup-password', ADMIN.password)
  await page.fill('#setup-confirm', ADMIN.password)
  await page.locator('form button[type=submit]').click()
  await waitText(page, '给组织起个名字')
  await page.fill('#setup-organization', ORG)
  await page.locator('form button[type=submit]').click()
  await waitText(page, '可选服务')
}

async function fillSignIn(page, email, password) {
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('[data-testid=sign-in-button]')
}

function startStack(extraEnv) {
  stopStack()
  const env = { ...process.env, E2E_WEB_PORT: String(WEB_PORT), ...extraEnv }
  execFileSync('bash', [path.join(ROOT, 'tools/e2e/stack/start-fresh-stack.sh'), String(SLOT)], { env, stdio: 'inherit', timeout: 600000 })
}

function stopStack() {
  execFileSync('bash', [path.join(ROOT, 'tools/e2e/stack/stop-fresh-stack.sh'), String(SLOT)], { env: { ...process.env, E2E_WEB_PORT: String(WEB_PORT) }, stdio: 'inherit' })
}

async function openBrowser({ width, height }) {
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN' })
  const page = await context.newPage()
  page.setDefaultTimeout(BROWSER_TIMEOUT)
  activePage = page
  return { browser, page }
}

async function next(page) {
  await page.locator('form button[type=submit]').click()
  await page.waitForTimeout(400)
}

async function fieldValues(page) {
  return page.locator('input[readonly], textarea[readonly]').evaluateAll((fields) => fields.map((field) => field.value))
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText)
}

async function waitText(page, text) {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), text, { timeout: BROWSER_TIMEOUT })
}

async function waitGone(page, text) {
  await page.waitForFunction((expected) => !document.body.innerText.includes(expected), text, { timeout: BROWSER_TIMEOUT })
}

async function shot(page, name) {
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

async function rawApi(method, route, body, token) {
  const response = await fetch(`${API}${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return text.length > 0 ? JSON.parse(text) : null
}

async function signIn({ email, password }) {
  const response = await rawApi('POST', '/authentication/sign-in', { email, password })
  return response.token
}

async function canReachGithub() {
  const result = spawnSync('curl', ['-sf', '-m', '8', '-o', '/dev/null', 'https://raw.githubusercontent.com/lokiworks/fema-ipaas/main/package.json'])
  return result.status === 0
}

async function check(name, run) {
  const started = Date.now()
  try {
    await run()
    results.push({ name, ok: true, seconds: (Date.now() - started) / 1000 })
    console.log(`PASS ${name}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({ name, ok: false, message })
    console.log(`FAIL ${name}\n     ${message}`)
    await activePage?.screenshot({ path: path.join(SHOTS, `fail-${name.split(' ')[0]}.png`), fullPage: true }).catch(() => undefined)
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function printSummary() {
  const failed = results.filter((result) => !result.ok)
  console.log(`\n共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  failed.forEach((result) => console.log(`  失败：${result.name}\n    ${result.message}`))
}

function createFakeSmtp() {
  let server = null
  let mode = 'accept'
  const received = []
  const handle = (socket) => {
    let buffer = ''
    let inData = false
    let current = { to: [], data: '' }
    socket.write('220 fake.smtp ESMTP\r\n')
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index = buffer.indexOf('\r\n')
      while (index >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        if (inData) {
          if (line === '.') {
            inData = false
            received.push(current)
            current = { to: [], data: '' }
            socket.write('250 2.0.0 queued\r\n')
          } else {
            current.data += `${line}\n`
          }
        } else if (/^EHLO/i.test(line)) {
          socket.write('250-fake.smtp\r\n250 AUTH PLAIN LOGIN\r\n')
        } else if (/^AUTH/i.test(line)) {
          socket.write(mode === 'accept' ? '235 2.7.0 Authentication successful\r\n' : '535 5.7.8 Authentication failed\r\n')
        } else if (/^MAIL FROM/i.test(line)) {
          socket.write('250 ok\r\n')
        } else if (/^RCPT TO/i.test(line)) {
          current.to.push(line.slice(8))
          socket.write('250 ok\r\n')
        } else if (/^DATA/i.test(line)) {
          inData = true
          socket.write('354 go ahead\r\n')
        } else if (/^QUIT/i.test(line)) {
          socket.write('221 bye\r\n')
          socket.end()
        } else {
          socket.write('250 ok\r\n')
        }
        index = buffer.indexOf('\r\n')
      }
    })
    socket.on('error', () => undefined)
  }
  return {
    start: () => new Promise((resolve) => {
      server = net.createServer(handle)
      server.listen(SMTP_PORT, '127.0.0.1', resolve)
    }),
    stop: () => new Promise((resolve) => {
      if (!server) {
        resolve()
        return
      }
      server.close(() => resolve())
      server.closeAllConnections?.()
      server = null
    }),
    close: async function close() {
      await this.stop()
    },
    setMode: (next) => {
      mode = next
    },
    messages: () => received,
  }
}

function createFakeRegistry() {
  let server = null
  let mode = 'ok'
  return {
    start: () => new Promise((resolve) => {
      server = http.createServer((request, response) => {
        if (mode === 'notfound') {
          response.writeHead(404).end('not found')
          return
        }
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(mode === 'notarray' ? '{"hello":"world"}' : '[]')
      })
      server.listen(REGISTRY_PORT, '127.0.0.1', resolve)
    }),
    close: () => new Promise((resolve) => {
      if (!server) {
        resolve()
        return
      }
      server.close(() => resolve())
      server.closeAllConnections?.()
      server = null
    }),
    setMode: (next) => {
      mode = next
    },
  }
}

