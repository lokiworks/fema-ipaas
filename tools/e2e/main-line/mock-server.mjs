import { createDirectoryOfficial } from './official-directory.mjs'
import { createServer } from 'node:http'

import { createBeisenOfficial } from './official-beisen.mjs'
import { createFeishuOfficial } from './official-feishu.mjs'

const port = Number(process.env.MOCK_PORT ?? 18900)

const state = {
  employees: [],
  departments: new Set(['od-rd', 'od-hr', 'od-sales']),
  feishuUsers: new Map(),
  createdByClientToken: new Map(),
  createCalls: 0,
  messages: [],
  bitableRecords: [],
  provisionFailure: null,
  messageFailure: null,
  beisenRules: [],
  failuresServed: 0,
  timeWindowRequests: [],
  usersByOpenId: new Map(),
  usersByEmail: new Map(),
  createAttemptsByMobile: new Map(),
  rejectedDuplicateCreates: 0,
  replayedCreates: 0,
  faults: [],
  faultsServed: 0,
  latencyMs: { feishu: 0, beisen: 0 },
  beisenQuirks: { duplicateRate: 0, shuffle: false },
  requestCounts: {},
  inflight: 0,
  inflightMax: 0,
  beisenPages: { withData: 0, empty: 0 },
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  const body = await readJson(req)
  const route = `${req.method} ${url.pathname}`
  const userMatch = url.pathname.match(/^\/feishu\/open-apis\/contact\/v3\/users\/([^/]+)$/)
  const openId = userMatch ? decodeURIComponent(userMatch[1]) : null
  const handler = feishuOfficial.dynamicHandlerFor({ method: req.method ?? 'GET', pathname: url.pathname }) ?? ROUTES[route]
  if (!handler) {
    return send(res, 404, { error: 'not_found', path: url.pathname })
  }
  const admin = url.pathname.startsWith('/__admin/')
  const target = url.pathname.startsWith('/beisen/') ? 'beisen' : url.pathname.startsWith('/feishu/') ? 'feishu' : url.pathname.startsWith('/wecom/') ? 'wecom' : url.pathname.startsWith('/dingtalk/') ? 'dingtalk' : 'admin'
  if (!admin) {
    state.requestCounts[`${target}:${routeKeyOf({ route, openId })}`] = (state.requestCounts[`${target}:${routeKeyOf({ route, openId })}`] ?? 0) + 1
    state.inflight += 1
    state.inflightMax = Math.max(state.inflightMax, state.inflight)
  }
  try {
    const latency = state.latencyMs[target] ?? 0
    if (latency > 0) {
      await sleep(latency)
    }
    const fault = admin ? null : pickFault({ target, method: req.method ?? 'GET', pathname: url.pathname })
    if (fault?.mode === 'drop') {
      if (fault.apply) {
        handler({ body, query: url.searchParams, headers: req.headers })
      }
      return req.socket.destroy()
    }
    if (fault?.mode === 'status') {
      return send(res, fault.status, fault.payload, faultHeaders({ fault }))
    }
    if (fault?.mode === 'delay') {
      await sleep(fault.delayMs)
    }
    const { status, payload, headers = {} } = handler({ body, query: url.searchParams, headers: req.headers })
    if (fault?.mode === 'apply_then_delay') {
      await sleep(fault.delayMs)
    }
    if (fault?.mode === 'apply_then_status') {
      return send(res, fault.status, fault.payload, faultHeaders({ fault }))
    }
    return send(res, status, payload, headers)
  }
  finally {
    if (!admin) {
      state.inflight -= 1
    }
  }
})

const ROUTES = {
  'POST /beisen/token': ({ body }) => {
    if (body.app_key === 'wrong') {
      return ok({ error: 'invalid_client', error_description: 'app_key or app_secret is wrong', error_code: '40001' })
    }
    return ok({ access_token: `${BEISEN_TOKEN}:${body.app_key}`, expires_in: 7200, token_type: 'bearer' })
  },
  'POST /__admin/employees': ({ body }) => {
    const changedAt = Date.now() + Number(body.changedAtOffsetSeconds ?? 0) * 1000
    const records = (body.records ?? []).map((record) => ({ ...record, changedAt }))
    state.employees.push(...records)
    return ok({ added: records.length, total: state.employees.length })
  },
  'POST /__admin/feishu-seed-users': ({ body }) => {
    const users = (body.users ?? []).map((input) => registerUser({ input }))
    return ok({ seeded: users.length, total: state.feishuUsers.size })
  },
  'POST /__admin/departments': ({ body }) => {
    ;(body.ids ?? []).forEach((id) => state.departments.add(id))
    return ok({ departments: state.departments.size })
  },
  'POST /__admin/faults': ({ body }) => {
    state.faults = (body.rules ?? []).map((rule, index) => normalizeFault({ rule, index }))
    return ok({ faults: state.faults.length })
  },
  'POST /__admin/latency': ({ body }) => {
    state.latencyMs = { feishu: Number(body.feishu ?? 0), beisen: Number(body.beisen ?? 0) }
    return ok({ latencyMs: state.latencyMs })
  },
  'POST /__admin/beisen-quirks': ({ body }) => {
    state.beisenQuirks = { duplicateRate: Number(body.duplicateRate ?? 0), shuffle: body.shuffle === true }
    return ok({ beisenQuirks: state.beisenQuirks })
  },
  'POST /__admin/reset': () => {
    state.employees = []
    state.feishuUsers = new Map()
    state.usersByOpenId = new Map()
    state.usersByEmail = new Map()
    state.createdByClientToken = new Map()
    state.createAttemptsByMobile = new Map()
    state.createCalls = 0
    state.rejectedDuplicateCreates = 0
    state.replayedCreates = 0
    state.messages = []
    state.bitableRecords = []
    state.provisionFailure = null
    state.messageFailure = null
    state.beisenRules = []
    state.failuresServed = 0
    state.timeWindowRequests = []
    state.faults = []
    state.faultsServed = 0
    state.latencyMs = { feishu: 0, beisen: 0 }
    state.beisenQuirks = { duplicateRate: 0, shuffle: false }
    state.requestCounts = {}
    state.inflightMax = 0
    state.beisenPages = { withData: 0, empty: 0 }
    feishuOfficial.reset()
    beisenOfficial.reset()
    return ok({ reset: true })
  },
  'POST /__admin/reset-counters': () => {
    state.requestCounts = {}
    state.inflightMax = 0
    state.faultsServed = 0
    state.faults.forEach((fault) => {
      fault.served = 0
    })
    return ok({ reset: true })
  },
  'GET /__admin/summary': () => ok(summaryOf()),
  'GET /__admin/users': () => ok({ users: [...state.feishuUsers.values()].map(({ mobile, open_id, department_ids, employee_no, is_frozen, name }) => ({ mobile, open_id, department_ids, employee_no, is_frozen: is_frozen === true, name })) }),
  'POST /__admin/feishu-user': ({ body }) => {
    const user = state.feishuUsers.get(body.mobile)
    if (!user) {
      return { status: 404, payload: { error: 'no such user' } }
    }
    Object.assign(user, body.set ?? {})
    return ok({ user })
  },
  'POST /__admin/beisen-mode': ({ body }) => {
    state.beisenRules = Array.isArray(body.rules) ? body.rules : body.mode ? [{ mode: body.mode, retryAfterSeconds: body.retryAfterSeconds, appKey: body.appKey }] : []
    return ok({ beisenRules: state.beisenRules })
  },
  'POST /__admin/feishu-failure': ({ body }) => {
    const failure = body.code ? { code: body.code, msg: body.msg ?? 'mock failure', remaining: body.times ?? null, resetSeconds: body.resetSeconds ?? null } : null
    if (body.target === 'messages') {
      state.messageFailure = failure
    }
    else {
      state.provisionFailure = failure
    }
    return ok({ provisionFailure: state.provisionFailure, messageFailure: state.messageFailure })
  },
  'GET /__admin/state': () => ok({
    feishuUsers: [...state.feishuUsers.values()],
    timeWindowRequests: state.timeWindowRequests.length > 200 ? state.timeWindowRequests.slice(-200) : state.timeWindowRequests,
    createCalls: state.createCalls,
    messages: state.messages,
    bitableRecords: state.bitableRecords,
    provisionFailure: state.provisionFailure,
    messageFailure: state.messageFailure,
    failuresServed: state.failuresServed,
  }),
}

function summaryOf() {
  const users = [...state.feishuUsers.values()]
  const byDepartment = {}
  users.forEach((user) => {
    const key = (user.department_ids ?? []).join(',')
    byDepartment[key] = (byDepartment[key] ?? 0) + 1
  })
  const messagesByText = new Map()
  state.messages.forEach((message) => {
    messagesByText.set(message.content, (messagesByText.get(message.content) ?? 0) + 1)
  })
  const employeeNos = new Map()
  users.forEach((user) => {
    if (user.employee_no) {
      employeeNos.set(user.employee_no, (employeeNos.get(user.employee_no) ?? 0) + 1)
    }
  })
  return {
    users: users.length,
    frozen: users.filter((user) => user.is_frozen === true).length,
    byDepartment,
    createCalls: state.createCalls,
    createAttemptsOverOne: [...state.createAttemptsByMobile.values()].filter((count) => count > 1).length,
    createAttemptsExtra: [...state.createAttemptsByMobile.values()].reduce((sum, count) => sum + Math.max(count - 1, 0), 0),
    rejectedDuplicateCreates: state.rejectedDuplicateCreates,
    replayedCreates: state.replayedCreates,
    duplicateEmployeeNos: [...employeeNos.values()].filter((count) => count > 1).length,
    messages: state.messages.length,
    duplicateMessages: [...messagesByText.values()].filter((count) => count > 1).length,
    duplicateMessageExtra: [...messagesByText.values()].reduce((sum, count) => sum + Math.max(count - 1, 0), 0),
    employees: state.employees.length,
    requestCounts: state.requestCounts,
    inflightMax: state.inflightMax,
    beisenPages: state.beisenPages,
    faultsServed: state.faultsServed,
    failuresServed: state.failuresServed,
    faults: state.faults.map(({ id, served, remaining }) => ({ id, served, remaining })),
  }
}

function registerUser({ input }) {
  const sequence = state.feishuUsers.size + 1
  const user = {
    open_id: `ou_${sequence}`,
    user_id: `u${sequence}`,
    union_id: `on_${sequence}`,
    name: input.name,
    mobile: input.mobile,
    email: input.email ?? null,
    employee_no: input.employee_no ?? null,
    department_ids: input.department_ids ?? [],
    is_frozen: input.is_frozen === true,
    is_resigned: input.is_resigned === true,
    is_tenant_manager: input.is_tenant_manager === true,
  }
  state.feishuUsers.set(user.mobile, user)
  state.usersByOpenId.set(user.open_id, user)
  if (user.email) {
    state.usersByEmail.set(user.email, user)
  }
  return user
}

function normalizeFault({ rule, index }) {
  const status = Number(rule.status ?? 500)
  return {
    id: rule.id ?? `fault-${index + 1}`,
    target: rule.target ?? 'feishu',
    method: rule.method ?? null,
    path: rule.path ? new RegExp(rule.path) : null,
    mode: rule.mode ?? 'status',
    status,
    payload: rule.payload ?? (status === 429 ? { code: 99991400, msg: 'request trigger frequency limit' } : { code: status, msg: 'mock server error' }),
    delayMs: Number(rule.delayMs ?? 0),
    probability: Number(rule.probability ?? 1),
    remaining: rule.times === undefined || rule.times === null ? null : Number(rule.times),
    skip: Number(rule.skip ?? 0),
    apply: rule.apply === true,
    resetSeconds: rule.resetSeconds ?? null,
    served: 0,
    seen: 0,
  }
}

function pickFault({ target, method, pathname }) {
  const fault = state.faults.find((candidate) => {
    if (candidate.target !== target || (candidate.method && candidate.method !== method) || (candidate.path && !candidate.path.test(pathname))) {
      return false
    }
    if (candidate.remaining !== null && candidate.remaining <= 0) {
      return false
    }
    candidate.seen += 1
    if (candidate.seen <= candidate.skip) {
      return false
    }
    return Math.random() < candidate.probability
  })
  if (!fault) {
    return null
  }
  fault.served += 1
  state.faultsServed += 1
  if (fault.remaining !== null) {
    fault.remaining -= 1
  }
  return fault
}

function faultHeaders({ fault }) {
  return fault.resetSeconds === null ? {} : { 'x-ogw-ratelimit-reset': String(fault.resetSeconds), 'retry-after': String(fault.resetSeconds) }
}

function quirkPage({ page }) {
  const { duplicateRate, shuffle } = state.beisenQuirks
  const extras = duplicateRate > 0 ? page.filter(() => Math.random() < duplicateRate) : []
  const combined = [...page, ...extras]
  return shuffle ? combined.map((item) => ({ item, key: Math.random() })).sort((a, b) => a.key - b.key).map(({ item }) => item) : combined
}

function routeKeyOf({ route, openId }) {
  return openId ? route.replace(openId, ':id') : route
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function beisenRuleFor({ appKey, empStatus }) {
  const statuses = Array.isArray(empStatus) ? empStatus.map(Number) : []
  return state.beisenRules.find((rule) => {
    const keyMatches = rule.appKey === undefined || rule.appKey === appKey
    const whenMatches = rule.whenEmpStatusIncludes === undefined || statuses.includes(Number(rule.whenEmpStatusIncludes))
    const unlessMatches = rule.unlessEmpStatusIncludes === undefined || !statuses.includes(Number(rule.unlessEmpStatusIncludes))
    return keyMatches && whenMatches && unlessMatches
  })
}

function takeFailure({ key }) {
  const failure = state[key]
  if (!failure) {
    return null
  }
  state.failuresServed += 1
  if (failure.remaining !== null) {
    failure.remaining -= 1
    if (failure.remaining <= 0) {
      state[key] = null
    }
  }
  return {
    status: 400,
    payload: { code: failure.code, msg: failure.msg },
    headers: failure.resetSeconds === null ? {} : { 'x-ogw-ratelimit-reset': String(failure.resetSeconds) },
  }
}

function statusAllowed({ employee, body }) {
  const status = String(employee.recordInfo.employeeStatus)
  if (Array.isArray(body.empStatus) && body.empStatus.length > 0) {
    return body.empStatus.map(String).includes(status)
  }
  if (body.withDisabled) {
    return true
  }
  return ['2', '3', '7'].includes(status)
}

function beisenTimeToEpoch(text) {
  return new Date(`${String(text).replace(' ', 'T')}+08:00`).getTime()
}

function toSecond(epochMs) {
  return Math.floor(epochMs / 1000) * 1000
}

function ok(payload) {
  return { status: 200, payload }
}

function send(res, status, payload, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers })
  res.end(JSON.stringify(payload))
}

async function readJson(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (!text) {
    return {}
  }
  try {
    return JSON.parse(text)
  }
  catch {
    return {}
  }
}

const DAY_MS = 24 * 60 * 60 * 1000
const BEISEN_TOKEN = 'beisen-mock-token'
const HR_CHAT_ID = 'oc_hr_notice'

const officialKit = { ok, takeFailure, quirkPage: typeof quirkPage === 'function' ? quirkPage : undefined, beisenRuleFor, statusAllowed, beisenTimeToEpoch, toSecond, BEISEN_TOKEN, HR_CHAT_ID }
const feishuOfficial = createFeishuOfficial({ state, kit: officialKit })
const beisenOfficial = createBeisenOfficial({ state, kit: officialKit })
Object.assign(ROUTES, feishuOfficial.routes(), beisenOfficial.routes(), createDirectoryOfficial({ target: 'wecom', kit: officialKit }).routes(), createDirectoryOfficial({ target: 'dingtalk', kit: officialKit }).routes())

server.listen(port, () => {
  process.stdout.write(`mock beisen + feishu listening on http://127.0.0.1:${port}\n`)
})
