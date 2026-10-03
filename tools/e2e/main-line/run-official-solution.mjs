const API = process.env.E2E_API_URL ?? 'http://localhost:3200/api/v1'
const MOCK = process.env.E2E_MOCK_URL ?? 'http://127.0.0.1:18900'
const EMAIL = process.env.E2E_EMAIL ?? 'dev@ap.com'
const PASSWORD = process.env.E2E_PASSWORD ?? '12345678'
const WAIT_MS = Number(process.env.E2E_WAIT_MS ?? 240000)
const SOLUTION_ID = 'official-beisen-feishu'
const HR_CHAT_ID = 'oc_hr_notice'
const IT_CHAT_ID = 'oc_it_desk'

const results = []
const injected = new Set()
const session = await authenticate()

await mock('POST', '/__admin/feishu-failure', {})
await mock('POST', '/__admin/beisen-mode', {})

await check('创建北森和飞书连接（保存时校验凭据）', async () => {
  await upsertConnection({ externalId: 'beisen-main', displayName: '北森', connectorName: '@fema-ipaas/connector-beisen', props: { appKey: 'mock-key', appSecret: 'mock-secret' } })
  await upsertConnection({ externalId: 'feishu-main', displayName: '飞书', connectorName: '@fema-ipaas/connector-feishu', props: { domain: 'https://open.feishu.cn', appId: 'cli_mock', appSecret: 'mock-secret' } })
  return 'ok'
})

const connections = { '@fema-ipaas/connector-beisen': 'beisen-main', '@fema-ipaas/connector-feishu': 'feishu-main' }
const config = { hrChatId: HR_CHAT_ID, itChatId: IT_CHAT_ID }

const installed = await check('官方方案出现在方案库，预览、检查、安装一路通', async () => {
  const solutions = await api('GET', '/solutions')
  const official = solutions.find((solution) => solution.id === SOLUTION_ID)
  assert(official, '方案库里没有官方方案')
  const preview = await api('POST', `/solutions/${SOLUTION_ID}/preview`, { projectId: session.projectId, connections, config })
  assert(preview.workflows.length === 3 && preview.mappingTables.length === 1, `预览不对：${JSON.stringify(preview)}`)
  const checks = await api('POST', `/solutions/${SOLUTION_ID}/checks`, { projectId: session.projectId, connections })
  const blocking = checks.results.filter((result) => result.blocking && result.status !== 'PASS')
  assert(blocking.length === 0, `阻塞检查未通过：${JSON.stringify(blocking)}`)
  const manual = checks.results.filter((result) => result.kind === 'MANUAL').map((result) => result.key)
  const result = await api('POST', `/solutions/${SOLUTION_ID}/install`, { projectId: session.projectId, connections, config, acknowledgedChecks: manual })
  return { workflows: result.workflows.map((workflow) => workflow.workflowId), tables: result.mappingTables.map((table) => table.tableId) }
})
if (!installed) {
  printSummary()
  process.exit(1)
}

await check('填好部门对照并发布、启用三个工作流', async () => {
  const table = await api('GET', `/mapping-tables/${installed.tables[0]}?projectId=${session.projectId}`)
  await api('POST', `/mapping-tables/${table.id}`, { projectId: session.projectId, name: table.name, description: table.description, keyLabel: table.keyLabel, valueLabel: table.valueLabel, missingBehavior: table.missingBehavior, defaultValue: table.defaultValue, rows: [{ k: '20301', v: 'od-rd' }, { k: '20302', v: 'od-hr' }] })
  for (const id of installed.workflows) {
    await api('POST', `/workflows/${id}?projectId=${session.projectId}`, { type: 'LOCK_AND_PUBLISH', request: {} })
  }
  const flows = await Promise.all(installed.workflows.map((id) => api('GET', `/workflows/${id}?projectId=${session.projectId}`)))
  return flows.map((flow) => ({ name: flow.version.displayName, status: flow.status, published: Boolean(flow.publishedVersionId) }))
})
await sleep(25000)

await check('入职：账号按部门对照建在研发部，只在新开通时通知 HR 群', () => waitFor(async () => {
  await mock('POST', '/__admin/employees', { records: [person({ id: 1001, jobNumber: 'E1001', name: '张三', mobile: '13800000001', department: 20301, status: '2', changeType: '1' })] }, { once: 'hire' })
  const state = await mock('GET', '/__admin/state')
  const user = state.feishuUsers.find((item) => item.mobile === '+8613800000001')
  const notices = state.messages.filter((message) => message.chat_id === HR_CHAT_ID && message.content.includes('张三'))
  return user && notices.length === 1 && user.department_ids[0] === 'od-rd' ? { open_id: user.open_id, department: user.department_ids[0] } : null
}))

await check('同一员工的后续业务修改不再重复开通，也不再通知', async () => {
  await mock('POST', '/__admin/employees', { records: [person({ id: 1001, jobNumber: 'E1001', name: '张三', mobile: '13800000001', department: 20301, status: '2', changeType: '1' })] })
  await sleep(90000)
  const state = await mock('GET', '/__admin/state')
  const accounts = state.feishuUsers.filter((item) => item.mobile === '+8613800000001').length
  const notices = state.messages.filter((message) => message.content.includes('张三')).length
  assert(accounts === 1 && notices === 1, `账号 ${accounts} 个，通知 ${notices} 条`)
  return { accounts, notices }
})

await check('调岗：飞书部门改成对照后的人力资源部', () => waitFor(async () => {
  await mock('POST', '/__admin/employees', { records: [person({ id: 1001, jobNumber: 'E1001', name: '张三', mobile: '13800000001', department: 20302, status: '3', changeType: '7' })] }, { once: 'transfer' })
  const state = await mock('GET', '/__admin/state')
  const user = state.feishuUsers.find((item) => item.mobile === '+8613800000001')
  return user && user.department_ids[0] === 'od-hr' ? { department: user.department_ids[0] } : null
}))

await check('离职：飞书账号被冻结且数据保留，IT 群收到通知', () => waitFor(async () => {
  await mock('POST', '/__admin/employees', { records: [person({ id: 1001, jobNumber: 'E1001', name: '张三', mobile: '13800000001', department: 20302, status: '8', changeType: '13' })] }, { once: 'leave' })
  const state = await mock('GET', '/__admin/state')
  const user = state.feishuUsers.find((item) => item.mobile === '+8613800000001')
  const notified = state.messages.some((message) => message.chat_id === IT_CHAT_ID && message.content.includes('张三'))
  return user && user.is_frozen === true && notified ? { frozen: true } : null
}))

await check('离职员工在飞书里没有账号：运行成功结束，不冻结任何人、不报错', async () => {
  await mock('POST', '/__admin/employees', { records: [person({ id: 2002, jobNumber: 'E2002', name: '赵六', mobile: '13800000009', department: 20301, status: '8', changeType: '13' })] })
  await sleep(90000)
  const runs = await api('GET', `/run-logs?projectId=${session.projectId}&limit=50&type=ALL&businessKey=E2002`)
  const state = await mock('GET', '/__admin/state')
  assert(runs.data.length > 0, '没有找到 E2002 的运行')
  assert(runs.data.every((run) => run.status === 'SUCCEEDED'), `E2002 的运行有失败：${runs.data.map((run) => run.status)}`)
  assert(!state.feishuUsers.some((user) => user.mobile === '+8613800000009'), '不该给没有账号的人建号')
  return { runs: runs.data.length }
})

await check('日志里能按工号找到张三的全部运行（入职、调岗、离职）', async () => {
  const runs = await api('GET', `/run-logs?projectId=${session.projectId}&limit=50&type=ALL&businessKey=E1001`)
  const names = new Set(runs.data.map((run) => run.workflowDisplayName))
  assert(names.size === 3, `只找到这些工作流的运行：${[...names]}`)
  return [...names]
})

await check('向北森发出的请求符合文档：新路径、业务修改时间、按状态范围取', async () => {
  const state = await mock('GET', '/__admin/state')
  const bodies = state.timeWindowRequests
  assert(bodies.length > 0, '没有任何时间窗请求')
  assert(bodies.every((body) => body.timeWindowQueryType === 2 && body.serviceType?.[0] === 0 && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(body.startTime)), `请求里有不符合文档的字段：${JSON.stringify(bodies[0])}`)
  const scopes = new Set(bodies.map((body) => JSON.stringify(body.empStatus)))
  assert(scopes.has('[8]') && scopes.has('[1,2,3]') && scopes.has('[2,3]'), `三种状态范围没有都出现：${[...scopes]}`)
  return [...scopes]
})

await check('核对：离职的账号被人手工解除了冻结 → 问题中心出现「结果对不上」，指出是哪个工号', async () => {
  const state = await mock('GET', '/__admin/state')
  const user = state.feishuUsers.find((item) => item.mobile === '+8613800000001')
  assert(user, '张三的账号不见了')
  await mock('POST', '/__admin/feishu-user', { mobile: '+8613800000001', set: { is_frozen: false } })
  const summary = await api('POST', '/verification/run', { projectId: session.projectId })
  assert(summary.mismatched >= 1, `没有发现差异：${JSON.stringify(summary)}`)
  const overview = await api('GET', `/issues?projectId=${session.projectId}&view=OPEN&limit=50`)
  const drift = overview.data.find((issue) => issue.kind === 'DRIFT')
  assert(drift, '问题中心里没有对账差异')
  assert(drift.message.includes('E1001'), `差异没有写明工号：${drift.message}`)
  return { mismatched: summary.mismatched, title: drift.title, message: drift.message }
})

await check('核对：手工改回去之后再核对，差异问题自动关闭', async () => {
  await mock('POST', '/__admin/feishu-user', { mobile: '+8613800000001', set: { is_frozen: true } })
  const summary = await api('POST', '/verification/run', { projectId: session.projectId })
  assert(summary.mismatched === 0, `仍有差异：${JSON.stringify(summary)}`)
  const resolved = await api('GET', `/issues?projectId=${session.projectId}&view=RESOLVED&limit=50`)
  assert(resolved.data.some((issue) => issue.kind === 'DRIFT'), '差异问题没有被关闭')
  return summary
})

printSummary()

function person({ id, jobNumber, name, mobile, department, status, changeType }) {
  return {
    employeeInfo: { userID: id, name, mobilePhone: mobile, workEmail: `${jobNumber.toLowerCase()}@example.com`, objectId: `00000000-0000-0000-0000-${String(id).padStart(12, '0')}` },
    recordInfo: { userID: id, jobNumber, oIdDepartment: department, employeeStatus: status, changeTypeOID: changeType, approvalStatus: 4, startDate: '2026-10-08T00:00:00', lastWorkDate: status === '8' ? '2026-10-02T00:00:00' : null },
  }
}

async function authenticate() {
  const signIn = await fetchJson('POST', `${API}/authentication/sign-in`, { email: EMAIL, password: PASSWORD })
  if (!signIn.ok) {
    throw new Error(`sign-in failed: ${JSON.stringify(signIn.body)}`)
  }
  return { token: signIn.body.token, projectId: signIn.body.projectId }
}

async function upsertConnection({ externalId, displayName, connectorName, props }) {
  return api('POST', '/connections', { externalId, displayName, connectorName, projectId: session.projectId, type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props } })
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
    await sleep(5000)
  }
  throw new Error(`timed out after ${WAIT_MS / 1000}s`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

async function mock(method, path, body, options) {
  if (options?.once) {
    if (injected.has(options.once)) {
      return (await fetchJson('GET', `${MOCK}/__admin/state`)).body
    }
    injected.add(options.once)
  }
  return (await fetchJson(method, `${MOCK}${path}`, body)).body
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
