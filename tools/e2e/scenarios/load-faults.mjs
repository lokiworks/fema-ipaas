import { mkdirSync, writeFileSync } from 'node:fs'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'

const WORKERS = Number(process.env.LOAD_WORKERS ?? 1)
const SCENARIOS = (process.env.LOAD_SCENARIOS ?? 'graceful,poll-window,kill-worker,redis-wipe,feishu-faults,beisen-quirks,concurrency,two-workers').split(',')
const REUSE = process.env.LOAD_REUSE === '1'
const PEOPLE = Number(process.env.LOAD_N ?? 60)
const RESULT_DIR = '/tmp/fema-e2e/results'
const { check, assert, summary } = kit.makeChecker()
const report = {}

mkdirSync(RESULT_DIR, { recursive: true })

if (!REUSE) {
  await loadStack.up({ db: 'real', redis: 'real', workers: WORKERS })
}
await kit.connect()
const setup = REUSE ? { workflowIds: [] } : await kit.setupMainLine({ departments: 20 })
await kit.mock({ method: 'POST', path: '/__admin/latency', body: { feishu: 40, beisen: 10 } })
await kit.sleep(REUSE ? 0 : 8000)

const scenarios = {
  graceful,
  'poll-window': pollWindow,
  'kill-worker': killWorker,
  'redis-wipe': redisWipe,
  'feishu-faults': feishuFaults,
  'beisen-quirks': beisenQuirks,
  concurrency,
  'two-workers': twoWorkers,
}

for (const name of SCENARIOS) {
  await scenarios[name]()
}
writeFileSync(`${RESULT_DIR}/faults.json`, JSON.stringify(report, null, 2))
summary()

async function graceful() {
  const ns = rangeOf({ first: 1000, count: PEOPLE })
  await check('a 优雅停 API 和 worker 再起：不丢事件、不重复开通、不多通知', async () => {
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    await waitFor({ label: '先有一部分被处理', probe: async () => (await usersAmong({ ns })).length >= 8 })
    const stopStartedAt = Date.now()
    await Promise.all([loadStack.stopProc({ name: 'api', graceMs: 60000 }), loadStack.stopProc({ name: 'worker1', graceMs: 60000 })])
    const stopSeconds = Math.round((Date.now() - stopStartedAt) / 1000)
    await kit.sleep(3000)
    loadStack.startApi({})
    await loadStack.waitApi()
    loadStack.startWorker({ index: 1 })
    await kit.connect()
    const outcome = await settle({ ns, timeoutMs: 600000 })
    report.graceful = { stopSeconds, ...outcome }
    assertClean({ outcome, before, label: 'graceful' })
    return { stopSeconds, ...outcomeBrief({ outcome }) }
  })
}

async function pollWindow() {
  const rounds = Number(process.env.LOAD_ROUNDS ?? 2)
  const quietMs = Number(process.env.LOAD_QUIET_MS ?? 240000)
  await check('a2 API 在「轮询游标已前移、运行还没建」的窗口被冻结后杀掉：事件不丢', async () => {
    const pg = await openPg()
    const flow = await pg.query(`select distinct "workflowId" from workflow_version where "displayName" = $1`, ['员工入职开通飞书账号'])
    const key = `workflow_${flow.rows[0].workflowId}/lastPoll`
    const attempts = []
    for (let round = 0; round < rounds; round += 1) {
      const ns = rangeOf({ first: Number(process.env.LOAD_BASE ?? 14000) + round * 1000, count: Math.max(PEOPLE, 300) })
      const cursorBefore = await cursorOf({ pg, key })
      await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
      await waitFor({ label: '轮询游标前移', timeoutMs: 240000, intervalMs: 4, probe: async () => (await cursorOf({ pg, key })) !== cursorBefore })
      const apiPid = loadStack.pidOf({ name: 'api' })
      process.kill(apiPid, 'SIGSTOP')
      await kit.sleep(300)
      const killed = loadStack.killProc({ name: 'api' })
      await kit.sleep(3000)
      loadStack.startApi({})
      await loadStack.waitApi()
      await kit.connect()
      const outcome = await settle({ ns, timeoutMs: 900000, allowIncomplete: true, quietMs })
      attempts.push({ round, killedApiPid: killed, missing: outcome.missing.length, of: ns.length, executions: outcome.executions, statuses: outcome.statuses, extraCreates: outcome.extraCreates, noNotice: outcome.noNotice.length })
      process.stdout.write(`  第 ${round + 1} 轮：缺 ${outcome.missing.length}/${ns.length}，运行 ${outcome.executions} ${JSON.stringify(outcome.statuses)}\n`)
    }
    await pg.end()
    report.pollWindow = attempts
    const lost = attempts.reduce((sum, attempt) => sum + attempt.missing, 0)
    assert(lost === 0, `丢事件：${lost} 人没有飞书账号：${JSON.stringify(attempts)}`)
    assert(attempts.every((attempt) => attempt.extraCreates === 0), '出现多余的创建调用')
    return attempts
  })
}

async function openPg() {
  const { createRequire } = await import('node:module')
  const { Client } = createRequire(`${loadStack.paths.ROOT}/packages/server/api/package.json`)('pg')
  const client = new Client({ host: '127.0.0.1', port: loadStack.paths.PG_PORT, user: 'fema', password: 'fema', database: 'fema' })
  await client.connect()
  return client
}

async function cursorOf({ pg, key }) {
  const result = await pg.query('select value::text as value from "store-entry" where key = $1', [key])
  return result.rows[0]?.value ?? null
}

async function killWorker() {
  const ns = rangeOf({ first: 3000, count: PEOPLE })
  await check('b 强杀 worker（SIGKILL）：不丢事件、不重复开通、不丢通知', async () => {
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    await waitFor({ label: '先有一部分被处理', probe: async () => (await usersAmong({ ns })).length >= 8 })
    for (let index = 1; index <= WORKERS; index += 1) {
      loadStack.killProc({ name: `worker${index}` })
    }
    await kit.sleep(8000)
    for (let index = 1; index <= WORKERS; index += 1) {
      loadStack.startWorker({ index })
    }
    const outcome = await settle({ ns, timeoutMs: 900000 })
    report.killWorker = outcome
    assertClean({ outcome, before, label: 'kill-worker' })
    return outcomeBrief({ outcome })
  })
}

async function redisWipe() {
  const ns = rangeOf({ first: 4000, count: PEOPLE })
  await check('c Redis 不持久重启（清空），API 不重启：处理中的事件、之后的新事件都不丢', async () => {
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    await waitFor({ label: '先有一部分被处理', probe: async () => (await usersAmong({ ns })).length >= 8 })
    await loadStack.redisKillAndStart({ flush: true })
    const later = rangeOf({ first: 4500, count: 10 })
    await kit.sleep(4000)
    await kit.inject({ records: later.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    const outcome = await settle({ ns: [...ns, ...later], timeoutMs: 360000, allowIncomplete: true })
    report.redisWipeNoRestart = outcome
    assertClean({ outcome, before, label: 'redis-wipe' })
    return outcomeBrief({ outcome })
  })
}

async function feishuFaults() {
  const ns = rangeOf({ first: 5000, count: PEOPLE })
  await check('d 飞书间歇 500、429 带等待时间、写入成功但返回失败：账号数对、不重复、问题只有一个，重跑后补平', async () => {
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    await kit.mock({
      method: 'POST',
      path: '/__admin/faults',
      body: {
        rules: [
          { id: 'create-applied-then-500', method: 'POST', path: '/contact/v3/users$', mode: 'apply_then_status', status: 500, probability: 0.12, times: 12 },
          { id: 'create-429', method: 'POST', path: '/contact/v3/users$', mode: 'status', status: 429, resetSeconds: 2, probability: 0.2, times: 20 },
          { id: 'create-500', method: 'POST', path: '/contact/v3/users$', mode: 'status', status: 500, probability: 0.25, times: 25 },
          { id: 'message-500', method: 'POST', path: '/im/v1/messages$', mode: 'status', status: 500, probability: 0.2, times: 8 },
        ],
      },
    })
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    const first = await settle({ ns, timeoutMs: 600000, allowIncomplete: true })
    await kit.mock({ method: 'POST', path: '/__admin/faults', body: { rules: [] } })
    const issuesBeforeReplay = await openIssues()
    const replay = await replayAll()
    const second = await settle({ ns, timeoutMs: 600000, allowIncomplete: true })
    const faults = (await kit.mock({ method: 'GET', path: '/__admin/summary' })).faults
    report.feishuFaults = { firstPass: first, issuesBeforeReplay, replay, final: second, faults }
    assert(issuesBeforeReplay.length >= 1, '故障注入后问题中心没有问题，注入可能没生效')
    const duplicates = groupDuplicates({ issues: issuesBeforeReplay })
    assert(duplicates.length === 0, `同一工作流、步骤、错误码出现多个问题：${JSON.stringify(duplicates)}`)
    assertClean({ outcome: second, before, label: 'feishu-faults' })
    return { firstPass: outcomeBrief({ outcome: first }), issuesBeforeReplay: issuesBeforeReplay.length, replay, final: outcomeBrief({ outcome: second }) }
  })
}

async function beisenQuirks() {
  const ns = rangeOf({ first: 6000, count: PEOPLE })
  await check('e 北森返回重复、乱序的变动：不重复开通；迟到的旧时间变动不丢', async () => {
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    await kit.mock({ method: 'POST', path: '/__admin/beisen-quirks', body: { duplicateRate: 0.5, shuffle: true } })
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    const outcome = await settle({ ns, timeoutMs: 420000 })
    await kit.mock({ method: 'POST', path: '/__admin/beisen-quirks', body: { duplicateRate: 0, shuffle: false } })
    const lateNs = rangeOf({ first: 6500, count: 10 })
    await kit.inject({ records: lateNs.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })), changedAtOffsetSeconds: -600 })
    const late = await settle({ ns: lateNs, timeoutMs: 240000, allowIncomplete: true })
    report.beisenQuirks = { duplicates: outcome, late }
    assertClean({ outcome, before, label: 'beisen-quirks' })
    assert(late.missing.length === 0, `变动时间早于游标的迟到变动没有被处理：缺 ${late.missing.length}/${lateNs.length}`)
    return { duplicates: outcomeBrief({ outcome }), late: outcomeBrief({ outcome: late }) }
  })
}

async function concurrency() {
  const base = 7000
  await check('f 同一员工连续调岗 A→B→C、A→B→A：最终部门与北森最后一条一致', async () => {
    const hires = rangeOf({ first: base, count: 20 })
    await kit.inject({ records: hires.map((n) => kit.hireOf({ n, departmentIndex: 0 })) })
    await settle({ ns: hires, timeoutMs: 300000 })
    const chain = rangeOf({ first: base, count: 10 })
    const back = rangeOf({ first: base + 10, count: 10 })
    await kit.inject({ records: chain.map((n) => kit.transferOf({ n, departmentIndex: 3 })) })
    await kit.sleep(1100)
    await kit.inject({ records: chain.map((n) => kit.transferOf({ n, departmentIndex: 5 })) })
    await kit.inject({ records: back.map((n) => kit.transferOf({ n, departmentIndex: 4 })) })
    await kit.sleep(1100)
    await kit.inject({ records: back.map((n) => kit.transferOf({ n, departmentIndex: 0 })) })
    await kit.sleep(150000)
    const users = (await kit.mock({ method: 'GET', path: '/__admin/users' })).users
    const byNo = new Map(users.map((user) => [user.employee_no, user]))
    const want = (n, index) => `od-d${String(index + 1).padStart(2, '0')}`
    const chainWrong = chain.filter((n) => byNo.get(kit.jobNumberOf({ n }))?.department_ids[0] !== want(n, 5))
    const backWrong = back.filter((n) => byNo.get(kit.jobNumberOf({ n }))?.department_ids[0] !== want(n, 0))
    report.concurrency = { chainWrong: chainWrong.length, backWrong: backWrong.length }
    assert(chainWrong.length === 0, `A→B→C 有 ${chainWrong.length}/${chain.length} 人没落到最后一个部门`)
    assert(backWrong.length === 0, `A→B→A 有 ${backWrong.length}/${back.length} 人没回到原部门`)
    return report.concurrency
  })
}

async function twoWorkers() {
  const ns = rangeOf({ first: 8000, count: PEOPLE })
  await check('g 两个 worker 同时跑：不重复开通、不多通知', async () => {
    loadStack.startWorker({ index: 2 })
    await kit.sleep(15000)
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    const outcome = await settle({ ns, timeoutMs: 420000 })
    report.twoWorkers = outcome
    assertClean({ outcome, before, label: 'two-workers' })
    return outcomeBrief({ outcome })
  })
}

function assertClean({ outcome, before, label }) {
  assert(outcome.missing.length === 0, `${label}：${outcome.missing.length} 人没有飞书账号（丢事件）`)
  assert(outcome.wrongDepartment.length === 0, `${label}：${outcome.wrongDepartment.length} 人部门不对`)
  assert(outcome.noNotice.length === 0, `${label}：${outcome.noNotice.length} 人没有收到 HR 群通知，样例 ${outcome.noNotice.slice(0, 3)}`)
  assert(outcome.dupNotice.length === 0, `${label}：${outcome.dupNotice.length} 人通知了多次`)
  assert(outcome.extraCreates === 0, `${label}：多余的创建调用 ${outcome.extraCreates} 次`)
  assert(outcome.duplicateEmployeeNos === 0, `${label}：重复工号 ${outcome.duplicateEmployeeNos}`)
  assert(outcome.unfinished === 0, `${label}：仍有 ${outcome.unfinished} 个运行没结束`)
  assert(outcome.failedRuns === 0, `${label}：有 ${outcome.failedRuns} 个运行失败`)
}

async function settle({ ns, timeoutMs, allowIncomplete = false, quietMs = 90000 }) {
  const deadline = Date.now() + timeoutMs
  let stableSince = null
  let lastKey = ''
  while (Date.now() < deadline) {
    const outcome = await evaluate({ ns })
    const key = `${outcome.users}:${outcome.unfinished}:${outcome.messages}:${outcome.executions}`
    const done = outcome.missing.length === 0 && outcome.noNotice.length === 0 && outcome.unfinished === 0
    if ((done || allowIncomplete) && key === lastKey) {
      stableSince = stableSince ?? Date.now()
      if (Date.now() - stableSince > (done ? 20000 : quietMs)) {
        return outcome
      }
    }
    else {
      stableSince = null
    }
    lastKey = key
    await kit.sleep(5000)
  }
  return evaluate({ ns })
}

async function evaluate({ ns }) {
  const usersAll = (await kit.mock({ method: 'GET', path: '/__admin/users' })).users
  const state = await kit.mock({ method: 'GET', path: '/__admin/state' })
  const summaryNow = await kit.mock({ method: 'GET', path: '/__admin/summary' })
  const byNo = new Map(usersAll.map((user) => [user.employee_no, user]))
  const noticeCount = new Map()
  state.messages.forEach((message) => {
    const match = /工号 (L\d+)/.exec(message.content)
    if (match) {
      noticeCount.set(match[1], (noticeCount.get(match[1]) ?? 0) + 1)
    }
  })
  const keys = ns.map((n) => kit.jobNumberOf({ n }))
  const quoted = keys.map((key) => `'${key}'`).join(',')
  const statusRows = loadStack.psql({ sql: `select status, count(*) from execution where "businessKey" in (${quoted}) group by status` })
  const statuses = Object.fromEntries(statusRows.split('\n').filter(Boolean).map((line) => line.split('|')).map(([status, count]) => [status, Number(count)]))
  const unfinished = (statuses.QUEUED ?? 0) + (statuses.RUNNING ?? 0) + (statuses.PAUSED ?? 0)
  const failedRuns = Object.entries(statuses).filter(([status]) => !['SUCCEEDED', 'QUEUED', 'RUNNING', 'PAUSED'].includes(status)).reduce((sum, [, count]) => sum + count, 0)
  const missing = ns.filter((n) => !byNo.has(kit.jobNumberOf({ n })))
  const wrongDepartment = ns.filter((n) => {
    const user = byNo.get(kit.jobNumberOf({ n }))
    return user !== undefined && user.department_ids[0] !== `od-d${String((n % 20) + 1).padStart(2, '0')}`
  })
  return {
    users: ns.length - missing.length,
    missing,
    wrongDepartment,
    messages: ns.reduce((sum, n) => sum + (noticeCount.get(kit.jobNumberOf({ n })) ?? 0), 0),
    noNotice: ns.filter((n) => byNo.has(kit.jobNumberOf({ n })) && !noticeCount.has(kit.jobNumberOf({ n }))),
    dupNotice: ns.filter((n) => (noticeCount.get(kit.jobNumberOf({ n })) ?? 0) > 1),
    extraCreates: summaryNow.createAttemptsExtra,
    duplicateEmployeeNos: summaryNow.duplicateEmployeeNos,
    executions: Object.values(statuses).reduce((sum, count) => sum + count, 0),
    statuses,
    unfinished,
    failedRuns,
  }
}

function outcomeBrief({ outcome }) {
  return { users: outcome.users, missing: outcome.missing.length, noNotice: outcome.noNotice.length, dupNotice: outcome.dupNotice.length, extraCreates: outcome.extraCreates, executions: outcome.executions, statuses: outcome.statuses }
}

async function usersAmong({ ns }) {
  const usersAll = (await kit.mock({ method: 'GET', path: '/__admin/users' })).users
  const wanted = new Set(ns.map((n) => kit.jobNumberOf({ n })))
  return usersAll.filter((user) => wanted.has(user.employee_no))
}

async function openIssues() {
  const projectId = kit.session().projectId
  const page = await kit.api({ method: 'GET', path: `/issues?projectId=${projectId}&view=ALL&limit=100` })
  return page.data.map((issue) => ({ id: issue.id, kind: issue.kind, stepName: issue.stepName, errorCode: issue.errorCode, status: issue.status, occurrences: issue.occurrences, workflowId: issue.workflowId }))
}

async function replayAll() {
  const projectId = kit.session().projectId
  const issues = (await openIssues()).filter((issue) => issue.status === 'OPEN')
  const results = []
  for (const issue of issues) {
    const result = await kit.api({ method: 'POST', path: `/issues/${issue.id}/replay`, body: { strategy: 'FROM_FAILED_STEP' } })
    results.push({ issue: `${issue.stepName}/${issue.errorCode}`, ...result })
  }
  return results
}

function groupDuplicates({ issues }) {
  const byKey = new Map()
  issues.filter((issue) => issue.kind !== 'DRIFT').forEach((issue) => {
    const key = `${issue.workflowId}:${issue.stepName}:${issue.errorCode}`
    byKey.set(key, [...(byKey.get(key) ?? []), issue.id])
  })
  return [...byKey.entries()].filter(([, ids]) => ids.length > 1)
}

async function waitFor({ probe, timeoutMs = 300000, intervalMs = 1000, label = '' }) {
  return kit.waitFor({ probe, timeoutMs, intervalMs, label })
}

function rangeOf({ first, count }) {
  return Array.from({ length: count }, (_, index) => first + index)
}
