import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'

const requireFromApi = createRequire(`${loadStack.paths.ROOT}/packages/server/api/package.json`)
const { Client } = requireFromApi('pg')
const { Queue } = requireFromApi('bullmq')
const RESULT_DIR = '/tmp/fema-e2e/results'
const BACKDATE_DAYS = Number(process.env.LOAD_BACKDATE_DAYS ?? 40)
const WAIT_MS = Number(process.env.LOAD_RETENTION_WAIT_MS ?? 600000)
const { check, assert, summary } = kit.makeChecker()

mkdirSync(RESULT_DIR, { recursive: true })
await kit.connect()
const pg = new Client({ host: '127.0.0.1', port: loadStack.paths.PG_PORT, user: 'fema', password: 'fema', database: 'fema' })
await pg.connect()
const queue = new Queue('system-job-queue', { connection: { host: '127.0.0.1', port: loadStack.paths.REDIS_PORT, db: 0 } })
const report = {}

report.before = await storage()
process.stdout.write(`清理前 ${JSON.stringify(report.before)}\n`)

await pg.query(`update file set created = created - interval '${BACKDATE_DAYS} days' where type in ('EXECUTION_LOG','EXECUTION_LOG_SLICE','WORKFLOW_STEP_FILE','TRIGGER_EVENT_FILE','TRIGGER_PAYLOAD','WEBHOOK_PAYLOAD')`)
await pg.query(`update execution set created = created - interval '${BACKDATE_DAYS} days', "finishTime" = "finishTime" - interval '${BACKDATE_DAYS} days'`)
const open = await pg.query(`select count(*)::int as count from execution where status in ('QUEUED','RUNNING','PAUSED')`)
report.openRunsBlocking = open.rows[0].count

await check('有未结束的运行时，保留期清理不会把已过期的日志清掉（对比：有几个未结束运行就卡住整个项目）', async () => {
  const run = await runCleanup({ label: 'blocked' })
  report.blocked = run
  const left = run.after.files.EXECUTION_LOG ?? 0
  assert(report.openRunsBlocking === 0 || left > 0, '没有未结束的运行也没被清掉，场景不成立')
  return { openRuns: report.openRunsBlocking, logFilesLeft: left, seconds: run.seconds }
})

await pg.query(`update execution set status = 'INTERNAL_ERROR', "finishTime" = now() - interval '${BACKDATE_DAYS - 1} days' where status in ('QUEUED','RUNNING','PAUSED')`)
await check('没有未结束的运行后，保留期清理在时限内清完过期日志', async () => {
  const run = await runCleanup({ label: 'cleared' })
  report.cleared = run
  const left = (run.after.files.EXECUTION_LOG ?? 0) + (run.after.files.WEBHOOK_PAYLOAD ?? 0)
  assert(left === 0, `清理后还剩 ${left} 个过期文件`)
  return { seconds: run.seconds, apiP95Ms: run.apiP95Ms, apiMaxMs: run.apiMaxMs, before: report.before.files, after: run.after.files }
})

writeFileSync(`${RESULT_DIR}/retention.json`, JSON.stringify(report, null, 2))
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
summary()
await queue.close()
await pg.end()

async function runCleanup({ label }) {
  const startedAt = Date.now()
  const samples = []
  const timer = setInterval(() => {
    kit.apiRaw({ method: 'GET', path: `/workflows?projectId=${kit.session().projectId}&limit=20` }).then((row) => samples.push(row.ms)).catch(() => undefined)
  }, 1000)
  await queue.add('file-cleanup-trigger', {}, { jobId: `manual-${label}-${startedAt}` })
  let last = ''
  let stableSince = null
  for (;;) {
    await kit.sleep(3000)
    const now = await storage()
    const key = JSON.stringify(now.files)
    if (key === last) {
      stableSince = stableSince ?? Date.now()
      if (Date.now() - stableSince > 15000) {
        break
      }
    }
    else {
      stableSince = null
    }
    last = key
    if (Date.now() - startedAt > WAIT_MS) {
      break
    }
  }
  clearInterval(timer)
  const sorted = [...samples].sort((a, b) => a - b)
  return { label, seconds: Math.round((Date.now() - startedAt - 15000) / 1000), after: await storage(), apiP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? null, apiMaxMs: sorted[sorted.length - 1] ?? null }
}

async function storage() {
  const files = await pg.query(`select type, count(*)::int as count, coalesce(sum(size), 0)::bigint as bytes from file group by type`)
  const executions = await pg.query(`select count(*)::int as count from execution`)
  const size = await pg.query(`select pg_database_size(current_database())::bigint as bytes`)
  return {
    files: Object.fromEntries(files.rows.map((row) => [row.type, row.count])),
    fileBytes: Object.fromEntries(files.rows.map((row) => [row.type, Number(row.bytes)])),
    executions: executions.rows[0].count,
    dbBytes: Number(size.rows[0].bytes),
  }
}
