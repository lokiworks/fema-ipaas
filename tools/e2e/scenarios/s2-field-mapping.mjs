import { chromium } from '@playwright/test'

const API_URL = process.env.S2_API_URL ?? 'http://localhost:3102'
const WEB_URL = process.env.S2_WEB_URL ?? 'http://localhost:4212'
const MOCK_URL = process.env.S2_MOCK_URL ?? 'http://127.0.0.1:18902'
const SHOTS = process.env.S2_SHOTS ?? '/tmp/fema-e2e/slot-2/shots'
const EMAIL = 'dev@ap.com'
const PASSWORD = '12345678'
const RUN = Date.now().toString(36)
const results = []

const session = await signIn()
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(150000)
page.on('pageerror', (error) => log(`pageerror ${error.message.slice(0, 160)}`))

await uiLogin()
const tableName = `北森部门到飞书部门 ${RUN}`
const flowName = `北森员工到飞书用户 ${RUN}`
const payload = {
  employeeInfo: { name: ' 张三 ', mobilePhone: '13800000001', workEmail: 'Zhangsan@Example.com', employeeType: '1' },
  recordInfo: { jobNumber: 'E1001', oIdDepartment: 20301, departmentName: '研发部', startDate: '2026/10/08', jobTitle: '后端工程师' },
  positions: [{ title: '后端工程师', deptCode: 20301, level: '3' }, { deptCode: 20302, level: '5' }],
}
const state = { tableId: null, workflowId: null }
const until = process.env.S2_UNTIL ?? 'end'

const phases = [
  ['table', '映射表：新建、录入对照、保存、刷新后仍在', async () => { const r = await createMappingTable(); state.tableId = r.id; await shot('01-mapping-table'); return r }],
  ['flow', '工作流：新建 Webhook 触发的流程，发送北森样例数据', async () => { const r = await createFlowWithSample(); state.workflowId = r.workflowId; return r }],
  ['mapper', '工作流：添加字段映射节点并打开入参', async () => { await addMapperStep(); await shot('02-mapper-empty') }],
  ['date', '自由字段：日期格式写错在设计期就提示，改对后预览出结果', freeFormDate],
  ['array', '自由字段：列表逐项映射，某一项缺字段在设计期提示是第几项', async () => { const r = await freeFormArray(); await shot('03-free-form'); return r }],
  ['feishu', '后端：添加飞书开通账号节点，引用映射结果', addFeishuStep],
  ['target', '映射到飞书节点：带出字段、类型和必填，必填没映射的 4 条都在设计期提示', async () => { const r = await pickTarget(); await shot('04-target-picked'); return r }],
  ['ai', 'AI 自动映射：不显示置信度、默认不勾选、写明依据，确认后才写入', async () => { const r = await aiSuggest(); await shot('05-after-ai'); return r }],
  ['manual', '手动补全部门（转文本、查映射表）和员工类型（类型不符先报错，再加转数字）', async () => { const r = await manualFill(); await shot('06-filled'); return r }],
  ['lookup', '映射表里缺这个部门：设计期预览就提示缺哪个值、哪张表', lookupMissAtDesign],
  ['debug', '调试：测试映射节点，输出就是飞书需要的字段', async () => { const r = await debugStep(); await shot('07-debug'); return r }],
  ['run', '发布后真正运行：飞书里按映射结果创建了用户，部门编码正确', publishAndRun],
  ['runfail', '运行失败给出可读原因：新部门值、员工类型不是数字、手机号为空；补上映射表后同一数据重试成功', runtimeFailures],
  ['refuse', '三条路径同一个校验：缺必填映射的流程（模拟方案或 AI 产出）发布被拒绝，编辑器里同样标出', publishRefusedForBrokenMapping],
  ['narrow', '窗口缩窄到 800 宽：映射卡片不横向溢出', narrowWindow],
  ['dark', '深色模式：映射面板跟随系统主题', darkMode],
  ['keys', '键盘：Tab 依次到达目标选择、来源输入和转换按钮', keyboardOrder],
]
for (const [name, label, fn] of phases) {
  await check(label, fn)
  if (name === until) {
    break
  }
}
await finish()

async function finish() {
  await browser.close()
  summary()
  process.exit(process.exitCode ?? 0)
}

async function createMappingTable() {
  await goto('/mapping-tables')
  await page.getByRole('button', { name: '新建映射表' }).click()
  await page.getByRole('dialog').getByLabel('名称').fill(tableName)
  await page.getByRole('dialog').getByRole('button', { name: '创建', exact: true }).click()
  await page.getByText(tableName).first().waitFor()
  const rows = [['20301', 'od-rd'], ['20302', 'od-hr']]
  for (const [key, value] of rows) {
    await page.getByPlaceholder('新的键').fill(key)
    await page.getByPlaceholder('新的值').fill(value)
    await page.getByRole('button', { name: '添加', exact: true }).click()
  }
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByRole('button', { name: '保存修改' }).waitFor({ state: 'visible' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(tableName).first().waitFor()
  const list = await api('GET', `/mapping-tables?projectId=${session.projectId}`)
  const table = list.find((item) => item.name === tableName)
  assert(table && table.rowCount === 2, `映射表行数不对：${JSON.stringify(table)}`)
  return { id: table.id, rows: table.rowCount }
}

async function createFlowWithSample() {
  await page.goto(`${WEB_URL}/home`, { waitUntil: 'domcontentloaded' })
  await page.getByText('新建工作流').first().click()
  await page.getByText('Webhook 触发器').waitFor()
  await page.waitForTimeout(3000)
  await page.getByText('Webhook 触发器').click()
  await page.getByLabel('工作流名称').fill(flowName)
  await page.getByRole('button', { name: '创建', exact: true }).click()
  await page.waitForURL(/workflows\/[^/]+$/)
  const workflowId = page.url().split('/').pop()
  await page.getByText('出参').first().waitFor()
  await page.getByText('出参').first().click()
  await page.getByTestId('test-trigger-button').click()
  await page.getByRole('button', { name: '生成示例数据' }).click()
  await page.getByRole('dialog').getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'POST' }).click()
  await page.getByRole('dialog').getByText('正文内容').click()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.insertText(JSON.stringify(payload))
  await page.getByRole('dialog').getByRole('button', { name: '发送' }).click()
  await page.getByText('测试成功').waitFor({ timeout: 300000 })
  return { workflowId }
}

async function addMapperStep() {
  await page.mouse.click(605, 346)
  await page.getByText('数据映射', { exact: true }).click()
  await page.getByText('字段映射', { exact: true }).first().click()
  await page.getByText('2. 字段映射').first().waitFor()
  await page.getByRole('tab', { name: '入参' }).or(page.getByText('入参', { exact: true })).first().click()
  await page.getByText('已映射 0 个字段').waitFor()
}

function ref(...path) {
  return `{{trigger['output']['body']${path.map((part) => `['${part}']`).join('')}}}`
}

function card(name) {
  return page.getByTestId(`mapping-row-${name}`)
}

function issuesIn(name) {
  return card(name).getByTestId('mapping-issue')
}

function previewIn(name) {
  return card(name).getByTestId('mapping-row-preview')
}

async function addFreeRow(name) {
  await page.getByRole('button', { name: '添加字段' }).first().click()
  await page.getByTestId('mapping-row-').getByLabel('目标字段').fill(name)
  await card(name).waitFor()
}

async function typeSource(name, text) {
  const editor = card(name).locator('.tiptap').first()
  await editor.click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  if (text.length > 0) {
    await page.keyboard.insertText(text)
  }
  await page.waitForTimeout(900)
}

async function addTransform(name, label) {
  await card(name).getByRole('button', { name: '转换', exact: true }).click()
  await page.getByRole('menuitem', { name: label, exact: true }).click()
}

async function expectText(locator, pattern, label) {
  await locator.first().waitFor({ timeout: 20000 }).catch(() => {})
  const texts = await locator.allInnerTexts()
  assert(texts.some((text) => pattern.test(text)), `${label}：没有出现 ${pattern}，实际是 ${JSON.stringify(texts)}`)
  return texts
}

async function freeFormDate() {
  await addFreeRow('startDate')
  await typeSource('startDate', ref('recordInfo', 'startDate'))
  await addTransform('startDate', '日期格式')
  await expectText(previewIn('startDate'), /2026-10-08/, '正确格式的预览')
  const pattern = card('startDate').getByPlaceholder('YYYY-MM-DD')
  await pattern.fill('yyyy-MM-dd')
  await expectText(issuesIn('startDate'), /日期格式 yyyy-MM-dd 无法识别/, '写成小写的日期格式')
  assert((await previewIn('startDate').getAttribute('data-status')) === 'error', '日期格式错时预览应为错误状态')
  await shot('03a-date-pattern-error')
  await pattern.fill('YYYY年MM月DD日')
  await expectText(previewIn('startDate'), /2026年10月08日/, '中文日期格式的预览')
  await typeSource('startDate', '2026-13-45')
  await expectText(issuesIn('startDate'), /2026-13-45 不是有效的日期/, '不存在的日期')
  await shot('03b-date-invalid')
  await card('startDate').getByRole('button', { name: '删除' }).first().click()
  await card('startDate').waitFor({ state: 'detached' })
  return 'ok'
}

async function freeFormArray() {
  await addFreeRow('positions')
  await typeSource('positions', ref('positions'))
  await card('positions').getByRole('button', { name: '逐项映射列表' }).click()
  await card('positions').getByPlaceholder('目标字段').last().fill('title')
  await card('positions').getByPlaceholder('当前项的字段，例如 code').fill('title')
  await expectText(issuesIn('positions'), /第 2 项缺少 title/, '列表第 2 项缺字段')
  await shot('03c-array-item-missing')
  await card('positions').getByRole('button', { name: '添加字段' }).click()
  await card('positions').getByPlaceholder('目标字段').last().fill('deptCode')
  await card('positions').getByPlaceholder('当前项的字段，例如 code').last().fill('deptCode')
  await card('positions').getByRole('button', { name: '逐项映射列表' }).click()
  await card('positions').getByRole('button', { name: '删除' }).first().click()
  await card('positions').waitFor({ state: 'detached' })
  return 'ok'
}

async function addFeishuStep() {
  const wf = await api('GET', `/workflows/${state.workflowId}?projectId=${session.projectId}`)
  const connection = await api('POST', '/connections', { externalId: 's2-feishu', displayName: '飞书', connectorName: '@fema-ipaas/connector-feishu', projectId: session.projectId, type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props: { domain: 'https://open.feishu.cn', appId: 'cli_mock', appSecret: 'mock-secret' } } })
  assert(connection, '飞书连接没有建成')
  const out = (field) => `{{step_1['output']['${field}']}}`
  await api('POST', `/workflows/${state.workflowId}?projectId=${session.projectId}`, {
    type: 'ADD_ACTION',
    request: {
      parentStep: 'step_1',
      action: {
        name: 'step_2', type: 'CONNECTOR', valid: true, displayName: '开通员工账号',
        settings: {
          connectorName: '@fema-ipaas/connector-feishu', connectorVersion: '~0.4.0', actionName: 'provision_user', propertySettings: {}, errorHandlingOptions: {},
          input: { auth: "{{connections['s2-feishu']}}", name: out('name'), mobile: out('mobile'), departmentId: out('departmentId'), employeeType: out('employeeType'), email: out('email'), employeeNo: out('employeeNo') },
        },
      },
    },
  })
  assert(wf.id === state.workflowId, '工作流不对')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('2. 字段映射').first().click()
  await page.getByText('入参', { exact: true }).first().click()
  await page.getByText('映射到').first().waitFor()
  return 'ok'
}

async function pickTarget() {
  await page.getByLabel('映射到').click()
  await page.getByRole('option', { name: /飞书 · .*开通/ }).click()
  await card('name').waitFor()
  for (const field of ['name', 'mobile', 'departmentId', 'employeeType']) {
    const text = await card(field).innerText()
    assert(text.includes('*'), `${field} 应带必填标记`)
    assert(await issuesIn(field).count() === 1, `${field} 应有一条必填未映射提示`)
    await expectText(issuesIn(field), /还没有映射来源/, `${field} 必填未映射`)
  }
  assert((await card('employeeType').innerText()).includes('数字'), '员工类型应标注为数字类型')
  const summary = await page.getByTestId('mapping-summary').innerText()
  assert(/已映射 0\/7 个字段 · 4 个问题/.test(summary), `摘要不对：${summary}`)
  return summary
}

async function insertViaSelector(name, path) {
  await card(name).locator('.tiptap').first().click()
  await page.getByText('数据选择器').first().waitFor()
  const selector = page.locator('div').filter({ has: page.getByText('数据选择器', { exact: true }) }).last()
  for (const segment of path.slice(0, -1)) {
    await selector.getByText(segment, { exact: true }).first().click()
  }
  const leaf = selector.getByText(path[path.length - 1], { exact: true }).first()
  await leaf.hover()
  await leaf.locator('xpath=ancestor::div[.//text()[normalize-space()="插入"]][1]').getByText('插入').first().click()
  await page.waitForTimeout(900)
}

async function aiSuggest() {
  await page.getByRole('button', { name: 'AI 自动映射' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('依据').first().waitFor()
  const text = await dialog.innerText()
  assert(!/\d+\s*%/.test(text), `AI 建议不应显示置信度：${text.slice(0, 200)}`)
  const boxes = dialog.getByRole('checkbox')
  const total = await boxes.count()
  for (let index = 0; index < total; index += 1) {
    assert((await boxes.nth(index).getAttribute('aria-checked')) !== 'true', '建议默认不应勾选')
  }
  assert(/没有模型连接|规则/.test(text), '没配模型时应说明只用规则')
  await shot('04a-ai-dialog')
  assert((await page.getByTestId('mapping-summary').innerText()).includes('0/7'), '确认前不应有任何映射生效')
  for (const field of ['name', 'mobile', 'email', 'employeeNo', 'employeeType']) {
    await dialog.getByLabel(field, { exact: true }).click()
  }
  await dialog.getByRole('button', { name: '应用 5 条' }).click()
  await dialog.waitFor({ state: 'detached' })
  const summary = await page.getByTestId('mapping-summary').innerText()
  assert(/已映射 5\/7 个字段 · 1 个问题/.test(summary), `应用后摘要不对：${summary}`)
  await expectText(previewIn('email'), /Zhangsan@Example\.com/, '邮箱预览')
  await expectText(previewIn('employeeType'), /^\s*1\s*$/, '员工类型预览')
  return summary
}

async function manualFill() {
  await insertViaSelector('departmentId', ['body', 'recordInfo', 'oIdDepartment'])
  await expectText(issuesIn('departmentId'), /类型不符：需要文本，实际是数字（20301）.*转文本/, '数字给文本字段')
  await addTransform('departmentId', '转文本')
  assert(await issuesIn('departmentId').count() === 0, '加转文本后类型问题应消失')
  await addTransform('departmentId', '查映射表')
  await card('departmentId').getByRole('combobox').last().click()
  await page.getByRole('option', { name: tableName }).click()
  await expectText(previewIn('departmentId'), /od-rd/, '查映射表后的预览')
  await expectText(card('departmentId'), /2 条对照，找不到时：报错/, '映射表说明')
  await card('employeeType').getByRole('button', { name: '删除' }).first().click()
  await expectText(issuesIn('employeeType'), /类型不符：需要数字，实际是文本.*转数字/, '文本给数字字段')
  await shot('06a-type-mismatch')
  await addTransform('employeeType', '转数字')
  assert(await issuesIn('employeeType').count() === 0, '加转数字后类型问题应消失')
  await addTransform('name', '去除首尾空格')
  await addTransform('email', '转小写')
  const summary = await page.getByTestId('mapping-summary').innerText()
  assert(/已映射 6\/7 个字段 · 0 个问题/.test(summary), `补全后摘要不对：${summary}`)
  await page.getByText('预览结果', { exact: true }).click()
  const json = JSON.parse(await page.getByTestId('mapping-result-json').innerText())
  assert(JSON.stringify(json) === JSON.stringify({ name: '张三', mobile: '13800000001', departmentId: 'od-rd', employeeType: 1, email: 'zhangsan@example.com', employeeNo: 'E1001' }), `预览结果不对：${JSON.stringify(json)}`)
  return json
}

async function lookupMissAtDesign() {
  const table = await api('GET', `/mapping-tables/${state.tableId}?projectId=${session.projectId}`)
  const body = { projectId: session.projectId, name: table.name, description: table.description, keyLabel: table.keyLabel, valueLabel: table.valueLabel, missingBehavior: table.missingBehavior, defaultValue: table.defaultValue }
  await api('POST', `/mapping-tables/${state.tableId}`, { ...body, rows: table.rows.filter((row) => row.k !== '20301') })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('2. 字段映射').first().click()
  await page.getByText('入参', { exact: true }).first().click()
  await expectText(issuesIn('departmentId'), new RegExp(`20301 不在映射表 ${tableName} 里，请先在映射表中补上这个值`), '映射表缺值')
  await shot('08-lookup-miss')
  assert((await page.getByTestId('mapping-summary').innerText()).includes('1 个问题'), '摘要应计入映射表缺值')
  await api('POST', `/mapping-tables/${state.tableId}`, { ...body, rows: table.rows })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('2. 字段映射').first().click()
  await page.getByText('入参', { exact: true }).first().click()
  await expectText(previewIn('departmentId'), /od-rd/, '补回对照后恢复')
  return 'ok'
}

async function openMapper() {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('2. 字段映射').first().click()
  await page.getByText('入参', { exact: true }).first().click()
  await page.getByText('映射到').first().waitFor()
}

async function debugStep() {
  await page.getByText('出参', { exact: true }).first().click()
  await page.getByRole('button', { name: /测试步骤/ }).first().click()
  await page.getByText('测试成功').waitFor({ timeout: 300000 })
  await page.getByText('原始 JSON').click().catch(() => {})
  const text = await page.locator('body').innerText()
  assert(text.includes('od-rd') && text.includes('张三') && text.includes('E1001'), '调试输出里应有映射后的部门编码、姓名和工号')
  assert(!text.includes('Zhangsan@Example.com'), '邮箱应已转成小写')
  return 'ok'
}

async function publishFlow() {
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const confirm = page.getByRole('dialog').getByRole('button', { name: /发布|确认/ }).last()
  await confirm.waitFor({ timeout: 8000 }).then(() => confirm.click()).catch(() => {})
  await page.waitForTimeout(6000)
  await shot('09-after-publish')
}

async function runWebhook(body) {
  const response = await fetch(`${API_URL}/api/v1/webhooks/${state.workflowId}/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return response.status
}

function personWith(overrides) {
  return {
    employeeInfo: { name: ' 李四 ', mobilePhone: '13800000002', workEmail: 'Lisi@Example.com', employeeType: '1', ...overrides.employeeInfo },
    recordInfo: { jobNumber: 'E1002', oIdDepartment: 20301, ...overrides.recordInfo },
  }
}

async function latestRun() {
  const runs = await api('GET', `/run-logs?projectId=${session.projectId}&limit=1&type=ALL&workflowId=${state.workflowId}`)
  return runs.data[0]
}

async function waitRun(predicate) {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const run = await latestRun()
    if (run && predicate(run)) {
      return run
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error('等运行结果超时')
}

function failureMessage(run) {
  const raw = run.failedStep?.message ?? ''
  try {
    return JSON.parse(raw).message ?? raw
  }
  catch {
    return raw
  }
}

async function publishAndRun() {
  await publishFlow()
  const wf = await api('GET', `/workflows/${state.workflowId}?projectId=${session.projectId}`)
  assert(wf.status === 'ENABLED' && wf.publishedVersionId, `发布后状态不对：${wf.status}`)
  await runWebhook(payload)
  const state1 = await mock('GET', '/__admin/state')
  const user = state1.feishuUsers.find((item) => item.mobile === '+8613800000001')
  assert(user, `飞书里没有创建用户，现有：${JSON.stringify(state1.feishuUsers)}`)
  assert(user.name === '张三' && user.department_ids[0] === 'od-rd' && user.employee_no === 'E1001' && user.email === 'zhangsan@example.com', `用户内容不对：${JSON.stringify(user)}`)
  return user
}

async function runtimeFailures() {
  const before = (await mock('GET', '/__admin/state')).feishuUsers.length
  await runWebhook(personWith({ recordInfo: { oIdDepartment: 20399 } }))
  const miss = await waitRun((run) => run.status === 'FAILED')
  const missText = failureMessage(miss)
  assert(missText.includes('20399') && missText.includes(tableName) && missText.includes('补上'), `新部门值的失败原因不可读：${missText}`)
  await runWebhook(personWith({ employeeInfo: { employeeType: 'abc' } }))
  const typeRun = await waitRun((run) => run.id !== miss.id && run.status === 'FAILED')
  const typeText = failureMessage(typeRun)
  assert(typeText.includes('「abc」不是数字') && typeText.includes('employeeType'), `员工类型的失败原因不可读：${typeText}`)
  await runWebhook(personWith({ employeeInfo: { mobilePhone: '' } }))
  const emptyRun = await waitRun((run) => run.id !== typeRun.id && run.status === 'FAILED')
  const emptyText = failureMessage(emptyRun)
  assert(emptyText.includes('必填字段') && emptyText.includes('为空'), `手机号为空的失败原因不可读：${emptyText}`)
  assert((await mock('GET', '/__admin/state')).feishuUsers.length === before, '失败的运行不应在飞书里建用户')
  const table = await api('GET', `/mapping-tables/${state.tableId}?projectId=${session.projectId}`)
  await api('POST', `/mapping-tables/${state.tableId}`, { projectId: session.projectId, name: table.name, description: table.description, keyLabel: table.keyLabel, valueLabel: table.valueLabel, missingBehavior: table.missingBehavior, defaultValue: table.defaultValue, rows: [...table.rows, { k: '20399', v: 'od-sales' }] })
  await runWebhook(personWith({ recordInfo: { oIdDepartment: 20399 } }))
  const after = (await mock('GET', '/__admin/state')).feishuUsers.find((item) => item.mobile === '+8613800000002')
  assert(after && after.department_ids[0] === 'od-sales', `补上映射表后重试应成功：${JSON.stringify(after)}`)
  return { missText, typeText, emptyText }
}

async function publishRefusedForBrokenMapping() {
  const created = await api('POST', '/workflows', { displayName: `缺映射的流程 ${RUN}`, projectId: session.projectId })
  const target = { connectorName: '@fema-ipaas/connector-feishu', actionName: 'provision_user', displayName: '飞书 · 开通员工账号', fields: [{ name: 'name', label: '姓名', type: 'STRING', required: true }, { name: 'mobile', label: '手机号', type: 'STRING', required: true }] }
  await api('POST', `/workflows/${created.id}?projectId=${session.projectId}`, {
    type: 'IMPORT_WORKFLOW',
    request: {
      displayName: `缺映射的流程 ${RUN}`, schemaVersion: null, notes: null,
      trigger: {
        name: 'trigger', type: 'CONNECTOR_TRIGGER', valid: true, displayName: 'Webhook',
        settings: { connectorName: '@fema-ipaas/connector-webhook', connectorVersion: '~0.1.42', triggerName: 'catch_webhook', input: { authType: 'none', authFields: {} }, propertySettings: {} },
        nextAction: { name: 'step_1', type: 'CONNECTOR', valid: true, displayName: '字段映射', settings: { connectorName: '@fema-ipaas/connector-data-mapper', connectorVersion: '0.4.0', actionName: 'map_fields', propertySettings: {}, errorHandlingOptions: {}, input: { mapping: { destination: target, fields: [{ id: 'a', target: 'name', source: '张三', transforms: [] }] }, failOnError: true } } },
      },
    },
  })
  let refusal = ''
  try {
    await api('POST', `/workflows/${created.id}?projectId=${session.projectId}`, { type: 'LOCK_AND_PUBLISH', request: {} })
  }
  catch (error) {
    refusal = error.message
  }
  assert(refusal.includes('手机号') && refusal.includes('还没有映射来源'), `发布应被拒绝并指出缺手机号：${refusal}`)
  await page.goto(`${WEB_URL}/projects/${session.projectId}/workflows/${created.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByText('2. 字段映射').first().click()
  await page.getByText('入参', { exact: true }).first().click()
  await expectText(page.getByTestId('mapping-issue'), /手机号 还没有映射来源|手机号.*还没有映射来源/, '编辑器里同样标出缺手机号')
  await shot('10-refused-flow')
  state.brokenWorkflowId = created.id
  return refusal.slice(0, 120)
}

async function narrowWindow() {
  await page.setViewportSize({ width: 800, height: 900 })
  await page.waitForTimeout(1500)
  await shot('11-narrow')
  const overflow = await page.evaluate(() => {
    const width = window.innerWidth
    return { page: document.documentElement.scrollWidth > width + 1, cards: [...document.querySelectorAll('[data-testid^="mapping-row-"]')].filter((node) => node.getBoundingClientRect().right > width + 1).length }
  })
  assert(!overflow.page && overflow.cards === 0, `窄屏下有横向溢出：${JSON.stringify(overflow)}`)
  await page.setViewportSize({ width: 1440, height: 900 })
  return overflow
}

async function darkMode() {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(1500)
  await shot('12-dark')
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const channels = background.match(/\d+/g)?.map(Number) ?? [255, 255, 255]
  assert(channels[0] + channels[1] + channels[2] < 300, `深色模式下背景仍是浅色：${background}`)
  await page.emulateMedia({ colorScheme: 'light' })
  return background
}

async function keyboardOrder() {
  await page.goto(`${WEB_URL}/projects/${session.projectId}/workflows/${state.brokenWorkflowId}`, { waitUntil: 'domcontentloaded' })
  await page.getByText('2. 字段映射').first().click()
  await page.getByText('入参', { exact: true }).first().click()
  await page.getByLabel('映射到').focus()
  const seen = []
  for (let index = 0; index < 14; index += 1) {
    await page.keyboard.press('Tab')
    seen.push(await page.evaluate(() => {
      const node = document.activeElement
      return node ? `${node.tagName}:${node.getAttribute('aria-label') ?? ''}:${node.className.toString().includes('tiptap') ? 'tiptap' : (node.textContent ?? '').trim().slice(0, 12)}` : 'none'
    }))
  }
  assert(seen.some((item) => item.includes('tiptap')), `Tab 没有到达来源输入：${JSON.stringify(seen)}`)
  assert(seen.some((item) => item.includes('转换')), `Tab 没有到达转换按钮：${JSON.stringify(seen)}`)
  return seen
}

async function uiLogin() {
  await page.goto(`${WEB_URL}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 180000 })
  await page.getByLabel(/邮箱|Email/).first().fill(EMAIL)
  await page.locator('input[type=password]').fill(PASSWORD)
  await page.getByRole('button', { name: /登录|Sign in/ }).click()
  await page.getByText('新建工作流').first().waitFor({ timeout: 180000 })
}

async function goto(path) {
  await page.goto(`${WEB_URL}/projects/${session.projectId}${path}`, { waitUntil: 'domcontentloaded' })
}

async function shot(name) {
  await page.screenshot({ path: `${SHOTS}/s2-${name}.png` })
}

async function check(label, fn) {
  const startedAt = Date.now()
  try {
    const detail = await fn()
    results.push({ label, ok: true })
    log(`PASS ${label} ${JSON.stringify(detail ?? '')} (${Math.round((Date.now() - startedAt) / 1000)}s)`)
    return detail
  }
  catch (error) {
    results.push({ label, ok: false })
    log(`FAIL ${label} ${error.message.split('\n')[0]}`)
    await page.screenshot({ path: `${SHOTS}/s2-fail-${results.length}.png` }).catch(() => {})
    return null
  }
}

function log(message) {
  process.stdout.write(`${message}\n`)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function summary() {
  const failed = results.filter((result) => !result.ok)
  log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exitCode = failed.length === 0 ? 0 : 1
}

async function signIn() {
  const response = await fetch(`${API_URL}/api/v1/authentication/sign-in`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const body = await response.json()
  return { token: body.token, projectId: body.projectId }
}

async function api(method, path, body) {
  const response = await fetch(`${API_URL}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` }, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  const parsed = text ? JSON.parse(text) : null
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 300)}`)
  }
  return parsed
}

async function mock(method, path, body) {
  const response = await fetch(`${MOCK_URL}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  return await response.json()
}
