const API = process.env.E2E_API_URL ?? 'http://localhost:18090/api/v1'
const MOCK = process.env.E2E_MOCK_URL ?? 'http://127.0.0.1:18900'
const EMAIL = process.env.E2E_EMAIL ?? 'mainline@example.com'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Passw0rd!Passw0rd'
const FEISHU_APP_ID = process.env.E2E_FEISHU_APP_ID ?? 'cli_mock'
const FEISHU_APP_SECRET = process.env.E2E_FEISHU_APP_SECRET ?? 'mock-secret'
const HR_CHAT_ID = process.env.E2E_FEISHU_HR_CHAT_ID ?? 'oc_hr_notice'
const WAIT_MS = Number(process.env.E2E_WAIT_MS ?? 240000)
const WORKFLOW_NAME = '北森员工变动开通飞书账号'
const TRIGGER_ENABLE_GRACE_MS = 20000

const results = []
const session = await authenticate()

await check('创建北森连接（保存时校验凭据）', () => upsertConnection({
  externalId: 'beisen-main',
  displayName: '北森',
  connectorName: '@fema-ipaas/connector-beisen',
  props: { appKey: 'mock-key', appSecret: 'mock-secret' },
}))
await check('创建飞书连接（保存时校验凭据）', () => upsertConnection({
  externalId: 'feishu-main',
  displayName: '飞书',
  connectorName: '@fema-ipaas/connector-feishu',
  props: { domain: 'https://open.feishu.cn', appId: FEISHU_APP_ID, appSecret: FEISHU_APP_SECRET },
}))
const table = await check('创建映射表「北森部门 → 飞书部门」', () => api('POST', '/mapping-tables', {
  projectId: session.projectId,
  name: '北森部门到飞书部门',
  description: '',
  keyLabel: '北森部门',
  valueLabel: '飞书部门 ID',
  missingBehavior: 'ERROR',
  defaultValue: null,
  rows: [{ k: '研发部', v: 'od-rd' }, { k: '人力资源部', v: 'od-hr' }],
}))
const workflow = await check('搭建并发布主线工作流', () => buildWorkflow({ tableId: table.id }))
await new Promise((resolve) => setTimeout(resolve, TRIGGER_ENABLE_GRACE_MS))

await mock('POST', '/__admin/feishu-failure', {})
await mock('POST', '/__admin/employees', { records: [employee({ id: 'E1001', name: '张三', mobile: '13800000001', department: '研发部' })] })
await check('北森新员工 → 飞书开通账号并通知 HR 群', () => waitFor(async () => {
  const state = await mock('GET', '/__admin/state')
  const user = state.feishuUsers.find((item) => item.mobile === '+8613800000001')
  const notified = state.messages.some((message) => message.content.includes('张三'))
  return user && notified && user.department_ids[0] === 'od-rd' ? { user: user.open_id, department: user.department_ids[0] } : null
}))

await mock('POST', '/__admin/feishu-failure', { code: 99991672, msg: 'Access denied. One of the following scopes is required: [contact:contact]' })
await mock('POST', '/__admin/employees', { records: [employee({ id: 'E1002', name: '李四', mobile: '13800000002', department: '人力资源部' })] })
const issue = await check('飞书缺权限 → 问题中心出现可读的问题', () => waitFor(async () => {
  const overview = await api('GET', '/issues/overview')
  const found = overview.latest.find((item) => item.workflowDisplayName === WORKFLOW_NAME)
  return found ? { id: found.id, title: found.title, errorCode: found.errorCode } : null
}))
if (issue) {
  assert(!issue.title.includes('{"'), `问题标题仍是原始 JSON：${issue.title}`)
  assert(issue.errorCode === 'HTTP_403', `缺权限应识别为 HTTP_403，实际是 ${issue.errorCode}`)
}

await mock('POST', '/__admin/feishu-failure', {})
await check('修复后从失败节点重放 → 李四开通成功', async () => {
  const replay = await api('POST', `/issues/${issue.id}/replay`, { strategy: 'FROM_FAILED_STEP' })
  assert(replay.queued > 0, `重放没有排上任何运行：${JSON.stringify(replay)}`)
  return waitFor(async () => {
    const state = await mock('GET', '/__admin/state')
    const user = state.feishuUsers.find((item) => item.mobile === '+8613800000002')
    return user ? { user: user.open_id, department: user.department_ids[0] } : null
  })
})

await mock('POST', '/__admin/employees', { records: [employee({ id: 'E1001', name: '张三', mobile: '13800000001', department: '研发部' })] })
await check('同一员工再次变动 → 不重复开通', () => waitFor(async () => {
  const state = await mock('GET', '/__admin/state')
  const notices = state.messages.filter((message) => message.content.includes('张三')).length
  if (notices < 2) {
    return null
  }
  const accounts = state.feishuUsers.filter((item) => item.mobile === '+8613800000001').length
  assert(accounts === 1, `张三被开通了 ${accounts} 个账号`)
  return { accounts, notices }
}))

printSummary()

async function authenticate() {
  const signIn = await fetchJson('POST', `${API}/authentication/sign-in`, { email: EMAIL, password: PASSWORD })
  if (signIn.ok && signIn.body.projectId) {
    return { token: signIn.body.token, projectId: signIn.body.projectId }
  }
  const signUp = await fetchJson('POST', `${API}/authentication/sign-up`, { email: EMAIL, password: PASSWORD, firstName: '集成', lastName: '工程师', trackEvents: false, newsLetter: false })
  if (!signUp.ok) {
    throw new Error(`sign-up failed: ${JSON.stringify(signUp.body)}`)
  }
  const completed = await fetchJson('POST', `${API}/authentication/complete-sign-up`, { fullName: '集成工程师' }, signUp.body.token)
  return { token: completed.body.token, projectId: completed.body.projectId }
}

async function upsertConnection({ externalId, displayName, connectorName, props }) {
  const connection = await api('POST', '/connections', {
    externalId,
    displayName,
    connectorName,
    projectId: session.projectId,
    type: 'CUSTOM_AUTH',
    value: { type: 'CUSTOM_AUTH', props },
  })
  return { id: connection.id, status: connection.status }
}

async function buildWorkflow({ tableId }) {
  const created = await api('POST', '/workflows', { displayName: WORKFLOW_NAME, projectId: session.projectId })
  const operate = (type, request) => api('POST', `/workflows/${created.id}`, { type, request })
  await operate('UPDATE_TRIGGER', {
    name: 'trigger',
    type: 'CONNECTOR_TRIGGER',
    valid: true,
    displayName: '北森员工变动',
    settings: {
      connectorName: '@fema-ipaas/connector-beisen',
      connectorVersion: '0.1.4',
      triggerName: 'employee_changed',
      input: { auth: "{{connections['beisen-main']}}", timezone: 'Asia/Shanghai', columns: [] },
      propertySettings: {},
    },
  })
  await operate('ADD_ACTION', { parentStep: 'trigger', action: connectorStep({
    name: 'step_1',
    displayName: '部门映射',
    connectorName: '@fema-ipaas/connector-data-mapper',
    connectorVersion: '0.4.0',
    actionName: 'map_fields',
    input: {
      mapping: { fields: [{ id: 'department', target: 'departmentId', source: "{{trigger['output']['DepartmentName']}}", transforms: [{ type: 'LOOKUP', arg: tableId }] }] },
      failOnError: true,
    },
  }) })
  await operate('ADD_ACTION', { parentStep: 'step_1', action: connectorStep({
    name: 'step_2',
    displayName: '开通飞书账号',
    connectorName: '@fema-ipaas/connector-feishu',
    connectorVersion: '0.2.0',
    actionName: 'provision_user',
    input: {
      auth: "{{connections['feishu-main']}}",
      name: "{{trigger['output']['Name']}}",
      mobile: "{{trigger['output']['MobilePhone']}}",
      departmentId: "{{step_1['output']['departmentId']}}",
      employeeType: 1,
      employeeNo: "{{trigger['output']['EmployeeNumber']}}",
    },
  }) })
  await operate('ADD_ACTION', { parentStep: 'step_2', action: connectorStep({
    name: 'step_3',
    displayName: '通知 HR 群',
    connectorName: '@fema-ipaas/connector-feishu',
    connectorVersion: '0.2.0',
    actionName: 'send_group_message',
    input: {
      auth: "{{connections['feishu-main']}}",
      chatId: HR_CHAT_ID,
      messageType: 'text',
      content: "{{trigger['output']['Name']}} 的飞书账号已就绪（{{step_2['output']['open_id']}}，新开通：{{step_2['output']['created']}}）",
    },
  }) })
  await operate('LOCK_AND_PUBLISH', {})
  return { id: created.id }
}

function connectorStep({ name, displayName, connectorName, connectorVersion, actionName, input }) {
  return {
    type: 'CONNECTOR',
    name,
    displayName,
    valid: true,
    settings: { connectorName, connectorVersion, actionName, input, propertySettings: {}, errorHandlingOptions: {} },
  }
}

function employee({ id, name, mobile, department }) {
  return { UserID: id, Name: name, MobilePhone: mobile, Email: `${id.toLowerCase()}@example.com`, EmployeeNumber: id, DepartmentName: department }
}

async function check(label, fn) {
  const startedAt = Date.now()
  try {
    const detail = await fn()
    results.push({ label, ok: true, detail, seconds: Math.round((Date.now() - startedAt) / 1000) })
    process.stdout.write(`PASS ${label} ${JSON.stringify(detail ?? '')}\n`)
    return detail
  }
  catch (error) {
    results.push({ label, ok: false, detail: error.message })
    process.stdout.write(`FAIL ${label} ${error.message}\n`)
    return null
  }
}

async function waitFor(probe) {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    const value = await probe()
    if (value) {
      return value
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  throw new Error(`timed out after ${WAIT_MS / 1000}s`)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function api(method, path, body) {
  const response = await fetchJson(method, `${API}${path}`, body, session.token)
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(response.body).slice(0, 400)}`)
  }
  return response.body
}

async function mock(method, path, body) {
  const response = await fetchJson(method, `${MOCK}${path}`, body)
  return response.body
}

async function fetchJson(method, url, body, token) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  }
  catch {
    parsed = text
  }
  return { ok: response.ok, status: response.status, body: parsed }
}

function printSummary() {
  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`)
  process.exitCode = failed.length === 0 ? 0 : 1
}
