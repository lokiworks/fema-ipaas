import { unsafeWrite500 } from './lib/unsafe-write-500.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'

const WORKERS = Number(process.env.LOAD_WORKERS ?? 1)
const SCENARIOS = (process.env.LOAD_SCENARIOS ?? 'graceful,poll-window,kill-worker,redis-wipe,feishu-faults,beisen-quirks,concurrency,two-workers,webhook-dedupe,republish,unsafe-write-500,feishu-hang').split(',')
const REUSE = process.env.LOAD_REUSE === '1'
const PEOPLE = Number(process.env.LOAD_N ?? 60)
const RESULT_DIR = process.env.E2E_RESULT_DIR ?? '/tmp/fema-e2e/results'
const { check, assert, summary, results } = kit.makeChecker()
const report = { target: kit.target().name, scenarios: {} }

mkdirSync(RESULT_DIR, { recursive: true })
process.stdout.write(`Fault target: ${kit.target().name}\n`)

if (!REUSE) {
  await loadStack.up({ db: 'real', redis: 'real', workers: WORKERS })
}
await kit.connect()
const setup = REUSE ? { workflowIds: [] } : await kit.setupMainLine({ departments: 20 })
await kit.mock({ method: 'POST', path: '/__admin/latency', body: { [kit.target().name]: 40, beisen: 10 } })
await kit.sleep(REUSE ? 0 : 8000)

const scenarios = {
  'unsafe-write-500': unsafeWrite500,
  graceful,
  'poll-window': pollWindow,
  'kill-worker': killWorker,
  'redis-wipe': redisWipe,
  'feishu-faults': feishuFaults,
  'beisen-quirks': beisenQuirks,
  concurrency,
  'two-workers': twoWorkers,
  'feishu-hang': feishuHang,
  'webhook-dedupe': webhookDedupe,
  republish,
}

for (const name of SCENARIOS) {
  process.stdout.write(`START ${name}\n`)
  const first = results.length
  let completed = false
  try { await scenarios[name](); completed = true }
  finally {
    report.scenarios[name] = { passed: completed && results.slice(first).every((result) => result.ok) }
    writeFileSync(`${RESULT_DIR}/faults.json`, JSON.stringify(report, null, 2))
  }
}
writeFileSync(`${RESULT_DIR}/faults.json`, JSON.stringify(report, null, 2))
summary()

async function graceful() {
  const ns = rangeOf({ first: Number(process.env.LOAD_BASE ?? 1000), count: PEOPLE })
  await check('a 优雅停 API 和 worker 再起：不丢事件、不重复开通、不多通知', async () => {
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    const noticeDelayMs = Number(process.env.LOAD_DRAIN_NOTICE_DELAY_MS ?? 0)
    if (noticeDelayMs > 0) await kit.mock({ method: 'POST', path: '/__admin/faults', body: { rules: [{ id: 'notice-during-drain', target: kit.target().name, method: 'POST', path: kit.target().messagePath, mode: 'apply_then_delay', delayMs: noticeDelayMs, times: PEOPLE }] } })
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    await waitFor({ label: '先有一部分被处理', probe: async () => (await usersAmong({ ns })).length >= 8 })
    const stopStartedAt = Date.now()
    await Promise.all(Array.from({ length: WORKERS }, (_, index) => loadStack.stopProc({ name: `worker${index + 1}`, graceMs: 60000 })))
    await loadStack.stopProc({ name: 'api', graceMs: 60000 })
    const stopSeconds = Math.round((Date.now() - stopStartedAt) / 1000)
    if (noticeDelayMs > 0) await kit.mock({ method: 'POST', path: '/__admin/faults', body: { rules: [] } })
    await kit.sleep(3000)
    loadStack.startApi({})
    await loadStack.waitApi()
    for (let index = 1; index <= WORKERS; index += 1) loadStack.startWorker({ index })
    await loadStack.waitWorkerOnline({ count: WORKERS })
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
    const flow = await pg.query(`select distinct version."workflowId" from workflow_version version join workflow on workflow.id=version."workflowId" where version."displayName"=$1 and workflow."projectId"=$2`, [kit.target().onboardName, kit.session().projectId])
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
    assert(lost === 0, `丢事件：${lost} 人没有目标平台账号：${JSON.stringify(attempts)}`)
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
  const result = await pg.query('select value::text as value from "store-entry" where key = $1 and "projectId"=$2', [key, kit.session().projectId])
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
  const ns = rangeOf({ first: Number(process.env.LOAD_BASE ?? 4000), count: PEOPLE })
  await check('c Redis 不持久重启（清空），API 不重启：处理中的事件、之后的新事件都不丢', async () => {
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    await waitFor({ label: '先有一部分被处理', probe: async () => (await usersAmong({ ns })).length >= 8 })
    await loadStack.redisKillAndStart({ flush: true })
    const later = rangeOf({ first: Number(process.env.LOAD_BASE ?? 4000) + 500, count: 10 })
    await kit.sleep(4000)
    await kit.inject({ records: later.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    const outcome = await settle({ ns: [...ns, ...later], timeoutMs: 360000, allowIncomplete: true })
    report.redisWipeNoRestart = outcome
    assertClean({ outcome, before, label: 'redis-wipe' })
    return outcomeBrief({ outcome })
  })
}

async function feishuFaults() {
  const ns = rangeOf({ first: Number(process.env.LOAD_BASE ?? 5000), count: PEOPLE })
  await check('d 目标平台间歇 500、429 带等待时间、写入成功但返回失败：账号数对、不重复、问题只有一个，重跑后补平', async () => {
    const workflows = await kit.api({ method: 'GET', path: `/workflows?projectId=${kit.session().projectId}&limit=100` })
    const workflow = workflows.data.find((item) => item.version?.displayName === kit.target().onboardName)
    assert(workflow, 'Missing onboarding workflow')
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    await kit.mock({
      method: 'POST',
      path: '/__admin/faults',
      body: {
        rules: [
          { id: 'create-applied-then-500', target: kit.target().name, method: 'POST', path: kit.target().createPath, mode: 'apply_then_status', status: 500, probability: 0.12, times: 12 },
          { id: 'create-429', target: kit.target().name, method: 'POST', path: kit.target().createPath, mode: 'status', status: 429, payload: kit.target().rateLimitPayload, resetSeconds: 2, probability: 0.2, times: 20 },
          { id: 'create-500', target: kit.target().name, method: 'POST', path: kit.target().createPath, mode: 'status', status: 500, probability: 0.25, times: 25 },
          { id: 'message-500', target: kit.target().name, method: 'POST', path: kit.target().messagePath, mode: 'status', status: 500, probability: 0.2, times: 8 },
        ],
      },
    })
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    const first = await settle({ ns, timeoutMs: 600000, allowIncomplete: true })
    const faults = (await kit.mock({ method: 'GET', path: '/__admin/summary' })).faults
    await kit.mock({ method: 'POST', path: '/__admin/faults', body: { rules: [] } })
    const issuesBeforeReplay = (await openIssues()).filter((issue) => issue.workflowId === workflow.id && issue.status === 'OPEN')
    const replay = await replayAll({ issues: issuesBeforeReplay })
    const second = await settle({ ns, timeoutMs: 600000, allowIncomplete: true })
    report.feishuFaults = { firstPass: first, issuesBeforeReplay, replay, final: second, faults }
    assert(faults.length === 4 && faults.every((fault) => fault.served > 0), 'Some injected failure modes did not execute')
    assert(issuesBeforeReplay.length >= 1, '故障注入后问题中心没有问题，注入可能没生效')
    const duplicates = groupDuplicates({ issues: issuesBeforeReplay })
    assert(duplicates.length === 0, `同一工作流、步骤、错误码出现多个问题：${JSON.stringify(duplicates)}`)
    assertClean({ outcome: second, before, label: 'feishu-faults', allowRecoveredFailures: true })
    return { firstPass: outcomeBrief({ outcome: first }), issuesBeforeReplay: issuesBeforeReplay.length, replay, final: outcomeBrief({ outcome: second }) }
  })
}

async function beisenQuirks() {
  const base = Number(process.env.LOAD_BASE ?? 6000)
  const ns = rangeOf({ first: base, count: PEOPLE })
  await check('e 北森返回重复、乱序的变动：不重复开通；乱序的连续调岗以最后一条为准；迟到的旧时间变动不丢', async () => {
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    await kit.mock({ method: 'POST', path: '/__admin/beisen-quirks', body: { duplicateRate: 0.5, shuffle: true } })
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    const outcome = await settle({ ns, timeoutMs: 420000 })
    const chain = rangeOf({ first: base, count: 30 })
    await kit.inject({ records: chain.map((n) => kit.transferOf({ n, departmentIndex: 3, startDate: '2026-11-01T00:00:00' })) })
    await kit.sleep(1100)
    await kit.inject({ records: chain.map((n) => kit.transferOf({ n, departmentIndex: 5, startDate: '2026-12-01T00:00:00' })) })
    await kit.sleep(1100)
    await kit.inject({ records: chain.map((n) => kit.transferOf({ n, departmentIndex: 7, startDate: '2027-01-01T00:00:00' })) })
    await kit.sleep(150000)
    const users = (await kit.mock({ method: 'GET', path: '/__admin/users' })).users
    const byNo = new Map(users.map((user) => [user.employee_no, user]))
    const lastDepartment = kit.departmentOpenId({ index: 7 })
    const wrongOrder = chain.filter((n) => byNo.get(kit.jobNumberOf({ n }))?.department_ids[0] !== lastDepartment)
    await kit.mock({ method: 'POST', path: '/__admin/beisen-quirks', body: { duplicateRate: 0, shuffle: false } })
    const lateNs = rangeOf({ first: base + 500, count: 10 })
    await kit.inject({ records: lateNs.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })), changedAtOffsetSeconds: -120 })
    const late = await settle({ ns: lateNs, timeoutMs: 240000, allowIncomplete: true })
    const tooLateNs = rangeOf({ first: base + 600, count: 10 })
    await kit.inject({ records: tooLateNs.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })), changedAtOffsetSeconds: -900 })
    const tooLate = await settle({ ns: tooLateNs, timeoutMs: 240000, allowIncomplete: true, quietMs: 150000 })
    const reconciled = await reconcileLate({ ns: tooLateNs })
    report.beisenQuirks = { duplicates: outcome, wrongOrder: wrongOrder.length, late, missingBeforeReconciliation: tooLate.missing.length, reconciled }
    process.stdout.write(`  北森延迟 15 分钟才可见：对账前缺 ${tooLate.missing.length} 人，补齐后缺 ${reconciled.missing.length} 人\n`)
    assert(reconciled.missing.length === 0 && reconciled.noNotice.length === 0, '迟到变动没有通过全量对账补齐')
    assertClean({ outcome, before, label: 'beisen-quirks' })
    assert(wrongOrder.length === 0, `乱序的连续调岗有 ${wrongOrder.length}/${chain.length} 人没有落在最后一条的部门`)
    assert(late.missing.length === 0, `晚 2 分钟才可见的变动没有被处理：缺 ${late.missing.length}/${lateNs.length}`)
    return { duplicates: outcomeBrief({ outcome }), wrongOrder: wrongOrder.length, late: outcomeBrief({ outcome: late }) }
  })
}

async function reconcileLate({ ns }) {
  const projectId = kit.session().projectId
  const rules = await kit.api({ method: 'GET', path: `/reconciliation/rules?projectId=${projectId}` })
  const rule = rules.find((item) => item.source.actionName === 'enumerate_employees')
  assert(rule, 'Missing people reconciliation rule')
  await kit.api({ method: 'POST', path: `/reconciliation/rules/${rule.id}`, body: { ...rule, maxRepairsPerRun: 0 } })
  await scanReconciliation({ ruleId: rule.id, projectId })
  const keys = new Set(ns.map((n) => kit.jobNumberOf({ n })))
  const page = await kit.api({ method: 'GET', path: `/reconciliation/rules/${rule.id}/differences?projectId=${projectId}&status=OPEN&limit=200` })
  const differences = page.data.filter((item) => keys.has(item.businessKey))
  if (differences.length > 0) await kit.api({ method: 'POST', path: '/reconciliation/differences/repair', body: { projectId, ids: differences.map((item) => item.id) } })
  const outcome = await settle({ ns, timeoutMs: 300000 })
  await scanReconciliation({ ruleId: rule.id, projectId })
  const remaining = await kit.api({ method: 'GET', path: `/reconciliation/rules/${rule.id}/differences?projectId=${projectId}&status=OPEN&limit=200` })
  assert(remaining.data.every((item) => !keys.has(item.businessKey)), 'Reconciliation differences remain after repair')
  return outcome
}

async function scanReconciliation({ ruleId, projectId }) {
  const started = await kit.api({ method: 'POST', path: `/reconciliation/rules/${ruleId}/runs`, body: { projectId } })
  return kit.waitFor({ timeoutMs: 600000, probe: async () => {
    const run = await kit.api({ method: 'GET', path: `/reconciliation/runs/${started.runId}?projectId=${projectId}` })
    if (run.status === 'FAILED') throw new Error(run.error ?? 'Reconciliation failed')
    return run.status === 'SUCCEEDED' ? run : null
  } })
}

async function concurrency() {
  const base = Number(process.env.LOAD_BASE ?? 7000)
  await check('f 同一员工连续调岗 A→B→C、A→B→A：最终部门与北森最后一条一致', async () => {
    const hires = rangeOf({ first: base, count: 20 })
    await kit.inject({ records: hires.map((n) => kit.hireOf({ n, departmentIndex: 0 })) })
    await settle({ ns: hires, timeoutMs: 300000 })
    const chain = rangeOf({ first: base, count: 10 })
    const back = rangeOf({ first: base + 10, count: 10 })
    await kit.inject({ records: chain.map((n) => kit.transferOf({ n, departmentIndex: 3, startDate: '2026-11-01T00:00:00' })) })
    await kit.sleep(1100)
    await kit.inject({ records: chain.map((n) => kit.transferOf({ n, departmentIndex: 5, startDate: '2026-12-01T00:00:00' })) })
    await kit.inject({ records: back.map((n) => kit.transferOf({ n, departmentIndex: 4, startDate: '2026-11-01T00:00:00' })) })
    await kit.sleep(1100)
    await kit.inject({ records: back.map((n) => kit.transferOf({ n, departmentIndex: 0, startDate: '2026-12-01T00:00:00' })) })
    await kit.sleep(150000)
    const users = (await kit.mock({ method: 'GET', path: '/__admin/users' })).users
    const byNo = new Map(users.map((user) => [user.employee_no, user]))
    const chainWrong = chain.filter((n) => byNo.get(kit.jobNumberOf({ n }))?.department_ids[0] !== kit.departmentOpenId({ index: 5 }))
    const backWrong = back.filter((n) => byNo.get(kit.jobNumberOf({ n }))?.department_ids[0] !== kit.departmentOpenId({ index: 0 }))
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

async function feishuHang() {
  const ns = rangeOf({ first: Number(process.env.LOAD_BASE ?? 10000), count: 20 })
  await check('j 目标平台写入已生效但响应迟迟不回（超过连接器超时）：超时后先读回，不重复开通，通知恰好一次，不会挂住整个运行', async () => {
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    await kit.mock({ method: 'POST', path: '/__admin/faults', body: { rules: [{ id: 'create-hangs-after-apply', target: kit.target().name, method: 'POST', path: kit.target().createPath, mode: 'apply_then_delay', delayMs: 180000, times: 4 }] } })
    const startedAt = Date.now()
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    const outcome = await settle({ ns, timeoutMs: 600000 })
    const seconds = Math.round((Date.now() - startedAt) / 1000)
    const faults = (await kit.mock({ method: 'GET', path: '/__admin/summary' })).faults
    await kit.mock({ method: 'POST', path: '/__admin/faults', body: { rules: [] } })
    report.feishuHang = { seconds, faults, ...outcome }
    assert(faults.length === 1 && faults[0].served === 4, 'Four ambiguous timed-out creates were not exercised')
    assertClean({ outcome, before, label: 'feishu-hang' })
    assert(seconds < 170, `有运行被挂住 ${seconds} 秒，超过了对方的拖延时间，说明没有超时`)
    return { seconds, ...outcomeBrief({ outcome }) }
  })
}

async function webhookDedupe() {
  await check('h Webhook 重复投递：同一事件号并发投递 20 次只跑一次，不同事件号各跑一次', async () => {
    const projectId = kit.session().projectId
    const workflow = await kit.api({ method: 'POST', path: '/workflows', body: { displayName: '负载测试：Webhook 去重', projectId } })
    const trigger = {
      name: 'trigger',
      type: 'CONNECTOR_TRIGGER',
      valid: true,
      displayName: 'Webhook',
      lastUpdatedDate: new Date().toISOString(),
      settings: {
        connectorName: '@fema-ipaas/connector-webhook',
        connectorVersion: '~0.1.0',
        triggerName: 'catch_webhook',
        input: { authType: 'none', authFields: {} },
        propertySettings: {},
        dedupe: { enabled: true, keyPath: '{{trigger.body.eventId}}', windowSeconds: 600 },
      },
      nextAction: {
        name: 'remember',
        type: 'CONNECTOR',
        valid: true,
        displayName: '记下事件',
        lastUpdatedDate: new Date().toISOString(),
        settings: { connectorName: '@fema-ipaas/connector-store', connectorVersion: '~0.6.0', actionName: 'put', input: { key: "webhook-seen:{{trigger['output']['body']['eventId']}}", value: 'x', store_scope: 'COLLECTION' }, propertySettings: {}, errorHandlingOptions: {} },
      },
    }
    await kit.api({ method: 'POST', path: `/workflows/${workflow.id}?projectId=${projectId}`, body: { type: 'IMPORT_WORKFLOW', request: { displayName: '负载测试：Webhook 去重', trigger, schemaVersion: null } } })
    await kit.api({ method: 'POST', path: `/workflows/${workflow.id}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
    await kit.sleep(15000)
    const url = `http://127.0.0.1:${loadStack.paths.API_PORT}/api/v1/webhooks/${workflow.id}`
    const post = (eventId) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ eventId }) }).then((response) => response.status)
    const statuses = await Promise.all([...Array.from({ length: 20 }, () => post('EV-SAME')), ...Array.from({ length: 20 }, (_, index) => post(`EV-${index}`))])
    await kit.sleep(20000)
    const again = await Promise.all(Array.from({ length: 5 }, () => post('EV-SAME')))
    await kit.sleep(20000)
    const rows = loadStack.psql({ sql: `select "businessKey", count(*) from execution where "workflowId" = '${workflow.id}' group by 1 order by 1` }).split('\n').filter(Boolean).map((line) => line.split('|'))
    const same = rows.find(([key]) => key === 'EV-SAME')
    const distinct = rows.filter(([key]) => key !== 'EV-SAME')
    report.webhookDedupe = { statuses: [...new Set([...statuses, ...again])], sameRuns: Number(same?.[1] ?? 0), distinctKeys: distinct.length, perKeyMax: Math.max(...distinct.map(([, count]) => Number(count))) }
    assert(report.webhookDedupe.sameRuns === 1, `同一事件号投递 25 次，实际跑了 ${report.webhookDedupe.sameRuns} 次`)
    assert(distinct.length === 20 && report.webhookDedupe.perKeyMax === 1, `不同事件号应各跑一次：${JSON.stringify(rows)}`)
    return report.webhookDedupe
  })
}

async function republish() {
  const ns = rangeOf({ first: 9000, count: PEOPLE })
  await check('i 触发器重复触发：入职事件到达时连续重新发布流程，事件不丢、不重复', async () => {
    const before = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    const projectId = kit.session().projectId
    const flows = await kit.api({ method: 'GET', path: `/workflows?projectId=${projectId}&limit=100` })
    const onboard = flows.data.find((flow) => flow.version?.displayName === kit.target().onboardName)
    await kit.inject({ records: ns.map((n) => kit.hireOf({ n, departmentIndex: n % 20 })) })
    for (let round = 0; round < 3; round += 1) {
      await kit.sleep(8000)
      await kit.api({ method: 'POST', path: `/workflows/${onboard.id}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
    }
    const outcome = await settle({ ns, timeoutMs: 600000 })
    report.republish = outcome
    assertClean({ outcome, before, label: 'republish' })
    return outcomeBrief({ outcome })
  })
}

function assertClean({ outcome, before, label, allowRecoveredFailures = false }) {
  assert(outcome.missing.length === 0, `${label}：${outcome.missing.length} 人没有目标平台账号（丢事件）`)
  assert(outcome.wrongDepartment.length === 0, `${label}：${outcome.wrongDepartment.length} 人部门不对`)
  assert(outcome.noNotice.length === 0, `${label}：${outcome.noNotice.length} 人没有收到 HR 群通知，样例 ${outcome.noNotice.slice(0, 3)}`)
  assert(outcome.dupNotice.length === 0, `${label}：${outcome.dupNotice.length} 人通知了多次`)
  assert(outcome.extraCreates === 0, `${label}：多余的创建调用 ${outcome.extraCreates} 次`)
  assert(outcome.duplicateEmployeeNos === 0, `${label}：重复工号 ${outcome.duplicateEmployeeNos}`)
  assert(outcome.unfinished === 0, `${label}：仍有 ${outcome.unfinished} 个运行没结束`)
  const unrecovered = outcome.failedRuns - (allowRecoveredFailures ? outcome.recoveredFailedRuns : 0)
  assert(unrecovered === 0, `${label}：有 ${unrecovered} 个运行失败且没有成功的显式重跑`)
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
  const statusRows = loadStack.psql({ sql: `select status, count(*) from execution where "projectId"='${kit.session().projectId}' and "businessKey" in (${quoted}) group by status` })
  const statuses = Object.fromEntries(statusRows.split('\n').filter(Boolean).map((line) => line.split('|')).map(([status, count]) => [status, Number(count)]))
  const unfinished = (statuses.QUEUED ?? 0) + (statuses.RUNNING ?? 0) + (statuses.PAUSED ?? 0)
  const failedRuns = Object.entries(statuses).filter(([status]) => !['SUCCEEDED', 'QUEUED', 'RUNNING', 'PAUSED'].includes(status)).reduce((sum, [, count]) => sum + count, 0)
  const recoveredFailedRuns = Number(loadStack.psql({ sql: `SELECT count(*) FROM execution failed WHERE failed."projectId"='${kit.session().projectId}' AND failed."businessKey" IN (${quoted}) AND failed.status IN ('FAILED','INTERNAL_ERROR','TIMEOUT') AND EXISTS (SELECT 1 FROM execution rerun WHERE rerun."projectId"=failed."projectId" AND rerun."workflowId"=failed."workflowId" AND rerun."rerunOfExecutionId"=failed.id AND rerun."businessKey"=failed."businessKey" AND rerun.status='SUCCEEDED')` }))
  const missing = ns.filter((n) => !byNo.has(kit.jobNumberOf({ n })))
  const wrongDepartment = ns.filter((n) => {
    const user = byNo.get(kit.jobNumberOf({ n }))
    return user !== undefined && user.department_ids[0] !== kit.departmentOpenId({ index: n % 20 })
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
    recoveredFailedRuns,
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

async function replayAll({ issues }) {
  const results = []
  for (const issue of issues) {
    const initial = await kit.api({ method: 'POST', path: `/issues/${issue.id}/replay-check`, body: { strategy: 'FROM_FAILED_STEP' } })
    const strategy = initial.items.some((item) => item.writeSteps.some((step) => step.needsConfirmation)) ? 'ON_LATEST_VERSION' : 'FROM_FAILED_STEP'
    const checked = strategy === 'FROM_FAILED_STEP' ? initial : await kit.api({ method: 'POST', path: `/issues/${issue.id}/replay-check`, body: { strategy } })
    const confirmedUnsafeSteps = checked.items.flatMap((item) => item.writeSteps.filter((step) => step.needsConfirmation).map((step) => `${item.executionId}:${step.stepName}`))
    const result = await kit.api({ method: 'POST', path: `/issues/${issue.id}/replay`, body: { strategy, includeDataProblems: true, confirmedUnsafeSteps } })
    results.push({ issue: `${issue.stepName}/${issue.errorCode}`, strategy, confirmedUnsafeSteps: confirmedUnsafeSteps.length, ...result })
  }
  return results
}

function groupDuplicates({ issues }) {
  const byKey = new Map()
  issues.filter((issue) => issue.kind !== 'DRIFT' && issue.status === 'OPEN').forEach((issue) => {
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
