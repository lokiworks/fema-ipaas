import { createServer } from 'node:http'

const port = Number(process.env.MOCK_PORT ?? 18900)

const state = {
  employees: [],
  departments: new Set(['od-rd', 'od-hr', 'od-sales']),
  feishuUsers: new Map(),
  createdByClientToken: new Map(),
  createCalls: 0,
  messages: [],
  provisionFailure: null,
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  const body = await readJson(req)
  const route = `${req.method} ${url.pathname}`
  const handler = ROUTES[route]
  if (!handler) {
    return send(res, 404, { error: 'not_found', path: url.pathname })
  }
  const { status, payload } = handler({ body, query: url.searchParams, headers: req.headers })
  return send(res, status, payload)
})

const ROUTES = {
  'POST /beisen/token': ({ body }) => {
    if (body.app_key === 'wrong') {
      return ok({ error: 'invalid_client', error_description: 'app_key or app_secret is wrong', error_code: '40001' })
    }
    return ok({ access_token: BEISEN_TOKEN, expires_in: 7200, token_type: 'bearer' })
  },
  'POST /beisen/TenantBasePublicApiV2/v2/employee/timewindow/search': ({ body, headers }) => {
    if (headers.authorization !== `Bearer ${BEISEN_TOKEN}`) {
      return ok({ error: 'invalid_token', error_description: 'access_token is invalid', error_code: '40003' })
    }
    const from = shanghaiToEpoch(body.startTime)
    const to = shanghaiToEpoch(body.stopTime)
    const inWindow = state.employees.filter((employee) => toSecond(employee.changedAt) > from && toSecond(employee.changedAt) <= to)
    const offset = body.scrollId ? Number(body.scrollId) : 0
    const capacity = Math.min(Number(body.capacity ?? 100), 100)
    const page = inWindow.slice(offset, offset + capacity)
    const next = offset + capacity < inWindow.length ? String(offset + capacity) : undefined
    return ok({ data: page.map(({ changedAt, ...record }) => record), ...(next ? { scrollId: next } : {}) })
  },
  'POST /feishu/open-apis/auth/v3/tenant_access_token/internal': ({ body }) => {
    if (body.app_secret === 'wrong') {
      return ok({ code: 99991663, msg: 'app secret invalid' })
    }
    return ok({ code: 0, msg: 'ok', tenant_access_token: FEISHU_TOKEN, expire: 7200 })
  },
  'POST /feishu/open-apis/contact/v3/users/batch_get_id': ({ body }) => {
    const mobiles = (body.mobiles ?? []).map((mobile) => ({ mobile, ...userIdFor({ mobile }) }))
    const emails = (body.emails ?? []).map((email) => ({ email, ...userIdFor({ email }) }))
    return ok({ code: 0, msg: 'success', data: { user_list: [...mobiles, ...emails] } })
  },
  'POST /feishu/open-apis/contact/v3/users': ({ body, query }) => {
    state.createCalls += 1
    if (state.provisionFailure) {
      return { status: 400, payload: { code: state.provisionFailure.code, msg: state.provisionFailure.msg } }
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
  'POST /feishu/open-apis/im/v1/messages': ({ body }) => {
    const message = { message_id: `om_${state.messages.length + 1}`, chat_id: body.receive_id, msg_type: body.msg_type, content: body.content, create_time: String(Date.now()) }
    state.messages.push(message)
    return ok({ code: 0, msg: 'success', data: message })
  },
  'POST /__admin/employees': ({ body }) => {
    const changedAt = Date.now()
    const records = (body.records ?? []).map((record) => ({ ...record, changedAt }))
    state.employees.push(...records)
    return ok({ added: records.length })
  },
  'POST /__admin/feishu-failure': ({ body }) => {
    state.provisionFailure = body.code ? { code: body.code, msg: body.msg ?? 'mock failure' } : null
    return ok({ provisionFailure: state.provisionFailure })
  },
  'GET /__admin/state': () => ok({
    feishuUsers: [...state.feishuUsers.values()],
    createCalls: state.createCalls,
    messages: state.messages,
    provisionFailure: state.provisionFailure,
  }),
}

function userIdFor({ mobile, email }) {
  const match = [...state.feishuUsers.values()].find((user) => (mobile && user.mobile === mobile) || (email && user.email === email))
  return match ? { user_id: match.open_id } : {}
}

function toSecond(epochMs) {
  return Math.floor(epochMs / 1000) * 1000
}

function shanghaiToEpoch(text) {
  return new Date(`${String(text).replace(' ', 'T')}+08:00`).getTime()
}

function ok(payload) {
  return { status: 200, payload }
}

function send(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
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

const BEISEN_TOKEN = 'beisen-mock-token'
const FEISHU_TOKEN = 't-mock-tenant-token'
const HR_CHAT_ID = 'oc_hr_notice'

server.listen(port, () => {
  process.stdout.write(`mock beisen + feishu listening on http://127.0.0.1:${port}\n`)
})
