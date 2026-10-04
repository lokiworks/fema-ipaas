import { ADMIN, ALL_PII, DEFAULT_SETTINGS, MEMBER, STATE_DIR, ageRows, api, assert, check, http, leakedIn, openDatabaseSnapshot, payloadOf, publishFlow, secretsOf, signIn, sleep, startApi, stopApi, summary, waitFor, webhookTrigger, codeStep, deleteFlowsNamed } from './lib/s5-kit.mjs'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const STATE_FILE = `${STATE_DIR}/retention-state.json`
const stage = process.argv[2] ?? 'prepare'
const admin = await signIn(ADMIN)

if (stage === 'prepare') {
  await prepare()
}
else {
  await verify()
}
summary()

async function prepare() {
  await check('设置：平台保留 14 天，项目保留 7 天，原文保留 3 天', async () => {
    await api({ method: 'POST', path: '/privacy-settings', body: { ...DEFAULT_SETTINGS, logRetentionDays: 14, rawPayloadRetentionDays: 3 }, token: admin.token })
    await api({ method: 'POST', path: `/projects/${admin.projectId}`, body: { executionDataRetentionDays: 7 }, token: admin.token })
  })
  const flows = await check('准备：发布保留期验证用的工作流', async () => {
    await deleteFlowsNamed({ session: admin, prefix: 'S5R ' })
    const flowId = await publishFlow({
      session: admin,
      displayName: 'S5R 保留期验证',
      trigger: webhookTrigger({
        displayName: '接收员工数据',
        dedupeKeyPath: '{{trigger.body.employee.jobNumber}}',
        nextAction: codeStep({
          name: 'step_1',
          displayName: '整理',
          code: "export const code = async (inputs) => { if (inputs.payload.fail) { throw new Error('失败 ' + inputs.payload.employee.mobile) } return { ok: true, profile: inputs.payload.employee } }",
          input: { payload: "{{trigger['output']['body']}}" },
        }),
      }),
    })
    return { flowId }
  })
  if (!flows) {
    return
  }
  const people = {}
  const fire = async ({ label }) => {
    const tag = String(1000 + Math.floor(Math.random() * 8999))
    const secrets = secretsOf({ tag })
    const startedAt = new Date().toISOString()
    const response = await http({ method: 'POST', path: `/webhooks/${flows.flowId}`, body: { ...payloadOf({ secrets }), fail: label !== 'C' } })
    assert(response.ok, `webhook ${response.status}`)
    const run = await waitFor({
      what: `运行 ${label} 结束`,
      probe: async () => {
        const runs = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=5&type=ALL&businessKey=${secrets.jobNumber}`, token: admin.token })
        return runs.data.find((item) => ['SUCCEEDED', 'FAILED', 'INTERNAL_ERROR'].includes(item.status)) ?? null
      },
    })
    people[label] = { tag, jobNumber: secrets.jobNumber, mobile: secrets.mobile, runId: run.id, startedAt }
    await sleep(3000)
  }
  await check('准备：三批运行（B 将回拨 10 天，A 回拨 4 天，C 保持新鲜）', async () => {
    await fire({ label: 'B' })
    await fire({ label: 'A' })
    await fire({ label: 'C' })
    return Object.keys(people)
  })
  await check('把 A、B 两批的运行和文件回拨，然后重启后端', async () => {
    const shift = ({ label, days }) => {
      const person = people[label]
      return [
        { sql: `update execution set created = created - $2::interval, "startTime" = "startTime" - $2::interval, "finishTime" = "finishTime" - $2::interval where id = $1`, params: [person.runId, `${days} days`] },
        { sql: `update file set created = created - $2::interval where id in (select "logsFileId" from execution where id = $1 union select "displayLogsFileId" from execution where id = $1)`, params: [person.runId, `${days} days`] },
      ]
    }
    const payloadShift = ({ from, to, days }) => ({
      sql: `update file set created = created - $3::interval where type = 'WEBHOOK_PAYLOAD' and created >= $1 and created < $2`,
      params: [from, to, `${days} days`],
    })
    stopApi()
    await sleep(3000)
    await ageRows({
      statements: [
        ...shift({ label: 'B', days: 10 }),
        ...shift({ label: 'A', days: 4 }),
        payloadShift({ from: people.B.startedAt, to: people.A.startedAt, days: 10 }),
        payloadShift({ from: people.A.startedAt, to: people.C.startedAt, days: 4 }),
      ],
    })
    startApi()
    writeFileSync(STATE_FILE, JSON.stringify({ people, flowId: flows.flowId, preparedAt: new Date().toISOString() }))
  })
}

async function verify() {
  assert(existsSync(STATE_FILE), '先跑 prepare 阶段')
  const { people } = JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  const snapshot = async () => {
    const db = openDatabaseSnapshot()
    try {
      const rows = await db.query('select id, "businessKey", "failedStep", "logsFileId", "displayLogsFileId" from execution where id = any($1)', [Object.values(people).map((person) => person.runId)])
      const files = await db.query('select id, type, created from file')
      return { rows, files }
    }
    finally {
      await db.close()
    }
  }
  const state = await snapshot()
  const row = (label) => state.rows.find((item) => item.id === people[label].runId)
  const nextCron = Math.min(...[17, 30].map((minute) => { const d = new Date(); d.setUTCMinutes(minute, 0, 0); if (d < new Date()) d.setUTCHours(d.getUTCHours() + 1); return d.getTime() }))
  process.stdout.write(`当前 ${new Date().toISOString()}，等定时任务（每小时 17 分清原文，30 分清文件）\n`)

  await check('清理：原文保留期（3 天）到期后，A 批的原始日志被清掉，展示日志还在', async () => {
    const result = await waitFor({
      what: 'A 批原始日志被清理',
      timeoutMs: 75 * 60 * 1000,
      stepMs: 30000,
      probe: async () => {
        const current = await snapshot()
        const a = current.rows.find((item) => item.id === people.A.runId)
        return a && a.logsFileId === null ? { a, files: current.files } : null
      },
    })
    assert(result.a.displayLogsFileId !== null, '展示日志也被清掉了')
  })
  await check('清理：到期的运行标识（工号）和失败原因被清除（B 批超过 7 天）', async () => {
    const current = await snapshot()
    const b = current.rows.find((item) => item.id === people.B.runId)
    assert(b.businessKey === null, `B 的工号还在：${b.businessKey}`)
    assert(!b.failedStep?.message, `B 的失败原因还在：${b.failedStep?.message}`)
    const c = current.rows.find((item) => item.id === people.C.runId)
    assert(c.businessKey === people.C.jobNumber && c.logsFileId, 'C 批被误清')
  })
  await check('清理：过期的 webhook 原始请求体文件被删除，新鲜的保留', async () => {
    const current = await snapshot()
    const old = current.files.filter((file) => file.type === 'WEBHOOK_PAYLOAD' && new Date(file.created) < new Date(Date.now() - 3 * 86400000))
    assert(old.length === 0, `还有 ${old.length} 个超过 3 天的原始请求体文件`)
    const fresh = current.files.filter((file) => file.type === 'WEBHOOK_PAYLOAD')
    assert(fresh.length > 0, '新鲜的请求体文件也被删了')
  })
  await check('清理：保留期（项目 7 天）到期的日志文件被删除（B 批）', async () => {
    await waitFor({
      what: 'B 批日志文件被清理',
      timeoutMs: 75 * 60 * 1000,
      stepMs: 30000,
      probe: async () => {
        const current = await snapshot()
        const b = current.rows.find((item) => item.id === people.B.runId)
        return b.displayLogsFileId === null && b.logsFileId === null
      },
    })
  })
  await check('读取：到期的运行从运行日志列表里消失，3 天的还在', async () => {
    const list = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=50&type=ALL&time=30d`, token: admin.token })
    const ids = new Set(list.data.map((item) => item.id))
    assert(!ids.has(people.B.runId), 'B 批还在列表里')
    assert(ids.has(people.A.runId) && ids.has(people.C.runId), 'A 或 C 批不在列表里')
    const a = list.data.find((item) => item.id === people.A.runId)
    assert(a.rerunBlockReason === 'RAW_DATA_EXPIRED', `A 的重跑受阻原因 ${a.rerunBlockReason}`)
  })
  await check('读取：原文过期后查看原文被拒绝，整体重跑也被拒绝', async () => {
    const reveal = await http({ method: 'POST', path: `/executions/${people.A.runId}/reveal`, body: { stepName: 'trigger', reason: '核对过期数据' }, token: admin.token })
    assert(reveal.status === 409, `查看原文返回 ${reveal.status}`)
    const retry = await http({ method: 'POST', path: `/executions/${people.A.runId}/retry`, body: { strategy: 'ON_LATEST_VERSION', projectId: admin.projectId }, token: admin.token })
    assert(!retry.ok, '过期后还能整体重跑')
  })
  await check('读取：展示日志仍然脱敏（A 批）', async () => {
    const response = await http({ method: 'GET', path: `/executions/${people.A.runId}?projectId=${admin.projectId}`, token: admin.token })
    assert(response.ok && !response.text.includes(people.A.mobile), '展示日志泄露手机号')
  })
  void nextCron
  void MEMBER
  void ALL_PII
  void leakedIn
}
