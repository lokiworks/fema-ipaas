import { createServer } from 'node:http'

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
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  const body = await readJson(req)
  const route = `${req.method} ${url.pathname}`
  const userMatch = url.pathname.match(/^\/feishu\/open-apis\/contact\/v3\/users\/([^/]+)$/)
  const openId = userMatch ? decodeURIComponent(userMatch[1]) : null
  const bitableMatch = url.pathname.match(/^\/feishu\/open-apis\/bitable\/v1\/apps\/([^/]+)\/tables(?:\/([^/]+)\/records)?$/)
  const handler = bitableMatch ? (context) => bitable({ ...context, match: bitableMatch, method: req.method }) : userMatch && req.method === 'PATCH' ? (context) => updateUser({ ...context, openId }) : userMatch && req.method === 'GET' ? () => getUser({ openId }) : ROUTES[route]
  if (!handler) {
    return send(res, 404, { error: 'not_found', path: url.pathname })
  }
  const { status, payload, headers = {} } = handler({ body, query: url.searchParams, headers: req.headers })
  return send(res, status, payload, headers)
})

const ROUTES = {
  'POST /beisen/token': ({ body }) => {
    if (body.app_key === 'wrong') {
      return ok({ error: 'invalid_client', error_description: 'app_key or app_secret is wrong', error_code: '40001' })
    }
    return ok({ access_token: `${BEISEN_TOKEN}:${body.app_key}`, expires_in: 7200, token_type: 'bearer' })
  },
  'POST /beisen/TenantBaseExternal/api/v5/Employee/GetByTimeWindow': ({ body, headers }) => {
    const authorization = String(headers.authorization ?? '')
    if (!authorization.startsWith(`Bearer ${BEISEN_TOKEN}`)) {
      return ok({ error: 'invalid_token', error_description: 'access_token is invalid', error_code: '40003' })
    }
    const appKey = authorization.slice(`Bearer ${BEISEN_TOKEN}:`.length)
    const mode = beisenRuleFor({ appKey, empStatus: body.empStatus }) ?? { mode: null }
    if (mode.mode === 'RATE_LIMIT_429') {
      return { status: 429, payload: 'API rate limit exceeded', headers: mode.retryAfterSeconds === undefined ? {} : { 'retry-after': String(mode.retryAfterSeconds) } }
    }
    if (mode.mode === 'RATE_LIMIT_BODY') {
      return ok({ error: 'rate_limit', error_description: 'API rate limit exceeded', error_code: '42901' })
    }
    if (mode.mode === 'SERVER_ERROR_500') {
      return { status: 500, payload: 'Beisen internal error' }
    }
    state.timeWindowRequests.push(body)
    const from = beisenTimeToEpoch(body.startTime)
    const to = beisenTimeToEpoch(body.stopTime)
    if (to - from > 90 * DAY_MS) {
      return ok({ code: 417, message: '只支持查询90天范围内的数据，请分段查询', total: 0, data: [] })
    }
    const matched = state.employees
      .filter((employee) => toSecond(employee.changedAt) > from && toSecond(employee.changedAt) <= to)
      .filter((employee) => statusAllowed({ employee, body }))
      .filter((employee) => (body.approvalStatuses?.length ? body.approvalStatuses : [4]).includes(Number(employee.recordInfo.approvalStatus ?? 4)))
    const offset = body.scrollId ? Number(body.scrollId) : 0
    const capacity = Math.min(Number(body.capacity ?? 100), 300)
    const page = matched.slice(offset, offset + capacity)
    return ok({
      code: 200,
      message: '',
      total: matched.length,
      ...(page.length > 0 ? { scrollId: String(offset + page.length) } : {}),
      data: page.map(({ changedAt, ...record }) => ({ originalId: null, ...record })),
    })
  },
  'POST /feishu/open-apis/auth/v3/tenant_access_token/internal': ({ body }) => {
    if (body.app_secret === 'wrong') {
      return ok({ code: 99991663, msg: 'app secret invalid' })
    }
    return ok({ code: 0, msg: 'ok', tenant_access_token: `${FEISHU_TOKEN}:${body.app_id}`, expire: 7200 })
  },
  'POST /feishu/open-apis/contact/v3/users/batch_get_id': ({ body }) => {
    const mobiles = (body.mobiles ?? []).map((mobile) => ({ mobile, ...userIdFor({ mobile }) }))
    const emails = (body.emails ?? []).map((email) => ({ email, ...userIdFor({ email }) }))
    return ok({ code: 0, msg: 'success', data: { user_list: [...mobiles, ...emails] } })
  },
  'POST /feishu/open-apis/contact/v3/users': ({ body, query }) => {
    state.createCalls += 1
    const failure = takeFailure({ key: 'provisionFailure' })
    if (failure) {
      return failure
    }
    const clientToken = query.get('client_token')
    const replayed = clientToken ? state.createdByClientToken.get(clientToken) : undefined
    if (replayed) {
      return ok({ code: 0, msg: 'success', data: { user: replayed } })
    }
    const unknownDepartment = (body.department_ids ?? []).find((id) => !state.departments.has(id))
    if (unknownDepartment) {
      return { status: 400, payload: { code: 40013, msg: `department ${unknownDepartment} not found` } }
    }
    const user = {
      open_id: `ou_${state.feishuUsers.size + 1}`,
      user_id: `u${state.feishuUsers.size + 1}`,
      union_id: `on_${state.feishuUsers.size + 1}`,
      name: body.name,
      mobile: body.mobile,
      email: body.email ?? null,
      employee_no: body.employee_no ?? null,
      department_ids: body.department_ids,
    }
    state.feishuUsers.set(body.mobile, user)
    if (clientToken) {
      state.createdByClientToken.set(clientToken, user)
    }
    return ok({ code: 0, msg: 'success', data: { user } })
  },
  'GET /feishu/open-apis/im/v1/chats': () => ok({ code: 0, msg: 'success', data: { items: [{ chat_id: HR_CHAT_ID, name: 'HR 通知群' }] } }),
  'POST /feishu/open-apis/im/v1/messages': ({ body, headers }) => {
    const failure = takeFailure({ key: 'messageFailure' })
    if (failure) {
      return failure
    }
    const message = { message_id: `om_${state.messages.length + 1}`, chat_id: body.receive_id, msg_type: body.msg_type, content: body.content, create_time: String(Date.now()), app_id: String(headers.authorization ?? '').split(':')[1] ?? null }
    state.messages.push(message)
    return ok({ code: 0, msg: 'success', data: message })
  },
  'POST /__admin/employees': ({ body }) => {
    const changedAt = Date.now()
    const records = (body.records ?? []).map((record) => ({ ...record, changedAt }))
    state.employees.push(...records)
    return ok({ added: records.length })
  },
  'POST /__admin/feishu-user': ({ body }) => {
    const user = [...state.feishuUsers.values()].find((candidate) => candidate.mobile === body.mobile)
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
    timeWindowRequests: state.timeWindowRequests,
    createCalls: state.createCalls,
    messages: state.messages,
    bitableRecords: state.bitableRecords,
    provisionFailure: state.provisionFailure,
    messageFailure: state.messageFailure,
    failuresServed: state.failuresServed,
  }),
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

function bitable({ body, match, method }) {
  if (!match[2]) {
    return ok({ code: 0, msg: 'success', data: { items: [{ table_id: 'tbl_roster', name: '员工花名册' }] } })
  }
  if (method !== 'POST') {
    return { status: 405, payload: { error: 'method_not_allowed' } }
  }
  const record = { record_id: `rec_${state.bitableRecords.length + 1}`, fields: body.fields ?? {} }
  state.bitableRecords.push({ appToken: match[1], tableId: match[2], ...record })
  return ok({ code: 0, msg: 'success', data: { record } })
}

function getUser({ openId }) {
  const user = [...state.feishuUsers.values()].find((candidate) => candidate.open_id === openId)
  if (!user) {
    return { status: 400, payload: { code: 41050, msg: 'user not found' } }
  }
  return ok({ code: 0, msg: 'success', data: { user: { open_id: user.open_id, name: user.name, department_ids: user.department_ids, leader_user_id: user.leader_user_id ?? null, job_title: user.job_title ?? null, status: { is_frozen: user.is_frozen === true, is_resigned: false } } } })
}

function updateUser({ openId, body }) {
  const user = [...state.feishuUsers.values()].find((candidate) => candidate.open_id === openId)
  if (!user) {
    return { status: 400, payload: { code: 41050, msg: 'user not found' } }
  }
  if (body.department_ids) {
    const unknown = body.department_ids.find((id) => !state.departments.has(id))
    if (unknown) {
      return { status: 400, payload: { code: 40013, msg: `department ${unknown} not found` } }
    }
    user.department_ids = body.department_ids
  }
  for (const key of ['name', 'job_title', 'leader_user_id']) {
    if (body[key] !== undefined) {
      user[key] = body[key]
    }
  }
  if (body.status && body.status.is_frozen !== undefined) {
    user.is_frozen = body.status.is_frozen
  }
  return ok({ code: 0, msg: 'success', data: { user } })
}

function statusAllowed({ employee, body }) {
  const status = String(employee.recordInfo.employeeStatus)
  if (Array.isArray(body.empStatus) && body.empStatus.length > 0) {
    return body.empStatus.map(String).includes(status)
  }
  if (body.withDisabled) {
    return true
  }
  return ['1', '2', '3', '7'].includes(status)
}

function beisenTimeToEpoch(text) {
  return new Date(`${String(text).replace(' ', 'T')}+08:00`).getTime()
}

function userIdFor({ mobile, email }) {
  const match = [...state.feishuUsers.values()].find((user) => (mobile && user.mobile === mobile) || (email && user.email === email))
  return match ? { user_id: match.open_id } : {}
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
const FEISHU_TOKEN = 't-mock-tenant-token'
const HR_CHAT_ID = 'oc_hr_notice'

server.listen(port, () => {
  process.stdout.write(`mock beisen + feishu listening on http://127.0.0.1:${port}\n`)
})
