import { loadStack } from './load-stack.mjs'

const { API_PORT, MOCK_PORT } = loadStack.paths
const API = `http://127.0.0.1:${API_PORT}/api/v1`
const MOCK = `http://127.0.0.1:${MOCK_PORT}`
const EMAIL = process.env.E2E_EMAIL ?? 'dev@ap.com'
const PASSWORD = process.env.E2E_PASSWORD ?? '12345678'
const SOLUTION_ID = 'official-beisen-feishu'
const FIRST_DEPARTMENT_OID = 20301
const TARGET = process.env.E2E_TARGET ?? 'feishu'

export const loadKit = {
  connect,
  api,
  apiRaw,
  mock,
  setupMainLine,
  setupOrgSync,
  republishWorkflows,
  workflows,
  person,
  hireOf,
  transferOf,
  leaveOf,
  inject,
  departmentOid,
  departmentOpenId,
  counts,
  runStatusCounts,
  issueRows,
  startSampler,
  waitFor,
  sleep,
  makeChecker,
  fmt,
  session: () => session,
  target: targetProfile,
  mobileOf,
  jobNumberOf,
}

let session = null
let targetDepartmentIds = []

async function connect({ projectId } = {}) {
  const signIn = await fetchJson({ method: 'POST', url: `${API}/authentication/sign-in`, body: { email: EMAIL, password: PASSWORD } })
  if (!signIn.ok) {
    throw new Error(`sign-in failed: ${JSON.stringify(signIn.body)}`)
  }
  session = { token: signIn.body.token, projectId: projectId ?? signIn.body.projectId }
  if (TARGET !== 'feishu') {
    const response = await fetchJson({ method: 'GET', url: `${MOCK}/__admin/${TARGET}` })
    if (!response.ok) throw new Error(`Cannot read ${TARGET} fixture departments`)
    targetDepartmentIds = Array.from({ length: 20 }, (_, index) => response.body.departments.find((department) => department.name === `Load department ${index + 1}`)?.id)
  }
  return session
}

async function api({ method, path, body }) {
  const response = await fetchJson({ method, url: `${API}${path}`, body, token: session.token })
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(response.body).slice(0, 400)}`)
  }
  return response.body
}

async function apiRaw({ method, path, body, timeoutMs }) {
  const startedAt = Date.now()
  const response = await fetchJson({ method, url: `${API}${path}`, body, token: session.token, ...(timeoutMs === undefined ? {} : { timeoutMs }) })
  return { ...response, ms: Date.now() - startedAt }
}

async function mock({ method, path, body }) {
  if (TARGET !== 'feishu' && method === 'GET' && ['/__admin/users', '/__admin/state', '/__admin/summary'].includes(path)) {
    const directory = (await fetchJson({ method, url: `${MOCK}/__admin/${TARGET}` })).body
    const users = directory.users.map((user) => ({ ...user, open_id: user.userid, employee_no: user.employee_no ?? user.userid, is_frozen: user.enable === 0 }))
    if (path === '/__admin/users') return { users }
    const original = (await fetchJson({ method, url: `${MOCK}${path}`, body })).body
    if (path === '/__admin/state') return { ...original, feishuUsers: users, messages: directory.messages }
    const createAttempts = Object.values(directory.createAttemptsByUser ?? {})
    const employeeNos = users.map((user) => user.employee_no)
    const messageKeys = directory.messages.map((message) => JSON.stringify([message.recipients, message.content]))
    return { ...original, users: users.length, createCalls: createAttempts.reduce((sum, count) => sum + count, 0), createAttemptsExtra: createAttempts.reduce((sum, count) => sum + Math.max(0, count - 1), 0), rejectedDuplicateCreates: directory.rejectedDuplicateCreates ?? 0, duplicateEmployeeNos: employeeNos.length - new Set(employeeNos).size, messages: directory.messages.length, duplicateMessageExtra: messageKeys.length - new Set(messageKeys).size, suppressedNotices: directory.suppressedNotices ?? 0 }
  }
  return (await fetchJson({ method, url: `${MOCK}${path}`, body })).body
}

async function fetchJson({ method, url, body, token, timeoutMs = 120000 }) {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
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

async function setupMainLine({ departments = 20, hrChatId = 'oc_hr_notice', itChatId = 'oc_it_desk', publish = true } = {}) {
  if (TARGET !== 'feishu') {
    const { directorySetup } = await import('./directory-setup.mjs')
    const installed = await directorySetup.run({ target: TARGET, departments, hrChatId, itChatId, publish, upsertConnection })
    targetDepartmentIds = installed.departmentIds
    return installed
  }
  await mock({ method: 'POST', path: '/__admin/reset' })
  await mock({ method: 'POST', path: '/__admin/departments', body: { ids: Array.from({ length: departments }, (_, index) => departmentOpenId({ index })) } })
  await upsertConnection({ externalId: 'beisen-main', displayName: '北森', connectorName: '@fema-ipaas/connector-beisen', props: { appKey: 'mock-key', appSecret: 'mock-secret' } })
  await upsertConnection({ externalId: 'feishu-main', displayName: '飞书', connectorName: '@fema-ipaas/connector-feishu', props: { domain: 'https://open.feishu.cn', appId: 'cli_mock', appSecret: 'mock-secret' } })
  const connections = { '@fema-ipaas/connector-beisen': 'beisen-main', '@fema-ipaas/connector-feishu': 'feishu-main' }
  const rootOrganizationId = '900100000'
  await mock({ method: 'POST', path: '/__admin/beisen-official', body: { orgs: [{ oId: Number(rootOrganizationId), name: 'Load company', parent: 0 }, ...Array.from({ length: departments }, (_, index) => ({ oId: departmentOid({ index }), name: `Load department ${index + 1}`, parent: Number(rootOrganizationId) }))] } })
  await mock({ method: 'POST', path: '/__admin/feishu-official', body: { departments: Array.from({ length: departments }, (_, index) => ({ id: departmentOpenId({ index }), name: `Load department ${index + 1}`, parent: '0' })) } })
  const organization = await setupOrgSync({ connections, rootOrganizationId, itChatId })
  const config = { hrChatId, itChatId, rootOrganizationId, orgWorkflow: organization.externalId }
  const checks = await api({ method: 'POST', path: `/solutions/${SOLUTION_ID}/checks`, body: { projectId: session.projectId, connections } })
  const manual = checks.results.filter((result) => result.kind === 'MANUAL').map((result) => result.key)
  const installed = await api({ method: 'POST', path: `/solutions/${SOLUTION_ID}/install`, body: { projectId: session.projectId, connections, config, acknowledgedChecks: manual } })
  const table = await api({ method: 'GET', path: `/mapping-tables/${installed.mappingTables[0].tableId}?projectId=${session.projectId}` })
  await api({
    method: 'POST',
    path: `/mapping-tables/${table.id}`,
    body: {
      projectId: session.projectId,
      name: table.name,
      description: table.description,
      keyLabel: table.keyLabel,
      valueLabel: table.valueLabel,
      missingBehavior: table.missingBehavior,
      defaultValue: table.defaultValue,
      rows: Array.from({ length: departments }, (_, index) => ({ k: String(departmentOid({ index })), v: departmentOpenId({ index }) })),
    },
  })
  const workflowIds = installed.workflows.map((workflow) => workflow.workflowId)
  if (publish) {
    await republishWorkflows({ workflowIds })
  }
  return { workflowIds, tableId: table.id, onboardId: installed.workflows.find((workflow) => workflow.key === 'onboard')?.workflowId }
}

async function setupOrgSync({ connections, rootOrganizationId, itChatId, archiveParentId = '' }) {
  const id = 'official-beisen-feishu-org'
  const checks = await api({ method: 'POST', path: `/solutions/${id}/checks`, body: { projectId: session.projectId, connections } })
  const installed = await api({ method: 'POST', path: `/solutions/${id}/install`, body: { projectId: session.projectId, connections, config: { rootOrganizationId, rootDepartmentId: '0', archiveParentId, itChatId }, acknowledgedChecks: checks.results.filter((check) => check.kind === 'MANUAL').map((check) => check.key) } })
  const workflow = installed.workflows.find((candidate) => candidate.key === 'converge')
  if (!workflow) throw new Error('Missing organization convergence workflow')
  await api({ method: 'POST', path: `/workflows/${workflow.workflowId}?projectId=${session.projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  const flow = await api({ method: 'GET', path: `/workflows/${workflow.workflowId}?projectId=${session.projectId}` })
  return { workflowId: workflow.workflowId, externalId: flow.externalId }
}

async function republishWorkflows({ workflowIds }) {
  for (const id of workflowIds) {
    await api({ method: 'POST', path: `/workflows/${id}?projectId=${session.projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  }
  return workflows({ workflowIds })
}

async function workflows({ workflowIds }) {
  return Promise.all(workflowIds.map(async (id) => {
    const flow = await api({ method: 'GET', path: `/workflows/${id}?projectId=${session.projectId}` })
    return { id, name: flow.version.displayName, status: flow.status, published: Boolean(flow.publishedVersionId) }
  }))
}

async function upsertConnection({ externalId, displayName, connectorName, props }) {
  const deadline = Date.now() + 240000
  for (;;) {
    try {
      return await createConnection({ externalId, displayName, connectorName, props })
    }
    catch (error) {
      if (Date.now() > deadline || !String(error.message).includes('connector_metadata_not_found')) {
        throw error
      }
      await sleep(3000)
    }
  }
}

async function createConnection({ externalId, displayName, connectorName, props }) {
  return api({ method: 'POST', path: '/connections', body: { externalId, displayName, connectorName, projectId: session.projectId, type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props } } })
}

function departmentOid({ index }) {
  return FIRST_DEPARTMENT_OID + index
}

function departmentOpenId({ index }) {
  if (TARGET !== 'feishu') return targetDepartmentIds[index]
  return `od-d${String(index + 1).padStart(2, '0')}`
}

function jobNumberOf({ n }) {
  return `L${String(n).padStart(6, '0')}`
}

function mobileOf({ n }) {
  return `13${String(700000000 + n).padStart(9, '0')}`
}

function person({ id, jobNumber, name, mobile, department, status, changeType, startDate = '2026-10-08T00:00:00' }) {
  return {
    employeeInfo: { userID: id, name, mobilePhone: mobile, workEmail: `${jobNumber.toLowerCase()}@example.com`, objectId: `00000000-0000-0000-0000-${String(id).padStart(12, '0')}` },
    recordInfo: { userID: id, jobNumber, oIdDepartment: department, employeeStatus: status, changeTypeOID: changeType, approvalStatus: 4, startDate, lastWorkDate: status === '8' ? '2026-10-02T00:00:00' : null },
  }
}

function hireOf({ n, departmentIndex }) {
  return person({ id: 100000 + n, jobNumber: jobNumberOf({ n }), name: `员工${n}`, mobile: mobileOf({ n }), department: departmentOid({ index: departmentIndex }), status: '2', changeType: '1' })
}

function transferOf({ n, departmentIndex, startDate }) {
  return person({ id: 100000 + n, jobNumber: jobNumberOf({ n }), name: `员工${n}`, mobile: mobileOf({ n }), department: departmentOid({ index: departmentIndex }), status: '3', changeType: '7', startDate })
}

function leaveOf({ n, departmentIndex }) {
  return person({ id: 100000 + n, jobNumber: jobNumberOf({ n }), name: `员工${n}`, mobile: mobileOf({ n }), department: departmentOid({ index: departmentIndex }), status: '8', changeType: '10' })
}

async function inject({ records, changedAtOffsetSeconds = 0, chunk = 1000 }) {
  for (let index = 0; index < records.length; index += chunk) {
    await mock({ method: 'POST', path: '/__admin/employees', body: { records: records.slice(index, index + chunk), changedAtOffsetSeconds } })
  }
}

function runStatusCounts() {
  const rows = loadStack.psql({ sql: `select status, count(*) from execution group by status order by status` })
  return Object.fromEntries(rows.split('\n').filter(Boolean).map((line) => {
    const [status, count] = line.split('|')
    return [status, Number(count)]
  }))
}

function counts() {
  const sql = (query) => Number(loadStack.psql({ sql: query }) || 0)
  return {
    executions: sql('select count(*) from execution'),
    succeeded: sql(`select count(*) from execution where status='SUCCEEDED'`),
    failed: sql(`select count(*) from execution where status in ('FAILED','INTERNAL_ERROR','TIMEOUT')`),
    unfinished: sql(`select count(*) from execution where status in ('QUEUED','RUNNING','PAUSED')`),
    issues: sql('select count(*) from issue'),
    openIssues: sql(`select count(*) from issue where status='OPEN'`),
  }
}

function issueRows() {
  return loadStack.psql({ sql: `select kind, "errorCode", "stepName", status, occurrences from issue order by "created"` }).split('\n').filter(Boolean)
}

function startSampler({ names, intervalMs = 2000 }) {
  const series = Object.fromEntries(names.map((name) => [name, []]))
  const timer = setInterval(() => {
    for (const name of names) {
      const sample = loadStack.sampleTree({ name })
      if (sample) {
        series[name].push({ at: Date.now(), ...sample })
      }
    }
  }, intervalMs)
  return {
    stop() {
      clearInterval(timer)
      return Object.fromEntries(names.map((name) => [name, summarize({ samples: series[name] })]))
    },
  }
}

function summarize({ samples }) {
  if (samples.length < 2) {
    return { samples: samples.length }
  }
  const first = samples[0]
  const last = samples[samples.length - 1]
  const wallSeconds = (last.at - first.at) / 1000
  return {
    samples: samples.length,
    startRssMb: Math.round(first.mainRssMb),
    peakMainRssMb: Math.round(Math.max(...samples.map((sample) => sample.mainRssMb))),
    peakTreeRssMb: Math.round(Math.max(...samples.map((sample) => sample.rssMb))),
    endMainRssMb: Math.round(last.mainRssMb),
    avgMainCpuPct: Math.round(((last.cpuSeconds - first.cpuSeconds) / wallSeconds) * 100),
    maxProcesses: Math.max(...samples.map((sample) => sample.processes)),
  }
}

async function waitFor({ probe, timeoutMs = 600000, intervalMs = 2000, label = '' }) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await probe()
    if (value) {
      return value
    }
    await sleep(intervalMs)
  }
  throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s ${label}`)
}

function makeChecker() {
  const results = []
  return {
    results,
    async check(label, fn) {
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
    },
    assert(condition, message) {
      if (!condition) {
        throw new Error(message)
      }
    },
    summary() {
      const failed = results.filter((result) => !result.ok)
      process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`)
      process.exitCode = failed.length === 0 ? 0 : 1
    },
  }
}

function fmt({ value }) {
  return JSON.stringify(value)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function targetProfile() {
  return {
    name: TARGET,
    createPath: TARGET === 'feishu' ? '/contact/v3/users$' : TARGET === 'wecom' ? '/cgi-bin/user/create$' : '/topapi/v2/user/create$',
    messagePath: TARGET === 'feishu' ? '/im/v1/messages$' : TARGET === 'wecom' ? '/cgi-bin/message/send$' : '/topapi/message/corpconversation/asyncsend_v2$',
    rateLimitPayload: TARGET === 'feishu' ? { code: 99991400, msg: 'request trigger frequency limit' } : { errcode: TARGET === 'wecom' ? 45009 : 90002, errmsg: 'API frequency limit exceeded' },
    onboardName: `员工入职开通${TARGET === 'feishu' ? '飞书' : TARGET === 'wecom' ? '企业微信' : '钉钉'}账号`,
  }
}
