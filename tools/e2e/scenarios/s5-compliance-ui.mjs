import { chromium } from '@playwright/test'
import { ADMIN, DEFAULT_SETTINGS, MEMBER, SHOTS, WEB, api, assert, check, codeStep, http, openDatabaseSnapshot, payloadOf, publishFlow, secretsOf, shot, signIn, sleep, summary, uiLogin, waitFor, webhookTrigger } from './lib/s5-kit.mjs'

const TAG = String(1000 + Math.floor(Math.random() * 8999))
const secrets = secretsOf({ tag: TAG })
const admin = await signIn(ADMIN)
const member = await signIn(MEMBER)
assert(admin && member, '先跑 s5-compliance.mjs 建好成员账号')
const browser = await chromium.launch()
const text = async (page) => (await page.locator('body').innerText())

const flow = await ensureFlow()
const run = await fireRun({ flowId: flow.flowId })
const runsUrl = `${WEB}/projects/${admin.projectId}/runs?time=30d&type=ALL&businessKey=${secrets.jobNumber}`

await check('界面：成员打开运行详情，看到脱敏后的值和「无权查看原文」的说明，没有查看原文按钮', async () => {
  const { context, page } = await uiLogin({ browser, user: MEMBER })
  await openRunNode({ page, name: '整理员工资料' })
  const body = await text(page)
  assert(body.includes(`139****0001`), '没看到脱敏后的手机号')
  assert(!body.includes(secrets.mobile) && !body.includes(secrets.idCard), '成员看到了原文')
  assert(body.includes('你没有查看原文的权限'), '没有说明为什么不能查看原文')
  assert((await page.getByRole('button', { name: '查看原文' }).count()) === 0, '成员能看到查看原文按钮')
  await shot({ page, name: 's5-ui-member-run-detail' })
  await context.close()
})

await check('界面：管理员查看原文——原因至少 4 个字，看到原文，关闭后重新脱敏', async () => {
  const { context, page } = await uiLogin({ browser, user: ADMIN })
  await openRunNode({ page, name: '整理员工资料' })
  assert(!(await text(page)).includes(secrets.mobile), '管理员默认看到了原文')
  await shot({ page, name: 's5-ui-admin-run-detail-masked' })
  await page.getByRole('button', { name: '查看原文' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  const submit = dialog.getByRole('button', { name: '查看原文' })
  await dialog.getByRole('textbox').fill('ab')
  assert(await submit.isDisabled(), '原因太短时按钮没有禁用')
  await shot({ page, name: 's5-ui-reveal-dialog' })
  await dialog.getByRole('textbox').fill('核对入职同步的原始数据')
  await submit.click()
  await waitFor({ what: '原文出现在弹窗里', timeoutMs: 60000, probe: async () => (await dialog.innerText()).includes(secrets.mobile) })
  await shot({ page, name: 's5-ui-reveal-original' })
  await dialog.getByRole('button', { name: /关闭并恢复脱敏/ }).click()
  await sleep(500)
  assert(!(await text(page)).includes(secrets.mobile), '关闭弹窗后页面上还有原文')
  await context.close()
})

await check('界面：审计日志里能按「查看运行原文」筛出刚才的记录，设置页有入口', async () => {
  const { context, page } = await uiLogin({ browser, user: ADMIN })
  await page.goto(`${WEB}/tenant/audit?action=workflow.run.payload.revealed`, { waitUntil: 'domcontentloaded' })
  await page.getByText('查看了运行').first().waitFor({ timeout: 60000 })
  assert((await text(page)).includes(run.id), '审计里没有这次运行')
  await shot({ page, name: 's5-ui-audit-reveal' })
  await page.goto(`${WEB}/tenant/security/privacy`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: '查看原文访问记录' }).waitFor({ timeout: 60000 })
  await context.close()
})

await check('界面：数据与隐私页——浅色、深色、窄屏截图，规则带示例，说明文案写得出的都能兑现', async () => {
  for (const [name, options] of [['light', {}], ['dark', { colorScheme: 'dark' }], ['narrow', { width: 480, height: 900 }]]) {
    const { context, page } = await uiLogin({ browser, user: ADMIN, ...options })
    await page.goto(`${WEB}/tenant/security/privacy`, { waitUntil: 'domcontentloaded' })
    await page.getByText('按项目设置保留期').waitFor({ timeout: 90000 })
    const body = await text(page)
    assert(body.includes('13812345678 → 138****5678'), '内置规则没有示例')
    assert(body.includes('邮箱') && body.includes('密钥与令牌'), '内置规则不全')
    await shot({ page, name: `s5-ui-privacy-${name}` })
    const container = page.locator('main, [class*="overflow-auto"]').first()
    await container.evaluate((element) => { element.scrollTop = element.scrollHeight }).catch(() => {})
    await sleep(500)
    await shot({ page, name: `s5-ui-privacy-${name}-bottom` })
    await context.close()
  }
})

const retentionEnabled = process.env.E2E_UI_SKIP_RETENTION !== '1'

await check('界面：按项目设置保留期，保存后生效，再改回跟随平台', async () => {
  if (!retentionEnabled) {
    return 'skipped'
  }
  const { context, page } = await uiLogin({ browser, user: ADMIN })
  await api({ method: 'POST', path: '/privacy-settings', body: { ...DEFAULT_SETTINGS, logRetentionDays: 30 }, token: admin.token })
  await page.goto(`${WEB}/tenant/security/privacy`, { waitUntil: 'domcontentloaded' })
  const row = page.locator('div').filter({ hasText: /^Dev 的项目/ }).first()
  await row.getByRole('combobox').click()
  await page.getByRole('option', { name: '7 天' }).click()
  await waitFor({ what: '项目保留期变成 7 天', timeoutMs: 20000, probe: async () => (await api({ method: 'GET', path: `/projects/${admin.projectId}`, token: admin.token })).executionDataRetentionDays === 7 })
  const logs = await signIn(ADMIN)
  const scope = await api({ method: 'GET', path: '/run-logs/scope', token: logs.token })
  assert(scope.projects.some((project) => project.retentionDays === 7), `运行日志范围里的保留期 ${JSON.stringify(scope.projects.map((project) => project.retentionDays))}`)
  await shot({ page, name: 's5-ui-project-retention' })
  await row.getByRole('combobox').click()
  await page.getByRole('option', { name: /跟随平台/ }).click()
  await waitFor({ what: '项目保留期恢复默认', timeoutMs: 20000, probe: async () => (await api({ method: 'GET', path: `/projects/${admin.projectId}`, token: admin.token })).executionDataRetentionDays === null })
  await context.close()
})

await check('界面：改平台保留期并保存，接口和运行日志页顶部的说明都变', async () => {
  if (!retentionEnabled) {
    return 'skipped'
  }
  const { context, page } = await uiLogin({ browser, user: ADMIN })
  await page.goto(`${WEB}/tenant/security/privacy`, { waitUntil: 'domcontentloaded' })
  await page.getByText('运行日志保留').waitFor({ timeout: 90000 })
  await page.getByRole('combobox').first().click()
  await page.getByRole('option', { name: '14 天' }).click()
  await page.getByRole('button', { name: '保存' }).click()
  await waitFor({ what: '设置保存', timeoutMs: 20000, probe: async () => (await api({ method: 'GET', path: '/privacy-settings', token: admin.token })).logRetentionDays === 14 })
  await page.goto(runsUrl, { waitUntil: 'domcontentloaded' })
  await page.getByText(/日志保留 14 天/).waitFor({ timeout: 60000 })
  await api({ method: 'POST', path: '/privacy-settings', body: DEFAULT_SETTINGS, token: admin.token })
  await context.close()
})

await check('界面：按工号删除个人数据——先搜索再确认，确认后接口和库里都找不到', async () => {
  const { context, page } = await uiLogin({ browser, user: ADMIN })
  await page.goto(`${WEB}/tenant/security/privacy`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '新建删除请求' }).click({ timeout: 90000 })
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('XH20210311').fill(secrets.jobNumber)
  await dialog.getByRole('textbox').last().fill('员工离职并要求删除个人数据，工单 HR-5001')
  await shot({ page, name: 's5-ui-erasure-dialog' })
  await dialog.getByRole('button', { name: '查找运行记录' }).click()
  await page.getByRole('button', { name: /删除 \d+ 条记录中的数据/ }).waitFor({ timeout: 90000 })
  await shot({ page, name: 's5-ui-erasure-found' })
  await page.getByRole('button', { name: /删除 \d+ 条记录中的数据/ }).click()
  await shot({ page, name: 's5-ui-erasure-confirm' })
  const confirm = page.getByRole('dialog')
  await confirm.getByRole('button', { name: /^删除$/ }).click()
  const hint = `${secrets.jobNumber.slice(0, 2)}${'*'.repeat(secrets.jobNumber.length - 4)}${secrets.jobNumber.slice(-2)}`
  await waitFor({
    what: '删除请求处理完成',
    timeoutMs: 120000,
    probe: async () => (await api({ method: 'GET', path: '/privacy-settings/erasures', token: admin.token })).some((request) => request.valueHint === hint && request.status === 'DONE'),
  })
  await page.getByText(/已清除 \d+ 条运行记录中的数据/).first().waitFor({ timeout: 90000 })
  await shot({ page, name: 's5-ui-erasure-done' })
  const found = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=20&type=ALL&time=30d&businessKey=${secrets.jobNumber}`, token: admin.token })
  assert(found.data.length === 0, `按工号还能搜到 ${found.data.length} 条运行`)
  const content = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=20&type=ALL&time=30d&content=${secrets.jobNumber}`, token: admin.token })
  assert(content.data.length === 0, `按日志内容还能搜到 ${content.data.length} 条运行`)
  const db = openDatabaseSnapshot()
  try {
    const rows = await db.query('select id, "businessKey", "failedStep", "logsFileId", "displayLogsFileId" from execution where id = $1', [run.id])
    assert(rows[0].businessKey === null, `运行记录上的工号还在：${rows[0].businessKey}`)
    const files = await Promise.all([rows[0].logsFileId, rows[0].displayLogsFileId].filter(Boolean).map((fileId) => db.fileText(fileId)))
    const remaining = [secrets.mobile, secrets.idCard, secrets.email, secrets.jobNumber].filter((value) => files.join('\n').includes(value))
    assert(remaining.length === 0, `日志文件里还有：${remaining}`)
    const payloads = await db.query("select data from file where type = 'WEBHOOK_PAYLOAD'")
    assert(!payloads.some((file) => Buffer.from(file.data).toString('utf8').includes(secrets.jobNumber)), 'webhook 原始请求体里还有这个工号')
    const dedupe = await db.query('select "keyPreview" from deduped_event')
    assert(!dedupe.some((row) => String(row.keyPreview).includes(secrets.jobNumber)), '去重记录里还有这个工号')
  }
  finally {
    await db.close()
  }
  await context.close()
})

await check('界面：编辑器里节点出参页有「出参包含敏感信息」开关，打开后保存到草稿', async () => {
  const { context, page } = await uiLogin({ browser, user: ADMIN })
  await page.goto(`${WEB}/projects/${admin.projectId}/workflows/${flow.flowId}`, { waitUntil: 'domcontentloaded' })
  await page.getByText('通知 HR').first().waitFor({ timeout: 90000 })
  await page.getByText('通知 HR').first().click()
  await page.getByRole('tab', { name: '出参' }).click()
  const toggle = page.getByRole('switch', { name: '出参包含敏感信息' })
  await toggle.waitFor({ timeout: 30000 })
  const before = (await toggle.getAttribute('aria-checked')) === 'true'
  await toggle.click()
  await waitFor({
    what: '草稿里 step_3 的敏感标记翻转',
    timeoutMs: 30000,
    probe: async () => {
      const draft = await api({ method: 'GET', path: `/workflows/${flow.flowId}?projectId=${admin.projectId}`, token: admin.token })
      return (draft.version.trigger.nextAction.nextAction.nextAction.settings.sensitiveOutput === true) === !before
    },
  })
  await shot({ page, name: 's5-ui-node-sensitive-toggle' })
  await context.close()
})

await browser.close()
summary()
void member
void SHOTS

async function ensureFlow() {
  const listed = await api({ method: 'GET', path: `/workflows?projectId=${admin.projectId}&limit=100`, token: admin.token })
  const existing = listed.data.find((item) => item.version?.displayName === 'S5UI 员工入职同步')
  if (existing) {
    return { flowId: existing.id }
  }
  const flowId = await publishFlow({
    session: admin,
    displayName: 'S5UI 员工入职同步',
    trigger: webhookTrigger({
      displayName: '接收员工数据',
      dedupeKeyPath: '{{trigger.body.employee.jobNumber}}',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '整理员工资料',
        code: 'export const code = async (inputs) => ({ synced: true, profile: inputs.payload.employee, contacts: inputs.payload.contacts, note: inputs.payload.note })',
        input: { payload: "{{trigger['output']['body']}}" },
        nextAction: codeStep({
          name: 'step_2',
          displayName: '薪资核算',
          sensitive: true,
          code: "export const code = async () => ({ salary: 32000, grade: 'P7' })",
          input: {},
          nextAction: codeStep({
            name: 'step_3',
            displayName: '通知 HR',
            code: "export const code = async () => ({ sent: true })",
            input: {},
          }),
        }),
      }),
    }),
  })
  return { flowId }
}

async function fireRun({ flowId }) {
  const response = await http({ method: 'POST', path: `/webhooks/${flowId}`, body: payloadOf({ secrets }) })
  assert(response.ok, `webhook ${response.status}`)
  return waitFor({
    what: '运行结束',
    probe: async () => {
      const runs = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=5&type=ALL&businessKey=${secrets.jobNumber}`, token: admin.token })
      return runs.data.find((item) => item.status === 'SUCCEEDED') ?? null
    },
  })
}

async function openRunNode({ page, name }) {
  await page.goto(runsUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('row').filter({ hasText: secrets.jobNumber }).first().getByRole('button', { name: /详情/ }).click({ timeout: 90000 })
  await page.getByText(name).first().waitFor({ timeout: 120000 })
  await page.getByText(name).first().click()
  await sleep(1500)
}
