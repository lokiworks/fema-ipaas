const DAY_MS = 24 * 60 * 60 * 1000
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const MAX_CAPACITY = 300
const MAX_IDS = 300
const MAX_SCROLL_SESSIONS = 2000
const BEISEN_PREFIX = '/beisen/TenantBaseExternal/api/v5'
const DEFAULT_TENANT_ID = 100000

export function createBeisenOfficial({ state, kit }) {
  const official = createState()
  state.beisenPages ??= { withData: 0, empty: 0 }
  state.timeWindowRequests ??= []
  const quirkPage = kit.quirkPage ?? (({ page }) => page)

  function createState() {
    return {
      tenantId: DEFAULT_TENANT_ID,
      scrollTtlMs: 10000,
      indexLagMs: 0,
      startInclusive: false,
      scrolls: new Map(),
      scrollSequence: 0,
      orgs: defaultOrgs({ tenantId: DEFAULT_TENANT_ID }),
      expiredScrolls: 0,
    }
  }

  function defaultOrgs({ tenantId }) {
    const root = 900000000 + tenantId
    return new Map([
      [root, { oId: root, name: '公司', parent: 0 }],
      [20301, { oId: 20301, name: '研发部', parent: root }],
      [20302, { oId: 20302, name: '人力资源部', parent: root }],
      [20303, { oId: 20303, name: '前端组', parent: 20301 }],
    ])
  }

  function reset() {
    Object.assign(official, createState())
    state.employees = []
    state.timeWindowRequests = []
    state.beisenRules = []
    state.beisenPages = { withData: 0, empty: 0 }
  }

  function envelope({ code = '200', message = '', data, extra = {} }) {
    return kit.ok({ ...extra, data, code, message })
  }

  function parameterError({ message }) {
    return kit.ok({ data: null, code: '417', message })
  }

  function gate({ headers }) {
    const authorization = String(headers.authorization ?? '')
    if (!authorization.startsWith(`Bearer ${kit.BEISEN_TOKEN}`)) {
      return kit.ok({ error: 'invalid_token', error_description: 'access_token is invalid', error_code: '40003' })
    }
    return null
  }

  function appKeyOf({ headers }) {
    return String(headers.authorization ?? '').slice(`Bearer ${kit.BEISEN_TOKEN}:`.length)
  }

  function ruleResponse({ headers, empStatus }) {
    const mode = kit.beisenRuleFor({ appKey: appKeyOf({ headers }), empStatus }) ?? { mode: null }
    if (mode.mode === 'RATE_LIMIT_429') {
      return { status: 429, payload: 'API rate limit exceeded', headers: mode.retryAfterSeconds === undefined ? {} : { 'retry-after': String(mode.retryAfterSeconds) } }
    }
    if (mode.mode === 'RATE_LIMIT_BODY') {
      return kit.ok({ error: 'rate_limit', error_description: 'API rate limit exceeded', error_code: '42901' })
    }
    if (mode.mode === 'SERVER_ERROR_500') {
      return { status: 500, payload: 'Beisen internal error' }
    }
    return null
  }

  function scrollPage({ matched, body, fingerprint }) {
    const capacity = Number(body.capacity ?? 100)
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_CAPACITY) {
      return { error: parameterError({ message: '每批次数据量必须小于等于300' }) }
    }
    const session = body.scrollId ? official.scrolls.get(body.scrollId) : { offset: 0, issuedAt: Date.now(), fingerprint }
    const expired = body.scrollId && (!session || Date.now() - session.issuedAt > official.scrollTtlMs || session.fingerprint !== fingerprint)
    if (expired) {
      official.expiredScrolls += 1
      return { page: [], total: matched.length, nextScrollId: null, last: true }
    }
    pruneScrolls()
    const offset = session.offset
    const slice = matched.slice(offset, offset + capacity)
    const nextOffset = offset + slice.length
    const last = nextOffset >= matched.length
    const nextScrollId = slice.length > 0 ? `sc${(official.scrollSequence += 1)}_${nextOffset}` : null
    if (nextScrollId) {
      official.scrolls.set(nextScrollId, { offset: nextOffset, issuedAt: Date.now(), fingerprint })
    }
    return { page: slice, total: matched.length, nextScrollId, last }
  }

  function pruneScrolls() {
    if (official.scrolls.size <= MAX_SCROLL_SESSIONS) {
      return
    }
    const cutoff = Date.now() - official.scrollTtlMs
    ;[...official.scrolls.entries()].filter(([, session]) => session.issuedAt < cutoff).forEach(([id]) => official.scrolls.delete(id))
  }

  function visibleAfterLag({ employee }) {
    return Date.now() - employee.changedAt >= (employee.visibleDelayMs ?? official.indexLagMs)
  }

  function stampText({ epochMs }) {
    return new Date(epochMs + BEIJING_OFFSET_MS).toISOString().slice(0, 19).replace('T', ' ')
  }

  function outputRecord({ employee }) {
    const { changedAt, systemOnly, visibleDelayMs, ...record } = employee
    const modifiedTime = stampText({ epochMs: changedAt })
    const businessModifiedTime = stampText({ epochMs: systemOnly === true ? changedAt - DAY_MS : changedAt })
    const stamps = { modifiedTime, businessModifiedTime }
    return {
      originalId: null,
      ...record,
      employeeInfo: { ...stamps, ...record.employeeInfo },
      recordInfo: { ...stamps, ...record.recordInfo },
    }
  }

  function timeWindow({ body, headers }) {
    const denied = gate({ headers })
    if (denied) {
      return denied
    }
    const limited = ruleResponse({ headers, empStatus: body.empStatus })
    if (limited) {
      return limited
    }
    state.timeWindowRequests.push(body)
    const from = kit.beisenTimeToEpoch(body.startTime)
    const to = kit.beisenTimeToEpoch(body.stopTime)
    if (Number.isNaN(from) || Number.isNaN(to)) {
      return parameterError({ message: 'Argument Error:StartTime or StopTime is not a valid date-time' })
    }
    if (from >= to) {
      return parameterError({ message: 'Argument Error:StartTime>=StopTime（开始时间不能大于等于结束时间）' })
    }
    if (to - from > 90 * DAY_MS) {
      return parameterError({ message: '只支持查询90天范围内的数据，请分段查询' })
    }
    const businessOnly = Number(body.timeWindowQueryType ?? 1) === 2
    const matched = state.employees
      .filter((employee) => visibleAfterLag({ employee }))
      .filter((employee) => (official.startInclusive ? kit.toSecond(employee.changedAt) >= from : kit.toSecond(employee.changedAt) > from) && kit.toSecond(employee.changedAt) <= to)
      .filter((employee) => !(businessOnly && employee.systemOnly === true))
      .filter((employee) => kit.statusAllowed({ employee, body }))
      .filter((employee) => (body.approvalStatuses?.length ? body.approvalStatuses : [4]).includes(Number(employee.recordInfo.approvalStatus ?? 4)))
    const result = scrollPage({ matched, body, fingerprint: JSON.stringify([body.startTime, body.stopTime, body.timeWindowQueryType, body.empStatus]) })
    if (result.error) {
      return result.error
    }
    const page = quirkPage({ page: result.page })
    state.beisenPages[page.length > 0 ? 'withData' : 'empty'] += 1
    return envelope({
      data: page.map((employee) => outputRecord({ employee })),
      extra: { total: result.total, ...(result.nextScrollId ? { scrollId: result.nextScrollId } : {}), isLastData: result.last },
    })
  }

  function descendantsOf({ oId }) {
    const children = [...official.orgs.values()].filter((org) => org.parent === oId)
    return children.flatMap((child) => [child, ...descendantsOf({ oId: child.oId })])
  }

  function departmentUnder({ orgOId, departmentOId, includeSub }) {
    if (Number(departmentOId) === orgOId) {
      return true
    }
    if (!includeSub) {
      return false
    }
    const known = official.orgs.has(Number(departmentOId))
    const rootOId = 900000000 + official.tenantId
    if (!known) {
      return orgOId === rootOId
    }
    return descendantsOf({ oId: orgOId }).some((org) => org.oId === Number(departmentOId))
  }

  function currentEmployees({ body }) {
    const reference = body.queryDate ? kit.beisenTimeToEpoch(body.queryDate) : Date.now()
    const byUser = new Map()
    for (const employee of state.employees) {
      const start = kit.beisenTimeToEpoch(employee.recordInfo.startDate)
      if (body.isGetLatestRecord === false && Number.isFinite(start) && start > reference) continue
      const key = String(employee.employeeInfo.userID)
      const previous = byUser.get(key)
      if (!previous || employee.changedAt >= previous.changedAt) byUser.set(key, employee)
    }
    return [...byUser.values()]
  }

  function employeesOfOrganization({ body, headers }) {
    const denied = gate({ headers })
    if (denied) {
      return denied
    }
    const limited = ruleResponse({ headers, empStatus: body.empStatus })
    if (limited) {
      return limited
    }
    const orgOId = Number(body.orgOId)
    if (!Number.isInteger(orgOId) || orgOId <= 0) {
      return kit.ok({ scrollId: null, isLastData: false, total: 0, data: null, code: '417', message: 'OrgOId不能为空且为正整数！' })
    }
    if (!official.orgs.has(orgOId)) {
      return kit.ok({ scrollId: null, isLastData: false, total: 0, data: null, code: '417', message: '组织单元不存在' })
    }
    const matched = currentEmployees({ body })
      .filter((employee) => departmentUnder({ orgOId, departmentOId: employee.recordInfo.oIdDepartment, includeSub: body.includeSubOrg === true }))
      .filter((employee) => kit.statusAllowed({ employee, body }))
    const result = scrollPage({ matched, body, fingerprint: JSON.stringify([orgOId, body.includeSubOrg, body.empStatus, body.withDisabled]) })
    if (result.error) {
      return result.error
    }
    return envelope({
      data: result.page.map((employee) => outputRecord({ employee })),
      extra: { total: result.total, ...(result.nextScrollId ? { scrollId: result.nextScrollId } : {}), isLastData: result.last },
    })
  }

  function orgOutput({ org }) {
    return { oId: org.oId, name: org.name, pOIdOrgAdmin: org.parent, status: org.disabled === true ? 0 : 1, stdIsDeleted: false }
  }

  function organizationChanges({ body, headers }) {
    const denied = gate({ headers })
    if (denied) return denied
    const from = kit.beisenTimeToEpoch(body.startTime)
    const to = kit.beisenTimeToEpoch(body.stopTime)
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) return parameterError({ message: 'Invalid organization time window' })
    const matched = [...official.orgs.values()].filter((org) => org.changedAt >= from && org.changedAt <= to)
    const result = scrollPage({ matched, body, fingerprint: JSON.stringify(['organization', body.startTime, body.stopTime]) })
    if (result.error) return result.error
    return envelope({ data: result.page.map((org) => orgOutput({ org })), extra: { total: result.total, scrollId: result.nextScrollId, isLastData: result.last } })
  }

  function subOrganizations({ body, headers }) {
    const denied = gate({ headers })
    if (denied) {
      return denied
    }
    const oId = Number(body.oId)
    if (!Number.isInteger(oId) || oId < 0) {
      return parameterError({ message: 'OId必须大于等于0' })
    }
    if (oId !== 0 && !official.orgs.has(oId)) {
      return parameterError({ message: '组织单元不存在' })
    }
    const children = [...official.orgs.values()].filter((org) => org.parent === oId && (body.isWithDisable === true || org.disabled !== true))
    const self = body.isWithSelf === true && official.orgs.has(oId) ? [official.orgs.get(oId)] : []
    return envelope({ data: [...self, ...children].map((org) => orgOutput({ org })) })
  }

  function subOrganizationTrees({ body, headers }) {
    const denied = gate({ headers })
    if (denied) {
      return denied
    }
    const oIds = body.oIds
    if (!Array.isArray(oIds) || oIds.some((id) => !Number.isInteger(id) || id < 0)) {
      return parameterError({ message: 'OIds所有元素必须为大于等于0的整数' })
    }
    const missing = oIds.find((id) => id !== 0 && !official.orgs.has(id))
    if (missing !== undefined) {
      return parameterError({ message: '组织单元不存在' })
    }
    const descendants = oIds.flatMap((oId) => descendantsOf({ oId }))
    const selves = body.isWithSelf === true ? oIds.filter((id) => official.orgs.has(id)).map((id) => official.orgs.get(id)) : []
    return envelope({ data: [...selves, ...descendants].filter((org) => body.isWithDisable === true || org.disabled !== true).map((org) => orgOutput({ org })) })
  }

  function serviceInfoByIds({ body, headers }) {
    const denied = gate({ headers })
    if (denied) {
      return denied
    }
    if (!Array.isArray(body.oIds)) {
      return parameterError({ message: 'Value cannot be null.\r\nParameter name: Argument name: Ids is null' })
    }
    if (body.oIds.length > MAX_IDS) {
      return parameterError({ message: 'The ids should never be more than 300（ids元素个数不能超过300个）' })
    }
    const wanted = new Set(body.oIds.map(Number))
    const records = state.employees.filter((employee) => wanted.has(Number(employee.employeeInfo.userID))).map((employee) => ({ userID: employee.employeeInfo.userID, ...employee.recordInfo }))
    return envelope({ data: records })
  }

  function userIdByEmail({ body, headers }) {
    const denied = gate({ headers })
    if (denied) {
      return denied
    }
    if (typeof body.email !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
      return parameterError({ message: `${body.email ?? ''}不是合法的Email格式` })
    }
    const match = state.employees.find((employee) => employee.employeeInfo.email === body.email)
    return envelope({ data: match ? match.employeeInfo.userID : null })
  }

  function routes() {
    return {
      [`POST ${BEISEN_PREFIX}/Employee/GetByTimeWindow`]: timeWindow,
      [`POST ${BEISEN_PREFIX}/Employee/GetEmployeeOfOrganization`]: employeesOfOrganization,
      [`POST ${BEISEN_PREFIX}/Employee/GetServiceInfoByIds`]: serviceInfoByIds,
      [`POST ${BEISEN_PREFIX}/Employee/GetUserIDByEmail`]: userIdByEmail,
      [`POST ${BEISEN_PREFIX}/Organization/GetSubOrganizations`]: subOrganizations,
      [`POST ${BEISEN_PREFIX}/Organization/GetSubOrganizationTrees`]: subOrganizationTrees,
      [`POST ${BEISEN_PREFIX}/Organization/GetByTimeWindow`]: organizationChanges,
      'POST /__admin/beisen-official': ({ body }) => {
        if (body.scrollTtlMs !== undefined) {
          official.scrollTtlMs = Number(body.scrollTtlMs)
        }
        if (body.indexLagMs !== undefined) {
          official.indexLagMs = Number(body.indexLagMs)
        }
        if (body.startInclusive !== undefined) {
          official.startInclusive = body.startInclusive === true
        }
        if (Array.isArray(body.orgs)) {
          official.orgs = new Map(body.orgs.map((org) => [Number(org.oId), { oId: Number(org.oId), name: org.name ?? String(org.oId), parent: Number(org.parent ?? 0), disabled: org.disabled === true, changedAt: Date.now() }]))
        }
        return kit.ok(describe())
      },
      'GET /__admin/beisen-official': () => kit.ok(describe()),
      'POST /__admin/beisen-official-reset': () => {
        reset()
        return kit.ok({ reset: true })
      },
    }
  }

  function describe() {
    return {
      scrollTtlMs: official.scrollTtlMs,
      indexLagMs: official.indexLagMs,
      startInclusive: official.startInclusive,
      expiredScrolls: official.expiredScrolls,
      orgs: [...official.orgs.values()],
    }
  }

  return { routes, reset, describe }
}
