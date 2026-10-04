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
        const alive = new Set(current.files.map((file) => file.id))
        return !alive.has(b.displayLogsFileId) && !alive.has(b.logsFileId)
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
  await check('检索：原文清掉后，按完整手机号仍能搜到 A 批的运行，按工号精确搜也能搜到', async () => {
    const byPhone = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=20&type=ALL&time=30d&content=${people.A.mobile}`, token: admin.token })
    assert(byPhone.data.some((item) => item.id === people.A.runId), `按手机号没搜到 A，结果 ${byPhone.data.length} 条`)
    const spaced = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=20&type=ALL&time=30d&content=${encodeURIComponent(`${people.A.mobile.slice(0, 3)} ${people.A.mobile.slice(3, 7)} ${people.A.mobile.slice(7)}`)}`, token: admin.token })
    assert(spaced.data.some((item) => item.id === people.A.runId), '带空格写法的手机号没搜到 A')
    const byKey = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=20&type=ALL&time=30d&businessKey=${people.A.jobNumber}`, token: admin.token })
    assert(byKey.data.some((item) => item.id === people.A.runId), '按工号没搜到 A')
  })
  await check('检索：只匹配完整号码——前缀、尾号、别人的号码都搜不到 A 批', async () => {
    const queries = [people.A.mobile.slice(0, 7), people.A.mobile.slice(-4), `139${people.C.tag}0001`.replace(people.C.tag, '0000'), people.C.mobile]
    for (const content of queries) {
      const result = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=20&type=ALL&time=30d&content=${content}`, token: admin.token })
      assert(!result.data.some((item) => item.id === people.A.runId), `「${content}」不应该搜到 A`)
    }
  })
  await check('检索：库里存的是带密钥的哈希，不含手机号和工号原文', async () => {
    const db = openDatabaseSnapshot()
    try {
      const [row] = await db.query('select "searchHashes" from execution where id = $1', [people.A.runId])
      assert(row.searchHashes.length >= 2, `A 的哈希只有 ${row.searchHashes.length} 个`)
      const text = JSON.stringify(row.searchHashes)
      assert(row.searchHashes.every((hash) => /^[0-9a-f]{64}$/.test(hash)), '哈希格式不对')
      assert(!text.includes(people.A.mobile) && !text.includes(people.A.jobNumber), '哈希列里出现了原文')
      const plain = (await import('node:crypto')).createHash('sha256').update(people.A.mobile).digest('hex')
      assert(!row.searchHashes.includes(plain), '哈希就是明文的普通 SHA-256，可以被撞库')
    }
    finally {
      await db.close()
    }
  })
  await check('删除：按手机号删除，原文清掉的 A 批也能被找到，确认后哈希一并清掉，回执里有各类清理条数', async () => {
    const request = await api({ method: 'POST', path: '/privacy-settings/erasures', body: { kind: 'PHONE', value: people.A.mobile, reason: '员工要求删除个人数据，工单 HR-5003' }, token: admin.token })
    const scanned = await waitFor({
      what: '扫描完成',
      timeoutMs: 120000,
      probe: async () => (await api({ method: 'GET', path: '/privacy-settings/erasures', token: admin.token })).find((item) => item.id === request.id && ['AWAITING_CONFIRMATION', 'DONE'].includes(item.status)),
    })
    assert(scanned.status === 'AWAITING_CONFIRMATION' && scanned.matchedRuns >= 1, `原文清掉后没有找到 A：${scanned.status} 命中 ${scanned.matchedRuns}`)
    await api({ method: 'POST', path: `/privacy-settings/erasures/${request.id}/confirm`, body: { confirmation: people.A.mobile }, token: admin.token })
    const done = await waitFor({
      what: '删除完成',
      timeoutMs: 120000,
      probe: async () => (await api({ method: 'GET', path: '/privacy-settings/erasures', token: admin.token })).find((item) => item.id === request.id && item.status === 'DONE'),
    })
    assert(done.counts && done.counts.searchHashes >= 1, `回执里没有清掉哈希：${JSON.stringify(done.counts)}`)
    const phoneAfter = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=20&type=ALL&time=30d&content=${people.A.mobile}`, token: admin.token })
    assert(!phoneAfter.data.some((item) => item.id === people.A.runId), '删除后还能按手机号搜到')
    const keyAfter = await api({ method: 'GET', path: `/run-logs?projectId=${admin.projectId}&limit=20&type=ALL&time=30d&businessKey=${people.A.jobNumber}`, token: admin.token })
    assert(keyAfter.data.some((item) => item.id === people.A.runId), '工号的哈希不该被按手机号删除清掉')
  })
  void nextCron
  void MEMBER
  void ALL_PII
  void leakedIn
}
