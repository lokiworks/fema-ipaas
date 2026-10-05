import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const port = Number(process.env.MOCK_PORT ?? 18904)
const base = `http://127.0.0.1:${port}`
const feishuBase = `${base}/feishu`
const beisenBase = `${base}/beisen`
const checks = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function check(name, run) {
  checks.push({ name, run })
}

async function http({ method = 'GET', url, body, headers = {} }) {
  const response = await fetch(url, { method, headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await response.text()
  let payload = text
  try {
    payload = JSON.parse(text)
  }
  catch {
    payload = text
  }
  return { status: response.status, payload, headers: Object.fromEntries(response.headers.entries()) }
}

const admin = (route, body) => http({ method: 'POST', url: `${base}${route}`, body })
const resetMock = async () => {
  await admin('/__admin/official-reset', {})
  await admin('/__admin/beisen-official-reset', {})
}

async function feishuToken(appId = 'cli_fid') {
  const response = await http({ method: 'POST', url: `${feishuBase}/open-apis/auth/v3/tenant_access_token/internal`, body: { app_id: appId, app_secret: 's' } })
  return response.payload.tenant_access_token
}

async function feishu({ method = 'GET', route, body, query = {}, token }) {
  const bearer = token ?? (await feishuToken())
  const search = new URLSearchParams(query).toString()
  return http({ method, url: `${feishuBase}/open-apis${route}${search ? `?${search}` : ''}`, body, headers: { authorization: `Bearer ${bearer}` } })
}

async function beisenToken() {
  const response = await http({ method: 'POST', url: `${beisenBase}/token`, body: { grant_type: 'client_credentials', app_key: 'k', app_secret: 's' } })
  return response.payload.access_token
}

async function beisen({ route, body }) {
  const token = await beisenToken()
  return http({ method: 'POST', url: `${beisenBase}/TenantBaseExternal/api/v5${route}`, body, headers: { authorization: `Bearer ${token}` } })
}

const code = (response) => response.payload.code
const create = (extra = {}) => feishu({ method: 'POST', route: '/contact/v3/users', query: { user_id_type: 'open_id', department_id_type: 'open_department_id' }, body: { name: '张三', mobile: '13800000001', department_ids: ['od-rd'], employee_type: 1, ...extra } })
const seedUser = (user) => admin('/__admin/official-users', { users: [{ name: 'S', mobile: '+8613900000000', department_ids: ['od-rd'], ...user }] })

check('feishu token: a wrong App Secret answers 10015 and a wrong App ID 10003 with HTTP 400', async () => {
  const wrong = await http({ method: 'POST', url: `${feishuBase}/open-apis/auth/v3/tenant_access_token/internal`, body: { app_id: 'cli', app_secret: 'wrong' } })
  const unknown = await http({ method: 'POST', url: `${feishuBase}/open-apis/auth/v3/tenant_access_token/internal`, body: { app_id: 'unknown', app_secret: 's' } })
  assert.deepEqual([wrong.status, code(wrong), unknown.status, code(unknown)], [400, 10015, 400, 10003])
})

check('feishu token: a cached token that Feishu has retired is answered 99991663, a missing one 99991661', async () => {
  const token = await feishuToken()
  await admin('/__admin/feishu-official', { expireToken: true })
  const stale = await feishu({ route: '/contact/v3/users/ou_x', token })
  const missing = await http({ url: `${feishuBase}/open-apis/contact/v3/users/ou_x` })
  assert.deepEqual([stale.status, code(stale), code(missing)], [400, 99991663, 99991661])
})

check('feishu batch_get_id: one entry per queried item, only a match carries user_id, resigned members need include_resigned', async () => {
  await seedUser({ mobile: '13800000001', email: 'a@example.com' })
  await seedUser({ mobile: '13800000002', is_resigned: true })
  const found = await feishu({ method: 'POST', route: '/contact/v3/users/batch_get_id', query: { user_id_type: 'open_id' }, body: { mobiles: ['13800000001', '13800000009', '13800000002'], emails: ['a@example.com'] } })
  const list = found.payload.data.user_list
  assert.equal(list.length, 4)
  assert.deepEqual(list.map((entry) => Boolean(entry.user_id)), [true, false, false, true])
  const withResigned = await feishu({ method: 'POST', route: '/contact/v3/users/batch_get_id', query: { user_id_type: 'open_id' }, body: { mobiles: ['13800000002'], include_resigned: true } })
  assert.equal(withResigned.payload.data.user_list[0].status.is_resigned, true)
})

check('feishu batch_get_id: a member outside the app contact scope is not returned', async () => {
  await seedUser({ mobile: '13800000001', department_ids: ['od-sales'] })
  await admin('/__admin/feishu-official', { scopeDepartments: ['od-rd'] })
  const response = await feishu({ method: 'POST', route: '/contact/v3/users/batch_get_id', query: { user_id_type: 'open_id' }, body: { mobiles: ['13800000001'] } })
  assert.equal(response.payload.data.user_list[0].user_id, undefined)
})

check('feishu create user: the documented validation errors', async () => {
  assert.equal(code(await create({ mobile: undefined })), 41010)
  assert.equal(code(await create({ mobile: '+41446681800' })), 44020)
  assert.equal(code(await create({ mobile: '+41446681800', email: 'x@example.com' })), 0)
  assert.equal(code(await create({ mobile: '13800000002', department_ids: ['od-none'] })), 41017)
  assert.equal(code(await create({ mobile: '13800000003', employee_type: 9 })), 41059)
})

check('feishu create user: duplicate mobile 41001, duplicate email 41002, one account per contact 41003 (HTTP 409)', async () => {
  assert.equal(code(await create({ mobile: '13800000001', email: 'one@example.com' })), 0)
  const mobile = await create({ mobile: '13800000001', email: 'two@example.com' })
  const email = await create({ mobile: '13800000002', email: 'one@example.com' })
  assert.deepEqual([mobile.status, code(mobile), email.status, code(email)], [400, 41001, 400, 41002])
  assert.equal(code(await create({ mobile: '13800000003', email: 'three@example.com' })), 0)
  const conflict = await create({ mobile: '13800000003', email: 'one@example.com' })
  assert.deepEqual([conflict.status, code(conflict)], [409, 41003])
})

check('feishu create user: a repeated client_token replays, the same token with other details is 40021', async () => {
  const token = '11111111-2222-4333-8444-555555555555'
  const send = (extra) => feishu({ method: 'POST', route: '/contact/v3/users', query: { user_id_type: 'open_id', department_id_type: 'open_department_id', client_token: token }, body: { name: '张三', mobile: '13800000001', department_ids: ['od-rd'], employee_type: 1, ...extra } })
  const first = await send({})
  const replay = await send({})
  const different = await send({ department_ids: ['od-hr'] })
  assert.equal(first.payload.data.user.open_id, replay.payload.data.user.open_id)
  assert.equal(code(different), 40021)
  assert.equal((await http({ url: `${base}/__admin/official-users` })).payload.users.length, 1)
})

check('feishu contact scope: a department outside the scope is 403 40004, a member outside it 41050, the root needs All members', async () => {
  await seedUser({ mobile: '13800000001', department_ids: ['od-sales'] })
  await admin('/__admin/feishu-official', { scopeDepartments: ['od-rd'] })
  const outsideDepartment = await create({ department_ids: ['od-hr'], mobile: '13800000005' })
  const root = await feishu({ route: '/contact/v3/users/find_by_department', query: { department_id: '0', page_size: '50' } })
  const openId = (await http({ url: `${base}/__admin/official-users` })).payload.users[0].open_id
  const member = await feishu({ route: `/contact/v3/users/${openId}` })
  assert.deepEqual([outsideDepartment.status, code(outsideDepartment), root.status, code(root), code(member)], [403, 40004, 403, 40004, 41050])
})

check('feishu patch user: only a top level is_frozen suspends, the status object of the response is ignored, nothing is deleted', async () => {
  await seedUser({ mobile: '13800000001' })
  const openId = (await http({ url: `${base}/__admin/official-users` })).payload.users[0].open_id
  const patch = (body) => feishu({ method: 'PATCH', route: `/contact/v3/users/${openId}`, query: { user_id_type: 'open_id' }, body })
  await patch({ status: { is_frozen: true } })
  assert.equal((await feishu({ route: `/contact/v3/users/${openId}` })).payload.data.user.status.is_frozen, false)
  await patch({ is_frozen: true })
  assert.equal((await feishu({ route: `/contact/v3/users/${openId}` })).payload.data.user.status.is_frozen, true)
  await patch({ is_frozen: false })
  assert.equal((await feishu({ route: `/contact/v3/users/${openId}` })).payload.data.user.status.is_frozen, false)
})

check('feishu patch user: resigned 42006, tenant creator 44036, unknown department 44035, self as leader 41030', async () => {
  await seedUser({ mobile: '13800000001', is_resigned: true })
  await seedUser({ mobile: '13800000002', is_tenant_manager: true })
  await seedUser({ mobile: '13800000003' })
  const users = (await http({ url: `${base}/__admin/official-users` })).payload.users
  const patch = (index, body) => feishu({ method: 'PATCH', route: `/contact/v3/users/${users[index].open_id}`, query: { user_id_type: 'open_id' }, body })
  assert.equal(code(await patch(0, { name: 'x' })), 42006)
  assert.equal(code(await patch(1, { is_frozen: true })), 44036)
  assert.equal(code(await patch(2, { department_ids: ['od-none'] })), 44035)
  assert.equal(code(await patch(2, { leader_user_id: users[2].open_id })), 41030)
})

check('feishu patch user: department and suspension changes can be limited to 1 per second with 429 and a reset header', async () => {
  await seedUser({ mobile: '13800000001' })
  const openId = (await http({ url: `${base}/__admin/official-users` })).payload.users[0].open_id
  await admin('/__admin/feishu-official', { patchMinIntervalMs: 1000 })
  const token = await feishuToken()
  const run = () => feishu({ method: 'PATCH', route: `/contact/v3/users/${openId}`, query: { user_id_type: 'open_id' }, body: { is_frozen: true }, token })
  assert.equal(code(await run()), 0)
  const limited = await run()
  assert.deepEqual([limited.status, code(limited), limited.headers['x-ogw-ratelimit-reset']], [429, 99991400, '1'])
})

check('feishu find_by_department: page_size above 50 is 40011, a bad token 40012, paging with has_more', async () => {
  await admin('/__admin/official-users', { users: Array.from({ length: 120 }, (_, index) => ({ name: `U${index}`, mobile: `+86139000${String(index).padStart(5, '0')}`, department_ids: ['od-rd'] })) })
  const page = (query) => feishu({ route: '/contact/v3/users/find_by_department', query: { department_id: 'od-rd', department_id_type: 'open_department_id', ...query } })
  assert.equal(code(await page({ page_size: '51' })), 40011)
  assert.equal(code(await page({ page_size: '50', page_token: 'garbage' })), 40012)
  const first = await page({ page_size: '50' })
  const second = await page({ page_size: '50', page_token: first.payload.data.page_token })
  const third = await page({ page_size: '50', page_token: second.payload.data.page_token })
  assert.deepEqual([first.payload.data.items.length, second.payload.data.items.length, third.payload.data.items.length, third.payload.data.has_more, third.payload.data.page_token], [50, 50, 20, false, undefined])
})

check('feishu messages: one message per uuid inside the hour, bot not in chat 230002, recipient outside availability 230013', async () => {
  const send = (extra, query = { receive_id_type: 'chat_id' }) => feishu({ method: 'POST', route: '/im/v1/messages', query, body: { receive_id: 'oc_hr_notice', msg_type: 'text', content: '{"text":"hi"}', ...extra } })
  const first = await send({ uuid: 'k1' })
  const again = await send({ uuid: 'k1' })
  const other = await send({ uuid: 'k2' })
  assert.equal(first.payload.data.message_id, again.payload.data.message_id)
  assert.notEqual(first.payload.data.message_id, other.payload.data.message_id)
  await admin('/__admin/feishu-official', { botNotInChats: ['oc_hr_notice'], unavailableRecipients: ['x@example.com'] })
  assert.equal(code(await send({})), 230002)
  assert.equal(code(await send({ receive_id: 'x@example.com' }, { receive_id_type: 'email' })), 230013)
  assert.equal(code(await send({}, { receive_id_type: 'nonsense' })), 230001)
})

check('feishu quota and keys: the monthly quota stops messages with 429 99991403 but not contact calls, a missing scope is 99991672, an IP allowlist 99991401', async () => {
  const send = () => feishu({ method: 'POST', route: '/im/v1/messages', query: { receive_id_type: 'chat_id' }, body: { receive_id: 'oc_hr_notice', msg_type: 'text', content: '{"text":"hi"}' } })
  await admin('/__admin/feishu-official', { quotaExhausted: true })
  const blocked = await send()
  assert.deepEqual([blocked.status, code(blocked)], [429, 99991403])
  assert.equal(code(await feishu({ route: '/contact/v3/scopes' })), 0)
  await admin('/__admin/feishu-official', { quotaExhausted: false, missingScopes: ['contact:contact'] })
  const denied = await create({ mobile: '13800000007' })
  assert.equal(code(denied), 99991672)
  assert.match(denied.payload.msg, /contact:contact/)
  await admin('/__admin/feishu-official', { missingScopes: [], ipDenied: true })
  assert.equal(code(await send()), 99991401)
})

check('feishu bitable: bad client_token 1254037, unknown column answered with HTTP 200 and 1254045, a repeated client_token adds one row, search pages', async () => {
  const route = '/bitable/v1/apps/bas1/tables/tbl_roster/records'
  const add = (query, fields) => feishu({ method: 'POST', route, query, body: { fields } })
  const bad = await add({ client_token: 'nope' }, { 工号: 'E1' })
  assert.deepEqual([bad.status, code(bad)], [400, 1254037])
  await admin('/__admin/feishu-official', { bitableFields: ['工号'] })
  const unknown = await add({}, { 姓名: 'x' })
  assert.deepEqual([unknown.status, code(unknown)], [200, 1254045])
  const token = '11111111-2222-4333-8444-555555555555'
  const first = await add({ client_token: token }, { 工号: 'E1' })
  const replay = await add({ client_token: token }, { 工号: 'E1' })
  assert.equal(first.payload.data.record.record_id, replay.payload.data.record.record_id)
  await Promise.all([2, 3, 4].map((index) => add({}, { 工号: `E${index}` })))
  const page = await feishu({ method: 'POST', route: `${route}/search`, query: { page_size: '3' }, body: {} })
  assert.deepEqual([page.payload.data.items.length, page.payload.data.has_more, page.payload.data.total], [3, true, 4])
  const filtered = await feishu({ method: 'POST', route: `${route}/search`, query: { page_size: '10' }, body: { filter: { conjunction: 'and', conditions: [{ field_name: '工号', operator: 'is', value: ['E3'] }] } } })
  assert.equal(filtered.payload.data.items.length, 1)
})

const employee = (id, extra = {}) => ({ employeeInfo: { userID: id, name: `E${id}`, email: `e${id}@example.com` }, recordInfo: { userID: id, jobNumber: `E${id}`, oIdDepartment: 20301, employeeStatus: '2', approvalStatus: 4 }, ...extra })
const window = (extra = {}) => ({ startTime: new Date(Date.now() - 3600_000 + 8 * 3600_000).toISOString().slice(0, 19), stopTime: new Date(Date.now() + 3600_000 + 8 * 3600_000).toISOString().slice(0, 19), timeWindowQueryType: 2, empStatus: [2, 3, 7], capacity: 300, ...extra })

check('beisen time window: the code is the string "200", the last page says isLastData, a page never exceeds 300', async () => {
  await admin('/__admin/employees', { records: Array.from({ length: 5 }, (_, index) => employee(index + 1)) })
  const first = await beisen({ route: '/Employee/GetByTimeWindow', body: window({ capacity: 3 }) })
  assert.deepEqual([first.payload.code, first.payload.data.length, first.payload.isLastData, first.payload.total], ['200', 3, false, 5])
  const second = await beisen({ route: '/Employee/GetByTimeWindow', body: window({ capacity: 3, scrollId: first.payload.scrollId }) })
  assert.deepEqual([second.payload.data.length, second.payload.isLastData], [2, true])
  const tooMany = await beisen({ route: '/Employee/GetByTimeWindow', body: window({ capacity: 301 }) })
  assert.equal(tooMany.payload.code, '417')
})

check('beisen time window: a scroll older than the 10 second limit finds nothing, silently', async () => {
  await admin('/__admin/employees', { records: Array.from({ length: 4 }, (_, index) => employee(index + 1)) })
  await admin('/__admin/beisen-official', { scrollTtlMs: 100 })
  const first = await beisen({ route: '/Employee/GetByTimeWindow', body: window({ capacity: 2 }) })
  await sleep(250)
  const late = await beisen({ route: '/Employee/GetByTimeWindow', body: window({ capacity: 2, scrollId: first.payload.scrollId }) })
  assert.deepEqual([first.payload.data.length, late.payload.data.length], [2, 0])
})

check('beisen time window: parameter errors are HTTP 200 with the string code "417" and a null data', async () => {
  const backwards = await beisen({ route: '/Employee/GetByTimeWindow', body: window({ startTime: '2026-10-02T00:00:00', stopTime: '2026-10-01T00:00:00' }) })
  const tooWide = await beisen({ route: '/Employee/GetByTimeWindow', body: window({ startTime: '2026-01-01T00:00:00', stopTime: '2026-06-01T00:00:00' }) })
  assert.deepEqual([backwards.status, backwards.payload.code, backwards.payload.data], [200, '417', null])
  assert.match(backwards.payload.message, /StartTime>=StopTime/)
  assert.deepEqual([tooWide.payload.code, tooWide.payload.message], ['417', '只支持查询90天范围内的数据，请分段查询'])
})

check('beisen time window: timeWindowQueryType 2 leaves out changes made by the nightly system job, 1 includes them', async () => {
  await admin('/__admin/employees', { records: [employee(1), employee(2, { systemOnly: true })] })
  const business = await beisen({ route: '/Employee/GetByTimeWindow', body: window({ timeWindowQueryType: 2 }) })
  const any = await beisen({ route: '/Employee/GetByTimeWindow', body: window({ timeWindowQueryType: 1 }) })
  assert.deepEqual([business.payload.data.length, any.payload.data.length], [1, 2])
})

check('beisen time window: a change is not visible until the index catches up', async () => {
  await admin('/__admin/beisen-official', { indexLagMs: 400 })
  await admin('/__admin/employees', { records: [employee(1)] })
  const early = await beisen({ route: '/Employee/GetByTimeWindow', body: window() })
  await sleep(500)
  const late = await beisen({ route: '/Employee/GetByTimeWindow', body: window() })
  assert.deepEqual([early.payload.data.length, late.payload.data.length], [0, 1])
})

check('beisen time window: every record carries its modification times, so a second edit of the same employee is a different record', async () => {
  await admin('/__admin/employees', { records: [employee(1)] })
  const first = await beisen({ route: '/Employee/GetByTimeWindow', body: window() })
  await sleep(1200)
  await admin('/__admin/employees', { records: [employee(1)] })
  const second = await beisen({ route: '/Employee/GetByTimeWindow', body: window() })
  const stamp = (response, index) => response.payload.data[index].recordInfo.businessModifiedTime
  assert.match(stamp(first, 0), /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  assert.equal(second.payload.data.length, 2)
  assert.notEqual(stamp(second, 0), stamp(second, 1))
})

check('beisen organization and lookup endpoints use the documented field names and errors', async () => {
  await admin('/__admin/employees', { records: [employee(1), employee(2, { recordInfo: { userID: 2, jobNumber: 'E2', oIdDepartment: 20302, employeeStatus: '2', approvalStatus: 4 } })] })
  const children = await beisen({ route: '/Organization/GetSubOrganizations', body: { oId: 900100000, isWithDisable: false, isWithSelf: false } })
  assert.deepEqual(children.payload.data.map((org) => org.oId), [20301, 20302])
  const legacy = await beisen({ route: '/Organization/GetSubOrganizations', body: { organizationId: '900100000' } })
  assert.equal(legacy.payload.code, '417')
  const tree = await beisen({ route: '/Organization/GetSubOrganizationTrees', body: { oIds: [900100000] } })
  assert.deepEqual(tree.payload.data.map((org) => org.oId).sort(), [20301, 20302, 20303])
  const wrongField = await beisen({ route: '/Employee/GetServiceInfoByIds', body: { userIds: [1] } })
  assert.match(wrongField.payload.message, /Ids is null/)
  const records = await beisen({ route: '/Employee/GetServiceInfoByIds', body: { oIds: [1, 2] } })
  assert.equal(records.payload.data.length, 2)
  const upper = await beisen({ route: '/Employee/GetUserIDByEmail', body: { email: 'E1@Example.com' } })
  const lower = await beisen({ route: '/Employee/GetUserIDByEmail', body: { email: 'e1@example.com' } })
  const invalid = await beisen({ route: '/Employee/GetUserIDByEmail', body: { email: 'liuhofd' } })
  assert.deepEqual([upper.payload.data, lower.payload.data, invalid.payload.code], [null, 1, '417'])
})

check('beisen roster by organization: root includes every unit below, a unit includes only its own, scrolling to the end', async () => {
  await admin('/__admin/employees', { records: Array.from({ length: 5 }, (_, index) => employee(index + 1, { recordInfo: { userID: index + 1, jobNumber: `E${index + 1}`, oIdDepartment: index < 3 ? 20301 : 20302, employeeStatus: '2', approvalStatus: 4 } })) })
  const all = await beisen({ route: '/Employee/GetEmployeeOfOrganization', body: { orgOId: 900100000, includeSubOrg: true, capacity: 2, empStatus: [2, 3, 7] } })
  assert.deepEqual([all.payload.data.length, all.payload.total, all.payload.isLastData], [2, 5, false])
  const own = await beisen({ route: '/Employee/GetEmployeeOfOrganization', body: { orgOId: 20301, includeSubOrg: false, capacity: 300, empStatus: [2, 3, 7] } })
  assert.equal(own.payload.total, 3)
  const missing = await beisen({ route: '/Employee/GetEmployeeOfOrganization', body: { orgId: 1 } })
  assert.equal(missing.payload.code, '417')
})

function runReal(extra = {}) {
  const result = spawnSync('node', [path.join(here, 'run-real.mjs')], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      FEMA_REAL_FEISHU_APP_ID: 'cli_real',
      FEMA_REAL_FEISHU_APP_SECRET: 's',
      FEMA_REAL_FEISHU_BASE_URL: feishuBase,
      FEMA_REAL_FEISHU_TEST_DEPARTMENT_ID: 'od-rd',
      FEMA_REAL_FEISHU_TEST_MOBILE: '13900001111',
      FEMA_REAL_FEISHU_TEST_CHAT_ID: 'oc_hr_notice',
      FEMA_REAL_ONLY: 'feishu',
      ...extra,
    },
  })
  return { output: `${result.stdout}${result.stderr}`, status: result.status }
}

check('run-real: without the confirmation variable it reads only, creates nothing and says it verified nothing real', async () => {
  const { output, status } = runReal()
  assert.equal(status, 0)
  assert.match(output, /\[SKIP\] feishu\.writes/)
  assert.match(output, /Writes: OFF/)
  assert.match(output, /Verified against the real platforms: NOTHING \(mock mode\)/)
  assert.equal((await http({ url: `${base}/__admin/official-users` })).payload.users.length, 0)
})

check('run-real: with the confirmation it creates and suspends exactly one prefixed test account and posts one message', async () => {
  const { output, status } = runReal({ FEMA_REAL_CONFIRM_WRITE: 'create-test-account-and-send-test-message' })
  assert.equal(status, 0)
  const users = (await http({ url: `${base}/__admin/official-users` })).payload.users
  assert.deepEqual(users.map((user) => [user.name, user.is_frozen]), [['FEMA验收-验收账号', true]])
  assert.match(output, /\[PASS\] feishu\.provision-repeat/)
  assert.match(output, /\[PASS\] feishu\.suspend /)
  const state = (await http({ url: `${base}/__admin/state` })).payload
  assert.equal(state.messages.length, 1)
})

check('run-real: it refuses to suspend an account that is not named with the test prefix, so a real employee is never touched', async () => {
  await seedUser({ mobile: '13900001111', name: '真实员工', department_ids: ['od-rd'] })
  const { output, status } = runReal({ FEMA_REAL_CONFIRM_WRITE: 'create-test-account-and-send-test-message' })
  const users = (await http({ url: `${base}/__admin/official-users` })).payload.users
  assert.equal(users.length, 1)
  assert.equal(users[0].is_frozen, false)
  assert.match(output, /refusing to suspend/)
  assert.equal(status, 0)
})

check('run-real: a missing permission fails the step, names the permission and exits non-zero', async () => {
  await admin('/__admin/feishu-official', { missingScopes: ['contact:contact'] })
  const { output, status } = runReal({ FEMA_REAL_CONFIRM_WRITE: 'create-test-account-and-send-test-message' })
  assert.equal(status, 1)
  assert.match(output, /\[FAIL\] feishu\.provision/)
  assert.match(output, /lacks a permission \(contact:contact\)/)
})

check('run-real: a wrong App Secret, a blocked IP and a used-up quota are each named', async () => {
  const wrongSecret = runReal({ FEMA_REAL_FEISHU_APP_SECRET: 'wrong' })
  assert.match(wrongSecret.output, /App Secret is wrong/)
  await admin('/__admin/feishu-official', { ipDenied: true })
  const blocked = runReal({ FEMA_REAL_FEISHU_APP_ID: 'cli_ip' })
  assert.match(blocked.output, /IP allowlist/)
  await admin('/__admin/feishu-official', { ipDenied: false, quotaExhausted: true })
  const quota = runReal({ FEMA_REAL_FEISHU_APP_ID: 'cli_quota', FEMA_REAL_FEISHU_TEST_CHAT_ID: 'oc_hr_notice', FEMA_REAL_CONFIRM_WRITE: 'create-test-account-and-send-test-message' })
  assert.match(quota.output, /monthly API quota is used up/)
})

const require = createRequire(import.meta.url)
const feishuDist = path.join(repoRoot, 'packages/connectors/community/feishu/dist/src')
const beisenDist = path.join(repoRoot, 'packages/connectors/community/beisen/dist/src')

check('connector feishu provision_user against the mock: two runs make one account, the contact scope error names the fix', async () => {
  process.env.FEMA_FEISHU_BASE_URL = feishuBase
  const { feishuContacts } = require(path.join(feishuDist, 'lib/common/contacts.js'))
  const auth = { type: 'CUSTOM_AUTH', props: { domain: 'https://open.feishu.cn', appId: 'cli_conn', appSecret: 's' } }
  const input = { name: '张三', mobile: '13800000001', departmentId: 'od-rd', employeeType: 1 }
  const first = await feishuContacts.provisionUser({ auth, input })
  const second = await feishuContacts.provisionUser({ auth, input })
  assert.deepEqual([first.created, second.created, second.open_id], [true, false, first.open_id])
  await admin('/__admin/feishu-official', { scopeDepartments: ['od-rd'] })
  await assert.rejects(feishuContacts.provisionUser({ auth, input: { ...input, mobile: '13800000002', departmentId: 'od-hr' } }), /contact scope.*Feishu error 40004/)
})

check('connector feishu suspend_user against the mock really freezes the account and reads it back', async () => {
  process.env.FEMA_FEISHU_BASE_URL = feishuBase
  const { feishuContacts } = require(path.join(feishuDist, 'lib/common/contacts.js'))
  const auth = { type: 'CUSTOM_AUTH', props: { domain: 'https://open.feishu.cn', appId: 'cli_conn2', appSecret: 's' } }
  const created = await feishuContacts.provisionUser({ auth, input: { name: '李四', mobile: '13800000003', departmentId: 'od-rd', employeeType: 1 } })
  const result = await feishuContacts.setUserSuspended({ auth, input: { openId: created.open_id, suspended: true } })
  assert.deepEqual([result.is_frozen, result.confirmed], [true, true])
  const users = (await http({ url: `${base}/__admin/official-users` })).payload.users
  assert.equal(users.find((user) => user.open_id === created.open_id).is_frozen, true)
})

check('connector feishu keeps working when the tenant token is retired between two calls', async () => {
  process.env.FEMA_FEISHU_BASE_URL = feishuBase
  const { feishuContacts } = require(path.join(feishuDist, 'lib/common/contacts.js'))
  const auth = { type: 'CUSTOM_AUTH', props: { domain: 'https://open.feishu.cn', appId: 'cli_conn3', appSecret: 's' } }
  const created = await feishuContacts.provisionUser({ auth, input: { name: '王五', mobile: '13800000004', departmentId: 'od-rd', employeeType: 1 } })
  await admin('/__admin/feishu-official', { expireToken: true })
  const read = await feishuContacts.getUser({ auth, input: { openId: created.open_id } })
  assert.equal(read.open_id, created.open_id)
})

check('connector feishu turns the monthly quota into a blocked-until error and an unknown account into a documented code', async () => {
  process.env.FEMA_FEISHU_BASE_URL = feishuBase
  const { feishuCommon } = require(path.join(feishuDist, 'lib/common/index.js'))
  const { blockedUntilMarker } = require(path.join(repoRoot, 'packages/connectors/community/feishu/node_modules/@fema-ipaas/connector-sdk'))
  const auth = { type: 'CUSTOM_AUTH', props: { domain: 'https://open.feishu.cn', appId: 'cli_conn4', appSecret: 's' } }
  await admin('/__admin/feishu-official', { quotaExhausted: true })
  const error = await feishuCommon.callApi({ auth, method: 'GET', path: '/open-apis/im/v1/chats' }).then(() => null, (failure) => failure)
  assert.match(error.message, /^HTTP 429: .*Feishu error 99991403/)
  assert.ok(blockedUntilMarker.parse(error.message) instanceof Date)
})

check('connector beisen trigger does not lose a change that became visible late, and reports nothing twice', async () => {
  process.env.FEMA_BEISEN_BASE_URL = beisenBase
  const { employeeChanged } = require(path.join(beisenDist, 'lib/triggers/employee-changed.js'))
  const data = new Map()
  const store = { get: async (key) => (data.has(key) ? data.get(key) : null), put: async (key, value) => { data.set(key, value); return value }, delete: async (key) => { data.delete(key) } }
  const context = { auth: { type: 'CUSTOM_AUTH', props: { appKey: 'k', appSecret: 's' } }, store, files: {}, isRepublish: false, propsValue: { statusScope: 'ACTIVE', queryType: 2, timezone: 'Asia/Shanghai' } }
  await employeeChanged.onEnable(context)
  data.set('lastPoll', Date.now() - 60_000)
  data.set('enabledAt', Date.now() - 60_000)
  await admin('/__admin/employees', { records: [employee(1, { visibleDelayMs: 600 }), employee(2, { visibleDelayMs: 0 })] })
  const first = await employeeChanged.run(context)
  assert.deepEqual(first.map((record) => record.employeeInfo.userID), [2])
  await sleep(800)
  const second = await employeeChanged.run(context)
  assert.deepEqual(second.map((record) => record.employeeInfo.userID), [1])
  const third = await employeeChanged.run(context)
  assert.deepEqual(third, [])
})

check('connector beisen trigger reports a second edit of the same employee, and still nothing twice', async () => {
  process.env.FEMA_BEISEN_BASE_URL = beisenBase
  const { employeeChanged } = require(path.join(beisenDist, 'lib/triggers/employee-changed.js'))
  const data = new Map()
  const store = { get: async (key) => (data.has(key) ? data.get(key) : null), put: async (key, value) => { data.set(key, value); return value }, delete: async (key) => { data.delete(key) } }
  const context = { auth: { type: 'CUSTOM_AUTH', props: { appKey: 'k', appSecret: 's' } }, store, files: {}, isRepublish: false, propsValue: { statusScope: 'ACTIVE', queryType: 2, timezone: 'Asia/Shanghai' } }
  await employeeChanged.onEnable(context)
  data.set('lastPoll', Date.now() - 60_000)
  data.set('enabledAt', Date.now() - 60_000)
  await admin('/__admin/employees', { records: [employee(1)] })
  assert.equal((await employeeChanged.run(context)).length, 1)
  assert.equal((await employeeChanged.run(context)).length, 0)
  await sleep(1200)
  await admin('/__admin/employees', { records: [employee(1)] })
  assert.equal((await employeeChanged.run(context)).length, 1)
  assert.equal((await employeeChanged.run(context)).length, 0)
})

async function main() {
  const child = spawn('node', [process.env.FIDELITY_MOCK_FILE ?? path.join(here, 'mock-server.mjs')], { env: { ...process.env, MOCK_PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] })
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => String(chunk).includes('listening') && resolve())
    child.on('exit', (exitCode) => reject(new Error(`the mock server exited with ${exitCode}, is port ${port} already in use?`)))
  })
  await ready
  let failed = 0
  for (const { name, run } of checks) {
    await resetMock()
    try {
      await run()
      process.stdout.write(`PASS  ${name}\n`)
    }
    catch (error) {
      failed += 1
      process.stdout.write(`FAIL  ${name}\n      ${error instanceof Error ? error.message.split('\n').slice(0, 6).join('\n      ') : String(error)}\n`)
    }
  }
  child.kill()
  process.stdout.write(`\n${checks.length - failed}/${checks.length} checks passed\n`)
  process.exit(failed === 0 ? 0 : 1)
}

await main()
