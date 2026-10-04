import { chromium } from '@playwright/test'

const SLOT = Number(process.env.E2E_SLOT ?? 2)
const API_URL = process.env.S2_API_URL ?? `http://localhost:${3100 + SLOT}`
const WEB_URL = process.env.S2_WEB_URL ?? `http://localhost:${4200 + SLOT}`
const MOCK_URL = process.env.S2_MOCK_URL ?? `http://127.0.0.1:${18900 + SLOT}`
const SHOTS = process.env.S2_SHOTS ?? `/tmp/fema-e2e/slot-${SLOT}/shots`
const EMAIL = 'dev@ap.com'
const PASSWORD = '12345678'
const RUN = process.env.S2_RUN ?? Date.now().toString(36)
const results = []

const session = await signIn()
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()
page.setDefaultTimeout(90000)
page.on('pageerror', (error) => log(`pageerror ${error.message.slice(0, 160)}`))

await uiLogin()
const tableName = `北森部门到飞书部门 ${RUN}`
const flowName = `北森员工到飞书用户 ${RUN}`
const payload = {
  employeeInfo: { name: ' 张三 ', mobilePhone: '13800000001', workEmail: 'Zhangsan@Example.com', employeeType: '1' },
  recordInfo: { jobNumber: 'E1001', oIdDepartment: 20301, departmentName: '研发部', startDate: '2026/10/08', jobTitle: '后端工程师' },
  positions: [{ title: '后端工程师', deptCode: 20301, level: '3' }, { deptCode: 20302, level: '5' }],
}
const payload2 = {
  employeeInfo: { name: '王芳', mobilePhone: '13800000077', workEmail: 'Wangfang@Example.com', employeeType: '2' },
  recordInfo: { jobNumber: 'E2077', oIdDepartment: 20302, startDate: '2026/10/09' },
}
const state = { tableId: null, workflowId: null, flow2Id: null }
const until = process.env.S2_UNTIL ?? 'end'
const only = (process.env.S2_ONLY ?? '').split(',').filter((name) => name.length > 0)
if (process.env.S2_RUN) {
  await recoverState()
}

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
  ['target2', '映射面板里直接选连接器和操作：从输入属性生成目标字段行（类型、必填），流程里自动加上待确认的写入步骤', connectorTarget],
  ['map2', '给自动生成的目标字段补来源：类型不符先报错，加转换后清零', mapFlow2],
  ['run2', '待确认的写入步骤没确认前发布被拒；确认后发布，运行真的在飞书建出用户', confirmAndRunFlow2],
  ['wide', '宽编辑器：左目标、中转换、右来源，右侧 JSON 预览实时出结果和类型错误，内嵌数据选择器能插入', wideEditor],
  ['sidebar', '侧栏拖宽后：紧凑视图的映射行变成四列网格，来源输入框不被挤成窄条', widenSidebar],
  ['coverage', '映射表覆盖率：来自真实运行，缺口列出来一键加入，映射表页、编辑器、校验面板三处一致', coverageFlow],
  ['masked', '覆盖率只统计脱敏日志里看得见的键：手机号查表的运行不泄露手机号，也不进缺口列表', maskedKeys],
  ['solution', '官方方案：北森员工信息映射到飞书多维表格，预览、检查、安装、前端改映射、补缺口、真跑通', officialSolution],
  ['narrow', '窗口缩窄到 800 宽：映射卡片不横向溢出，底部工具栏不重叠，数据选择器避开正在编辑的节点', narrowWindow],
  ['dark', '深色模式：映射面板、宽编辑器、覆盖率页跟随系统主题', darkMode],
  ['keys', '键盘：Tab 顺序按目标字段逐行，没有多余的拖拽停靠点，Alt+Shift+R 选上游字段', keyboardOrder],
]
for (const [name, label, fn] of phases) {
  if (only.length > 0 && !only.includes(name)) {
    continue
  }
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
  await page.waitForTimeout(1500)
  await page.getByRole('dialog').getByLabel('名称').pressSequentially(tableName)
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

async function createFlowWithSample({ name = flowName, body = payload } = {}) {
  await page.goto(`${WEB_URL}/home`, { waitUntil: 'domcontentloaded' })
  await page.getByText('新建工作流').first().click()
  await page.getByText('Webhook 触发器').waitFor()
  await page.waitForTimeout(3000)
  await page.getByText('Webhook 触发器').click()
  await page.getByLabel('工作流名称').pressSequentially(name)
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
  await page.keyboard.insertText(JSON.stringify(body))
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

async function focusSource(name) {
  const editor = card(name).locator('.tiptap').first()
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const box = await editor.boundingBox()
    await editor.click({ position: { x: Math.max(box.width - 6, 2), y: box.height / 2 } })
    const focused = await editor.evaluate((node) => document.activeElement === node)
    if (focused) {
      return editor
    }
    await page.waitForTimeout(400)
  }
  throw new Error(`点了 ${name} 的来源输入框，焦点还是没进去`)
}

async function typeSource(name, text) {
  const editor = await focusSource(name)
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  if (text.length > 0) {
    await page.keyboard.insertText(text)
  }
  await page.waitForTimeout(900)
}

async function addTransform(name, label) {
  await card(name).click({ position: { x: 4, y: 4 } })
  await page.waitForTimeout(400)
  await card(name).getByRole('button', { name: '转换', exact: true }).click()
  await page.getByRole('menuitem', { name: label, exact: true }).click()
}

async function expectText(locator, pattern, label) {
  const deadline = Date.now() + 30000
  let texts = []
  while (Date.now() < deadline) {
    texts = await locator.allInnerTexts()
    if (texts.some((text) => pattern.test(text))) {
      return texts
    }
    await page.waitForTimeout(500)
  }
  throw new Error(`${label}：没有出现 ${pattern}，实际是 ${JSON.stringify(texts)}`)
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
  await waitSaved()
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
  await waitSaved()
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
  await page.getByText('上游节点').first().waitFor()
  for (const segment of path.slice(0, -1)) {
    await page.getByText(segment, { exact: true }).first().click()
  }
  const leaf = page.getByText(path[path.length - 1], { exact: true }).first()
  await leaf.hover()
  await leaf.locator('xpath=ancestor::div[contains(@class,"cursor") or contains(@class,"group")][1]').getByText('插入').click()
  await page.waitForTimeout(900)
}

async function aiSuggest() {
  await page.getByRole('button', { name: 'AI 自动映射' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByText('依据').first().waitFor()
  await dialog.getByText(/没有模型连接/).waitFor()
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
  const expected = { name: '张三', mobile: '13800000001', departmentId: 'od-rd', employeeType: 1, email: 'zhangsan@example.com', employeeNo: 'E1001' }
  assert(JSON.stringify(Object.entries(json).sort()) === JSON.stringify(Object.entries(expected).sort()), `预览结果不对：${JSON.stringify(json)}`)
  return json
}

async function lookupMissAtDesign() {
  const table = await api('GET', `/mapping-tables/${state.tableId}?projectId=${session.projectId}`)
  const body = { projectId: session.projectId, name: table.name, description: table.description, keyLabel: table.keyLabel, valueLabel: table.valueLabel, missingBehavior: table.missingBehavior, defaultValue: table.defaultValue }
  await waitSaved()
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

async function waitSaved() {
  await page.getByText('已自动保存').waitFor()
  await page.waitForFunction(() => !document.body.innerText.includes('保存中'))
  await page.waitForTimeout(2500)
}

async function openMapper() {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText('2. 字段映射').first().click()
  await page.getByText('入参', { exact: true }).first().click()
  await page.getByText('映射到').first().waitFor()
}

async function debugStep() {
  await waitSaved()
  await page.getByText('出参', { exact: true }).first().click()
  await page.getByRole('button', { name: /测试步骤/ }).first().click()
  await page.getByText('测试成功').waitFor({ timeout: 300000 })
  await page.getByText('原始 JSON').click().catch(() => {})
  const text = await page.locator('body').innerText()
  assert(text.includes('od-rd') && text.includes('张三') && text.includes('E1001'), '调试输出里应有映射后的部门编码、姓名和工号')
  assert(!text.includes('Zhangsan@Example.com'), '邮箱应已转成小写')
  return 'ok'
}

async function waitPublished(workflowId) {
  const deadline = Date.now() + 90000
  let wf = null
  while (Date.now() < deadline) {
    wf = await api('GET', `/workflows/${workflowId}?projectId=${session.projectId}`)
    if (wf.status === 'ENABLED' && wf.publishedVersionId) {
      return wf
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error(`等不到发布完成，状态是 ${wf?.status}`)
}

async function publishFlow() {
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const confirm = page.getByRole('dialog').getByRole('button', { name: /发布|确认/ }).last()
  await confirm.waitFor({ timeout: 8000 }).then(() => confirm.click()).catch(() => {})
  await page.waitForTimeout(6000)
  await shot('09-after-publish')
}

async function runWebhook(body, workflowId = state.workflowId) {
  const response = await fetch(`${API_URL}/api/v1/webhooks/${workflowId}/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
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
  await waitPublished(state.workflowId)
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
  const source = await api('GET', `/workflows/${state.workflowId}?projectId=${session.projectId}`)
  const created = await api('POST', '/workflows', { displayName: `缺映射的流程 ${RUN}`, projectId: session.projectId })
  const destination = { connectorName: '@fema-ipaas/connector-feishu', actionName: 'provision_user', displayName: '飞书 · 开通员工账号', fields: [{ name: 'name', label: '姓名', type: 'STRING', required: true }, { name: 'mobile', label: '手机号', type: 'STRING', required: true }] }
  const { nextAction: _unused, ...trigger } = source.version.trigger
  await api('POST', `/workflows/${created.id}?projectId=${session.projectId}`, {
    type: 'IMPORT_WORKFLOW',
    request: {
      displayName: `缺映射的流程 ${RUN}`, schemaVersion: source.version.schemaVersion, notes: [],
      trigger: {
        ...trigger,
        nextAction: { name: 'step_1', type: 'CONNECTOR', valid: true, skip: false, displayName: '字段映射', lastUpdatedDate: new Date().toISOString(), settings: { connectorName: '@fema-ipaas/connector-data-mapper', connectorVersion: '0.4.0', actionName: 'map_fields', propertySettings: {}, errorHandlingOptions: {}, input: { mapping: { destination, fields: [{ id: 'a', target: 'name', source: '张三', transforms: [] }] }, failOnError: true } } },
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
  state.brokenWorkflowId = created.id
  await page.goto(`${WEB_URL}/projects/${session.projectId}/workflows/${created.id}`, { waitUntil: 'domcontentloaded' })
  await page.getByText('2. 字段映射').first().click()
  await page.getByText('入参', { exact: true }).first().click()
  await expectText(page.getByTestId('mapping-issue'), /手机号 还没有映射来源/, '编辑器里同样标出缺手机号')
  await shot('10-refused-flow')
  return refusal.slice(0, 120)
}

async function recoverState() {
  const tables = await api('GET', `/mapping-tables?projectId=${session.projectId}`)
  state.tableId = tables.find((item) => item.name === tableName)?.id ?? null
  const flows = await api('GET', `/workflows?projectId=${session.projectId}&limit=100`)
  state.workflowId = flows.data.find((item) => item.version.displayName === flowName)?.id ?? null
  state.flow2Id = flows.data.find((item) => item.version.displayName === `${flowName} 自动建行`)?.id ?? null
  state.brokenWorkflowId = flows.data.find((item) => item.version.displayName === `缺映射的流程 ${RUN}`)?.id ?? null
}

async function ensureFeishuConnection() {
  const connections = await api('GET', `/app-connections?projectId=${session.projectId}&limit=100`).catch(() => null)
  const known = connections?.data?.some((item) => item.externalId === 's2-feishu')
  if (!known) {
    await api('POST', '/connections', { externalId: 's2-feishu', displayName: '飞书', connectorName: '@fema-ipaas/connector-feishu', projectId: session.projectId, type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props: { domain: 'https://open.feishu.cn', appId: 'cli_mock', appSecret: 'mock-secret' } } }).catch(() => null)
  }
}

async function openFlowMapper({ workflowId, stepLabel = '2. 字段映射' }) {
  await page.goto(`${WEB_URL}/projects/${session.projectId}/workflows/${workflowId}`, { waitUntil: 'domcontentloaded' })
  await page.getByText(stepLabel).first().click()
  await page.getByText('入参', { exact: true }).first().click()
  await page.getByText('映射到').first().waitFor()
  await page.waitForTimeout(1200)
}

async function connectorTarget() {
  await ensureFeishuConnection()
  const created = await createFlowWithSample({ name: `${flowName} 自动建行`, body: payload2 })
  state.flow2Id = created.workflowId
  await addMapperStep()
  await page.getByLabel('映射到').click()
  await page.getByRole('option', { name: '添加写入节点...' }).click()
  const dialog = page.getByTestId('mapping-write-step-dialog')
  await dialog.waitFor()
  await dialog.getByPlaceholder('搜索').fill('飞书')
  await expectText(dialog.getByTestId('mapping-write-connectors'), /飞书/, '搜索后列出飞书')
  await page.waitForFunction(() => !document.querySelector('[data-testid="mapping-write-connectors"]')?.textContent?.includes('加密'), null, { timeout: 15000 })
  await dialog.getByTestId('mapping-write-connector-@fema-ipaas/connector-feishu').click()
  await dialog.getByTestId('mapping-write-action-provision_user').waitFor()
  const actions = await dialog.getByTestId('mapping-write-actions').innerText()
  assert(actions.includes('开通员工账号') && !actions.includes('查找'), `只应列出写入类操作：${actions.slice(0, 200)}`)
  await shot('13-add-write-step')
  await dialog.getByTestId('mapping-write-action-provision_user').click()
  await card('name').waitFor()
  for (const field of ['name', 'mobile', 'departmentId', 'employeeType']) {
    assert((await card(field).innerText()).includes('*'), `${field} 应带必填标记`)
  }
  assert((await card('employeeType').innerText()).includes('数字'), '员工类型应标注为数字类型')
  const summary = await page.getByTestId('mapping-summary').innerText()
  assert(/已映射 0\/7 个字段 · 4 个问题/.test(summary), `摘要不对：${summary}`)
  await page.getByText('3. 开通员工账号').first().waitFor()
  await expectText(page.locator('body'), /待确认/, '新加的写入步骤带待确认标记')
  await waitSaved()
  const saved = await api('GET', `/workflows/${state.flow2Id}?projectId=${session.projectId}`)
  const mapper = saved.version.trigger.nextAction
  const writer = mapper.nextAction
  assert(mapper.settings.input.mapping.destination?.actionName === 'provision_user', `映射目标没有保存：${JSON.stringify(mapper.settings.input.mapping).slice(0, 200)}`)
  assert(writer?.settings.actionName === 'provision_user' && writer.settings.pendingReview === true, `写入步骤没有保存成待确认：${JSON.stringify(writer?.settings).slice(0, 200)}`)
  assert(writer.settings.input.name === `{{${mapper.name}['output']['name']}}` && writer.settings.input.auth === "{{connections['s2-feishu']}}", `写入步骤的入参没有接到映射输出：${JSON.stringify(writer.settings.input)}`)
  await shot('13b-target-created')
  return { summary, writer: writer.name }
}

async function mapFlow2() {
  await openFlowMapper({ workflowId: state.flow2Id })
  await typeSource('name', ref('employeeInfo', 'name'))
  await typeSource('mobile', ref('employeeInfo', 'mobilePhone'))
  await typeSource('departmentId', ref('recordInfo', 'oIdDepartment'))
  await expectText(issuesIn('departmentId'), /类型不符：需要文本，实际是数字/, '部门是数字时先报类型不符')
  await addTransform('departmentId', '转文本')
  await addTransform('departmentId', '查映射表')
  await card('departmentId').getByRole('combobox').last().click()
  await page.getByRole('option', { name: tableName }).click()
  await expectText(previewIn('departmentId'), /od-hr/, '部门查表后的预览')
  await typeSource('employeeType', ref('employeeInfo', 'employeeType'))
  await expectText(issuesIn('employeeType'), /类型不符：需要数字，实际是文本/, '员工类型是文本时先报类型不符')
  await addTransform('employeeType', '转数字')
  await page.waitForTimeout(800)
  assert(await issuesIn('employeeType').count() === 0, '加转数字后类型问题应消失')
  const summary = await page.getByTestId('mapping-summary').innerText()
  assert(/已映射 4\/7 个字段 · 0 个问题/.test(summary), `摘要不对：${summary}`)
  await waitSaved()
  await shot('14-flow2-mapped')
  return summary
}

async function confirmAndRunFlow2() {
  let refusal = ''
  try {
    await api('POST', `/workflows/${state.flow2Id}?projectId=${session.projectId}`, { type: 'LOCK_AND_PUBLISH', request: {} })
  }
  catch (error) {
    refusal = error.message
  }
  assert(refusal.includes('Confirm every') && refusal.includes('开通员工账号'), `没确认写入步骤就发布，应被拒绝并点名那一步：${refusal}`)
  await page.getByText('3. 开通员工账号').first().click()
  await page.getByRole('button', { name: '确认无误' }).click()
  await waitSaved()
  await publishFlow()
  await waitPublished(state.flow2Id)
  await runWebhook(payload2, state.flow2Id)
  const user = await pollUntil(async () => (await mock('GET', '/__admin/state')).feishuUsers.find((item) => item.mobile === '+8613800000077'), 90000)
  assert(user, '飞书里没有建出王芳')
  assert(user.name === '王芳' && user.department_ids[0] === 'od-hr', `用户内容不对：${JSON.stringify(user)}`)
  return { refusal: refusal.slice(0, 100), user: user.name }
}

async function insertViaEmbeddedSelector({ name, path }) {
  await focusSource(name)
  const selector = page.getByTestId('embedded-data-selector')
  await selector.getByText('上游节点').first().waitFor()
  for (const segment of path.slice(0, -1)) {
    await selector.getByText(segment, { exact: true }).first().click()
  }
  const leaf = selector.getByText(path[path.length - 1], { exact: true }).first()
  await leaf.hover()
  await leaf.locator('xpath=ancestor::div[contains(@class,"cursor") or contains(@class,"group")][1]').getByText('插入').click()
  await page.waitForTimeout(900)
}

async function jsonPreviewValue() {
  return await page.evaluate(() => {
    const entries = [...document.querySelectorAll('[data-testid="mapping-json-entry"] pre')].map((node) => node.textContent ?? '')
    return JSON.parse(`{${entries.join('\n')}}`)
  })
}

async function wideEditor() {
  await openFlowMapper({ workflowId: state.flow2Id })
  await page.getByTestId('mapping-expand').click()
  const dialog = page.getByTestId('mapping-wide-editor')
  await dialog.waitFor()
  await expectText(page.getByTestId('mapping-wide-columns'), /目标字段\s*转换\s*来源/, '三列标题')
  const x = async (locator) => (await locator.boundingBox()).x
  const row = dialog.getByTestId('mapping-row-name')
  const cells = row.locator(':scope > div')
  const [targetX, transformX, sourceX] = [await x(cells.nth(0)), await x(cells.nth(1)), await x(cells.nth(2))]
  assert(targetX < transformX && transformX < sourceX, `左目标、中转换、右来源的顺序不对：${[targetX, transformX, sourceX]}`)
  const box = await dialog.boundingBox()
  assert(box.width > 1100, `弹窗不够宽：${box.width}`)
  await expectText(dialog.getByTestId('mapping-json-entry'), /"name": "王芳"/, 'JSON 预览出结果')
  const expected = { name: '王芳', mobile: '13800000077', departmentId: 'od-hr', employeeType: 2 }
  const json = await jsonPreviewValue()
  assert(JSON.stringify(json) === JSON.stringify(expected), `JSON 预览不对：${JSON.stringify(json)}`)
  await shot('15-wide-light')
  await typeSource('employeeType', 'abc')
  await expectText(dialog.getByTestId('mapping-json-issue'), /abc 不是数字/, 'JSON 栏里列出类型错误')
  assert(await dialog.locator('[data-testid="mapping-json-entry"][data-status="error"]').count() === 1, '出错的字段在 JSON 栏里应标红')
  await shot('15b-wide-error')
  await waitSaved()
  await typeSource('employeeType', ref('employeeInfo', 'employeeType'))
  await expectText(dialog.getByTestId('mapping-json-issues'), /没有类型错误/, '改回去后类型错误消失')
  await waitSaved()
  await typeSource('name', '')
  await waitSaved()
  await insertViaEmbeddedSelector({ name: 'name', path: ['body', 'employeeInfo', 'name'] })
  await expectText(dialog.getByTestId('mapping-json-entry'), /"name": "王芳"/, '用内嵌数据选择器插入后预览恢复')
  const sources = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-testid^="mapping-row-"]')].filter((node) => node.querySelector('.tiptap')).map((node) => [node.getAttribute('data-testid'), node.querySelector('.tiptap').textContent ?? ''])))
  assert(sources['mapping-row-name'].includes('employeeInfo.name') && !sources['mapping-row-employeeType'].includes('employeeInfo.name'), `选择器的插入落错了输入框：${JSON.stringify(sources)}`)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  await expectText(page.getByTestId('mapping-summary'), /已映射 4\/7 个字段 · 0 个问题/, '关闭宽编辑器后侧栏仍同步')
  await waitSaved()
  return json
}

async function widenSidebar() {
  await openFlowMapper({ workflowId: state.flow2Id })
  const handle = page.locator('[role="separator"]').last()
  const box = await handle.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x - 520, box.y + 100, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(1200)
  const layout = await card('name').evaluate((node) => {
    const style = getComputedStyle(node)
    const children = [...node.children].slice(0, 4).map((child) => child.getBoundingClientRect())
    return { display: style.display, columns: style.gridTemplateColumns.split(' ').length, width: node.getBoundingClientRect().width, xs: children.map((rect) => Math.round(rect.x)), sourceWidth: children[1].width }
  })
  assert(layout.display === 'grid' && layout.columns === 4, `拖宽后映射行应是四列网格：${JSON.stringify(layout)}`)
  assert(layout.xs.every((value, index) => index === 0 || value > layout.xs[index - 1]), `四列应从左到右排开：${layout.xs}`)
  assert(layout.sourceWidth >= 240, `来源输入框被挤得太窄：${layout.sourceWidth}`)
  await shot('16-sidebar-wide')
  return layout
}

async function coverageSources() {
  const sources = await api('GET', `/mapping-tables/${state.tableId}/coverage`)
  return sources.find((item) => item.workflowId === state.workflowId)
}

async function coverageFlow() {
  const gapA = String(30000 + (Date.now() % 9000))
  const gapB = String(Number(gapA) + 1)
  await runWebhook(personWith({ recordInfo: { oIdDepartment: Number(gapA) } }))
  await runWebhook(personWith({ recordInfo: { oIdDepartment: Number(gapA) } }))
  await runWebhook(personWith({ recordInfo: { oIdDepartment: Number(gapB) } }))
  const source = await coverageSources()
  const missing = Object.fromEntries(source.uncovered.map((item) => [item.key, item.count]))
  assert(missing[gapA] === 2 && missing[gapB] === 1, `缺口不对：${JSON.stringify(source.uncovered)}`)
  const counted = source.uncovered.reduce((sum, item) => sum + item.count, 0)
  assert(source.total === source.hit + counted && source.hit > 0, `命中数对不上：${JSON.stringify({ total: source.total, hit: source.hit, counted })}`)
  assert(!JSON.stringify(source).includes('*'), '覆盖率结果里不应出现脱敏痕迹的键')

  await goto(`/mapping-tables?id=${state.tableId}`)
  await page.getByTestId('mapping-table-coverage').waitFor()
  const entry = page.getByTestId('mapping-coverage-entry').first()
  await expectText(entry.getByTestId('mapping-coverage-rate'), /命中率 \d+%/, '映射表页显示命中率')
  await expectText(page.getByTestId('mapping-coverage-uncovered'), new RegExp(gapA), '映射表页列出缺口')
  await page.getByTestId('mapping-table-coverage').scrollIntoViewIfNeeded()
  await shot('17-coverage-table')
  const row = page.getByTestId('mapping-coverage-uncovered').filter({ hasText: gapA })
  await row.getByRole('textbox').fill('od-new')
  await row.getByRole('button', { name: '加入映射表' }).click()
  await expectText(page.getByTestId('mapping-table-coverage'), new RegExp(`^(?![\\s\\S]*${gapA})[\\s\\S]*${gapB}`), '加入后 20500 不再是缺口、20501 仍是')
  const table = await api('GET', `/mapping-tables/${state.tableId}?projectId=${session.projectId}`)
  assert(table.rows.some((item) => item.k === gapA && item.v === 'od-new'), `映射表里没有新加的行：${JSON.stringify(table.rows)}`)

  await openFlowMapper({ workflowId: state.workflowId })
  const hint = page.getByTestId('mapping-coverage-hint').first()
  await expectText(hint, new RegExp(`最近 \\d+ 次运行：覆盖 \\d+%。[\\s\\S]*有 1 个值没有对照行：${gapB}`), '编辑器里的覆盖率提示')
  await shot('18-coverage-editor')
  await page.getByRole('button', { name: '校验' }).click()
  await expectText(page.locator('body'), new RegExp(`映射表「.*」里没有最近运行或样例里出现过的 1 个值（${gapB}）。运行到这些值时会失败`), '校验面板在设计期提示覆盖率不足')
  await shot('18b-coverage-validation')
  await page.getByTestId('mapping-coverage-open').first().click()
  const coverageDialog = page.getByTestId('mapping-coverage-dialog')
  await coverageDialog.waitFor()
  const dialogRow = coverageDialog.getByTestId('mapping-coverage-uncovered').filter({ hasText: gapB })
  await dialogRow.getByRole('textbox').fill('od-ops')
  await dialogRow.getByRole('button', { name: '加入映射表' }).click()
  await expectText(coverageDialog, /目前见到的值在映射表里都有对应行/, '补完后弹窗里没有缺口')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="mapping-coverage-hint"][data-uncovered="0"]').length > 0 || document.querySelectorAll('[data-testid="mapping-coverage-hint"]').length === 0, null, { timeout: 30000 })
  const lastRunId = (await latestRun())?.id
  await runWebhook(personWith({ recordInfo: { oIdDepartment: Number(gapB) } }))
  const replay = await waitRun((run) => run.id !== lastRunId && run.status === 'SUCCEEDED')
  assert(replay, '补上缺口后同样的数据应成功')
  return { missing, hit: source.hit, total: source.total }
}

async function maskedKeys() {
  const makeTable = (name, keyLabel, valueLabel, rows) => api('POST', '/mapping-tables', { projectId: session.projectId, name: `${name} ${RUN}`, description: '', keyLabel, valueLabel, missingBehavior: 'ERROR', defaultValue: null, rows })
  const byPhone = await makeTable('手机号到团队', '手机号', '团队', [{ k: '13800000001', v: 'team-a' }])
  const byJob = await makeTable('工号到工位', '工号', '工位', [{ k: 'E1001', v: 'seat-1' }])
  const source = await api('GET', `/workflows/${state.workflowId}?projectId=${session.projectId}`)
  const created = await api('POST', '/workflows', { displayName: `手机号查团队 ${RUN}`, projectId: session.projectId })
  const { nextAction: _unused, ...trigger } = source.version.trigger
  await api('POST', `/workflows/${created.id}?projectId=${session.projectId}`, {
    type: 'IMPORT_WORKFLOW',
    request: {
      displayName: `手机号查团队 ${RUN}`, schemaVersion: source.version.schemaVersion, notes: [],
      trigger: {
        ...trigger,
        nextAction: { name: 'step_1', type: 'CONNECTOR', valid: true, skip: false, displayName: '字段映射', lastUpdatedDate: new Date().toISOString(), settings: { connectorName: '@fema-ipaas/connector-data-mapper', connectorVersion: '0.4.0', actionName: 'map_fields', propertySettings: {}, errorHandlingOptions: {}, input: { mapping: { fields: [
          { id: 'team', target: 'team', source: ref('employeeInfo', 'mobilePhone'), transforms: [{ type: 'LOOKUP', arg: byPhone.id }] },
          { id: 'seat', target: 'seat', source: ref('recordInfo', 'jobNumber'), transforms: [{ type: 'LOOKUP', arg: byJob.id }] },
        ] }, failOnError: true } } },
      },
    },
  })
  await api('POST', `/workflows/${created.id}?projectId=${session.projectId}`, { type: 'LOCK_AND_PUBLISH', request: {} })
  const secret = '13800009999'
  await fetch(`${API_URL}/api/v1/webhooks/${created.id}/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeInfo: { mobilePhone: secret }, recordInfo: { jobNumber: 'E7001' } }) })
  await fetch(`${API_URL}/api/v1/webhooks/${created.id}/sync`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeInfo: { mobilePhone: '13800000001' }, recordInfo: { jobNumber: 'E7002' } }) })
  const response = await api('GET', `/mapping-tables/coverage?projectId=${session.projectId}&workflowId=${created.id}`)
  const text = JSON.stringify(response)
  assert(!text.includes(secret), '覆盖率接口把脱敏前的手机号泄露了')
  const phone = response.find((item) => item.tableId === byPhone.id)
  const job = response.find((item) => item.tableId === byJob.id)
  assert(phone && phone.maskedSkipped >= 1 && phone.uncovered.length === 0, `手机号被脱敏的键应只计入「已跳过」：${JSON.stringify(phone)}`)
  assert(job && job.uncovered.some((item) => item.key === 'E7001' || item.key === 'E7002'), `未脱敏的工号应列出缺口：${JSON.stringify(job)}`)
  await goto(`/mapping-tables?id=${byPhone.id}`)
  await expectText(page.getByTestId('mapping-coverage-masked'), /已脱敏，不计入统计/, '映射表页说明有脱敏键被跳过')
  assert(!(await page.locator('body').innerText()).includes(secret), '页面上不应出现手机号明文')
  await shot('19-coverage-masked')
  return { maskedSkipped: phone.maskedSkipped, jobMissing: job.uncovered.map((item) => item.key) }
}

async function officialSolution() {
  const beisenConn = { externalId: 'beisen-main', displayName: '北森', connectorName: '@fema-ipaas/connector-beisen', props: { appKey: 'mock-key', appSecret: 'mock-secret' } }
  const feishuConn = { externalId: 'feishu-main', displayName: '飞书（方案）', connectorName: '@fema-ipaas/connector-feishu', props: { domain: 'https://open.feishu.cn', appId: 'cli_mock', appSecret: 'mock-secret' } }
  for (const conn of [beisenConn, feishuConn]) {
    await api('POST', '/connections', { externalId: conn.externalId, displayName: conn.displayName, connectorName: conn.connectorName, projectId: session.projectId, type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props: conn.props } }).catch(() => null)
  }
  const id = 'official-beisen-bitable-roster'
  const connections = { '@fema-ipaas/connector-beisen': 'beisen-main', '@fema-ipaas/connector-feishu': 'feishu-main' }
  const config = { appToken: 'bascnRoster', tableId: 'tblRoster' }
  const listed = await api('GET', '/solutions')
  assert(listed.some((item) => item.id === id), '方案库里没有映射方案')
  const preview = await api('POST', `/solutions/${id}/preview`, { projectId: session.projectId, connections, config })
  assert(preview.workflows.length === 1 && preview.mappingTables.length === 1, `预览不对：${JSON.stringify(preview)}`)
  const checks = await api('POST', `/solutions/${id}/checks`, { projectId: session.projectId, connections })
  const blocking = checks.results.filter((item) => item.blocking && item.status !== 'PASS')
  assert(blocking.length === 0, `阻塞检查未通过：${JSON.stringify(blocking)}`)
  const manual = checks.results.filter((item) => item.kind === 'MANUAL').map((item) => item.key)
  const result = await api('POST', `/solutions/${id}/install`, { projectId: session.projectId, connections, config, acknowledgedChecks: manual })
  const workflowId = result.workflows[0].workflowId
  const tableId = result.mappingTables[0].tableId
  const installed = await api('GET', `/workflows/${workflowId}?projectId=${session.projectId}`)
  const mapper = installed.version.trigger.nextAction
  const writer = mapper.nextAction
  assert(writer.settings.input.appToken === 'bascnRoster' && writer.settings.input.tableId === 'tblRoster', `配置项没有写进写入步骤：${JSON.stringify(writer.settings.input)}`)
  assert(mapper.settings.input.mapping.fields.some((item) => item.target === '部门' && item.transforms.some((transform) => transform.arg === tableId)), '部门行没有接上安装出来的映射表')

  await openFlowMapper({ workflowId, stepLabel: '2. 整理成花名册一行' })
  await expectText(page.getByTestId('mapping-summary'), /已映射 6 个字段 · 0 个问题/, '方案里的映射在编辑器里过同一个校验')
  await shot('20-solution-mapper')
  const phoneRow = card('手机号')
  await phoneRow.getByLabel('目标字段').fill('联系电话')
  await expectText(page.getByTestId('mapping-summary'), /已映射 6 个字段 · 0 个问题/, '改列名后映射仍通过')
  await waitSaved()
  await publishFlow()
  await waitPublished(workflowId)

  await goto(`/mapping-tables?id=${tableId}`)
  await page.getByPlaceholder('新的键').fill('20301')
  await page.getByPlaceholder('新的值').fill('研发部')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByRole('button', { name: '保存修改' }).click()
  await page.getByRole('button', { name: '保存修改' }).waitFor({ state: 'visible' })
  const employee = ({ userId, jobNumber, name, mobile, department }) => ({
    employeeInfo: { userID: userId, name, mobilePhone: mobile, workEmail: `${jobNumber.toLowerCase()}@Example.com`, objectId: `00000000-0000-0000-0000-${String(userId).padStart(12, '0')}` },
    recordInfo: { userID: userId, jobNumber, oIdDepartment: department, employeeStatus: '2', changeTypeOID: '1', approvalStatus: 4, startDate: '2026-10-08T00:00:00', lastWorkDate: null },
  })
  await mock('POST', '/__admin/employees', { records: [employee({ userId: 3001, jobNumber: 'E3001', name: '李雷', mobile: '13800003001', department: 20301 }), employee({ userId: 3002, jobNumber: 'E3002', name: '韩梅梅', mobile: '13800003002', department: 20302 })] })
  const recordOf = async (jobNumber) => (await mock('GET', '/__admin/state')).bitableRecords.find((item) => item.fields['工号'] === jobNumber)
  const first = await pollUntil(async () => recordOf('E3001'), 180000)
  assert(first, '北森的新员工没有被写进多维表格')
  assert(first.appToken === 'bascnRoster' && first.tableId === 'tblRoster', `写到了别的表：${first.appToken}/${first.tableId}`)
  const fields = first.fields
  assert(fields['姓名'] === '李雷' && fields['联系电话'] === '13800003001' && fields['邮箱'] === 'e3001@example.com' && fields['部门'] === '研发部' && fields['入职日期'] === '2026-10-08' && !('手机号' in fields), `写入的列不对：${JSON.stringify(fields)}`)
  const failed = await pollUntil(async () => {
    const runs = await api('GET', `/run-logs?projectId=${session.projectId}&limit=20&type=ALL&workflowId=${workflowId}`)
    return runs.data.find((run) => run.status === 'FAILED')
  }, 120000)
  assert(failed, '部门不在映射表里的员工应该失败')
  const reason = failureMessage(failed)
  assert(reason.includes('20302') && reason.includes('补上'), `失败原因不可读：${reason}`)
  assert(!(await recordOf('E3002')), '失败的运行不应写入多维表格')
  await goto(`/mapping-tables?id=${tableId}`)
  const gap = page.getByTestId('mapping-coverage-uncovered').filter({ hasText: '20302' })
  await gap.waitFor()
  await shot('21-solution-gap')
  await gap.getByRole('textbox').fill('人力资源部')
  await gap.getByRole('button', { name: '加入映射表' }).click()
  await page.getByTestId('mapping-coverage-uncovered').filter({ hasText: '20302' }).waitFor({ state: 'detached' })
  const retry = await api('POST', `/executions/${failed.id}/retry`, { strategy: 'ON_LATEST_VERSION', projectId: session.projectId })
  assert(retry, '重试没有返回运行')
  const second = await pollUntil(async () => recordOf('E3002'), 120000)
  assert(second && second.fields['部门'] === '人力资源部', `补上缺口后重试应写入：${JSON.stringify(second)}`)
  return { record: fields, retried: second.fields['部门'] }
}

async function pollUntil(probe, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value) {
      return value
    }
    await new Promise((resolve) => setTimeout(resolve, 4000))
  }
  return null
}

async function narrowWindow() {
  await openFlowMapper({ workflowId: state.flow2Id })
  await page.setViewportSize({ width: 800, height: 900 })
  await page.waitForTimeout(1800)
  await shot('11-narrow')
  const overflow = await page.evaluate(() => {
    const width = window.innerWidth
    return { page: document.documentElement.scrollWidth > width + 1, cards: [...document.querySelectorAll('[data-testid^="mapping-row-"]')].filter((node) => node.getBoundingClientRect().right > width + 1).length }
  })
  assert(!overflow.page && overflow.cards === 0, `窄屏下有横向溢出：${JSON.stringify(overflow)}`)
  const overlap = await page.evaluate(() => {
    const bar = document.querySelector('#canvas-controls')
    const parts = [...bar.children].map((child) => child.getBoundingClientRect()).filter((rect) => rect.width > 0)
    const barRect = bar.getBoundingClientRect()
    const clipped = parts.filter((rect) => rect.left < barRect.left - 1 || rect.right > barRect.right + 1).length
    const crossed = parts.some((rect, index) => parts.some((other, otherIndex) => otherIndex > index && rect.left < other.right - 1 && other.left < rect.right - 1))
    return { clipped, crossed, parts: parts.length }
  })
  assert(overlap.clipped === 0 && !overlap.crossed, `底部画布工具栏重叠或被裁掉：${JSON.stringify(overlap)}`)
  await page.getByTestId('canvas-controls-more').click()
  await page.getByRole('menuitem', { name: '全屏' }).waitFor()
  await page.getByRole('menuitem', { name: '下载为图片' }).waitFor()
  await page.getByTestId('canvas-controls-more').click({ force: true })
  await page.getByRole('menuitem', { name: '全屏' }).waitFor({ state: 'detached' })
  await card('name').locator('.tiptap').first().click()
  await page.getByTestId('data-selector').waitFor()
  await page.waitForTimeout(1200)
  const geometry = await page.evaluate(() => {
    const selector = document.querySelector('[data-testid="data-selector"]').getBoundingClientRect()
    const node = document.querySelector('[data-step-context-menu="step_1"]').getBoundingClientRect()
    const bar = document.querySelector('#canvas-controls').getBoundingClientRect()
    const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    return { overNode: intersects(selector, node), overToolbar: intersects(selector, bar), selector: [selector.left, selector.top, selector.right, selector.bottom].map(Math.round), node: [node.left, node.top, node.right, node.bottom].map(Math.round) }
  })
  assert(!geometry.overNode && !geometry.overToolbar, `数据选择器遮住了正在编辑的节点或工具栏：${JSON.stringify(geometry)}`)
  await shot('11b-narrow-selector')
  await page.setViewportSize({ width: 780, height: 700 })
  await page.waitForTimeout(1500)
  const small = await page.evaluate(() => {
    const selector = document.querySelector('[data-testid="data-selector"]').getBoundingClientRect()
    const nodeElement = document.querySelector('[data-step-context-menu="step_1"]')
    const node = nodeElement ? nodeElement.getBoundingClientRect() : null
    const overNode = node !== null && selector.left < node.right && selector.right > node.left && selector.top < node.bottom && selector.bottom > node.top
    return { overNode, nodeRendered: node !== null, pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 }
  })
  assert(!small.overNode && !small.pageOverflow, `更窄的窗口里选择器仍遮住节点：${JSON.stringify(small)}`)
  await shot('11c-narrower')
  await page.setViewportSize({ width: 1440, height: 900 })
  return { overflow, overlap, geometry }
}

async function darkMode() {
  await page.evaluate(() => localStorage.setItem('fema.theme', 'dark'))
  await openFlowMapper({ workflowId: state.flow2Id })
  await page.getByTestId('mapping-summary').waitFor()
  await page.waitForTimeout(1500)
  await shot('12-dark')
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  const background = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid^="mapping-row-"]') ?? document.body).backgroundColor)
  const text = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="mapping-summary"]')).color)
  assert(dark, '切到深色后根节点没有 dark 类')
  await page.getByTestId('mapping-expand').click()
  await page.getByTestId('mapping-wide-editor').waitFor()
  await page.waitForTimeout(2000)
  await shot('12b-dark-wide')
  const wideBackground = await page.getByTestId('mapping-wide-editor').evaluate((node) => getComputedStyle(node).backgroundColor)
  assert(wideBackground !== 'rgb(255, 255, 255)', `宽编辑器在深色下还是白底：${wideBackground}`)
  await page.keyboard.press('Escape')
  await goto(`/mapping-tables?id=${state.tableId}`)
  await page.getByTestId('mapping-table-coverage').waitFor()
  await page.getByTestId('mapping-table-coverage').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500)
  await shot('12c-dark-coverage')
  await page.evaluate(() => localStorage.setItem('fema.theme', 'light'))
  return { background, text, wideBackground }
}

async function keyboardOrder() {
  await openFlowMapper({ workflowId: state.flow2Id })
  await page.getByLabel('映射到').focus()
  const seen = []
  for (let index = 0; index < 24; index += 1) {
    await page.keyboard.press('Tab')
    seen.push(await page.evaluate(() => {
      const node = document.activeElement
      return node ? `${node.tagName}:${node.getAttribute('aria-label') ?? ''}:${node.className.toString().includes('tiptap') ? 'tiptap' : (node.textContent ?? '').trim().slice(0, 12)}` : 'none'
    }))
  }
  assert(seen.some((item) => item.includes('tiptap')), `Tab 没有到达来源输入：${JSON.stringify(seen)}`)
  assert(seen.some((item) => item.includes('转换')), `Tab 没有到达转换按钮：${JSON.stringify(seen)}`)
  assert(!seen.some((item) => item.includes('拖到上游节点')), `Tab 不应停在拖拽圆点上：${JSON.stringify(seen)}`)
  const stops = seen.filter((item) => item.includes('tiptap') || item.includes('转换'))
  const firstRowOrder = stops.slice(0, 4).map((item) => (item.includes('tiptap') ? '来源' : '转换'))
  assert(firstRowOrder.join('>') === '来源>转换>来源>转换', `Tab 应按目标字段逐行走（来源、转换、下一行来源、转换）：${firstRowOrder}`)
  const dots = await page.locator('button[aria-label^="拖到上游节点"]').evaluateAll((nodes) => nodes.map((node) => node.tabIndex))
  assert(dots.length > 0 && dots.every((value) => value === -1), `拖拽圆点的 tabindex 应都是 -1：${dots}`)
  await card('name').locator('.tiptap').first().click()
  await page.keyboard.press('Meta+a')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Alt+Shift+KeyR')
  const steps = page.getByTestId('reference-steps')
  await steps.waitFor()
  await shot('22-reference-by-keyboard')
  await steps.getByRole('button', { name: /^1\. 捕获 Webhook/ }).click()
  await page.getByText('Whole output').or(page.getByText('整个出参')).first().waitFor()
  await page.getByRole('dialog').getByText('body.employeeInfo.name', { exact: true }).first().click()
  await page.waitForTimeout(1000)
  const text = await card('name').locator('.tiptap').first().innerText()
  assert(text.includes('employeeInfo'), `快捷键选出的引用没有插进输入框：${text}`)
  return { seen: seen.slice(0, 8), dots: dots.length }
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
    log(`FAIL ${label} ${error.message.split('\n').slice(0, 4).join(' | ')}`)
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
