import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'

const SLOT = process.env.SLOT ?? '3'
const STATE_DIR = `${process.env.E2E_STATE_ROOT ?? '/tmp/fema-e2e'}/slot-${SLOT}`
const ports = parsePortsEnv({ path: `${STATE_DIR}/ports.env` })
const API_ORIGIN = process.env.E2E_API_URL ?? ports.API_URL
const WEB = process.env.E2E_WEB_URL ?? ports.WEB_URL
const MOCK = process.env.E2E_MOCK_URL ?? ports.MOCK_URL
const API = `${API_ORIGIN}/api/v1`
const EMAIL = process.env.E2E_EMAIL ?? 'dev@ap.com'
const PASSWORD = process.env.E2E_PASSWORD ?? '12345678'
const SHOTS = process.env.E2E_SHOTS ?? `${STATE_DIR}/shots`
const HR_CHAT_ID = 'oc_hr_notice'
const IT_CHAT_ID = 'oc_it_desk'
const FROM_STAGE = process.env.E2E_FROM ?? ''
const BATCH_SIZE = Number(process.env.E2E_BATCH_SIZE ?? 22)
const UNMAPPED_DEPARTMENT = process.env.E2E_UNMAPPED ?? '20399'
const RECEIVER_PORT = Number(process.env.E2E_RECEIVER_PORT ?? 19000 + Number(SLOT))

mkdirSync(SHOTS, { recursive: true })

const results = []
const gaps = []
const ctx = { session: null, browser: null, page: null, installed: null, receiver: null, webhooks: [] }

await main()

async function main() {
  ctx.session = await authenticate()
  ctx.receiver = await startReceiver()
  ctx.browser = await chromium.launch()
  const context = await ctx.browser.newContext({ viewport: { width: 1440, height: 900 } })
  ctx.page = await context.newPage()
  ctx.page.setDefaultNavigationTimeout(180000)
  ctx.page.setDefaultTimeout(60000)
  ctx.page.on('pageerror', (error) => gaps.push(`页面脚本错误：${error.message.slice(0, 160)}`))
  await signIn()
  const onlyStage = process.env.E2E_ONLY ?? ''
  const stages = [
    ['connections', stageConnections],
    ['install', stageInstall],
    ['publish', stagePublish],
    ['events', stageEvents],
    ['search', stageSearch],
    ['alerts', stageAlerts],
    ['failA', stageMissingMapping],
  ]
  let started = FROM_STAGE === ''
  for (const [name, run] of stages) {
    started = started || name === FROM_STAGE
    if (started && (onlyStage === '' || onlyStage === name)) {
      await run()
    }
  }
  await ctx.browser.close()
  ctx.receiver.close()
  printSummary()
}

async function stageConnections() {
  await check('连接向导：错误的北森凭据被拦住并说明原因', async () => {
    await openConnectionWizard({ app: '北森' })
    await fillConnectionForm({ values: ['wrong', 'x'] })
    const message = await submitConnectionForm({ expect: 'error' })
    await shot('conn-beisen-wrong')
    assert(message.includes('app_key or app_secret is wrong'), `提示里没有写明原因：${message}`)
    await closeDialog()
    return message
  })
  await check('连接向导：正确的北森凭据保存成功', async () => {
    await openConnectionWizard({ app: '北森' })
    await fillConnectionForm({ values: ['mock-key', 'mock-secret'] })
    await submitConnectionForm({ expect: 'saved' })
    await shot('conn-beisen-saved')
    return 'ok'
  })
  await check('连接向导：错误的飞书凭据被拦住并说明原因', async () => {
    await openConnectionWizard({ app: '飞书' })
    await fillConnectionForm({ values: ['cli_mock', 'wrong'] })
    const message = await submitConnectionForm({ expect: 'error' })
    await shot('conn-feishu-wrong')
    assert(/invalid|app secret|99991663/i.test(message), `提示里没有写明原因：${message}`)
    await closeDialog()
    return message
  })
  await check('连接向导：正确的飞书凭据保存成功，列表里能看到两个连接', async () => {
    await openConnectionWizard({ app: '飞书' })
    await fillConnectionForm({ values: ['cli_mock', 'mock-secret'] })
    await submitConnectionForm({ expect: 'saved' })
    const body = await ctx.page.locator('body').innerText()
    assert(body.includes('北森') && body.includes('飞书'), '连接列表里缺少连接')
    await shot('conn-list')
    return 'ok'
  })
}

async function stageInstall() {
  const { page } = ctx
  await check('方案库：官方方案在库里，详情页写明包含的资源和安装前要准备的事', async () => {
    await page.goto(`${WEB}/solutions`)
    await page.getByText('北森 → 飞书 人员同步').first().click()
    await page.getByText('安装前要准备').waitFor({ timeout: 60000 })
    const body = await page.locator('body').innerText()
    assert(['员工入职开通飞书账号', '员工调岗同步部门', '员工离职暂停飞书账号', '北森部门到飞书部门'].every((name) => body.includes(name)), '详情页缺少资源')
    await shot('solution-detail')
    return 'ok'
  })
  await check('安装向导：选连接、填群 ID、安装检查（必填项通过）、确认页写明要建的资源，安装成功', async () => {
    await page.getByRole('button', { name: /^安装$/ }).first().click()
    await page.getByText('安装到项目').waitFor({ timeout: 60000 })
    await nextStep()
    await nextStep()
    const inputs = page.locator('input[type=text], input:not([type])')
    await inputs.nth(0).fill(HR_CHAT_ID)
    await inputs.nth(1).fill(IT_CHAT_ID)
    await nextStep()
    await page.getByText('全部重新检查').waitFor({ timeout: 60000 })
    await page.getByText('北森 连接可用').waitFor()
    await shot('install-checks')
    const boxes = page.getByRole('checkbox')
    const count = await boxes.count()
    for (let index = 0; index < count; index++) {
      await boxes.nth(index).click()
    }
    await nextStep()
    await page.getByText('将创建的资源').waitFor()
    await shot('install-confirm')
    await page.getByRole('button', { name: /^安装$/ }).click()
    await page.waitForURL((url) => !url.pathname.endsWith('/install'), { timeout: 5000 }).catch(() => undefined)
    await page.getByText(/安装完成|已安装/).first().waitFor({ timeout: 120000 })
    await shot('install-done')
    return (await page.locator('body').innerText()).slice(0, 400)
  })
}

async function stagePublish() {
  const { page } = ctx
  await check('映射表：在界面填好北森部门到飞书部门的对照并保存', async () => {
    await page.goto(`${WEB}/projects/${ctx.session.projectId}/mapping-tables`)
    await page.getByText('北森部门到飞书部门').first().click()
    await page.getByText('对照数据').waitFor({ timeout: 60000 })
    const alreadyFilled = (await page.locator('body').innerText()).includes('2/5000')
    for (const [key, value] of alreadyFilled ? [] : [['20301', 'od-rd'], ['20302', 'od-hr']]) {
      await page.getByPlaceholder('新的键').fill(key)
      await page.getByPlaceholder('新的值').fill(value)
      await page.getByRole('button', { name: '添加' }).click()
    }
    if (!alreadyFilled) {
      await page.getByRole('button', { name: '保存修改' }).click()
      await page.getByText('映射表已保存').waitFor({ timeout: 30000 })
    }
    await shot('mapping-saved')
    return 'ok'
  })
  const workflows = await listWorkflows()
  await check('发布：三个工作流在编辑器里逐个发布启用（未测试的写入步骤会先弹警告）', async () => {
    const published = []
    for (const workflow of workflows) {
      await page.goto(`${WEB}/projects/${ctx.session.projectId}/workflows/${workflow.id}`)
      await page.getByText('部门对照', { exact: false }).or(page.getByText('最后更新')).first().waitFor({ timeout: 90000 })
      const live = page.getByText('已发布', { exact: true }).or(page.getByText(/线上版本/)).first()
      const alreadyLive = await live.isVisible().catch(() => false)
      if (!alreadyLive) {
        await page.getByRole('button', { name: '发布', exact: true }).click({ timeout: 90000 })
        const confirm = page.getByRole('button', { name: '仍然发布' })
        await confirm.waitFor({ timeout: 10000 }).then(() => confirm.click()).catch(() => undefined)
      }
      await live.waitFor({ timeout: 60000 })
      published.push(workflow.version.displayName)
    }
    await shot('published')
    return published
  })
  await check('发布后触发器已启用（北森轮询开始）', async () => {
    const before = (await mock({ method: 'GET', path: '/__admin/state' })).timeWindowRequests.length
    await waitFor({ probe: async () => (await mock({ method: 'GET', path: '/__admin/state' })).timeWindowRequests.length > before + 1, timeoutMs: 120000 })
    return 'ok'
  })
}

async function stageEvents() {
  const { page } = ctx
  await mock({ method: 'POST', path: '/__admin/feishu-failure', body: {} })
  await mock({ method: 'POST', path: '/__admin/beisen-mode', body: {} })
  await check('入职：账号按部门对照建在研发部，只在新开通时通知 HR 群', async () => {
    const stateBefore = await mockState()
    if (!stateBefore.feishuUsers.some((user) => user.employee_no === 'E1001')) {
      await injectEmployees({ records: [person({ id: 1001, jobNumber: 'E1001', name: '张三', mobile: '13800000001', department: 20301, status: '2', changeType: '1' })] })
    }
    return waitFor({
      probe: async () => {
        const state = await mockState()
        const user = state.feishuUsers.find((item) => item.mobile === '+8613800000001')
        const notices = state.messages.filter((message) => message.chat_id === HR_CHAT_ID && message.content.includes('张三'))
        return user && notices.length === 1 && user.department_ids[0] === 'od-rd' ? { open_id: user.open_id, department: user.department_ids[0] } : null
      },
    })
  })
  await check('调岗：飞书部门改成对照后的人力资源部', async () => {
    await injectEmployees({ records: [person({ id: 1001, jobNumber: 'E1001', name: '张三', mobile: '13800000001', department: 20302, status: '3', changeType: '7' })] })
    return waitFor({
      probe: async () => {
        const user = (await mockState()).feishuUsers.find((item) => item.mobile === '+8613800000001')
        return user && user.department_ids[0] === 'od-hr' ? { department: user.department_ids[0] } : null
      },
    })
  })
  await check('离职：飞书账号被暂停（冻结）而不是删除，数据保留，IT 群收到通知', async () => {
    await injectEmployees({ records: [person({ id: 1001, jobNumber: 'E1001', name: '张三', mobile: '13800000001', department: 20302, status: '8', changeType: '13' })] })
    return waitFor({
      probe: async () => {
        const state = await mockState()
        const user = state.feishuUsers.find((item) => item.mobile === '+8613800000001')
        const notified = state.messages.some((message) => message.chat_id === IT_CHAT_ID && message.content.includes('张三'))
        return user && user.is_frozen === true && notified ? { frozen: true, accountStillExists: true } : null
      },
    })
  })
}

async function stageSearch() {
  const { page } = ctx
  await check('运行日志：在界面按工号 E1001 筛选，能看到入职、调岗、离职三个工作流的记录', async () => {
    await openRunLogs()
    await addRunLogFilter({ field: '业务标识', value: 'E1001' })
    const rows = page.locator('tbody tr').filter({ hasText: 'E1001' })
    await rows.nth(2).waitFor({ timeout: 60000 })
    const names = await rows.allInnerTexts()
    ;['员工入职开通飞书账号', '员工调岗同步部门', '员工离职暂停飞书账号'].forEach((name) => assert(names.some((row) => row.includes(name)), `按工号搜不到 ${name} 的记录`))
    await shot('runlogs-by-job-number')
    return 'ok'
  })
}

async function stageAlerts() {
  const { page } = ctx
  await check('告警设置：新建 Webhook 渠道，发送测试消息，模拟接收端真的收到', async () => {
    await page.goto(`${WEB}/issue-center?tab=alerts`)
    await page.getByText('通知渠道', { exact: true }).first().click()
    await page.getByRole('button', { name: /新建通知渠道/ }).first().waitFor({ timeout: 120000 })
    const existing = await page.getByRole('row').filter({ hasText: '值班 Webhook' }).count()
    if (existing === 0) {
      await page.getByRole('button', { name: /新建通知渠道/ }).first().click()
      const dialog = page.getByRole('dialog')
      await dialog.locator('input[name=name]').fill('值班 Webhook')
      await dialog.getByRole('combobox').click()
      await page.getByRole('option', { name: 'Webhook' }).click()
      await dialog.locator('input[name=url]').fill(`http://127.0.0.1:${RECEIVER_PORT}/alerts`)
      await dialog.getByRole('button', { name: '保存' }).click()
      await page.getByRole('row').filter({ hasText: '值班 Webhook' }).first().waitFor({ timeout: 90000 })
    }
    await page.getByRole('button', { name: /测试/ }).first().click()
    await waitFor({ probe: async () => ctx.webhooks.some((hook) => hook.title === '告警渠道测试'), timeoutMs: 30000 })
    await shot('alert-channel')
    return 'ok'
  })
  await check('告警设置：新建告警策略（出现新问题 + 问题复发），静默时段默认关闭', async () => {
    await page.getByText('告警策略', { exact: true }).first().click()
    await page.getByRole('button', { name: '新建告警策略' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('input[name=name]').fill('主线失败告警')
    const quiet = dialog.getByRole('switch').first()
    assert((await quiet.getAttribute('aria-checked')) === 'false', '静默时段默认应当关闭')
    await dialog.getByText('值班 Webhook').click()
    await shot('alert-policy-dialog')
    await dialog.getByRole('button', { name: '保存' }).click()
    await page.getByText('主线失败告警').first().waitFor()
    await shot('alert-policy-saved')
    return 'ok'
  })
}

async function stageMissingMapping() {
  const { page } = ctx
  const batch = Number(process.env.E2E_BATCH ?? Date.now() % 100000)
  const people = Array.from({ length: BATCH_SIZE }, (_, index) => personOf({ number: batch * 100 + index, department: UNMAPPED_DEPARTMENT }))
  const issueBefore = await findIssue({ stepName: 'map_department' })
  const countBefore = issueBefore?.occurrences ?? 0
  ctx.webhooks.length = 0
  await mock({ method: 'POST', path: '/__admin/feishu-failure', body: {} })
  await check(`失败路径 A：${BATCH_SIZE} 个新员工的部门不在映射表里，聚合成一个问题`, async () => {
    await injectEmployees({ records: people.map((person) => person.record) })
    const issue = await waitFor({
      probe: async () => {
        const found = await findIssue({ stepName: 'map_department' })
        return found && found.occurrences >= countBefore + BATCH_SIZE ? found : null
      },
      timeoutMs: 420000,
    })
    const open = await listIssues({ view: 'OPEN' })
    const sameCause = open.filter((item) => item.stepName === 'map_department')
    assert(sameCause.length === 1, `同一原因应当只有一个问题，实际 ${sameCause.length} 个`)
    ctx.issueA = issue
    return { issueId: issue.id, occurrences: issue.occurrences, title: issue.title.slice(0, 60) }
  })
  await check('失败路径 A：同一原因只告警一次（22 次失败 → 1 条告警送达）', async () => {
    await sleep(15000)
    const alerts = ctx.webhooks.filter((hook) => hook.title !== '告警渠道测试')
    const tooMany = issueBefore ? alerts.length > 1 : alerts.length !== 1
    assert(!tooMany, `这批失败应当只告警一次，实际 ${alerts.length} 条：${JSON.stringify(alerts).slice(0, 300)}`)
    return { alerts: alerts.length, sample: alerts[0]?.title ?? null }
  })
  await check('失败路径 A：触发器去重——同一员工的重复事件不会再跑一次', async () => {
    const issue = await findIssue({ stepName: 'map_department' })
    const before = issue.occurrences
    const duplicated = people.slice(0, 3).map((person) => person.record)
    await injectEmployees({ records: duplicated })
    await sleep(150000)
    const after = await findIssue({ stepName: 'map_department' })
    assert(after.occurrences === before, `重复事件被当成新运行：${before} -> ${after.occurrences}`)
    const deduped = await api({ method: 'GET', path: `/deduped-events?projectId=${ctx.session.projectId}&limit=50` })
    const keys = deduped.data.map((event) => JSON.stringify(event))
    assert(people.slice(0, 3).every((person) => keys.some((key) => key.includes(person.jobNumber))), `去重记录里找不到这三个工号：${keys.length} 条`)
    return { occurrences: after.occurrences, dedupedEvents: deduped.data.length }
  })
  await check('问题详情：写明根因和谁能修，修复动作可直接点（打开映射表、从失败节点重跑）', async () => {
    await openIssueDetail({ issue: ctx.issueA })
    const body = await page.locator('body').innerText()
    assert(body.includes('根因分析'), '没有根因分析')
    assert(!body.includes('置信度'), '不应显示置信度')
    const owner = await page.getByTestId('issue-fix-owner').innerText()
    assert(owner.includes('映射表负责人'), `谁能修写的是：${owner}`)
    assert(await page.getByRole('button', { name: '打开映射表' }).isVisible(), '缺少「打开映射表」按钮')
    assert(/\d+ 次失败 → \d+ 条告警/.test(body), '概况里没有写明聚合后的告警数')
    await shot('issue-a-detail')
    return owner
  })
  await check('修复：点「打开映射表」补上缺的部门，保存成功', async () => {
    await page.getByRole('button', { name: '打开映射表' }).click()
    await page.getByText('北森部门到飞书部门').first().click()
    await page.getByPlaceholder('新的键').fill(UNMAPPED_DEPARTMENT)
    await page.getByPlaceholder('新的值').fill('od-sales')
    const add = page.getByRole('button', { name: '添加' })
    if (await add.isEnabled()) {
      await add.click()
      await page.getByRole('button', { name: '保存修改' }).click()
      await page.getByText('映射表已保存').waitFor({ timeout: 60000 })
    }
    return 'ok'
  })
  await check('重试前确认：对话框写明用哪个版本、哪些写步骤会执行或跳过，勾选整体重跑才需要确认重复写入', async () => {
    await openIssueDetail({ issue: ctx.issueA })
    await page.getByRole('button', { name: '批量重跑失败的运行' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByTestId('rerun-preview').waitFor({ timeout: 60000 })
    await dialog.getByText(/沿用这些运行当时的版本 v\d+/).waitFor({ timeout: 60000 })
    await dialog.getByText(/会再次调用并写入：.*开通飞书账号/).waitFor({ timeout: 60000 })
    const text = await dialog.innerText()
    assert(text.includes('通知 HR 群'), '预览里没有写出通知步骤')
    await shot('issue-a-replay-dialog')
    await dialog.getByText('用最新版本整体重跑').click()
    await dialog.getByText(/最新发布的版本 v\d+/).waitFor({ timeout: 60000 })
    const confirm = dialog.getByRole('button', { name: /^重跑 \d+ 次运行/ })
    assert(await confirm.isDisabled(), '整体重跑在没确认重复写入前不该能点')
    await shot('issue-a-replay-dialog-whole')
    await dialog.getByText('从失败节点重跑').first().click()
    assert(await confirm.isEnabled(), '从失败节点重跑应当可以直接确认')
    return 'ok'
  })
  await check(`批量重跑：${BATCH_SIZE} 条从失败节点继续，账号各开通一次、HR 群各通知一次，问题自动已解决`, async () => {
    await page.getByRole('dialog').getByRole('button', { name: /^重跑 \d+ 次运行/ }).click()
    const mobiles = people.map((person) => person.mobile)
    await waitFor({
      probe: async () => {
        const state = await mockState()
        return mobiles.every((mobile) => state.feishuUsers.some((user) => user.mobile === mobile)) ? state : null
      },
      timeoutMs: 420000,
    })
    await sleep(10000)
    const state = await mockState()
    const accounts = state.feishuUsers.filter((user) => mobiles.includes(user.mobile))
    assert(accounts.length === BATCH_SIZE, `账号数 ${accounts.length}`)
    assert(accounts.every((user) => user.department_ids[0] === 'od-sales'), '部门不是映射后的 od-sales')
    const notices = state.messages.filter((message) => people.some((person) => message.content.includes(person.jobNumber)))
    assert(notices.length === BATCH_SIZE, `HR 群通知 ${notices.length} 条，应当每人一条`)
    const resolved = await waitFor({
      probe: async () => {
        const issue = await findIssue({ stepName: 'map_department', view: 'ALL' })
        return issue?.status === 'RESOLVED' ? issue : null
      },
      timeoutMs: 180000,
    })
    return { accounts: accounts.length, notices: notices.length, issue: resolved.status }
  })
}

async function findIssue({ stepName, view = 'OPEN' }) {
  const issues = await listIssues({ view })
  return issues.find((issue) => issue.stepName === stepName) ?? null
}

async function listIssues({ view }) {
  const page = await api({ method: 'GET', path: `/issues?projectId=${ctx.session.projectId}&view=${view}&limit=100` })
  return page.data
}

async function openIssueDetail({ issue }) {
  await ctx.page.goto(`${WEB}/projects/${ctx.session.projectId}/issues/${issue.id}`)
  await ctx.page.getByText('根因分析').waitFor({ timeout: 120000 })
}

function personOf({ number, department }) {
  const jobNumber = `E${number}`
  const mobile = `+86139${String(number).padStart(8, '0').slice(-8)}`
  return {
    jobNumber,
    mobile,
    record: person({ id: number, jobNumber, name: `测试${number}`, mobile: mobile.replace('+86', ''), department, status: '2', changeType: '1' }),
  }
}

async function openRunLogs() {
  await ctx.page.goto(`${WEB}/projects/${ctx.session.projectId}/runs`)
  await ctx.page.getByRole('button', { name: /筛选/ }).waitFor({ timeout: 120000 })
  await ctx.page.getByText('已创建').waitFor({ timeout: 120000 })
}

async function addRunLogFilter({ field, value }) {
  const { page } = ctx
  await page.getByRole('button', { name: /筛选/ }).click()
  await page.getByRole('button', { name: '添加筛选条件' }).click()
  await page.getByRole('menuitem', { name: field }).or(page.getByRole('option', { name: field })).first().click()
  const inputs = page.locator('[data-radix-popper-content-wrapper] input')
  await inputs.last().fill(value)
  await page.getByRole('button', { name: '查询' }).click()
}

function startReceiver() {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const chunks = []
      request.on('data', (chunk) => chunks.push(chunk))
      request.on('end', () => {
        ctx.webhooks.push(parseJson({ text: Buffer.concat(chunks).toString('utf8') }) ?? {})
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{}')
      })
    })
    server.listen(RECEIVER_PORT, () => resolve(server))
  })
}

async function mockState() {
  return mock({ method: 'GET', path: '/__admin/state' })
}

async function injectEmployees({ records }) {
  return mock({ method: 'POST', path: '/__admin/employees', body: { records } })
}

function person({ id, jobNumber, name, mobile, department, status, changeType }) {
  return {
    employeeInfo: { userID: id, name, mobilePhone: mobile, workEmail: `${jobNumber.toLowerCase()}@example.com`, objectId: `00000000-0000-0000-0000-${String(id).padStart(12, '0')}` },
    recordInfo: { userID: id, jobNumber, oIdDepartment: department, employeeStatus: status, changeTypeOID: changeType, approvalStatus: 4, startDate: '2026-10-08T00:00:00', lastWorkDate: status === '8' ? '2026-10-02T00:00:00' : null },
  }
}

async function listWorkflows() {
  const list = await api({ method: 'GET', path: `/workflows?projectId=${ctx.session.projectId}&limit=100` })
  return list.data
}

async function waitFor({ probe, timeoutMs = 240000 }) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value) {
      return value
    }
    await sleep(3000)
  }
  throw new Error(`等了 ${timeoutMs / 1000} 秒仍未出现`)
}

async function nextStep() {
  await ctx.page.getByRole('button', { name: '下一步' }).click()
  await ctx.page.waitForTimeout(1200)
}

async function signIn() {
  const { page } = ctx
  await page.goto(`${WEB}/sign-in`)
  await page.getByTestId('sign-in-email').fill(EMAIL)
  await page.getByTestId('sign-in-password').fill(PASSWORD)
  await page.getByRole('button', { name: '登录' }).click()
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 90000 })
}

async function openConnectionWizard({ app }) {
  const { page } = ctx
  await page.goto(`${WEB}/projects/${ctx.session.projectId}/connections`)
  await page.getByRole('button', { name: /新建连接/ }).first().click()
  await page.getByText(app, { exact: true }).click()
  await page.getByRole('dialog').getByText(`连接到 ${app}`).waitFor({ timeout: 30000 })
}

async function fillConnectionForm({ values }) {
  const dialog = ctx.page.getByRole('dialog')
  const textInputs = dialog.locator('input[type=text]')
  const count = await textInputs.count()
  const secretInput = dialog.locator('input[type=password]')
  await textInputs.nth(count - 1).fill(values[0])
  await secretInput.fill(values[1])
}

async function submitConnectionForm({ expect }) {
  const { page } = ctx
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: '保存' }).click()
  if (expect === 'saved') {
    await dialog.waitFor({ state: 'detached', timeout: 120000 })
    return ''
  }
  const error = dialog.locator('.text-destructive, [role=alert], p').filter({ hasText: '连接失败' }).first()
  await error.waitFor({ timeout: 120000 })
  return error.innerText()
}

async function closeDialog() {
  const dialog = ctx.page.getByRole('dialog')
  await dialog.getByRole('button', { name: '取消' }).click()
  await dialog.waitFor({ state: 'detached', timeout: 10000 })
}

async function authenticate() {
  const signIn = await fetchJson({ method: 'POST', url: `${API}/authentication/sign-in`, body: { email: EMAIL, password: PASSWORD } })
  if (!signIn.ok) {
    throw new Error(`sign-in failed: ${JSON.stringify(signIn.body)}`)
  }
  return { token: signIn.body.token, projectId: signIn.body.projectId }
}

async function check(label, fn) {
  const startedAt = Date.now()
  try {
    const detail = await fn()
    results.push({ label, ok: true })
    process.stdout.write(`PASS ${label} ${JSON.stringify(detail ?? '')} (${Math.round((Date.now() - startedAt) / 1000)}s)\n`)
    return detail
  }
  catch (error) {
    results.push({ label, ok: false })
    process.stdout.write(`FAIL ${label} ${error.message}\n`)
    await shot(`FAIL-${results.length}`).catch(() => undefined)
    return null
  }
}

async function shot(name) {
  await ctx.page.screenshot({ path: `${SHOTS}/${name}.png` })
}

async function api({ method, path, body }) {
  const response = await fetchJson({ method, url: `${API}${path}`, body, token: ctx.session.token })
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(response.body).slice(0, 400)}`)
  }
  return response.body
}

async function mock({ method, path, body }) {
  return (await fetchJson({ method, url: `${MOCK}${path}`, body })).body
}

async function fetchJson({ method, url, body, token }) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  return { ok: response.ok, status: response.status, body: parseJson({ text }) }
}

function parseJson({ text }) {
  try {
    return text ? JSON.parse(text) : null
  }
  catch {
    return text
  }
}

function parsePortsEnv({ path }) {
  const entries = readFileSync(path, 'utf8').split('\n').filter((line) => line.includes('=')).map((line) => line.split(/=(.*)/s).slice(0, 2))
  return Object.fromEntries(entries)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function printSummary() {
  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`)
  gaps.forEach((gap) => process.stdout.write(`NOTE ${gap}\n`))
  process.exitCode = failed.length === 0 ? 0 : 1
}

export const unused = { api, mock, sleep, HR_CHAT_ID, IT_CHAT_ID }
