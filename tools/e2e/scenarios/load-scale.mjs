import { writeFileSync, mkdirSync } from 'node:fs'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'

const DB = process.env.LOAD_DB ?? 'pglite'
const REDIS = process.env.LOAD_REDIS ?? (DB === 'real' ? 'real' : 'memory')
const PEOPLE = Number(process.env.LOAD_N ?? 2000)
const WORKERS = Number(process.env.LOAD_WORKERS ?? 1)
const FEISHU_LATENCY_MS = Number(process.env.LOAD_LATENCY_MS ?? 60)
const BATCHES = Number(process.env.LOAD_BATCHES ?? 10)
const BATCH_GAP_MS = Number(process.env.LOAD_BATCH_GAP_MS ?? 20000)
const DEPARTMENTS = 20
const KEEP_STACK = process.env.LOAD_KEEP === '1'
const RESULT_DIR = '/tmp/fema-e2e/results'
const { check, assert, summary } = kit.makeChecker()

mkdirSync(RESULT_DIR, { recursive: true })
process.stdout.write(`规模测试 db=${DB} redis=${REDIS} 人数=${PEOPLE} worker=${WORKERS} 飞书延迟=${FEISHU_LATENCY_MS}ms\n`)

await loadStack.up({ db: DB, redis: REDIS, workers: WORKERS })
await kit.connect()
const setup = await kit.setupMainLine({ departments: DEPARTMENTS })
await kit.mock({ method: 'POST', path: '/__admin/latency', body: { feishu: FEISHU_LATENCY_MS, beisen: 20 } })
await kit.sleep(8000)

const plan = planOf({ people: PEOPLE, batches: BATCHES })
const sampler = kit.startSampler({ names: ['api', ...Array.from({ length: WORKERS }, (_, i) => `worker${i + 1}`)] })
const probes = []
const probeTimer = setInterval(() => {
  probeApi().then((row) => probes.push(row)).catch(() => undefined)
}, 5000)

const startedAt = Date.now()
const injectedAt = []
for (const batch of plan.batches) {
  for (const step of batch.steps) {
    await kit.inject({ records: step.records })
    await kit.sleep(step.afterMs)
  }
  injectedAt.push(Date.now() - startedAt)
  process.stdout.write(`注入批次 ${injectedAt.length}/${plan.batches.length} 累计 ${Math.round((Date.now() - startedAt) / 1000)}s\n`)
  await kit.sleep(BATCH_GAP_MS)
}
const finished = await waitSettled({ expectedUsers: plan.expectedUsers, timeoutMs: Number(process.env.LOAD_TIMEOUT_MS ?? 5400000) })
const endedAt = Date.now()
clearInterval(probeTimer)
const resources = sampler.stop()

const state = await kit.mock({ method: 'GET', path: '/__admin/summary' })
const users = (await kit.mock({ method: 'GET', path: '/__admin/users' })).users
const progress = await progressOf()
const verdict = judge({ users, expected: plan.expected })
const durationSeconds = Math.round((endedAt - startedAt) / 1000)
const dbBytes = DB === 'real' ? loadStack.dbSizeBytes() : null
const probeStats = summarizeProbes({ rows: probes })

const result = {
  config: { db: DB, redis: REDIS, people: PEOPLE, workers: WORKERS, feishuLatencyMs: FEISHU_LATENCY_MS, batches: BATCHES },
  durationSeconds,
  runsTotal: progress.total,
  throughputRunsPerSecond: Number((progress.total / durationSeconds).toFixed(2)),
  settled: finished,
  feishu: { users: state.users, expectedUsers: plan.expectedUsers, createCalls: state.createCalls, createAttemptsExtra: state.createAttemptsExtra, rejectedDuplicateCreates: state.rejectedDuplicateCreates, duplicateEmployeeNos: state.duplicateEmployeeNos, messages: state.messages, duplicateMessageExtra: state.duplicateMessageExtra, inflightMax: state.inflightMax },
  verdict,
  progress,
  resources,
  dbBytes,
  probeStats,
  requestCounts: state.requestCounts,
}
writeFileSync(`${RESULT_DIR}/scale-${DB}-${PEOPLE}.json`, JSON.stringify(result, null, 2))
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

await check('飞书账号数等于预期', async () => {
  assert(state.users === plan.expectedUsers, `账号 ${state.users}，预期 ${plan.expectedUsers}`)
  return { users: state.users }
})
await check('没有重复开通（同一手机号只创建一次，工号不重复）', async () => {
  assert(state.createAttemptsExtra === 0 && state.duplicateEmployeeNos === 0, `多余的创建调用 ${state.createAttemptsExtra}，重复工号 ${state.duplicateEmployeeNos}`)
  return { createCalls: state.createCalls }
})
await check('每人只通知 HR 群一次', async () => {
  assert(state.duplicateMessageExtra === 0, `重复通知 ${state.duplicateMessageExtra} 条`)
  assert(state.messages === plan.expectedUsers, `通知 ${state.messages} 条，预期 ${plan.expectedUsers}`)
  return { messages: state.messages }
})
await check('部门与北森最终记录一致', async () => {
  assert(verdict.wrongDepartment === 0 && verdict.missing === 0, `部门错 ${verdict.wrongDepartment}，缺账号 ${verdict.missing}，样例 ${JSON.stringify(verdict.samples)}`)
  return verdict
})
await check('运行监控的计数与数据库里的实际一致，没有把积压误记成宕机补事件', async () => {
  const monitor = await kit.api({ method: 'GET', path: `/run-monitor/summary?range=24h&timezone=UTC&projectIds=${kit.session().projectId}` })
  assert(monitor.stats.runs === progress.total, `监控显示 ${monitor.stats.runs} 个运行，数据库里 ${progress.total} 个`)
  assert(monitor.stats.succeeded === progress.succeeded, `监控显示成功 ${monitor.stats.succeeded}，数据库里 ${progress.succeeded}`)
  assert(monitor.handled.caughtUpEvents === 0, `没有宕机，监控却记了 ${monitor.handled.caughtUpEvents} 个宕机后补上的事件`)
  return { runs: monitor.stats.runs, caughtUpEvents: monitor.handled.caughtUpEvents, duplicateEvents: monitor.handled.duplicateEvents }
})
await check('没有失败的运行、没有未处理的问题', async () => {
  assert(progress.failed === 0 && progress.openIssues === 0, `失败 ${progress.failed}，未处理问题 ${progress.openIssues}`)
  return { failed: progress.failed, issues: progress.issues }
})
summary()

if (!KEEP_STACK) {
  await loadStack.down({ keepState: true })
}

function planOf({ people, batches }) {
  const perBatch = Math.floor(people / batches)
  const expected = new Map()
  const records = []
  const result = Array.from({ length: batches }, (_, batchIndex) => {
    const first = batchIndex * perBatch + 1
    const hires = Array.from({ length: perBatch }, (_, i) => {
      const n = first + i
      const departmentIndex = n % DEPARTMENTS
      expected.set(n, departmentIndex)
      return kit.hireOf({ n, departmentIndex })
    })
    const edits = hires.slice(0, Math.floor(perBatch / 10)).map((record) => structuredClone(record))
    const earlier = batchIndex >= 2 ? Array.from({ length: Math.floor(perBatch * 0.3) }, (_, i) => (batchIndex - 2) * perBatch + 1 + i) : []
    const firstTransfers = earlier.map((n) => {
      const departmentIndex = (n + 7) % DEPARTMENTS
      expected.set(n, departmentIndex)
      return kit.transferOf({ n, departmentIndex })
    })
    const secondTransfers = earlier.slice(0, Math.floor(earlier.length / 3)).map((n) => {
      const departmentIndex = (n + 13) % DEPARTMENTS
      expected.set(n, departmentIndex)
      return kit.transferOf({ n, departmentIndex })
    })
    records.push(...hires)
    return {
      steps: [
        { records: hires, afterMs: 1500 },
        { records: edits, afterMs: 1500 },
        { records: firstTransfers, afterMs: 1500 },
        { records: secondTransfers, afterMs: 0 },
      ],
    }
  })
  return { batches: result, expected, expectedUsers: expected.size }
}

function judge({ users, expected }) {
  const byEmployeeNo = new Map(users.map((user) => [user.employee_no, user]))
  const samples = []
  const tally = [...expected.entries()].reduce((acc, [n, departmentIndex]) => {
    const user = byEmployeeNo.get(kit.jobNumberOf({ n }))
    if (!user) {
      return { ...acc, missing: acc.missing + 1 }
    }
    const want = `od-d${String(departmentIndex + 1).padStart(2, '0')}`
    if (user.department_ids[0] !== want) {
      if (samples.length < 5) {
        samples.push({ n, want, got: user.department_ids })
      }
      return { ...acc, wrongDepartment: acc.wrongDepartment + 1 }
    }
    return { ...acc, correct: acc.correct + 1 }
  }, { correct: 0, wrongDepartment: 0, missing: 0 })
  return { ...tally, samples }
}

async function progressOf() {
  if (DB === 'real') {
    const c = kit.counts()
    return { total: c.executions, succeeded: c.succeeded, failed: c.failed, unfinished: c.unfinished, issues: c.issues, openIssues: c.openIssues }
  }
  const monitor = await kit.api({ method: 'GET', path: `/run-monitor/summary?range=7d&timezone=UTC&projectIds=${kit.session().projectId}` })
  const issues = await kit.api({ method: 'GET', path: `/issues?projectId=${kit.session().projectId}&view=ALL&limit=100` })
  return { total: monitor.stats.runs, succeeded: monitor.stats.succeeded, failed: monitor.stats.failed, unfinished: monitor.stats.running, issues: issues.data.length, openIssues: issues.data.filter((issue) => issue.status === 'OPEN').length }
}

async function waitSettled({ expectedUsers, timeoutMs }) {
  let stableSince = null
  let last = ''
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const sum = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    const progress = await progressOf()
    const key = `${progress.total}:${progress.unfinished}:${sum.users}`
    process.stdout.write(`  进度 账号 ${sum.users}/${expectedUsers} 运行 ${progress.total} 未完成 ${progress.unfinished} 失败 ${progress.failed}\n`)
    if (sum.users >= expectedUsers && progress.unfinished === 0 && key === last) {
      stableSince = stableSince ?? Date.now()
      if (Date.now() - stableSince > 75000) {
        return true
      }
    }
    else {
      stableSince = null
    }
    last = key
    await kit.sleep(15000)
  }
  return false
}

async function probeApi() {
  const projectId = kit.session().projectId
  const paths = ['/workflows?projectId=' + projectId + '&limit=20', '/issues?projectId=' + projectId + '&view=OPEN&limit=20', '/run-logs?type=RUN&time=24h&projectId=' + projectId + '&limit=20', `/run-monitor/summary?range=24h&timezone=UTC&projectIds=${projectId}`]
  const rows = await Promise.all(paths.map(async (path) => ({ path: path.split('?')[0], ...(await kit.apiRaw({ method: 'GET', path })) })))
  return rows.map(({ path, ms, status }) => ({ path, ms, status }))
}

function summarizeProbes({ rows }) {
  const flat = rows.flat()
  const byPath = new Map()
  flat.forEach((row) => byPath.set(row.path, [...(byPath.get(row.path) ?? []), row]))
  return Object.fromEntries([...byPath.entries()].map(([path, items]) => {
    const sorted = items.map((item) => item.ms).sort((a, b) => a - b)
    return [path, { n: items.length, p50: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1], errors: items.filter((item) => item.status !== 200).length }]
  }))
}
