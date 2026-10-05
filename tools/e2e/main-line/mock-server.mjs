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
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`)
  const body = await readJson(req)
  const route = `${req.method} ${url.pathname}`
  const handler = feishuOfficial.dynamicHandlerFor({ method: req.method ?? 'GET', pathname: url.pathname }) ?? ROUTES[route]
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
Object.assign(ROUTES, feishuOfficial.routes(), beisenOfficial.routes())

server.listen(port, () => {
  process.stdout.write(`mock beisen + feishu listening on http://127.0.0.1:${port}\n`)
})
