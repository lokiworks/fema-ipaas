import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const env = process.env
const WRITE_CONFIRMATION = 'create-test-account-and-send-test-message'
const config = {
  only: env.FEMA_REAL_ONLY ?? '',
  prefix: env.FEMA_REAL_TEST_PREFIX ?? 'FEMA验收-',
  confirmed: env.FEMA_REAL_CONFIRM_WRITE === WRITE_CONFIRMATION,
  feishu: {
    appId: env.FEMA_REAL_FEISHU_APP_ID ?? '',
    appSecret: env.FEMA_REAL_FEISHU_APP_SECRET ?? '',
    domain: env.FEMA_REAL_FEISHU_DOMAIN === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn',
    baseUrl: env.FEMA_REAL_FEISHU_BASE_URL ?? '',
    departmentId: env.FEMA_REAL_FEISHU_TEST_DEPARTMENT_ID ?? '',
    mobile: env.FEMA_REAL_FEISHU_TEST_MOBILE ?? '',
    email: env.FEMA_REAL_FEISHU_TEST_EMAIL ?? '',
    chatId: env.FEMA_REAL_FEISHU_TEST_CHAT_ID ?? '',
    bitableAppToken: env.FEMA_REAL_FEISHU_BITABLE_APP_TOKEN ?? '',
    bitableTableId: env.FEMA_REAL_FEISHU_BITABLE_TABLE_ID ?? '',
    bitableTextField: env.FEMA_REAL_FEISHU_BITABLE_TEXT_FIELD ?? '',
    allowRoot: env.FEMA_REAL_ALLOW_ROOT === 'yes',
  },
  beisen: {
    appKey: env.FEMA_REAL_BEISEN_APP_KEY ?? '',
    appSecret: env.FEMA_REAL_BEISEN_APP_SECRET ?? '',
    baseUrl: env.FEMA_REAL_BEISEN_BASE_URL ?? '',
    rootOId: env.FEMA_REAL_BEISEN_ROOT_OID ?? '',
    testEmail: env.FEMA_REAL_BEISEN_TEST_EMAIL ?? '',
  },
  mockAdminUrl: env.FEMA_REAL_MOCK_ADMIN_URL ?? '',
}
const isMock = config.feishu.baseUrl !== '' || config.beisen.baseUrl !== ''
const results = []
const requestLog = []

if (config.feishu.baseUrl) {
  env.FEMA_FEISHU_BASE_URL = config.feishu.baseUrl
}
if (config.beisen.baseUrl) {
  env.FEMA_BEISEN_BASE_URL = config.beisen.baseUrl
}

const modules = await loadModules()
instrumentHttp({ httpClient: modules.httpClient })
printBanner()

if (config.mockAdminUrl) {
  await seedMock()
}
if (config.only !== 'beisen') {
  await runFeishu()
}
if (config.only !== 'feishu') {
  await runBeisen()
}
printSummary()
process.exit(results.some((result) => result.status === 'FAIL') ? 1 : 0)

async function runFeishu() {
  const { appId, appSecret, domain } = config.feishu
  if (!appId || !appSecret) {
    return skipGroup({ group: 'feishu', reason: 'FEMA_REAL_FEISHU_APP_ID and FEMA_REAL_FEISHU_APP_SECRET are not set' })
  }
  const auth = { type: 'CUSTOM_AUTH', props: { domain, appId, appSecret } }
  const { feishuContacts, feishuCommon } = modules
  const shared = {}

  const tokenStep = await step({
    id: 'feishu.token',
    title: 'Get a tenant_access_token',
    run: async () => {
      await feishuCommon.obtainTenantAccessToken(auth.props)
      return 'token issued'
    },
    diagnose: diagnoseFeishu,
  })
  if (tokenStep.status !== 'PASS') {
    return skipGroup({ group: 'feishu after the token step', reason: 'no token, nothing else can run' })
  }

  await step({
    id: 'feishu.scope',
    title: 'Read the contact permission scope of the app',
    run: async () => {
      const data = await feishuCommon.callApi({ auth, method: 'GET', path: '/open-apis/contact/v3/scopes', queryParams: { user_id_type: 'open_id', department_id_type: 'open_department_id' } })
      shared.scopeDepartments = data.department_ids ?? []
      return `${shared.scopeDepartments.length} department(s) and ${(data.user_ids ?? []).length} member(s) listed in the scope`
    },
    diagnose: diagnoseFeishu,
    softFail: true,
  })

  const parentDepartmentId = config.feishu.departmentId || '0'
  await step({
    id: 'feishu.departments',
    title: config.feishu.departmentId ? 'List the sub-departments of the test department (read)' : 'List all departments from the company root (read, needs the All members scope)',
    run: async () => {
      const departments = await feishuContacts.listDepartments({ auth, input: { parentDepartmentId, includeAllLevels: true, maxItems: 300 } })
      return `${departments.length} department(s) below ${parentDepartmentId}`
    },
    diagnose: diagnoseFeishu,
    softFail: !config.feishu.departmentId,
  })

  if (config.feishu.departmentId) {
    await step({
      id: 'feishu.members',
      title: 'List the members of the test department (read)',
      run: async () => {
        const members = await feishuContacts.listDepartmentUsers({ auth, input: { departmentId: config.feishu.departmentId, includeSubDepartments: false, maxItems: 200 } })
        return `${members.length} member(s), ${members.filter((member) => member.is_frozen).length} suspended`
      },
      diagnose: diagnoseFeishu,
    })
  }

  if (config.feishu.mobile) {
    await step({
      id: 'feishu.find',
      title: 'Look the test mobile up before writing anything (read)',
      run: async () => {
        const found = await feishuContacts.lookupUser({ auth, mobile: config.feishu.mobile, email: config.feishu.email || undefined, includeResigned: true })
        shared.existing = found
        return found ? `already held by ${found.openId}${found.isResigned ? ' (resigned)' : ''}` : 'nobody holds it yet'
      },
      diagnose: diagnoseFeishu,
    })
  }

  const writePlan = writePrerequisites()
  if (!writePlan.ok) {
    skip({ id: 'feishu.writes', title: 'Create a test account, suspend it, send a test message', reason: writePlan.reason })
    return
  }
  await runFeishuWrites({ auth, shared })
}

function writePrerequisites() {
  if (!config.confirmed) {
    return { ok: false, reason: `writes are off: set FEMA_REAL_CONFIRM_WRITE=${WRITE_CONFIRMATION} to allow creating one test account, suspending it and sending one test message` }
  }
  const { departmentId, mobile, email, allowRoot } = config.feishu
  if (!departmentId || !mobile) {
    return { ok: false, reason: 'FEMA_REAL_FEISHU_TEST_DEPARTMENT_ID and FEMA_REAL_FEISHU_TEST_MOBILE are required for the write steps' }
  }
  if (departmentId === '0' && !allowRoot) {
    return { ok: false, reason: 'the test department is the company root; use a dedicated test department, or set FEMA_REAL_ALLOW_ROOT=yes if you really mean it' }
  }
  if (!mobile.replace(/[\s-]/g, '').startsWith('+') && !/^1\d{10}$/.test(mobile.replace(/[\s-]/g, ''))) {
    return { ok: false, reason: 'FEMA_REAL_FEISHU_TEST_MOBILE must be an 11-digit mainland number or start with + and the country code' }
  }
  if (/^\+(?!86)/.test(mobile.replace(/[\s-]/g, '')) && !email) {
    return { ok: false, reason: 'a mobile outside mainland China needs FEMA_REAL_FEISHU_TEST_EMAIL as well' }
  }
  return { ok: true }
}

async function runFeishuWrites({ auth, shared }) {
  const { feishuContacts, actions } = modules
  const accountName = `${config.prefix}验收账号`
  const input = { name: accountName, mobile: config.feishu.mobile, departmentId: config.feishu.departmentId, employeeType: 1, ...(config.feishu.email ? { email: config.feishu.email } : {}), jobTitle: 'FEMA acceptance test' }
  const state = {}

  const provision = await step({
    id: 'feishu.provision',
    title: 'Provision the test account (write)',
    run: async () => {
      const result = await feishuContacts.provisionUser({ auth, input })
      state.openId = result.open_id
      state.created = result.created
      return `${result.created ? 'created' : 'reused the existing account'} ${result.open_id}`
    },
    diagnose: diagnoseFeishu,
  })
  if (provision.status !== 'PASS') {
    return
  }

  await step({
    id: 'feishu.provision-repeat',
    title: 'Provision again, it must find the account instead of creating a second one',
    run: async () => {
      const result = await feishuContacts.provisionUser({ auth, input })
      assertThat({ condition: result.created === false && result.open_id === state.openId, message: `expected created=false and ${state.openId}, got created=${result.created} open_id=${result.open_id}` })
      return `created=false matched_by=${result.matched_by}`
    },
    diagnose: diagnoseFeishu,
  })

  const readBack = await step({
    id: 'feishu.get',
    title: 'Read the account back (read)',
    run: async () => {
      const user = await feishuContacts.getUser({ auth, input: { openId: state.openId, departmentId: config.feishu.departmentId } })
      state.user = user
      assertThat({ condition: user.name === accountName || state.created === false, message: `the name is ${user.name}, expected ${accountName}` })
      return `name=${user.name} departments=${user.department_ids.join(',')} is_frozen=${user.is_frozen}`
    },
    diagnose: diagnoseFeishu,
  })

  const carriesPrefix = readBack.status === 'PASS' && typeof state.user?.name === 'string' && state.user.name.startsWith(config.prefix)
  if (!carriesPrefix) {
    const unreadable = readBack.status === 'PASS' && (state.user?.name ?? null) === null
    skip({
      id: 'feishu.suspend',
      title: 'Suspend the test account (write)',
      reason: unreadable
        ? `refusing to suspend ${state.openId}: its name could not be read back, the app probably lacks a read permission such as contact:contact:readonly_as_app`
        : `refusing to suspend ${state.openId}: its name does not start with ${config.prefix}, so it may be a real employee. Pick another test mobile.`,
    })
  }
  else {
    await step({
      id: 'feishu.suspend',
      title: 'Suspend the test account, never delete it (write)',
      run: async () => {
        const result = await feishuContacts.setUserSuspended({ auth, input: { openId: state.openId, suspended: true } })
        assertThat({ condition: result.confirmed !== false, message: `Feishu still reports is_frozen=${result.is_frozen} after the call` })
        return `is_frozen=${result.is_frozen} confirmed=${result.confirmed}`
      },
      diagnose: diagnoseFeishu,
    })
    await step({
      id: 'feishu.suspend-repeat',
      title: 'Suspend again, it must change nothing',
      run: async () => {
        const result = await feishuContacts.setUserSuspended({ auth, input: { openId: state.openId, suspended: true } })
        return `is_frozen=${result.is_frozen} confirmed=${result.confirmed}`
      },
      diagnose: diagnoseFeishu,
    })
  }

  if (config.feishu.chatId) {
    const dedupeKey = `fema-acceptance-${new Date().toISOString().slice(0, 13)}`
    await step({
      id: 'feishu.message',
      title: 'Send one test message to the test chat (write)',
      run: async () => {
        const result = await actions.sendGroupMessage.run({ auth, propsValue: { chatId: config.feishu.chatId, messageType: 'text', content: `${config.prefix}验收消息，请忽略`, dedupeKey } })
        state.messageId = result.message_id
        return `message_id=${result.message_id}`
      },
      diagnose: diagnoseFeishu,
    })
    if (state.messageId) {
      await step({
        id: 'feishu.message-dedupe',
        title: 'Send the same message again with the same dedupe key and see what Feishu does',
        run: async () => {
          const result = await actions.sendGroupMessage.run({ auth, propsValue: { chatId: config.feishu.chatId, messageType: 'text', content: `${config.prefix}验收消息，请忽略`, dedupeKey } })
          return result.message_id === state.messageId ? 'same message_id returned, no second message was posted' : `a different message_id came back (${result.message_id}), check whether a second message appeared in the chat`
        },
        diagnose: diagnoseFeishu,
        observation: true,
      })
    }
  }
  else {
    skip({ id: 'feishu.message', title: 'Send one test message to the test chat (write)', reason: 'FEMA_REAL_FEISHU_TEST_CHAT_ID is not set' })
  }

  await runBitable({ auth })
}

async function runBitable({ auth }) {
  const { bitableAppToken, bitableTableId, bitableTextField } = config.feishu
  if (!bitableAppToken || !bitableTableId || !bitableTextField) {
    skip({ id: 'feishu.bitable', title: 'Add and read back one Bitable record (write)', reason: 'FEMA_REAL_FEISHU_BITABLE_APP_TOKEN, _TABLE_ID and _TEXT_FIELD are not all set' })
    return
  }
  const marker = `${config.prefix}${new Date().toISOString()}`
  await step({
    id: 'feishu.bitable',
    title: 'Add one Bitable record and read it back by its text column (write)',
    run: async () => {
      await modules.actions.createBitableRecord.run({ auth, propsValue: { appToken: bitableAppToken, tableId: bitableTableId, fields: { [bitableTextField]: marker }, dedupeKey: marker } })
      const rows = await modules.actions.searchBitableRecords.run({ auth, propsValue: { appToken: bitableAppToken, tableId: bitableTableId, filterField: bitableTextField, filterValue: marker, pageSize: 5 } })
      assertThat({ condition: rows.length === 1, message: `expected to read the record back once, found ${rows.length}` })
      return `record ${rows[0].record_id} written and read back`
    },
    diagnose: diagnoseFeishu,
  })
}

async function runBeisen() {
  const { appKey, appSecret, rootOId, testEmail } = config.beisen
  if (!appKey || !appSecret) {
    return skipGroup({ group: 'beisen', reason: 'FEMA_REAL_BEISEN_APP_KEY and FEMA_REAL_BEISEN_APP_SECRET are not set' })
  }
  const auth = { type: 'CUSTOM_AUTH', props: { appKey, appSecret } }
  const { beisenCommon, beisenTimeWindow, actions } = modules

  const tokenStep = await step({
    id: 'beisen.token',
    title: 'Get an access_token',
    run: async () => {
      await beisenCommon.obtainAccessToken({ appKey, appSecret })
      return 'token issued'
    },
    diagnose: diagnoseBeisen,
  })
  if (tokenStep.status !== 'PASS') {
    return skipGroup({ group: 'beisen after the token step', reason: 'no token, nothing else can run' })
  }

  await step({
    id: 'beisen.time-window',
    title: 'Read the employees changed in the last 24 hours, scroll to the end (read)',
    run: async () => {
      const stopMs = Date.now()
      const records = await beisenTimeWindow.drain({ auth, scope: 'ACTIVE', queryType: 2, startMs: stopMs - 24 * 60 * 60 * 1000, stopMs, timeZone: 'Asia/Shanghai' })
      const sample = records[0]
      const shape = sample ? `employeeInfo keys: ${Object.keys(sample.employeeInfo ?? {}).length}, recordInfo keys: ${Object.keys(sample.recordInfo ?? {}).length}` : 'no change in the window, which is fine'
      return `${records.length} record(s); ${shape}`
    },
    diagnose: diagnoseBeisen,
  })

  await step({
    id: 'beisen.sub-organizations',
    title: 'List the organization units under the root (read)',
    run: async () => {
      const result = await actions.getSubOrganizations.run({ auth, propsValue: { organizationId: rootOId || '0', includeAllLevels: false } })
      return `${result.length} direct child unit(s) of ${rootOId || '0'}`
    },
    diagnose: diagnoseBeisen,
    observation: !rootOId,
  })

  if (rootOId) {
    await step({
      id: 'beisen.roster',
      title: 'List up to 200 active employees of the root organization (read)',
      run: async () => {
        const result = await actions.listOrganizationEmployees.run({ auth, propsValue: { organizationId: rootOId, includeSubOrganizations: true, statusScope: 'ACTIVE', maxItems: 200 } })
        return `${result.count} employee(s)`
      },
      diagnose: diagnoseBeisen,
    })
  }
  else {
    skip({ id: 'beisen.roster', title: 'List the active employees of the root organization (read)', reason: 'FEMA_REAL_BEISEN_ROOT_OID is not set (900 followed by the tenant ID)' })
  }

  if (testEmail) {
    await step({
      id: 'beisen.email',
      title: 'Find one employee by email (read)',
      run: async () => {
        const result = await actions.findEmployeeByEmail.run({ auth, propsValue: { email: testEmail } })
        return result.found ? `found user_id ${result.user_id}` : 'nobody has that email'
      },
      diagnose: diagnoseBeisen,
    })
  }
}

async function step({ id, title, run, diagnose, softFail = false, observation = false }) {
  const startedAt = Date.now()
  const before = requestLog.length
  try {
    const detail = await run()
    return record({ id, title, status: 'PASS', detail, startedAt, before, observation })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return record({ id, title, status: softFail ? 'WARN' : 'FAIL', detail: message.split('\n')[0], cause: diagnose(message), startedAt, before })
  }
}

function record({ id, title, status, detail, cause, startedAt, before, observation }) {
  const requests = requestLog.slice(before)
  const entry = { id, title, status, detail, cause, ms: Date.now() - startedAt, requests }
  results.push(entry)
  const label = observation && status === 'PASS' ? 'INFO' : status
  process.stdout.write(`[${label}] ${id}  ${title}\n       ${detail}\n       ${requests.length > 0 ? requests.join(' | ') : 'no request'}  (${entry.ms} ms)\n`)
  if (cause) {
    process.stdout.write(`       most likely cause: ${cause}\n`)
  }
  return entry
}

function skip({ id, title, reason }) {
  results.push({ id, title, status: 'SKIP', detail: reason, ms: 0, requests: [] })
  process.stdout.write(`[SKIP] ${id}  ${title}\n       ${reason}\n`)
}

function skipGroup({ group, reason }) {
  skip({ id: group, title: `Steps of ${group}`, reason })
}

function assertThat({ condition, message }) {
  if (!condition) {
    throw new Error(message)
  }
}

function diagnoseFeishu(message) {
  const code = Number(/Feishu error (\d+)/.exec(message)?.[1] ?? 0)
  const scopeName = /\[([a-z_.:]+(?:, ?[a-z_.:]+)*)\]/.exec(message)?.[1]
  const table = {
    99991672: `the app lacks a permission${scopeName ? ` (${scopeName})` : ''}: add it under Permissions & Scopes, then create a version and publish it`,
    99991663: 'the access token was rejected: check App ID and App Secret belong to the same app',
    10015: 'the App Secret is wrong: copy it again from Credentials & Basic Info',
    10003: 'the App ID is not recognised: check it and the region (Feishu or Lark)',
    10014: 'the app is disabled or not installed in this organization',
    99991662: 'the app is disabled or not installed in this organization',
    99991673: 'the app is disabled or not installed in this organization',
    99991401: 'the app has an IP allowlist and this machine is not on it: add this machine outbound IP under Security Settings',
    99991403: 'the free edition monthly API quota is used up: an administrator must upgrade, or wait for the first of next month',
    40004: 'the department is outside the contact permission scope of the app: add it under Data permissions and republish',
    41050: 'the member is outside the contact permission scope of the app: add the member or their department and republish',
    41017: 'the department ID does not exist: check FEMA_REAL_FEISHU_TEST_DEPARTMENT_ID and its ID type (od- prefix means open_department_id)',
    44035: 'the department ID does not exist: check FEMA_REAL_FEISHU_TEST_DEPARTMENT_ID and its ID type (od- prefix means open_department_id)',
    41001: 'the test mobile is already used by a member the app cannot see (outside the contact scope)',
    41002: 'the test email is already used by a member the app cannot see (outside the contact scope)',
    41003: 'the test mobile and email belong to two different Feishu accounts',
    44019: 'an unverified organization only accepts +86 mobile numbers',
    44020: 'a mobile outside mainland China needs an email as well',
    41007: 'the organization is at its member limit',
    44023: 'the organization is at its member limit for this edition',
    230002: 'the bot is not in the test chat: add the app to the chat',
    230006: 'the bot ability is not switched on for the app',
    230013: 'the recipient is outside the availability scope of the app',
    1254045: 'a Bitable column name does not match exactly',
    1254040: 'the Bitable App Token does not exist, or the app is not a collaborator of it',
    1254041: 'the Bitable table ID does not exist',
  }
  if (table[code]) {
    return table[code]
  }
  return diagnoseNetwork(message)
}

function diagnoseBeisen(message) {
  if (/Beisen code 417/.test(message)) {
    return 'Beisen rejected a request parameter: read the message, for the organization steps check the OId (root is 900 followed by the tenant ID)'
  }
  if (/HTTP 401|access_token|app_key|app_secret|invalid_client/i.test(message)) {
    return 'the Key or Secret is wrong or revoked, or this machine IP is not in the OpenAPI trusted IP list of the connector'
  }
  if (/HTTP 429|rate limit/i.test(message)) {
    return 'the tenant hit the rate limit and Beisen refuses calls until 00:00 the next day (Beijing time)'
  }
  if (/permission|权限|forbidden|403/i.test(message)) {
    return 'the connector has not been granted this interface, or one of the two employee objects (Employee Information, Employment Record) is not ticked'
  }
  return diagnoseNetwork(message)
}

function diagnoseNetwork(message) {
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|fetch failed|EAI_AGAIN/i.test(message)) {
    return 'this machine cannot reach the platform: check DNS, proxy and firewall'
  }
  return ''
}

function instrumentHttp({ httpClient }) {
  const original = httpClient.sendRequest.bind(httpClient)
  httpClient.sendRequest = async (request) => {
    const url = new URL(request.url)
    requestLog.push(`${request.method} ${url.pathname}${request.queryParams ? `?${Object.keys(request.queryParams).join('&')}` : ''}`)
    return original(request)
  }
}

async function loadModules() {
  const require = createRequire(import.meta.url)
  const feishuDist = path.join(repoRoot, 'packages/connectors/community/feishu/dist/src')
  const beisenDist = path.join(repoRoot, 'packages/connectors/community/beisen/dist/src')
  try {
    const { httpClient } = require(path.join(repoRoot, 'packages/connectors/community/feishu/node_modules/@fema-ipaas/connector-common'))
    return {
      httpClient,
      feishuContacts: require(path.join(feishuDist, 'lib/common/contacts.js')).feishuContacts,
      feishuCommon: require(path.join(feishuDist, 'lib/common/index.js')).feishuCommon,
      beisenCommon: require(path.join(beisenDist, 'lib/common/index.js')).beisenCommon,
      beisenTimeWindow: require(path.join(beisenDist, 'lib/common/time-window.js')).beisenTimeWindow,
      actions: {
        sendGroupMessage: require(path.join(feishuDist, 'lib/actions/send-group-message.js')).sendGroupMessage,
        createBitableRecord: require(path.join(feishuDist, 'lib/actions/create-bitable-record.js')).createBitableRecord,
        searchBitableRecords: require(path.join(feishuDist, 'lib/actions/search-bitable-records.js')).searchBitableRecords,
        getSubOrganizations: require(path.join(beisenDist, 'lib/actions/get-sub-organizations.js')).getSubOrganizations,
        listOrganizationEmployees: require(path.join(beisenDist, 'lib/actions/list-organization-employees.js')).listOrganizationEmployees,
        findEmployeeByEmail: require(path.join(beisenDist, 'lib/actions/find-employee-by-email.js')).findEmployeeByEmail,
      },
    }
  }
  catch (error) {
    process.stderr.write(`Cannot load the built connectors (${error instanceof Error ? error.message : String(error)}).\nBuild them first: npx turbo run build --filter=@fema-ipaas/connector-feishu --filter=@fema-ipaas/connector-beisen\n`)
    process.exit(2)
  }
}

async function seedMock() {
  const post = (route, body) => fetch(`${config.mockAdminUrl}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  await post('/__admin/official-reset', {})
  await post('/__admin/beisen-official-reset', {})
  await post('/__admin/employees', {
    records: [
      { employeeInfo: { userID: 100001, name: '验收甲', email: 'jia@example.com', mobilePhone: '13800000001' }, recordInfo: { userID: 100001, jobNumber: 'T001', oIdDepartment: 20301, employeeStatus: '2', approvalStatus: 4 } },
      { employeeInfo: { userID: 100002, name: '验收乙', email: 'yi@example.com', mobilePhone: '13800000002' }, recordInfo: { userID: 100002, jobNumber: 'T002', oIdDepartment: 20302, employeeStatus: '3', approvalStatus: 4 } },
    ],
  })
  process.stdout.write('seeded the mock server with two employees\n')
}

function printBanner() {
  process.stdout.write('FEMA real-tenant acceptance run\n')
  process.stdout.write(isMock
    ? 'MODE: MOCK. A base URL override is set, so this run only proves the script flow. It does NOT verify the real Feishu or Beisen.\n'
    : 'MODE: REAL. Requests go to the real Feishu and Beisen platforms. Writes need FEMA_REAL_CONFIRM_WRITE.\n')
  process.stdout.write(`Writes: ${config.confirmed ? 'ALLOWED (one test account named with the prefix is created and suspended, one test message is sent, nothing is deleted)' : 'OFF (read-only)'}\n\n`)
}

function printSummary() {
  const count = (status) => results.filter((result) => result.status === status).length
  process.stdout.write(`\nSummary: ${count('PASS')} passed, ${count('FAIL')} failed, ${count('WARN')} warned, ${count('SKIP')} skipped\n`)
  results.filter((result) => result.status === 'FAIL').forEach((result) => {
    process.stdout.write(`  FAILED ${result.id}: ${result.detail}${result.cause ? `\n    most likely cause: ${result.cause}` : ''}\n`)
  })
  if (isMock) {
    process.stdout.write('Verified against the real platforms: NOTHING (mock mode).\n')
  }
  else {
    const verified = results.filter((result) => result.status === 'PASS').map((result) => result.id)
    process.stdout.write(`Verified against the real platforms: ${verified.length > 0 ? verified.join(', ') : 'nothing'}\n`)
  }
}
