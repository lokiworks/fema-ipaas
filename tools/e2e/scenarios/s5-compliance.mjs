import { websocketChecks } from './lib/s5-websocket.mjs'
import { ADMIN, ALL_PII, DEFAULT_SETTINGS, MEMBER, api, assert, check, codeStep, deleteFlowsNamed, http, leakedIn, openDatabaseSnapshot, payloadOf, publishFlow, secretsOf, signIn, sleep, summary, waitFor, webhookTrigger } from './lib/s5-kit.mjs'

const TAG = String(1000 + Math.floor(Math.random() * 8999))
const FLOW_PREFIX = 'S5 '
const secrets = secretsOf({ tag: TAG })
const payload = payloadOf({ secrets })

const admin = await signIn(ADMIN)
if (!admin) {
  throw new Error('管理员登录失败，先用 tools/e2e/stack/start-stack.sh 5 和 start-worker.sh 5 起栈')
}
const member = await ensureMember()

await check('准备：清理旧的 S5 工作流，隐私设置恢复默认', async () => {
  const removed = await deleteFlowsNamed({ session: admin, prefix: FLOW_PREFIX })
  await api({ method: 'POST', path: '/privacy-settings', body: DEFAULT_SETTINGS, token: admin.token })
  return { removed }
})

const flows = await check('准备：发布三个工作流（主线、失败、同步回包）', async () => {
  const main = await publishFlow({
    session: admin,
    displayName: `${FLOW_PREFIX}员工入职同步`,
    trigger: webhookTrigger({
      displayName: '接收员工数据',
      dedupeKeyPath: '{{trigger.body.employee.jobNumber}}',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '整理员工资料',
        code: 'export const code = async (inputs) => ({ synced: true, profile: inputs.payload.employee, contacts: inputs.payload.contacts, family: inputs.payload.family, note: inputs.payload.note, ids: inputs.payload.ids, echo: JSON.stringify(inputs.payload) })',
        input: { payload: "{{trigger['output']['body']}}" },
        nextAction: codeStep({
          name: 'step_2',
          displayName: '薪资核算',
          sensitive: true,
          code: `export const code = async () => ({ salary: ${secrets.salary}, grade: '${secrets.grade}', memo: '${secrets.memo}' })`,
          input: {},
          nextAction: codeStep({
            name: 'step_3',
            displayName: '通知 HR',
            code: 'export const code = async (inputs) => ({ sent: true, text: inputs.text })',
            input: { text: "备注：{{step_2['output']['memo']}}，职级 {{step_2['output']['grade']}}" },
          }),
        }),
      }),
    }),
  })
  const fail = await publishFlow({
    session: admin,
    displayName: `${FLOW_PREFIX}员工同步失败`,
    trigger: webhookTrigger({
      displayName: '接收员工数据',
      dedupeKeyPath: '{{trigger.body.employee.jobNumber}}',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '写入飞书',
        code: "export const code = async (inputs) => { const e = inputs.payload.employee; throw new Error('飞书拒绝了 ' + e.mobile + ' 身份证 ' + e.idCard + ' 邮箱 ' + e.email + ' 令牌 ' + e.apiToken + ' password=' + inputs.pwd) }",
        input: { payload: "{{trigger['output']['body']}}", pwd: "{{trigger['output']['body']['pwd']}}" },
      }),
    }),
  })
  return { main, fail }
})

if (flows) {
  const mainRun = await check('主线：带敏感字段的数据触发一次完整运行', async () => {
    const response = await http({ method: 'POST', path: `/webhooks/${flows.main}`, body: payload })
    assert(response.ok, `webhook 返回 ${response.status}`)
    return waitFor({
      what: '主线运行结束',
      probe: async () => {
        const runs = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=5&type=ALL&businessKey=${secrets.jobNumber}`, token: admin.token })
        const run = runs.data.find((item) => item.workflowId === flows.main)
        return run && ['SUCCEEDED', 'FAILED', 'INTERNAL_ERROR'].includes(run.status) ? run : null
      },
    })
  })
  const failRun = await check('失败：同样的数据触发会报错的工作流', async () => {
    const response = await http({ method: 'POST', path: `/webhooks/${flows.fail}`, body: { ...payload, pwd: secrets.password } })
    assert(response.ok, `webhook 返回 ${response.status}`)
    return waitFor({
      what: '失败运行结束',
      probe: async () => {
        const runs = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=5&type=ALL&businessKey=${secrets.jobNumber}`, token: admin.token })
        const run = runs.data.find((item) => item.workflowId === flows.fail)
        return run && ['SUCCEEDED', 'FAILED', 'INTERNAL_ERROR'].includes(run.status) ? run : null
      },
    })
  })
  await check('主线运行成功结束', async () => {
    assert(mainRun?.status === 'SUCCEEDED', `状态 ${mainRun?.status}`)
    return mainRun.status
  })
  await check('失败运行是 FAILED', async () => {
    assert(failRun?.status === 'FAILED', `状态 ${failRun?.status}`)
    return failRun.status
  })
  await sleep(3000)
  if (mainRun && failRun) {
    await apiLayerChecks({ mainRun, failRun })
    await permissionChecks({ mainRun, failRun })
    await retryChecks({ failRun })
    await surroundingChecks({ flows, failRun })
    await websocketChecks({ admin, member })
    await erasureChecks({ mainRun })
  }
}

summary()

async function apiLayerChecks({ mainRun, failRun }) {
  const detail = async ({ runId, token }) => (await http({ method: 'GET', path: `/executions/${runId}?projectId=${admin.projectId}`, token }))
  const adminMain = await detail({ runId: mainRun.id, token: admin.token })
  const adminFail = await detail({ runId: failRun.id, token: admin.token })

  await check('API：执行详情（管理员）不含任何敏感原值', async () => {
    const leaks = leakedIn({ text: JSON.stringify(adminMain.body.steps), secrets, only: ALL_PII })
    assert(leaks.length === 0, `泄露：${leaks.join(', ')}`)
  })
  await check('API：逐类脱敏——手机号、身份证、银行卡、邮箱、密钥', async () => {
    const text = JSON.stringify(adminMain.body.steps)
    const missing = [['手机号', '139****'], ['身份证', '110***'], ['银行卡', '***************'], ['邮箱', 'e***@corp-example.com'], ['密钥', '******']].filter(([, mark]) => !text.includes(mark))
    assert(missing.length === 0, `没看到脱敏后的形态：${missing.map(([name]) => name)}`)
  })
  await check('API：标为敏感的节点出参整体脱敏', async () => {
    const step = adminMain.body.steps.step_2
    const text = JSON.stringify(step?.output)
    assert(!text.includes(secrets.grade) && !text.includes(secrets.memo) && !text.includes(String(secrets.salary)), `step_2 出参 ${text}`)
  })
  await check('API：敏感节点的值流到下游节点的入参和出参也被遮住', async () => {
    const text = JSON.stringify(adminMain.body.steps.step_3)
    assert(!text.includes(secrets.grade) && !text.includes(secrets.memo), `step_3 ${text}`)
  })
  await check('API：失败运行的执行详情、错误信息不含敏感原值', async () => {
    const leaks = leakedIn({ text: JSON.stringify(adminFail.body.steps), secrets, only: [...ALL_PII, 'password'] })
    assert(leaks.length === 0, `泄露：${leaks.join(', ')}`)
  })
  await check('API：运行日志列表和详情里的失败原因不含敏感原值', async () => {
    const list = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=20&type=ALL&businessKey=${secrets.jobNumber}`, token: admin.token })
    const text = JSON.stringify(list)
    const detail = await http({ method: 'GET', path: `/run-logs/${failRun.id}?projectId=${admin.projectId}`, token: admin.token })
    const leaks = leakedIn({ text: `${text}${detail.text}`, secrets, only: [...ALL_PII, 'password'] })
    assert(leaks.length === 0, `泄露：${leaks.join(', ')}`)
  })

  const db = openDatabaseSnapshot()
  try {
    const rows = await db.query('select id, "logsFileId", "displayLogsFileId", "failedStep", "businessKey" from execution where id = any($1)', [[mainRun.id, failRun.id]])
    const byId = new Map(rows.map((row) => [row.id, row]))
    await check('库：运行记录上都登记了脱敏后的展示日志', async () => {
      assert(rows.every((row) => row.displayLogsFileId && row.logsFileId), `displayLogsFileId：${rows.map((row) => row.displayLogsFileId)}`)
    })
    await check('库：展示日志文件（脱敏发生在写入前）不含敏感原值', async () => {
      const texts = await Promise.all(rows.filter((row) => row.displayLogsFileId).map((row) => db.fileText(row.displayLogsFileId)))
      const leaks = leakedIn({ text: texts.join('\n'), secrets, only: [...ALL_PII, 'password', 'grade', 'memo'] })
      assert(leaks.length === 0, `泄露：${leaks.join(', ')}`)
    })
    await check('库：展示日志和失败原因不含服务器本地路径和堆栈，错误信息本身还在', async () => {
      const failRow = byId.get(failRun.id)
      const displayText = await db.fileText(failRow.displayLogsFileId)
      const combined = `${displayText}${JSON.stringify(failRow.failedStep)}`
      const traces = [/\/(private|tmp|Users|home|var)\//, /worker-cache/, /\\n\s+at\s/, /\n\s+at\s/, /node:internal/].filter((pattern) => pattern.test(combined))
      assert(traces.length === 0, `还有本地路径或堆栈：${traces.map(String)}`)
      assert(displayText.includes('飞书拒绝了'), '错误信息被一并删掉了')
      const response = await http({ method: 'GET', path: `/executions/${failRun.id}?projectId=${admin.projectId}`, token: admin.token })
      assert(!/worker-cache|\/private\//.test(JSON.stringify(response.body.steps)), '执行详情接口还带本地路径')
    })
    await check('库：原始日志文件保留原文（用于查看原文和从失败节点重跑）', async () => {
      const text = await db.fileText(byId.get(mainRun.id).logsFileId)
      assert(text.includes(secrets.mobile) && text.includes(secrets.idCard), '原始日志里没有原文')
    })
    await check('库：运行记录上的失败原因（failedStep）不含敏感原值', async () => {
      const text = JSON.stringify(byId.get(failRun.id).failedStep)
      const leaks = leakedIn({ text, secrets, only: [...ALL_PII, 'password'] })
      assert(leaks.length === 0, `泄露：${leaks.join(', ')} 内容 ${text.slice(0, 300)}`)
    })
  }
  finally {
    await db.close()
  }
}

async function permissionChecks({ mainRun }) {
  const revealPath = `/executions/${mainRun.id}/reveal`
  const asMember = (body) => http({ method: 'POST', path: revealPath, body, token: member.token })
  const asAdmin = (body) => http({ method: 'POST', path: revealPath, body, token: admin.token })

  await check('权限：无查看原文权限的成员看到的运行详情是脱敏的', async () => {
    const response = await http({ method: 'GET', path: `/executions/${mainRun.id}?projectId=${admin.projectId}`, token: member.token })
    assert(response.ok, `成员读不到运行详情 ${response.status}`)
    const leaks = leakedIn({ text: JSON.stringify(response.body.steps), secrets, only: ALL_PII })
    assert(leaks.length === 0, `泄露：${leaks.join(', ')}`)
  })
  await check('权限：无权限的成员直接调查看原文接口被拒绝（403），响应里没有原文', async () => {
    const response = await asMember({ stepName: 'trigger', reason: '想看看数据' })
    assert(response.status === 403, `状态 ${response.status}`)
    assert(leakedIn({ text: response.text, secrets, only: ALL_PII }).length === 0, '被拒绝的响应里带了原文')
  })
  await check('权限：成员读不到审计日志', async () => {
    const response = await http({ method: 'GET', path: '/audit-events?limit=5', token: member.token })
    assert(response.status === 403, `状态 ${response.status}`)
  })
  await check('权限：成员不能改隐私设置', async () => {
    const response = await http({ method: 'POST', path: '/privacy-settings', body: DEFAULT_SETTINGS, token: member.token })
    assert(response.status === 403, `状态 ${response.status}`)
  })
  await check('权限：成员直接取原始日志文件也取不到', async () => {
    const db = openDatabaseSnapshot()
    const [row] = await db.query('select "logsFileId", "displayLogsFileId" from execution where id = $1', [mainRun.id])
    await db.close()
    const attempts = await Promise.all([row.logsFileId, row.displayLogsFileId].map((fileId) => http({ method: 'GET', path: `/files/${fileId}?projectId=${admin.projectId}`, token: member.token })))
    const leaked = attempts.filter((response) => leakedIn({ text: response.text, secrets, only: ALL_PII }).length > 0)
    assert(leaked.length === 0, `文件接口返回了原文：${attempts.map((response) => response.status)}`)
    assert(attempts.every((response) => !response.ok), `文件接口对用户令牌返回了 ${attempts.map((response) => response.status)}`)
  })
  await check('查看原文：必须填原因（不填 409，太短 400）', async () => {
    const none = await asAdmin({ stepName: 'trigger' })
    const tooShort = await asAdmin({ stepName: 'trigger', reason: 'ab' })
    assert(none.status === 409, `不填原因返回 ${none.status}`)
    assert(tooShort.status === 400, `原因太短返回 ${tooShort.status}`)
  })
  const revealed = await check('查看原文：管理员填了原因后拿到原文（只含这一个步骤）', async () => {
    const response = await asAdmin({ stepName: 'trigger', reason: '核对入职同步的原始数据' })
    assert(response.ok, `状态 ${response.status} ${response.text.slice(0, 200)}`)
    const text = JSON.stringify(response.body)
    assert(text.includes(secrets.mobile) && text.includes(secrets.idCard), '没有拿到原文')
    assert(response.body.stepName === 'trigger' && !text.includes(secrets.salary.toString()), '返回了其他步骤的数据')
    return true
  })
  await check('查看原文：每次查看都写进审计日志（谁、哪次运行、哪个步骤、原因），审计里不带原文', async () => {
    assert(revealed, '前一步失败')
    const events = await waitFor({
      what: '审计日志出现查看原文记录',
      timeoutMs: 15000,
      probe: async () => {
        const page = await api({ method: 'GET', path: `/audit-events?action=workflow.run.payload.revealed&limit=20`, token: admin.token })
        const mine = page.data.filter((event) => event.data?.execution?.id === mainRun.id)
        return mine.length > 0 ? mine : null
      },
    })
    const event = events[0]
    assert(event.userEmail === ADMIN.email, `操作人 ${event.userEmail}`)
    assert(event.data.stepName === 'trigger' && String(event.data.reason).includes('核对入职同步'), `审计内容 ${JSON.stringify(event.data).slice(0, 300)}`)
    assert(leakedIn({ text: JSON.stringify(event), secrets, only: ALL_PII }).length === 0, '审计日志里带了原文')
  })
  await check('查看原文：失败的尝试（被拒绝）也留下审计记录', async () => {
    const page = await api({ method: 'GET', path: `/audit-events?action=workflow.run.payload.reveal.denied&limit=20`, token: admin.token })
    assert(page.data.some((event) => event.data?.execution?.id === mainRun.id && event.userEmail === MEMBER.email), '没有被拒绝的审计记录')
  })
  await check('设置：把成员加入「可以查看原文」后，成员能看，审计里记的是成员', async () => {
    await api({ method: 'POST', path: '/privacy-settings', body: { ...DEFAULT_SETTINGS, rawViewRoles: ['OWNER', 'ADMIN', 'MEMBER'] }, token: admin.token })
    const response = await asMember({ stepName: 'trigger', reason: '值班排查' })
    assert(response.ok, `状态 ${response.status}`)
    const page = await api({ method: 'GET', path: `/audit-events?action=workflow.run.payload.revealed&limit=20`, token: admin.token })
    assert(page.data.some((event) => event.userEmail === MEMBER.email), '审计里没有成员的查看记录')
    await api({ method: 'POST', path: '/privacy-settings', body: DEFAULT_SETTINGS, token: admin.token })
  })
}

async function retryChecks({ failRun }) {
  const retried = async (strategy) => {
    const response = await http({ method: 'POST', path: `/executions/${failRun.id}/retry`, body: { strategy, projectId: admin.projectId }, token: admin.token })
    assert(response.ok, `重试 ${strategy} 返回 ${response.status} ${response.text.slice(0, 200)}`)
    return response.body
  }
  const settled = (runId) => waitFor({
    what: '重试的运行结束',
    probe: async () => {
      const response = await http({ method: 'GET', path: `/executions/${runId}?projectId=${admin.projectId}`, token: admin.token })
      return response.ok && ['FAILED', 'SUCCEEDED', 'INTERNAL_ERROR'].includes(response.body.status) ? response : null
    },
  })
  await check('重试：整体重跑后，新运行的日志仍然脱敏（不会因为重试重新泄露）', async () => {
    const run = await retried('ON_LATEST_VERSION')
    const response = await settled(run.id)
    const leaks = leakedIn({ text: JSON.stringify(response.body), secrets, only: [...ALL_PII, 'password'] })
    assert(leaks.length === 0, `泄露：${leaks.join(', ')}`)
    const db = openDatabaseSnapshot()
    const [row] = await db.query('select "displayLogsFileId", "failedStep" from execution where id = $1', [run.id])
    const text = `${JSON.stringify(row.failedStep)}${row.displayLogsFileId ? await db.fileText(row.displayLogsFileId) : ''}`
    await db.close()
    const stored = leakedIn({ text, secrets, only: [...ALL_PII, 'password'] })
    assert(stored.length === 0, `库里的展示日志泄露：${stored.join(', ')}`)
  })
  await check('重试：从失败节点重跑后，原运行的日志和失败原因仍然脱敏', async () => {
    await retried('FROM_FAILED_STEP')
    await settled(failRun.id)
    await sleep(2500)
    const response = await http({ method: 'GET', path: `/executions/${failRun.id}?projectId=${admin.projectId}`, token: admin.token })
    const leaks = leakedIn({ text: JSON.stringify(response.body.steps), secrets, only: [...ALL_PII, 'password'] })
    assert(leaks.length === 0, `泄露：${leaks.join(', ')}`)
    const db = openDatabaseSnapshot()
    const [row] = await db.query('select "displayLogsFileId", "failedStep" from execution where id = $1', [failRun.id])
    const text = `${JSON.stringify(row.failedStep)}${row.displayLogsFileId ? await db.fileText(row.displayLogsFileId) : ''}`
    await db.close()
    const stored = leakedIn({ text, secrets, only: [...ALL_PII, 'password'] })
    assert(stored.length === 0, `库里泄露：${stored.join(', ')}`)
  })
}

async function surroundingChecks({ flows }) {
  await check('周边：问题中心里的失败原因不含敏感原值', async () => {
    const issues = await api({ method: 'GET', path: `/issues?projectId=${admin.projectId}&view=OPEN&limit=50`, token: admin.token })
    const leaks = leakedIn({ text: JSON.stringify(issues), secrets, only: [...ALL_PII, 'password'] })
    assert(leaks.length === 0, `泄露：${leaks.join(', ')}`)
  })
  await check('周边：同步 webhook 在工作流失败时的回包不带原文', async () => {
    const response = await http({ method: 'POST', path: `/webhooks/${flows.fail}/sync`, body: { ...payload, employee: { ...payload.employee, jobNumber: `${secrets.jobNumber}-sync` }, pwd: secrets.password } })
    assert(leakedIn({ text: response.text, secrets, only: [...ALL_PII, 'password'] }).length === 0, `回包 ${response.status} ${response.text.slice(0, 200)}`)
    return response.status
  })
}

async function erasureChecks({ mainRun }) {
  const created = await check('删除：按手机号（带空格的写法也算）发起删除请求，先扫描出命中的运行', async () => {
    const request = await api({ method: 'POST', path: '/privacy-settings/erasures', body: { kind: 'PHONE', value: secrets.contactPlain, reason: '员工要求删除个人数据，工单 HR-5002' }, token: admin.token })
    const scanned = await waitFor({
      what: '扫描完成',
      timeoutMs: 90000,
      probe: async () => (await api({ method: 'GET', path: '/privacy-settings/erasures', token: admin.token })).find((item) => item.id === request.id && item.status === 'AWAITING_CONFIRMATION'),
    })
    assert(scanned.matchedRuns >= 1, `命中 ${scanned.matchedRuns} 条`)
    assert(!JSON.stringify(scanned).includes(secrets.contactPlain), '请求记录里带了完整手机号')
    return request.id
  })
  await check('删除：确认后日志文件里这个手机号的所有写法都没了，其他人的数据还在，审计里只有脱敏的提示', async () => {
    assert(created, '前一步失败')
    await api({ method: 'POST', path: `/privacy-settings/erasures/${created}/confirm`, body: {}, token: admin.token })
    await waitFor({
      what: '删除完成',
      timeoutMs: 90000,
      probe: async () => (await api({ method: 'GET', path: '/privacy-settings/erasures', token: admin.token })).find((item) => item.id === created && item.status === 'DONE'),
    })
    const db = openDatabaseSnapshot()
    try {
      const [row] = await db.query('select "logsFileId", "displayLogsFileId" from execution where id = $1', [mainRun.id])
      const texts = (await Promise.all([row.logsFileId, row.displayLogsFileId].filter(Boolean).map((fileId) => db.fileText(fileId)))).join('\n')
      assert(leakedIn({ text: texts, secrets, only: ['contactPlain'] }).length === 0, '日志文件里还有这个手机号')
      const events = await api({ method: 'GET', path: '/audit-events?action=privacy.personal_data.erasure&limit=10', token: admin.token })
      assert(events.data.length > 0, '没有删除审计')
      assert(!JSON.stringify(events).includes(secrets.contactPlain), '审计里带了完整手机号')
    }
    finally {
      await db.close()
    }
  })
}

async function ensureMember() {
  const existing = await signIn(MEMBER)
  if (existing) {
    await addToProject(existing)
    return existing
  }
  const invitation = await api({ method: 'POST', path: '/tenant-access/members/invite', body: { emails: [MEMBER.email], tenantRole: 'MEMBER', modules: [] }, token: admin.token })
  const token = new URL(invitation.invited[0].link).searchParams.get('token')
  await http({ method: 'POST', path: '/user-invitations/accept', body: { invitationToken: token } })
  await http({ method: 'POST', path: '/authentication/sign-up', body: { email: MEMBER.email, password: MEMBER.password, firstName: 'Mem', lastName: 'Ber', trackEvents: false, newsLetter: false } })
  const created = await signIn(MEMBER)
  await addToProject(created)
  return created
}

async function addToProject(user) {
  await api({ method: 'POST', path: '/project-members', body: { projectId: admin.projectId, userId: user.userId, role: 'Operator' }, token: admin.token })
}
