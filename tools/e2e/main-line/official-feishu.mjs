const FEISHU_DOMAIN_PREFIX = '/feishu/open-apis'
const TOKEN_BASE = 't-mock-tenant-token'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const MAINLAND_BARE = /^1\d{10}$/
const MESSAGE_UUID_WINDOW_MS = 60 * 60 * 1000
const DEFAULT_DEPARTMENTS = [
  { id: 'od-rd', name: '研发部', parent: '0' },
  { id: 'od-hr', name: '人力资源部', parent: '0' },
  { id: 'od-sales', name: '销售部', parent: '0' },
]

export function createFeishuOfficial({ state, kit }) {
  const official = createState()
  state.official = official
  state.usersByOpenId ??= new Map()
  state.usersByEmail ??= new Map()
  state.createAttemptsByMobile ??= new Map()
  state.rejectedDuplicateCreates ??= 0
  state.replayedCreates ??= 0

  function createState() {
    return {
      tokenEpoch: 0,
      approvals: new Map(),
      subscriptions: new Set(),
      departmentSequence: 0,
      departmentsByToken: new Map(),
      departmentWrites: 0,
      departmentDeletes: 0,
      ipDenied: false,
      quotaExhausted: false,
      missingScopes: new Set(),
      scopeDepartments: null,
      patchMinIntervalMs: 0,
      lastPatchAt: new Map(),
      maxUsers: null,
      messagesByUuid: new Map(),
      botNotInChats: new Set(),
      unavailableRecipients: new Set(),
      departmentTree: new Map(DEFAULT_DEPARTMENTS.map((department) => [department.id, department])),
      bitableFields: null,
      bitableByClientToken: new Map(),
      calls: { counted: 0, uncounted: 0 },
    }
  }

  function reset() {
    Object.assign(official, createState())
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
  }

  function seedUsers({ users }) {
    return users.map((input) => {
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
    })
  }

  function fail({ status = 400, code, msg, headers = {} }) {
    return { status, payload: { code, msg }, headers }
  }

  function bitableFail({ code, msg }) {
    return { status: 200, payload: { code, msg } }
  }

  function gate({ headers, scope, counted }) {
    if (official.ipDenied) {
      return fail({ code: 99991401, msg: 'ip 203.0.113.9 is denied by app setting' })
    }
    const authorization = String(headers.authorization ?? '')
    if (!authorization.startsWith('Bearer ')) {
      return fail({ code: 99991661, msg: 'Missing access token for authorization. Please make a request with token attached.' })
    }
    const epoch = Number(authorization.split(':')[2] ?? 0)
    if (!authorization.startsWith(`Bearer ${TOKEN_BASE}`) || epoch !== official.tokenEpoch) {
      return fail({ code: 99991663, msg: 'Invalid access token for authorization. Please make a request with token attached.' })
    }
    if (scope && official.missingScopes.has(scope)) {
      return fail({ code: 99991672, msg: `Access denied. One of the following scopes is required: [${scope}]. Application scope list: https://open.feishu.cn/app` })
    }
    if (counted) {
      if (official.quotaExhausted) {
        return fail({ status: 429, code: 99991403, msg: "This month's API call quota has been exceeded" })
      }
      official.calls.counted += 1
    }
    else {
      official.calls.uncounted += 1
    }
    return null
  }

  function departmentInScope(departmentId) {
    if (official.scopeDepartments === null) {
      return true
    }
    return official.scopeDepartments.has(departmentId)
  }

  function userVisible(user) {
    if (official.scopeDepartments === null) {
      return true
    }
    return (user.department_ids ?? []).some((departmentId) => departmentInScope(departmentId))
  }

  function mobileKeys(mobile) {
    const text = String(mobile ?? '')
    const bare = text.startsWith('+86') ? text.slice(3) : text
    return MAINLAND_BARE.test(bare) ? [bare, `+86${bare}`] : [text]
  }

  function findByMobile(mobile) {
    return mobileKeys(mobile).map((key) => state.feishuUsers.get(key)).find((user) => user !== undefined)
  }

  function statusOf(user) {
    return {
      is_frozen: user.is_frozen === true,
      is_resigned: user.is_resigned === true,
      is_activated: user.is_activated !== false,
      is_exited: false,
      is_unjoin: false,
    }
  }

  function publicUser(user) {
    return {
      open_id: user.open_id,
      user_id: user.user_id,
      union_id: user.union_id,
      name: user.name,
      email: user.email ?? undefined,
      mobile: user.mobile,
      employee_no: user.employee_no ?? undefined,
      employee_type: user.employee_type ?? 1,
      department_ids: user.department_ids ?? [],
      leader_user_id: user.leader_user_id ?? undefined,
      job_title: user.job_title ?? undefined,
      status: statusOf(user),
    }
  }

  function departmentUnknown(departmentId) {
    return departmentId !== '0' && !official.departmentTree.has(departmentId) && !state.departments.has(departmentId)
  }

  function tokenRoute({ body }) {
    if (body.app_secret === 'wrong') {
      return fail({ code: 10015, msg: 'wrong app secret' })
    }
    if (body.app_id === 'unknown') {
      return fail({ code: 10003, msg: 'invalid param' })
    }
    return kit.ok({ code: 0, msg: 'ok', tenant_access_token: `${TOKEN_BASE}:${body.app_id}:${official.tokenEpoch}`, expire: 7200 })
  }

  function batchGetId({ body, query, headers }) {
    const denied = gate({ headers, scope: 'contact:user.id:readonly', counted: false })
    if (denied) {
      return denied
    }
    const mobiles = (body.mobiles ?? []).map((mobile) => entryFor({ key: 'mobile', value: mobile, user: findByMobile(mobile), includeResigned: body.include_resigned === true }))
    const emails = (body.emails ?? []).map((email) => entryFor({ key: 'email', value: email, user: state.usersByEmail.get(email), includeResigned: body.include_resigned === true }))
    return kit.ok({ code: 0, msg: 'success', data: { user_list: [...mobiles, ...emails] } })
  }

  function entryFor({ key, value, user, includeResigned }) {
    const visible = user !== undefined && userVisible(user) && (includeResigned || user.is_resigned !== true)
    return visible ? { [key]: value, user_id: user.open_id, status: statusOf(user) } : { [key]: value }
  }

  function createUser({ body, query, headers }) {
    const denied = gate({ headers, scope: 'contact:contact', counted: false })
    if (denied) {
      return denied
    }
    state.createCalls += 1
    state.createAttemptsByMobile.set(body.mobile, (state.createAttemptsByMobile.get(body.mobile) ?? 0) + 1)
    const injected = kit.takeFailure({ key: 'provisionFailure' })
    if (injected) {
      return injected
    }
    const clientToken = query.get('client_token')
    const previous = clientToken ? state.createdByClientToken.get(clientToken) : undefined
    if (previous) {
      if (previous.requestFingerprint !== JSON.stringify(body)) {
        return fail({ code: 40021, msg: 'no a same request error' })
      }
      state.replayedCreates += 1
      return kit.ok({ code: 0, msg: 'success', data: { user: publicUser(previous.user) } })
    }
    const invalid = validateCreate({ body })
    if (invalid) {
      return invalid
    }
    const departmentIds = body.department_ids ?? []
    const unknownDepartment = departmentIds.find((id) => departmentUnknown(id))
    if (unknownDepartment) {
      return fail({ code: 41017, msg: 'department not exist' })
    }
    const outside = departmentIds.find((id) => !departmentInScope(id))
    if (outside) {
      return fail({ status: 403, code: 40004, msg: 'no dept authority error' })
    }
    const byMobile = findByMobile(body.mobile)
    const byEmail = body.email ? state.usersByEmail.get(body.email) : undefined
    if (byMobile && byEmail && byMobile !== byEmail) {
      return fail({ status: 409, code: 41003, msg: 'user account conflict error' })
    }
    if (byMobile) {
      state.rejectedDuplicateCreates += 1
      return fail({ code: 41001, msg: 'mobile has already exist error' })
    }
    if (byEmail) {
      state.rejectedDuplicateCreates += 1
      return fail({ code: 41002, msg: 'email has already exist error' })
    }
    if (body.employee_no && [...state.feishuUsers.values()].some((user) => user.employee_no === body.employee_no)) {
      return fail({ code: 44051, msg: 'employee_no already existed' })
    }
    if (official.maxUsers !== null && state.feishuUsers.size >= official.maxUsers) {
      return fail({ code: 44023, msg: 'exceed feature contact seat limit' })
    }
    const sequence = state.feishuUsers.size + 1
    const user = {
      open_id: `ou_${sequence}`,
      user_id: `u${sequence}`,
      union_id: `on_${sequence}`,
      name: body.name,
      mobile: body.mobile,
      email: body.email ?? null,
      employee_no: body.employee_no ?? null,
      employee_type: body.employee_type,
      job_title: body.job_title ?? null,
      department_ids: departmentIds,
    }
    state.feishuUsers.set(body.mobile, user)
    state.usersByOpenId.set(user.open_id, user)
    if (user.email) {
      state.usersByEmail.set(user.email, user)
    }
    if (clientToken) {
      state.createdByClientToken.set(clientToken, { user, requestFingerprint: JSON.stringify(body) })
    }
    return kit.ok({ code: 0, msg: 'success', data: { user: publicUser(user) } })
  }

  function validateCreate({ body }) {
    if (!body.name) {
      return fail({ code: 41006, msg: 'no user name error' })
    }
    if (!body.mobile) {
      return fail({ code: 41010, msg: 'no mobile error' })
    }
    const mainland = mobileKeys(body.mobile).length === 2
    if (!mainland && !/^\+\d{6,15}$/.test(String(body.mobile))) {
      return fail({ code: 41004, msg: 'mobile is invalid error' })
    }
    if (!mainland && !body.email) {
      return fail({ code: 44020, msg: 'mobile and email need together exist' })
    }
    if (!Array.isArray(body.department_ids) || body.department_ids.length === 0) {
      return fail({ code: 41017, msg: 'department is required error' })
    }
    if (![1, 2, 3, 4, 5].includes(Number(body.employee_type))) {
      return fail({ code: 41059, msg: 'invalid employee type error' })
    }
    return null
  }

  function getUser({ openId, headers }) {
    const denied = gate({ headers, scope: 'contact:contact:readonly_as_app', counted: false })
    if (denied) {
      return denied
    }
    const user = state.usersByOpenId.get(openId)
    if (!user) {
      return fail({ code: 41012, msg: 'user id invalid error' })
    }
    if (!userVisible(user)) {
      return fail({ code: 41050, msg: 'no user authority error' })
    }
    return kit.ok({ code: 0, msg: 'success', data: { user: publicUser(user) } })
  }

  function patchUser({ openId, body, headers }) {
    const denied = gate({ headers, scope: 'contact:contact', counted: false })
    if (denied) {
      return denied
    }
    const touchesThrottled = body.department_ids !== undefined || body.is_frozen !== undefined
    if (touchesThrottled && official.patchMinIntervalMs > 0) {
      const last = official.lastPatchAt.get(headers.authorization) ?? 0
      if (Date.now() - last < official.patchMinIntervalMs) {
        return fail({ status: 429, code: 99991400, msg: 'request trigger frequency limit', headers: { 'x-ogw-ratelimit-limit': '1', 'x-ogw-ratelimit-reset': '1' } })
      }
      official.lastPatchAt.set(headers.authorization, Date.now())
    }
    const user = state.usersByOpenId.get(openId)
    if (!user) {
      return fail({ code: 41012, msg: 'user id invalid error' })
    }
    if (!userVisible(user)) {
      return fail({ code: 41050, msg: 'no user authority error' })
    }
    if (user.is_resigned === true) {
      return fail({ code: 42006, msg: 'user has resigned error' })
    }
    if (body.is_frozen === true && user.is_tenant_manager === true) {
      return fail({ code: 44036, msg: 'freeze tenant founder is forbidden' })
    }
    if (body.leader_user_id !== undefined && body.leader_user_id === openId) {
      return fail({ code: 41030, msg: 'set leader to oneself error' })
    }
    if (body.department_ids) {
      const unknown = body.department_ids.find((id) => departmentUnknown(id))
      if (unknown) {
        return fail({ code: 44035, msg: 'departmentID is invaild' })
      }
      const outside = body.department_ids.find((id) => !departmentInScope(id))
      if (outside) {
        return fail({ status: 403, code: 40004, msg: 'no dept authority error' })
      }
      user.department_ids = body.department_ids
    }
    for (const key of ['name', 'job_title', 'leader_user_id']) {
      if (body[key] !== undefined) {
        user[key] = body[key]
      }
    }
    if (typeof body.is_frozen === 'boolean') {
      user.is_frozen = body.is_frozen
    }
    return kit.ok({ code: 0, msg: 'success', data: { user: publicUser(user) } })
  }

  function findByDepartment({ query, headers }) {
    const denied = gate({ headers, scope: 'contact:contact:readonly_as_app', counted: false })
    if (denied) {
      return denied
    }
    const departmentId = query.get('department_id') ?? ''
    const pageSize = Number(query.get('page_size') ?? 10)
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      return fail({ code: 40011, msg: 'page size is invalid' })
    }
    const offset = parsePageToken({ token: query.get('page_token') })
    if (offset === null) {
      return fail({ code: 40012, msg: 'page token is invalid error' })
    }
    if (departmentId === '0' ? official.scopeDepartments !== null : !departmentInScope(departmentId)) {
      return fail({ status: 403, code: 40004, msg: 'no dept authority error' })
    }
    if (departmentUnknown(departmentId)) {
      return fail({ code: 40015, msg: 'department not exist' })
    }
    const members = [...state.feishuUsers.values()].filter((user) => (departmentId === '0' ? (user.department_ids ?? []).length === 0 : (user.department_ids ?? []).includes(departmentId)))
    const page = members.slice(offset, offset + pageSize)
    const more = offset + pageSize < members.length
    return kit.ok({ code: 0, msg: 'success', data: { items: page.map(publicUser), has_more: more, ...(more ? { page_token: `pt${offset + pageSize}` } : {}) } })
  }

  function departmentChildren({ departmentId, query, headers }) {
    const denied = gate({ headers, scope: 'contact:contact:readonly_as_app', counted: false })
    if (denied) {
      return denied
    }
    const pageSize = Number(query.get('page_size') ?? 10)
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      return fail({ code: 40011, msg: 'page size is invalid' })
    }
    const offset = parsePageToken({ token: query.get('page_token') })
    if (offset === null) {
      return fail({ code: 40012, msg: 'page token is invalid error' })
    }
    if (departmentId === '0' ? official.scopeDepartments !== null : !departmentInScope(departmentId)) {
      return fail({ status: 403, code: 40004, msg: 'no dept authority error' })
    }
    if (departmentUnknown(departmentId)) {
      return fail({ code: 40015, msg: 'department not exist' })
    }
    const all = query.get('fetch_child') === 'true' ? descendantsOf({ departmentId }) : childrenOf({ departmentId })
    const page = all.slice(offset, offset + pageSize)
    const more = offset + pageSize < all.length
    return kit.ok({
      code: 0,
      msg: 'success',
      data: {
        items: page.map((department) => publicDepartment({ department, query })),
        has_more: more,
        ...(more ? { page_token: `pt${offset + pageSize}` } : {}),
      },
    })
  }

  function resolveDepartment({ id, query }) {
    if (id === '0') return { id: '0', customId: '0', name: 'Company', parent: '' }
    return query.get('department_id_type') === 'department_id' ? [...official.departmentTree.values()].find((department) => (department.customId ?? department.id) === id) : official.departmentTree.get(id)
  }

  function publicDepartment({ department, query }) {
    const parent = official.departmentTree.get(department.parent)
    return { department_id: department.customId ?? department.id, open_department_id: department.id, name: department.name, parent_department_id: query.get('department_id_type') === 'department_id' ? parent?.customId ?? department.parent : department.parent, ...(department.order !== undefined ? { order: String(department.order) } : {}), status: { is_deleted: false } }
  }

  function getDepartment({ departmentId, query, headers }) {
    const denied = gate({ headers, scope: 'contact:contact:readonly_as_app', counted: false })
    if (denied) return denied
    const department = resolveDepartment({ id: departmentId, query })
    if (!department) return fail({ code: 40015, msg: 'department not exist' })
    if (department.id !== '0' && !departmentInScope(department.id)) return fail({ status: 403, code: 40004, msg: 'no dept authority error' })
    return kit.ok({ code: 0, msg: 'success', data: { department: publicDepartment({ department, query }) } })
  }

  function writeDepartment({ departmentId, body, query, headers }) {
    const denied = gate({ headers, scope: 'contact:contact', counted: false })
    if (denied) return denied
    const creating = departmentId === undefined
    const token = query.get('client_token')
    if (creating && token && official.departmentsByToken.has(token)) return kit.ok({ code: 0, msg: 'success', data: { department: publicDepartment({ department: official.departmentsByToken.get(token), query }) } })
    const existing = creating ? null : resolveDepartment({ id: departmentId, query })
    if (!creating && !existing) return fail({ code: 40015, msg: 'department not exist' })
    const parent = body.parent_department_id === undefined ? official.departmentTree.get(existing?.parent) ?? { id: '0' } : resolveDepartment({ id: body.parent_department_id, query })
    if (!parent) return fail({ code: 40015, msg: 'parent department not exist' })
    if (parent.id !== '0' && !departmentInScope(parent.id)) return fail({ status: 403, code: 40014, msg: 'no parent dept authority error' })
    const name = body.name ?? existing?.name
    if (typeof name !== 'string' || !name.length) return fail({ code: 40011, msg: 'invalid name' })
    if (name.includes('/')) return fail({ code: 43029, msg: 'dept name not contain separator' })
    if ([...official.departmentTree.values()].some((department) => department.id !== existing?.id && department.parent === parent.id && department.name === name)) return fail({ code: 43022, msg: 'department name duplicate' })
    if (creating && body.department_id && [...official.departmentTree.values()].some((department) => (department.customId ?? department.id) === body.department_id)) return fail({ code: 43007, msg: 'department id already exists' })
    let ancestor = parent
    for (let depth = 0; ancestor && ancestor.id !== '0'; depth++) {
      if (ancestor.id === existing?.id || depth >= 24) return fail({ code: 43019, msg: 'exceed dept max level' })
      ancestor = official.departmentTree.get(ancestor.parent)
    }
    const department = { ...existing, id: existing?.id ?? `od-created-${++official.departmentSequence}`, customId: existing?.customId ?? body.department_id ?? existing?.id, name, parent: parent.id, ...(body.order !== undefined ? { order: String(body.order) } : {}) }
    official.departmentTree.set(department.id, department)
    state.departments.add(department.id)
    official.departmentWrites++
    if (creating && token) official.departmentsByToken.set(token, department)
    return kit.ok({ code: 0, msg: 'success', data: { department: publicDepartment({ department, query }) } })
  }

  function childrenOf({ departmentId }) {
    return [...official.departmentTree.values()].filter((department) => department.parent === departmentId)
  }

  function descendantsOf({ departmentId }) {
    return childrenOf({ departmentId }).flatMap((department) => [department, ...descendantsOf({ departmentId: department.id })])
  }

  function parsePageToken({ token }) {
    if (!token) {
      return 0
    }
    const match = /^pt(\d+)$/.exec(token)
    return match ? Number(match[1]) : null
  }

  function contactScopes({ headers }) {
    const denied = gate({ headers, scope: 'contact:contact:readonly_as_app', counted: false })
    if (denied) {
      return denied
    }
    const departments = official.scopeDepartments === null ? childrenOf({ departmentId: '0' }).map((department) => department.id) : [...official.scopeDepartments]
    return kit.ok({ code: 0, msg: 'success', data: { department_ids: departments, user_ids: [], group_ids: [], has_more: false } })
  }

  function listChats({ headers }) {
    const denied = gate({ headers, scope: 'im:chat:readonly', counted: true })
    if (denied) {
      return denied
    }
    return kit.ok({ code: 0, msg: 'success', data: { items: [{ chat_id: kit.HR_CHAT_ID, name: 'HR 通知群' }], has_more: false } })
  }

  function sendMessage({ body, query, headers }) {
    const denied = gate({ headers, scope: 'im:message:send_as_bot', counted: true })
    if (denied) {
      return denied
    }
    const injected = kit.takeFailure({ key: 'messageFailure' })
    if (injected) {
      return injected
    }
    const receiveIdType = query.get('receive_id_type')
    if (!['open_id', 'union_id', 'user_id', 'email', 'chat_id'].includes(receiveIdType ?? '')) {
      return fail({ code: 230001, msg: 'Your request contains an invalid request parameter.' })
    }
    if (!body.receive_id || !body.msg_type || typeof body.content !== 'string') {
      return fail({ code: 230001, msg: 'Your request contains an invalid request parameter.' })
    }
    if (receiveIdType === 'chat_id' && official.botNotInChats.has(body.receive_id)) {
      return fail({ code: 230002, msg: 'The bot can not be outside the group.' })
    }
    if (receiveIdType !== 'chat_id') {
      const recipient = [...state.feishuUsers.values()].find((user) => user.open_id === body.receive_id || user.email === body.receive_id || user.user_id === body.receive_id)
      if (official.unavailableRecipients.has(body.receive_id)) {
        return fail({ code: 230013, msg: 'Bot has NO availability to this user.' })
      }
      if (recipient?.is_resigned === true) {
        return fail({ code: 230029, msg: 'User has resigned.' })
      }
    }
    const uuid = body.uuid
    const now = Date.now()
    const previous = uuid ? official.messagesByUuid.get(uuid) : undefined
    if (previous && now - previous.at < MESSAGE_UUID_WINDOW_MS) {
      return kit.ok({ code: 0, msg: 'success', data: previous.message })
    }
    const message = { message_id: `om_${state.messages.length + 1}`, chat_id: body.receive_id, msg_type: body.msg_type, content: body.content, create_time: String(now), app_id: String(headers.authorization ?? '').split(':')[1] ?? null, ...(uuid ? { uuid } : {}) }
    state.messages.push(message)
    if (uuid) {
      official.messagesByUuid.set(uuid, { at: now, message })
    }
    return kit.ok({ code: 0, msg: 'success', data: message })
  }

  function bitableTables({ headers }) {
    const denied = gate({ headers, scope: 'bitable:app', counted: true })
    if (denied) {
      return denied
    }
    return kit.ok({ code: 0, msg: 'success', data: { items: [{ table_id: 'tbl_roster', name: '员工花名册' }], has_more: false, total: 1 } })
  }

  function bitableFieldList({ headers }) {
    const denied = gate({ headers, scope: 'bitable:app', counted: true })
    if (denied) {
      return denied
    }
    const columns = official.bitableFields === null ? DEFAULT_BITABLE_COLUMNS : official.bitableFields.map((name) => ({ field_name: name, type: 1 }))
    const items = columns.map((column, index) => ({ field_id: `fld_${index + 1}`, field_name: column.field_name, type: column.type, is_primary: index === 0 }))
    return kit.ok({ code: 0, msg: 'success', data: { items, has_more: false, total: items.length } })
  }

  function bitableCreate({ appToken, tableId, body, query, headers }) {
    const denied = gate({ headers, scope: 'bitable:app', counted: true })
    if (denied) {
      return denied
    }
    const clientToken = query.get('client_token')
    if (clientToken && !UUID_V4.test(clientToken)) {
      return { status: 400, payload: { code: 1254037, msg: 'Invalid client token, make sure that it complies with the specification.' } }
    }
    const bad = invalidFields({ fields: body.fields })
    if (bad) {
      return bad
    }
    const replay = clientToken ? official.bitableByClientToken.get(`${appToken}:${tableId}:${clientToken}`) : undefined
    if (replay) {
      return kit.ok({ code: 0, msg: 'success', data: { record: replay } })
    }
    const record = { record_id: `rec_${state.bitableRecords.length + 1}`, fields: body.fields ?? {} }
    state.bitableRecords.push({ appToken, tableId, ...record })
    if (clientToken) {
      official.bitableByClientToken.set(`${appToken}:${tableId}:${clientToken}`, record)
    }
    return kit.ok({ code: 0, msg: 'success', data: { record } })
  }

  function invalidFields({ fields }) {
    if (!fields || typeof fields !== 'object') {
      return bitableFail({ code: 1254001, msg: 'WrongRequestBody' })
    }
    const unknown = official.bitableFields === null ? undefined : Object.keys(fields).find((name) => !official.bitableFields.includes(name))
    return unknown === undefined ? null : bitableFail({ code: 1254045, msg: 'FieldNameNotFound' })
  }

  function bitableSearch({ appToken, tableId, body, query, headers }) {
    const denied = gate({ headers, scope: 'bitable:app', counted: true })
    if (denied) {
      return denied
    }
    const pageSize = Number(query.get('page_size') ?? 20)
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
      return { status: 400, payload: { code: 1254001, msg: 'WrongRequestBody' } }
    }
    const offset = parsePageToken({ token: query.get('page_token') })
    if (offset === null) {
      return bitableFail({ code: 1254001, msg: 'WrongRequestBody' })
    }
    const conditions = body.filter?.conditions ?? []
    const rows = state.bitableRecords
      .filter((record) => record.appToken === appToken && record.tableId === tableId)
      .filter((record) => conditions.every((condition) => condition.operator === 'is' && (condition.value ?? []).map(String).includes(String(record.fields[condition.field_name]))))
    const page = rows.slice(offset, offset + pageSize)
    const more = offset + pageSize < rows.length
    return kit.ok({ code: 0, msg: 'success', data: { items: page.map(({ record_id, fields }) => ({ record_id, fields })), has_more: more, total: rows.length, ...(more ? { page_token: `pt${offset + pageSize}` } : {}) } })
  }

  function approvalList({ query, headers }) {
    const denied = gate({ headers, scope: 'approval:approval', counted: true }); if (denied) return denied
    const start = Number(query.get('start_time')); const end = Number(query.get('end_time')); const size = Number(query.get('page_size') ?? 100)
    const offset = parsePageToken({ token: query.get('page_token') })
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 36000000 || !Number.isInteger(size) || size < 1 || size > 100 || offset === null) return fail({ code: 1390001, msg: 'invalid approval query' })
    const rows = [...official.approvals.values()].filter((item) => item.approval_code === query.get('approval_code') && Number(item.start_time) >= start && Number(item.start_time) <= end).sort((a, b) => Number(a.start_time) - Number(b.start_time))
    const more = offset + size < rows.length
    return kit.ok({ code: 0, msg: 'success', data: { instance_code_list: rows.slice(offset, offset + size).map((item) => item.instance_code), has_more: more, ...(more ? { page_token: `pt${offset + size}` } : {}) } })
  }

  function approvalGet({ instanceCode, headers }) {
    const denied = gate({ headers, scope: 'approval:approval', counted: true }); if (denied) return denied
    const instance = official.approvals.get(instanceCode)
    return instance ? kit.ok({ code: 0, msg: 'success', data: instance }) : fail({ code: 1390003, msg: 'instance not found' })
  }

  function bitableRecord({ method, recordId, appToken, tableId, body, headers }) {
    const denied = gate({ headers, scope: 'bitable:app', counted: true }); if (denied) return denied
    const record = state.bitableRecords.find((row) => row.record_id === recordId && row.appToken === appToken && row.tableId === tableId)
    if (!record) return bitableFail({ code: 1254043, msg: 'RecordNotFound' })
    if (method === 'PUT') { const invalid = invalidFields({ fields: body.fields }); if (invalid) return invalid; record.fields = { ...record.fields, ...body.fields } }
    return kit.ok({ code: 0, msg: 'success', data: { record: { record_id: record.record_id, fields: record.fields } } })
  }

  function adminRoutes() {
    return {
      'POST /__admin/approvals': ({ body }) => { for (const item of body.instances ?? []) official.approvals.set(item.instance_code, { ...item, form: typeof item.form === 'string' ? item.form : JSON.stringify(item.form ?? []) }); return kit.ok({ count: official.approvals.size }) },
      'POST /__admin/feishu-official': ({ body }) => {
        if (body.expireToken === true) {
          official.tokenEpoch += 1
        }
        if (body.ipDenied !== undefined) {
          official.ipDenied = body.ipDenied === true
        }
        if (body.quotaExhausted !== undefined) {
          official.quotaExhausted = body.quotaExhausted === true
        }
        if (Array.isArray(body.missingScopes)) {
          official.missingScopes = new Set(body.missingScopes)
        }
        if (body.scopeDepartments !== undefined) {
          official.scopeDepartments = body.scopeDepartments === null ? null : new Set(body.scopeDepartments)
        }
        if (body.patchMinIntervalMs !== undefined) {
          official.patchMinIntervalMs = Number(body.patchMinIntervalMs)
        }
        if (body.maxUsers !== undefined) {
          official.maxUsers = body.maxUsers === null ? null : Number(body.maxUsers)
        }
        if (Array.isArray(body.botNotInChats)) {
          official.botNotInChats = new Set(body.botNotInChats)
        }
        if (Array.isArray(body.unavailableRecipients)) {
          official.unavailableRecipients = new Set(body.unavailableRecipients)
        }
        if (body.bitableFields !== undefined) {
          official.bitableFields = body.bitableFields === null ? null : body.bitableFields
        }
        if (Array.isArray(body.departments)) {
          body.departments.forEach((department) => {
            official.departmentTree.set(department.id, { id: department.id, name: department.name ?? department.id, parent: department.parent ?? '0' })
            state.departments.add(department.id)
          })
        }
        return kit.ok(describe())
      },
      'GET /__admin/feishu-official': () => kit.ok(describe()),
      'POST /__admin/official-reset': () => {
        reset()
        return kit.ok({ reset: true })
      },
      'POST /__admin/official-users': ({ body }) => kit.ok({ seeded: seedUsers({ users: body.users ?? [] }).length, total: state.feishuUsers.size }),
      'GET /__admin/official-users': () =>
        kit.ok({ users: [...state.feishuUsers.values()].map(({ open_id, mobile, name, department_ids, employee_no, is_frozen }) => ({ open_id, mobile, name, department_ids, employee_no, is_frozen: is_frozen === true })) }),
    }
  }

  function describe() {
    return {
      tokenEpoch: official.tokenEpoch,
      ipDenied: official.ipDenied,
      quotaExhausted: official.quotaExhausted,
      missingScopes: [...official.missingScopes],
      scopeDepartments: official.scopeDepartments === null ? null : [...official.scopeDepartments],
      patchMinIntervalMs: official.patchMinIntervalMs,
      maxUsers: official.maxUsers,
      calls: official.calls,
      departments: [...official.departmentTree.values()],
      departmentWrites: official.departmentWrites,
      departmentDeletes: official.departmentDeletes,
    }
  }

  function routes() {
    return {
      [`POST ${FEISHU_DOMAIN_PREFIX}/auth/v3/tenant_access_token/internal`]: tokenRoute,
      [`POST ${FEISHU_DOMAIN_PREFIX}/contact/v3/users/batch_get_id`]: batchGetId,
      [`POST ${FEISHU_DOMAIN_PREFIX}/contact/v3/users`]: createUser,
      [`GET ${FEISHU_DOMAIN_PREFIX}/contact/v3/users/find_by_department`]: findByDepartment,
      [`GET ${FEISHU_DOMAIN_PREFIX}/contact/v3/scopes`]: contactScopes,
      [`GET ${FEISHU_DOMAIN_PREFIX}/im/v1/chats`]: listChats,
      [`POST ${FEISHU_DOMAIN_PREFIX}/im/v1/messages`]: sendMessage,
      ...adminRoutes(),
    }
  }

  function dynamicHandlerFor({ method, pathname }) {
    const path = pathname.startsWith('/feishu/open-apis') ? pathname.slice('/feishu/open-apis'.length) : null
    if (path === '/approval/v4/instances' && method === 'GET') return approvalList
    const approval = /^\/approval\/v4\/instances\/([^/]+)$/.exec(path)
    if (approval && method === 'GET') return (request) => approvalGet({ ...request, instanceCode: decodeURIComponent(approval[1]) })
    const subscription = /^\/approval\/v4\/approvals\/([^/]+)\/(subscribe|unsubscribe)$/.exec(path)
    if (subscription && method === 'POST') return ({ headers }) => { const denied = gate({ headers, scope: 'approval:approval', counted: true }); if (denied) return denied; if (subscription[2] === 'subscribe') official.subscriptions.add(subscription[1]); else official.subscriptions.delete(subscription[1]); return kit.ok({ code: 0, msg: 'success', data: {} }) }
    const record = /^\/bitable\/v1\/apps\/([^/]+)\/tables\/([^/]+)\/records\/([^/]+)$/.exec(path)
    if (record && ['GET', 'PUT'].includes(method) && record[3] !== 'search') return (request) => bitableRecord({ ...request, method, appToken: record[1], tableId: record[2], recordId: record[3] })

    if (path === null) {
      return null
    }
    const user = /^\/contact\/v3\/users\/([^/]+)$/.exec(path)
    if (user && !['batch_get_id', 'find_by_department'].includes(user[1])) {
      const openId = decodeURIComponent(user[1])
      if (method === 'GET') {
        return (request) => getUser({ ...request, openId })
      }
      if (method === 'PATCH') {
        return (request) => patchUser({ ...request, openId })
      }
    }
    if (path === '/contact/v3/departments' && method === 'POST') return (request) => writeDepartment(request)
    const department = /^\/contact\/v3\/departments\/([^/]+)$/.exec(path)
    if (department && method === 'GET') return (request) => getDepartment({ ...request, departmentId: decodeURIComponent(department[1]) })
    if (department && method === 'PATCH') return (request) => writeDepartment({ ...request, departmentId: decodeURIComponent(department[1]) })
    if (department && method === 'DELETE') return () => { official.departmentDeletes++; return fail({ code: 43031, msg: 'department deletion is disabled in synchronization tests' }) }
    const children = /^\/contact\/v3\/departments\/([^/]+)\/children$/.exec(path)
    if (children && method === 'GET') {
      return (request) => departmentChildren({ ...request, departmentId: decodeURIComponent(children[1]) })
    }
    const tables = /^\/bitable\/v1\/apps\/([^/]+)\/tables$/.exec(path)
    if (tables && method === 'GET') {
      return (request) => bitableTables(request)
    }
    const fieldList = /^\/bitable\/v1\/apps\/([^/]+)\/tables\/([^/]+)\/fields$/.exec(path)
    if (fieldList && method === 'GET') {
      return (request) => bitableFieldList(request)
    }
    const records = /^\/bitable\/v1\/apps\/([^/]+)\/tables\/([^/]+)\/records(\/search)?$/.exec(path)
    if (records && method === 'GET' && !records[3]) return (request) => bitableSearch({ ...request, body: {}, appToken: records[1], tableId: records[2] })
    if (records && method === 'POST') {
      return (request) => (records[3] ? bitableSearch : bitableCreate)({ ...request, appToken: records[1], tableId: records[2] })
    }
    return null
  }

  return { routes, dynamicHandlerFor, reset, describe }
}

const DEFAULT_BITABLE_COLUMNS = [
  { field_name: '姓名', type: 1 },
  { field_name: '工号', type: 1 },
  { field_name: '手机号', type: 13 },
  { field_name: '邮箱', type: 1 },
  { field_name: '部门', type: 1 },
  { field_name: '入职日期', type: 5 },
]
