import { createRequire } from 'node:module'
import { promisify } from 'node:util'
import { zstdCompress as zstdCompressCallback, zstdDecompress as zstdDecompressCallback } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'

const requireFromApi = createRequire(`${loadStack.paths.ROOT}/packages/server/api/package.json`)
const { Client } = requireFromApi('pg')
const zstdCompress = promisify(zstdCompressCallback)
const zstdDecompress = promisify(zstdDecompressCallback)

const PEOPLE = Number(process.env.LOAD_N ?? 10000)
const DRIFTS = Number(process.env.LOAD_DRIFTS ?? 50)
const FIRST = 100000
const RESULT_DIR = '/tmp/fema-e2e/results'
const { check, assert, summary } = kit.makeChecker()

mkdirSync(RESULT_DIR, { recursive: true })
await kit.connect()
const projectId = kit.session().projectId

const client = new Client({ host: '127.0.0.1', port: loadStack.paths.PG_PORT, user: 'fema', password: 'fema', database: 'fema' })
await client.connect()

const template = await loadTemplate()
process.stdout.write(`模板运行 ${template.execution.id} 日志 ${template.logsFile.id} 步骤 ${Object.keys(template.steps).join(',')}\n`)

const seeded = await seedFeishu()
process.stdout.write(`飞书侧造账号 ${seeded.length} 个，其中 ${DRIFTS} 个被手工改了部门\n`)
const seedStartedAt = Date.now()
await seedRuns({ people: seeded })
process.stdout.write(`造运行记录 ${seeded.length} 条，耗时 ${Math.round((Date.now() - seedStartedAt) / 1000)}s\n`)

const sampler = kit.startSampler({ names: ['api'], intervalMs: 1000 })
const startedAt = Date.now()
const response = await kit.apiRaw({ method: 'POST', path: '/verification/run', body: { projectId, sinceHours: 24 } })
const durationSeconds = Math.round((Date.now() - startedAt) / 1000)
const resources = sampler.stop()
const result = response.body
const mock = await kit.mock({ method: 'GET', path: '/__admin/summary' })
const readsServed = mock.requestCounts['feishu:GET /feishu/open-apis/contact/v3/users/:id'] ?? 0
const issues = await client.query(`select count(*)::int as count from issue where kind = 'DRIFT'`)

const report = { people: seeded.length, drifts: DRIFTS, status: response.status, durationSeconds, readsServed, readsPerSecond: Number((readsServed / durationSeconds).toFixed(1)), result: { ...result, problems: undefined }, driftIssues: issues.rows[0].count, resources }
writeFileSync(`${RESULT_DIR}/verify-${seeded.length}.json`, JSON.stringify(report, null, 2))
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

await check('核对覆盖了全部运行', async () => {
  assert(response.status === 200, `HTTP ${response.status}`)
  assert(result.truncated === false, '核对被截断（超过时间预算或候选上限）')
  assert(result.checked >= seeded.length, `只核对了 ${result.checked}/${seeded.length}`)
  return { checked: result.checked, matched: result.matched, mismatched: result.mismatched }
})
await check('被手工改过的账号全部发现', async () => {
  assert(result.mismatched === DRIFTS, `发现 ${result.mismatched} 个差异，预期 ${DRIFTS}`)
  return { mismatched: result.mismatched }
})
await check('1 万人核对在分钟级（10 分钟内）完成', async () => {
  assert(durationSeconds <= 600, `耗时 ${durationSeconds} 秒`)
  return { durationSeconds }
})
summary()
await client.end()

async function loadTemplate() {
  const row = await client.query(`select e.id, e."workflowId", e."workflowVersionId", e."logsFileId" from execution e where e.status = 'SUCCEEDED' and e."logsFileId" is not null and e."businessKey" is not null and e.environment = 'PRODUCTION' order by e.created desc limit 1`)
  assert(row.rows.length === 1, '库里没有可当模板的成功运行，先跑一次 load-scale.mjs')
  const [execution] = row.rows
  const file = await client.query(`select id, "projectId", "tenantId", data, location, "fileName", size, metadata, type, compression from file where id = $1`, [execution.logsFileId])
  const [logsFile] = file.rows
  const raw = await zstdDecompress(logsFile.data)
  const parsed = JSON.parse(raw.toString('utf8'))
  const state = parsed.executionState ?? parsed
  return { execution, logsFile, parsed, steps: state.steps }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message)
    }
  }
}

async function seedFeishu() {
  await kit.mock({ method: 'POST', path: '/__admin/reset' })
  await kit.mock({ method: 'POST', path: '/__admin/departments', body: { ids: Array.from({ length: 20 }, (_, index) => kit.departmentOpenId({ index })) } })
  const users = Array.from({ length: PEOPLE }, (_, index) => {
    const n = FIRST + index
    return { name: `员工${n}`, mobile: `+86${kit.mobileOf({ n })}`, email: `${kit.jobNumberOf({ n }).toLowerCase()}@example.com`, employee_no: kit.jobNumberOf({ n }), department_ids: [kit.departmentOpenId({ index: n % 20 })] }
  })
  for (let offset = 0; offset < users.length; offset += 2000) {
    await kit.mock({ method: 'POST', path: '/__admin/feishu-seed-users', body: { users: users.slice(offset, offset + 2000) } })
  }
  const listed = (await kit.mock({ method: 'GET', path: '/__admin/users' })).users
  const byNo = new Map(listed.map((user) => [user.employee_no, user]))
  const people = Array.from({ length: PEOPLE }, (_, index) => {
    const n = FIRST + index
    const user = byNo.get(kit.jobNumberOf({ n }))
    return { n, openId: user.open_id, mobile: user.mobile, departmentId: kit.departmentOpenId({ index: n % 20 }) }
  })
  for (const person of people.slice(0, DRIFTS)) {
    await kit.mock({ method: 'POST', path: '/__admin/feishu-user', body: { mobile: person.mobile, set: { department_ids: ['od-d20'] } } })
  }
  return people
}

async function seedRuns({ people }) {
  const now = Date.now()
  for (let offset = 0; offset < people.length; offset += 500) {
    const slice = people.slice(offset, offset + 500)
    const rows = await Promise.all(slice.map(async (person, index) => {
      const steps = cloneSteps({ person })
      const logsFileId = `vlog${person.n}`.padEnd(21, '0').slice(0, 21)
      const executionId = `vrun${person.n}`.padEnd(21, '0').slice(0, 21)
      const body = JSON.parse(JSON.stringify(template.parsed))
      const state = body.executionState ?? body
      state.steps = steps
      const data = await zstdCompress(Buffer.from(JSON.stringify(body)))
      return { person, steps, logsFileId, executionId, data, finishedAt: new Date(now - (offset + index) * 20).toISOString() }
    }))
    await client.query('begin')
    for (const row of rows) {
      await client.query(`insert into file (id, "projectId", "tenantId", data, location, "fileName", size, metadata, type, compression) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [row.logsFileId, template.logsFile.projectId, template.logsFile.tenantId, row.data, template.logsFile.location, template.logsFile.fileName, row.data.length, template.logsFile.metadata, template.logsFile.type, template.logsFile.compression])
      await client.query(`insert into execution (id, "projectId", "workflowId", "workflowVersionId", environment, status, "logsFileId", "businessKey", "startTime", "finishTime", tags, "stepsCount") values ($1, $2, $3, $4, 'PRODUCTION', 'SUCCEEDED', $5, $6, $7, $7, '{}', 3)`, [row.executionId, projectId, template.execution.workflowId, template.execution.workflowVersionId, row.logsFileId, kit.jobNumberOf({ n: row.person.n }), row.finishedAt])
    }
    await client.query('commit')
  }
}

function cloneSteps({ person }) {
  const steps = JSON.parse(JSON.stringify(template.steps))
  const provision = steps.provision
  provision.input = { ...provision.input, departmentId: person.departmentId, mobile: person.mobile.replace('+86', ''), employeeNo: kit.jobNumberOf({ n: person.n }) }
  provision.output = { ...provision.output, open_id: person.openId, mobile: person.mobile, created: true }
  return steps
}
