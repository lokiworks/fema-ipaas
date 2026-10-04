import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

import { createFakeRegistry, createFakeSmtp } from './lib/fakes.mjs'
import { ADMIN, API, assert, check, http, SHOTS, STATE_DIR, summary, waitFor, WEB } from './lib/s5-kit.mjs'

const SLOT = Number(process.env.E2E_SLOT ?? 1)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const BACKUP_DIR = path.join(STATE_DIR, 'config', 'backups')
const SMTP_PORT = 25300 + SLOT
const REGISTRY_PORT = 19300 + SLOT
const TIMEOUT = Number(process.env.E2E_TIMEOUT_MS ?? 180000)

const smtp = createFakeSmtp({ port: SMTP_PORT })
const registry = createFakeRegistry({ port: REGISTRY_PORT })
let session = null

fs.mkdirSync(SHOTS, { recursive: true })
await Promise.all([smtp.start(), registry.start()])
const browser = await chromium.launch()
try {
  session = await signInApi()
  await resetState()
  const only = (process.env.E2E_ONLY ?? '').split(',').filter(Boolean)
  const phases = { light: lightMode, dark: darkAndNarrow, services: servicesPage, upgrade: upgradePage }
  for (const [name, run] of Object.entries(phases)) {
    if (only.length === 0 || only.includes(name)) {
      await run()
    }
  }
}
finally {
  await browser.close()
  await Promise.all([smtp.close(), registry.close()])
}
summary()

async function lightMode() {
  const { page, context } = await openPage({ width: 1280, height: 1900 })
  try {
    await signInUi(page)
    await check('U1 备份页空状态：没有备份时有说明和「立即备份」，备份计划是默认值，没有错误提示', async () => {
      await page.goto(`${WEB}/tenant/infra/backup`)
      await waitText(page, '还没有备份')
      const body = await bodyText(page)
      for (const expected of ['备份与恢复', '备份计划', '立即备份', '每天', '02:00', '最近一次成功备份', '备份里有什么', '加密密钥和 JWT 密钥']) {
        assert(body.includes(expected), `备份页缺少「${expected}」`)
      }
      assert(!body.includes('内置备份未启用'), '引擎可用时不应出现未启用提示')
      await shot(page, 'b01-empty-light')
    })

    await check('U2 点「立即备份」：列表出现一行，先「运行中」后「成功」，最近一次成功备份有了时间', async () => {
      await page.getByRole('button', { name: /立即备份|Back up now/ }).first().click()
      await waitText(page, '已开始')
      await page.waitForFunction(() => document.querySelectorAll('[data-testid=backup-row]').length === 1, null, { timeout: TIMEOUT })
      await page.waitForFunction(() => /成功/.test(document.querySelector('[data-testid=backup-row]')?.textContent ?? ''), null, { timeout: TIMEOUT })
      await page.waitForFunction(() => !/最近一次成功备份\s*还没有/.test(document.body.innerText.replace(/\n/g, ' ')), null, { timeout: TIMEOUT })
      const body = await bodyText(page)
      assert(!body.includes('还没有备份'), '有备份后不应再显示空状态')
      await shot(page, 'b02-first-backup-light')
    })

    await check('U3 备份计划：改成每周、保留 14 份并保存，刷新后保持', async () => {
      await page.getByLabel('频率').click()
      await page.getByRole('option', { name: '每周' }).click()
      await waitText(page, '星期几')
      await page.getByLabel('定时备份保留份数').click()
      await page.getByRole('option', { name: '14 份' }).click()
      await page.getByRole('button', { name: '保存计划' }).click()
      await waitText(page, '已保存备份计划')
      await page.reload()
      await waitText(page, '星期几')
      const saved = await apiGet('/backups/settings')
      assert(saved.frequency === 'WEEKLY' && saved.keep === 14, `服务端应已保存，实际 ${JSON.stringify(saved)}`)
      await shot(page, 'b03-plan-weekly-light')
      await page.getByLabel('频率').click()
      await page.getByRole('option', { name: '每天' }).click()
      await page.getByLabel('定时备份保留份数').click()
      await page.getByRole('option', { name: '7 份' }).click()
      await page.getByRole('button', { name: '保存计划' }).click()
      await waitText(page, '已保存备份计划')
    })

    await check('U4 恢复预检：完好的备份各项通过，并给出在服务器上执行的步骤和原因', async () => {
      await page.getByRole('button', { name: '恢复预检' }).first().click()
      await waitText(page, '这份备份可以恢复')
      const body = await bodyText(page)
      for (const expected of ['校验和一致', '加密密钥一致', '会被替换的内容', '恢复步骤', '应用不能自己恢复']) {
        assert(body.includes(expected), `预检缺少「${expected}」`)
      }
      const commands = await fieldValues(page)
      assert(commands.includes('tar -xzf') && commands.includes('pglite.before-restore-'), `恢复步骤里应有可复制的命令，实际 ${commands.slice(0, 200)}`)
      await shot(page, 'b04-precheck-ok-light')
      await page.keyboard.press('Escape')
    })

    await check('U5 备份文件被改动后预检报错：校验和对不上、不能恢复，错误是红色的', async () => {
      const [latest] = await apiGet('/backups')
      fs.appendFileSync(path.join(BACKUP_DIR, latest.fileName), Buffer.from('tampered'))
      await page.getByRole('button', { name: '恢复预检' }).first().click()
      await waitText(page, '这份备份不能恢复')
      const body = await bodyText(page)
      assert(body.includes('校验和对不上') && body.includes('不要用它恢复'), '应写明校验和对不上')
      await shot(page, 'b05-precheck-corrupt-light')
      await page.keyboard.press('Escape')
      const bytes = fs.readFileSync(path.join(BACKUP_DIR, latest.fileName))
      fs.writeFileSync(path.join(BACKUP_DIR, latest.fileName), bytes.subarray(0, bytes.length - 8))
    })

    await check('U6 删除备份：确认后这一行消失，磁盘上的文件也没了', async () => {
      const [latest] = await apiGet('/backups')
      await page.getByRole('button', { name: '删除备份' }).first().click()
      await waitText(page, '删除这份备份？')
      await shot(page, 'b06-delete-confirm-light')
      await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
      await page.waitForFunction(() => document.querySelectorAll('[data-testid=backup-row]').length === 0, null, { timeout: TIMEOUT })
      assert(!fs.existsSync(path.join(BACKUP_DIR, latest.fileName)), '文件应已删除')
      await waitText(page, '还没有备份')
    })
  }
  finally {
    await context.close()
  }
}

async function darkAndNarrow() {
  await apiPost('/backups', { note: '深色和窄屏截图' })
  await waitFor({ what: '备份完成', timeoutMs: TIMEOUT, probe: async () => (await apiGet('/backups')).every((entry) => entry.status !== 'RUNNING') })
  for (const variant of [{ name: 'dark', scheme: 'dark', width: 1280 }, { name: 'narrow', scheme: 'light', width: 390 }, { name: 'narrow-dark', scheme: 'dark', width: 390 }]) {
    const { page, context } = await openPage({ width: variant.width, height: variant.width < 600 ? 2600 : 1900, scheme: variant.scheme })
    try {
      await signInUi(page)
      await check(`U7 备份页和恢复预检在「${variant.name}」下可读：没有横向滚动，截图留档`, async () => {
        await page.goto(`${WEB}/tenant/infra/backup`)
        await waitText(page, '备份计划')
        await page.waitForTimeout(800)
        await shot(page, `b07-page-${variant.name}`)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        assert(overflow <= 1, `页面不应横向滚动，实际溢出 ${overflow}px`)
        await page.getByRole('button', { name: '恢复预检' }).first().click()
        await waitText(page, '这份备份可以恢复')
        await page.waitForTimeout(500)
        await shot(page, `b08-precheck-${variant.name}`)
        const dialogOverflow = await page.evaluate(() => {
          const dialog = document.querySelector('[role=dialog]')
          return dialog ? dialog.scrollWidth - dialog.clientWidth : 0
        })
        assert(dialogOverflow <= 1, `对话框不应横向滚动，实际溢出 ${dialogOverflow}px`)
      })
    }
    finally {
      await context.close()
    }
  }
}

async function servicesPage() {
  const { page, context } = await openPage({ width: 1280, height: 1900 })
  try {
    await signInUi(page)
    await check('U8 可选服务：四项都「未启用」，每项有「设置」入口，说明环境变量优先', async () => {
      await page.goto(`${WEB}/tenant/infra/system`)
      await page.getByRole('tab', { name: '可选服务' }).click()
      await waitText(page, '环境变量优先')
      const body = await bodyText(page)
      assert((body.match(/未启用/g) ?? []).length >= 4, '四项都应显示未启用')
      await page.waitForFunction(() => [...document.querySelectorAll('button')].filter((button) => button.textContent?.trim() === '设置').length === 4, null, { timeout: TIMEOUT })
      await shot(page, 'c01-services-empty')
    })

    await check('U9 在界面配置连接器仓库：地址不通时不保存并说明；正确后保存，状态变成已启用和「已在此处保存」', async () => {
      const row = page.getByTestId('service-CONNECTOR_REGISTRY')
      await row.getByRole('button', { name: '设置', exact: true }).click()
      await waitText(page, '配置连接器仓库')
      await page.getByLabel('地址').fill('http://127.0.0.1:1/registry')
      await page.getByRole('button', { name: '测试并保存' }).click()
      await waitText(page, '连不上')
      await shot(page, 'c02-registry-unreachable')
      assert((await apiGet('/service-settings')).find((entry) => entry.kind === 'CONNECTOR_REGISTRY').source === 'NONE', '失败时不应保存')
      await page.getByLabel('地址').fill(`http://127.0.0.1:${REGISTRY_PORT}`)
      await page.getByRole('button', { name: '测试并保存' }).click()
      await waitText(page, '已保存服务配置')
      await page.waitForFunction(() => /已在此处保存/.test(document.body.innerText), null, { timeout: TIMEOUT })
      await shot(page, 'c03-registry-saved')
    })

    await check('U10 在界面配置邮件：密码留空保存后不再回显，发测试邮件真的送到', async () => {
      const row = page.getByTestId('service-SMTP')
      await row.getByRole('button', { name: '设置', exact: true }).click()
      await waitText(page, '配置邮件')
      await page.getByLabel('SMTP 服务器').fill('127.0.0.1')
      await page.getByLabel('端口').fill(String(SMTP_PORT))
      await page.getByLabel('用户名').fill('mailer')
      await page.getByLabel('密码', { exact: true }).fill('ui-smtp-password')
      await page.getByLabel('发件人地址').fill('noreply@corp.test')
      await page.getByRole('button', { name: /发送测试邮件/ }).click()
      await waitText(page, '测试邮件已发送到')
      assert(smtp.messages().length >= 1, '假邮件服务器应收到测试邮件')
      await shot(page, 'c04-smtp-tested')
      await page.getByRole('button', { name: '测试并保存' }).click()
      await waitText(page, '已保存服务配置')
      await row.getByRole('button', { name: '编辑' }).click()
      await waitText(page, '配置邮件')
      assert((await page.getByLabel('密码', { exact: true }).getAttribute('placeholder')) === '已保存，留空表示不修改', '密码框应提示已保存、留空表示不修改')
      assert(!(await bodyText(page)).includes('ui-smtp-password'), '密码不应回显')
      const inputValue = await page.getByLabel('密码', { exact: true }).inputValue()
      assert(inputValue === '', '密码框应为空')
      await shot(page, 'c05-smtp-edit-no-secret')
      await page.keyboard.press('Escape')
    })

    await check('U11 设了环境变量的服务：来源「来自环境变量」、没有配置按钮，已保存的值被忽略', async () => {
      await startApi({ extra: ['FEMA_SMTP_HOST=127.0.0.1', `FEMA_SMTP_PORT=${SMTP_PORT}`] })
      session = await signInApi()
      await page.goto(`${WEB}/tenant/infra/system`)
      await page.getByRole('tab', { name: '可选服务' }).click()
      const row = page.getByTestId('service-SMTP')
      await row.waitFor()
      await page.waitForFunction(() => /来自环境变量/.test(document.querySelector('[data-testid=service-SMTP]')?.textContent ?? ''), null, { timeout: TIMEOUT })
      assert((await row.getByRole('button', { name: /设置|编辑/ }).count()) === 0, '环境变量设置的服务不应有编辑入口')
      await shot(page, 'c06-smtp-from-environment')
    })

    await check('U12 移除保存的配置后回到未启用，不报错', async () => {
      await startApi()
      session = await signInApi()
      await page.goto(`${WEB}/tenant/infra/system`)
      await page.getByRole('tab', { name: '可选服务' }).click()
      for (const kind of ['SMTP', 'CONNECTOR_REGISTRY']) {
        const row = page.getByTestId(`service-${kind}`)
        await row.getByRole('button', { name: '移除已保存的配置' }).click()
        await page.waitForFunction((testId) => /未启用/.test(document.querySelector(`[data-testid=${testId}]`)?.textContent ?? ''), `service-${kind}`, { timeout: TIMEOUT })
      }
      assert(!(await bodyText(page)).includes('需要处理'), '不应出现错误状态')
      await shot(page, 'c07-services-cleared')
    })
  }
  finally {
    await context.close()
  }
}

async function upgradePage() {
  const online = await canReachGithub()
  if (!online) {
    console.log('SKIP U13 本机无法访问 raw.githubusercontent.com，升级前检查的备份一项没有在界面实测')
    return
  }
  await startApi({ extra: ['E2E_FAKE_VERSION=0.80.0', `NODE_OPTIONS=--require ${ROOT}/tools/e2e/stack/instance-preload.cjs`] })
  session = await signInApi()
  await resetState()
  const { page, context } = await openPage({ width: 1280, height: 1100 })
  try {
    await signInUi(page)
    await check('U13 升级前检查读取真实备份：没有备份时标红并给出「立即备份」，点了之后变成已有备份', async () => {
      await page.goto(`${WEB}/tenant/infra/system`)
      await waitText(page, '升级前检查')
      const body = await bodyText(page)
      assert(body.includes('还没有成功的备份'), '没有备份时应写明')
      await shot(page, 'd01-upgrade-no-backup')
      await page.getByTestId('upgrade-backup-now').click()
      await waitText(page, '最近一次备份是')
      assert((await bodyText(page)).includes('由你正在运行的版本创建'), '备份由当前版本创建应显示一致')
      await shot(page, 'd02-upgrade-backup-ok')
    })
  }
  finally {
    await context.close()
    await startApi()
    session = await signInApi()
  }
}

async function openPage({ width, height, scheme = 'light' }) {
  const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN', colorScheme: scheme })
  await context.addInitScript((theme) => {
    localStorage.setItem('fema.theme', theme)
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'vite-plugin-checker-error-overlay{display:none!important}'
      document.head.appendChild(style)
    })
  }, scheme)
  const page = await context.newPage()
  page.setDefaultTimeout(TIMEOUT)
  return { page, context }
}

async function signInUi(page) {
  await page.goto(`${WEB}/sign-in`, { timeout: 300000 })
  await page.fill('#email', ADMIN.email)
  await page.fill('#password', ADMIN.password)
  await page.click('[data-testid=sign-in-button]')
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), { timeout: TIMEOUT })
}

async function bodyText(page) {
  return page.evaluate(() => document.body.innerText)
}

async function fieldValues(page) {
  return page.evaluate(() => [...document.querySelectorAll('input, textarea')].map((field) => field.value).join('\n'))
}

async function waitText(page, text) {
  await page.waitForFunction((expected) => document.body.innerText.includes(expected), text, { timeout: TIMEOUT })
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })
}

async function signInApi() {
  const response = await http({ method: 'POST', path: '/authentication/sign-in', body: ADMIN })
  assert(response.ok, `登录失败 ${response.status}`)
  return { token: response.body.token }
}

async function apiGet(urlPath) {
  const response = await http({ method: 'GET', path: urlPath, token: session.token })
  assert(response.ok, `GET ${urlPath} -> ${response.status} ${response.text.slice(0, 200)}`)
  return response.body
}

async function apiPost(urlPath, body) {
  const response = await http({ method: 'POST', path: urlPath, body, token: session.token })
  assert(response.ok, `POST ${urlPath} -> ${response.status} ${response.text.slice(0, 200)}`)
  return response.body
}

async function apiDelete(urlPath) {
  const response = await fetch(`${API}${urlPath}`, { method: 'DELETE', headers: { authorization: `Bearer ${session.token}` } })
  return response.status
}

async function resetState() {
  await waitFor({ what: '没有运行中的备份', timeoutMs: TIMEOUT, probe: async () => (await apiGet('/backups')).every((entry) => entry.status !== 'RUNNING') })
  for (const entry of await apiGet('/backups')) {
    await apiDelete(`/backups/${entry.id}`)
  }
  await apiPost('/backups/settings', { enabled: true, frequency: 'DAILY', weekday: 1, hour: 2, keep: 7, uploadToObjectStorage: false })
  for (const entry of await apiGet('/service-settings')) {
    if (entry.source === 'SAVED') {
      await apiDelete(`/service-settings/${entry.kind}`)
    }
  }
}

async function startApi({ extra = [] } = {}) {
  const port = 3100 + SLOT
  const pids = execFileSync('bash', ['-c', `lsof -nP -tiTCP:${port} -sTCP:LISTEN || true`]).toString().trim()
  if (pids.length > 0) {
    execFileSync('bash', ['-c', `kill ${pids.split('\n').join(' ')}; while lsof -nP -tiTCP:${port} -sTCP:LISTEN >/dev/null 2>&1; do sleep 1; done`])
  }
  execFileSync('bash', [path.join(ROOT, 'tools/e2e/stack/restart-api.sh'), String(SLOT), ...extra], { stdio: 'pipe', timeout: 600000 })
  await waitFor({
    what: 'API 可以访问',
    timeoutMs: 300_000,
    stepMs: 1000,
    probe: async () => (await fetch(`${API}/flags`).then((response) => response.ok).catch(() => false)),
  })
}

async function canReachGithub() {
  const response = await fetch('https://raw.githubusercontent.com/', { signal: AbortSignal.timeout(8000) }).catch(() => null)
  return response !== null
}
