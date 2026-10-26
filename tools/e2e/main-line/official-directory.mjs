import { createHmac } from 'node:crypto'

export function createDirectoryOfficial({ target, kit }) {
  let users = new Map()
  let departments = new Map([['1', { id: '1', name: 'Company', parentId: '0', customId: null }]])
  let messages = []
  let writes = 0
  let deletes = 0
  let sequence = 10
  let denied = false
  let minimumIntervalMs = 0
  let lastWrite = 0
  const messageKeys = new Map()
  const base = `/${target}`
  const ding = target === 'dingtalk'
  const ok = (data = {}) => kit.ok(ding ? { errcode: 0, result: data } : { errcode: 0, ...data })
  const fail = (errcode) => kit.ok({ errcode, errmsg: 'mock provider rejection' })
  const idList = (user) => user.department_ids.map(Number)
  const publicUser = (user) => ding ? { userid: user.userid, job_number: user.employee_no ?? user.userid, name: user.name, mobile: user.mobile, email: user.email, dept_id_list: idList(user), active: true, title: user.title } : { userid: user.userid, name: user.name, mobile: user.mobile, email: user.email, department: idList(user), status: user.enable === 0 ? 2 : 1, position: user.title }
  const publicDepartment = (department) => ding ? { dept_id: Number(department.id), name: department.name, parent_id: Number(department.parentId), source_identifier: department.customId, order: department.order ?? 0 } : { id: Number(department.id), name: department.name, parentid: Number(department.parentId), order: department.order ?? 0 }
  const token = ({ query, headers }) => ding ? query.get('access_token') : query.get('access_token')
  function guard({ query, headers, write = false }) {
    if (!token({ query, headers })?.startsWith(`${target}-token-`)) return fail(40014)
    if (denied) return fail(60011)
    if (write && Date.now() - lastWrite < minimumIntervalMs) return fail(ding ? 90002 : 45009)
    if (write) lastWrite = Date.now()
    return null
  }
  function memberGet({ body, query, headers }) {
    const error = guard({ query, headers }); if (error) return error
    const user = users.get(ding ? body.userid : query.get('userid'))
    return user ? ok(publicUser(user)) : fail(ding ? 60121 : 60111)
  }
  function memberFind({ body, query, headers }) {
    const error = guard({ query, headers }); if (error) return error
    const user = [...users.values()].find((user) => body.mobile ? user.mobile === body.mobile : user.email === body.email)
    return user ? ok({ userid: user.userid }) : fail(ding ? 60121 : body.mobile ? 60146 : 60147)
  }
  function memberCreate({ body, query, headers }) {
    const error = guard({ query, headers, write: true }); if (error) return error
    if (users.has(body.userid)) return fail(ding ? 60102 : 60102)
    if ([...users.values()].some((user) => user.mobile && user.mobile === body.mobile)) return fail(60104)
    const ids = (ding ? body.dept_id_list : body.department)?.map(String) ?? []
    if (!ids.length || ids.some((id) => !departments.has(id))) return fail(60003)
    users.set(body.userid, { userid: body.userid, employee_no: body.job_number ?? body.userid, name: body.name, mobile: body.mobile, email: body.email, department_ids: ids, enable: 1 })
    writes++
    return ok({ userid: body.userid })
  }
  function memberUpdate({ body, query, headers }) {
    const error = guard({ query, headers, write: true }); if (error) return error
    const user = users.get(body.userid)
    if (!user) return fail(ding ? 60121 : 60111)
    const ids = ding ? body.dept_id_list : body.department
    if (ids?.some((id) => !departments.has(String(id)))) return fail(60003)
    if (ids) user.department_ids = ids.map(String)
    if (body.enable !== undefined) user.enable = body.enable
    if (body.title ?? body.position) user.title = body.title ?? body.position
    writes++
    return ok()
  }
  function memberList({ body, query, headers }) {
    const error = guard({ query, headers }); if (error) return error
    const size = Math.min(ding ? 100 : 300, body.size ?? body.limit ?? 100)
    const offset = Number(body.cursor ?? 0)
    const members = [...users.values()]
    if (ding) {
      const list = members.filter((user) => user.department_ids.includes(String(body.dept_id))).map(publicUser)
      return ok({ list: list.slice(offset, offset + size), has_more: offset + size < list.length, next_cursor: offset + size })
    }
    const list = members.flatMap((user) => user.department_ids.map((id) => ({ userid: user.userid, department: Number(id) })))
    return ok({ dept_user: list.slice(offset, offset + size), next_cursor: offset + size < list.length ? String(offset + size) : '' })
  }
  function departmentGet({ body, query, headers }) {
    const error = guard({ query, headers }); if (error) return error
    const row = departments.get(String(ding ? body.dept_id : query.get('id')))
    return row ? ok(ding ? publicDepartment(row) : { department: publicDepartment(row) }) : fail(60003)
  }
  function departmentList({ body, query, headers }) {
    const error = guard({ query, headers }); if (error) return error
    if (ding) return ok({ dept_id_list: [...departments.values()].filter((department) => department.parentId === String(body.dept_id)).map((department) => Number(department.id)) })
    return ok({ department_id: [...departments.values()].map((department) => ({ id: Number(department.id), parentid: Number(department.parentId), order: department.order ?? 0 })) })
  }
  function departmentWrite({ body, query, headers, creating }) {
    const error = guard({ query, headers, write: true }); if (error) return error
    const id = creating ? String(body.id ?? ++sequence) : String(ding ? body.dept_id : body.id)
    const current = departments.get(id)
    if (!creating && !current) return fail(60003)
    const parentId = String((ding ? body.parent_id : body.parentid) ?? current?.parentId)
    const name = body.name ?? current?.name
    if (!departments.has(parentId) || parentId === id || id === '1') return fail(60003)
    let ancestor = parentId
    for (let depth = 0; ancestor !== '0'; depth++) { if (depth > (ding ? 20 : 15) || ancestor === id) return fail(60003); ancestor = departments.get(ancestor)?.parentId ?? '0' }
    if ([...departments.values()].some((department) => department.id !== id && department.parentId === parentId && department.name === name)) return fail(60008)
    departments.set(id, { id, name, parentId, customId: body.source_identifier ?? current?.customId ?? null, order: body.order ?? current?.order ?? 0 })
    writes++
    return ok(ding ? { dept_id: Number(id) } : { id: Number(id) })
  }
  function notice({ body, query, headers, robot = false }) {
    const error = robot ? null : guard({ query, headers, write: true }); if (error) return error
    if (robot && ding) { const timestamp = query.get('timestamp'); const expected = createHmac('sha256', 'robot-secret').update(`${timestamp}\nrobot-secret`).digest('base64'); if (query.get('sign') !== expected) return fail(310000) }
    const recipients = ding ? body.userid_list : body.touser
    const content = robot ? body.text?.content : ding ? body.msg?.text?.content : body.text?.content
    if (!robot && (!recipients || !body[ding ? 'agent_id' : 'agentid'])) return fail(40035)
    const key = JSON.stringify([recipients, content])
    const previous = messageKeys.get(key)
    if (!ding && body.enable_duplicate_check && previous && Date.now() - previous < Math.min(14400, body.duplicate_check_interval ?? 1800) * 1000) return ok({ msgid: 'duplicate' })
    messages.push({ recipients, content, robot })
    messageKeys.set(key, Date.now())
    return ok(ding ? { task_id: messages.length } : { msgid: String(messages.length) })
  }
  function routes() {
    const read = ding ? 'POST' : 'GET'
    const prefix = ding ? '/topapi/v2' : '/cgi-bin'
    return {
      [`POST /__admin/${target}`]: ({ body }) => { if (body.reset) { users = new Map(); departments = new Map([['1', { id: '1', name: 'Company', parentId: '0', customId: null }]]); messages = []; writes = 0; deletes = 0; sequence = 10; messageKeys.clear() }; if (body.departments) departments = new Map(body.departments.map((department) => [String(department.id), { ...department, id: String(department.id), parentId: String(department.parentId), customId: department.customId ?? null }])); denied = body.denied ?? false; minimumIntervalMs = body.minimumIntervalMs ?? 0; return kit.ok({ ok: true }) },
      [`GET /__admin/${target}`]: () => kit.ok({ users: [...users.values()], departments: [...departments.values()], messages, writes, deletes }),
      [`${ding ? 'POST' : 'GET'} ${base}${ding ? '/v1.0/oauth2/accessToken' : '/cgi-bin/gettoken'}`]: ({ body, query }) => ding ? kit.ok({ accessToken: `${target}-token-${body.appKey}`, expireIn: 7200 }) : kit.ok({ errcode: 0, access_token: `${target}-token-${query.get('corpsecret')}`, expires_in: 7200 }),
      [`${read} ${base}${prefix}/user/get`]: memberGet,
      [`POST ${base}${prefix}/user/${ding ? 'getbymobile' : 'getuserid'}`]: memberFind,
      [`POST ${base}${prefix}/user/get_userid_by_email`]: memberFind,
      [`POST ${base}${prefix}/user/create`]: memberCreate,
      [`POST ${base}${prefix}/user/update`]: memberUpdate,
      [`POST ${base}${prefix}/user/${ding ? 'list' : 'list_id'}`]: memberList,
      [`${read} ${base}${prefix}/department/get`]: departmentGet,
      [`${read} ${base}${prefix}/department/${ding ? 'listsubid' : 'simplelist'}`]: departmentList,
      [`POST ${base}${prefix}/department/create`]: (params) => departmentWrite({ ...params, creating: true }),
      [`POST ${base}${prefix}/department/update`]: (params) => departmentWrite({ ...params, creating: false }),
      [`POST ${base}${ding ? '/topapi/message/corpconversation/asyncsend_v2' : '/cgi-bin/message/send'}`]: notice,
      [`POST ${base}${ding ? '/robot/send' : '/cgi-bin/webhook/send'}`]: (params) => notice({ ...params, robot: true }),
    }
  }
  return { routes }
}
