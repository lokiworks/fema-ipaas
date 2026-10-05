import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prodKit } from './lib/prod-kit.mjs'

const { check, assert, summary, ensureAdmin, api, http, sleep, waitFor, stateDir } = prodKit

const SLOT = Number(process.env.E2E_SLOT ?? 1)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const OLD_ROOT = process.env.OLD_ROOT ?? path.join(stateDir, 'run-old')
const NEW_ROOT = process.env.NEW_ROOT ?? path.join(stateDir, 'run')
const OLD_MANIFEST = process.env.OLD_MANIFEST ?? path.join(stateDir, 'manifest-old.json')
const DB_NAME = process.env.PROD_DB_NAME ?? 'fema_upgrade'
const DB_PASSWORD = process.env.PROD_DB_PASSWORD ?? 'femapw'
const PG_PORT = 55440 + SLOT
const REDIS_PORT = 56440 + SLOT
const MOCK_URL = process.env.E2E_MOCK_URL ?? `http://127.0.0.1:${18900 + SLOT}`
const OLD_VERSION_CEILING = process.env.ROLLBACK_TO ?? '0.88.3'
const RUN_ID = 100000 + (Math.floor(Date.now() / 1000) % 800000)
const ADDED_TABLES = ['backup_record', 'backup_settings', 'service_setting', 'issue_workflow', 'release_change', 'run_reliability_event']
const ADDED_COLUMNS = [{ table: 'execution', column: 'searchHashes' }, { table: 'agent_approval', column: 'workflowDisplayName' }, { table: 'agent_approval', column: 'invalidReason' }]
const baseEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  LC_ALL: 'en_US.UTF-8',
  PROD_DB_NAME: DB_NAME,
  FEMA_STEP_TIMEOUT: '20',
}

function psql({ sql }) {
  return execFileSync('psql', ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'fema', '-d', DB_NAME, '-At', '-F', '|', '-c', sql], {
    env: { ...baseEnv, PGPASSWORD: DB_PASSWORD },
    encoding: 'utf8',
  }).trim()
}

function tableCounts() {
  const tables = psql({ sql: "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1" }).split('\n').filter(Boolean)
  return Object.fromEntries(tables.map((table) => [table, Number(psql({ sql: `select count(*) from "${table}"` }))]))
}

function executedMigrations() {
  return psql({ sql: 'select name from migrations order by id' }).split('\n').filter(Boolean)
}

function columnExists({ table, column }) {
  return psql({ sql: `select count(*) from information_schema.columns where table_name = '${table}' and column_name = '${column}'` }) === '1'
}

function startStack({ root }) {
  execFileSync(path.join(ROOT, 'tools/e2e/stack/start-prod-stack.sh'), [String(SLOT)], {
    env: { ...baseEnv, PROD_ROOT: root, PROD_MOCK: '0' },
    stdio: 'ignore',
  })
}

function stopStack() {
  execFileSync(path.join(ROOT, 'tools/e2e/stack/stop-prod-stack.sh'), [String(SLOT)], { env: baseEnv, stdio: 'ignore' })
}

function rollback({ args }) {
  return execFileSync('node', ['packages/server/api/dist/src/rollback.js', ...args], {
    cwd: NEW_ROOT,
    env: {
      ...baseEnv,
      NODE_ENV: 'production',
      FEMA_ENVIRONMENT: 'prod',
      FEMA_DB_TYPE: 'POSTGRES',
      FEMA_POSTGRES_HOST: '127.0.0.1',
      FEMA_POSTGRES_PORT: String(PG_PORT),
      FEMA_POSTGRES_DATABASE: DB_NAME,
      FEMA_POSTGRES_USERNAME: 'fema',
      FEMA_POSTGRES_PASSWORD: DB_PASSWORD,
      FEMA_REDIS_TYPE: 'STANDALONE',
      FEMA_REDIS_HOST: '127.0.0.1',
      FEMA_REDIS_PORT: String(REDIS_PORT),
      FEMA_JWT_SECRET: process.env.PROD_JWT_SECRET ?? '8f3a1c5e7b9d2046a8c1e3f5071b9d2c4e6f80a1b3c5d7e9f102a4c6e8b0d2f4',
      FEMA_ENCRYPTION_KEY: process.env.PROD_ENCRYPTION_KEY ?? '5b1e9c3a7d2f40869e0c4a8b6d1f3e57',
      FEMA_CONFIG_PATH: path.join(stateDir, 'config'),
    },
    encoding: 'utf8',
  })
}

async function apiSnapshot() {
  const session = await ensureAdmin()
  const read = async (route) => (await api({ method: 'GET', path: route, token: session.token }))
  const workflows = (await read(`/workflows?projectId=${session.projectId}&limit=100`)).data
  const runs = (await read(`/run-logs?projectId=${session.projectId}&limit=100&type=ALL`)).data
  const connections = (await read(`/connections?projectId=${session.projectId}&limit=100`)).data
  return {
    session,
    workflows: workflows.map((flow) => ({ id: flow.id, status: flow.status, published: flow.publishedVersionId ?? null, name: flow.version?.displayName })).sort((a, b) => a.id.localeCompare(b.id)),
    runs: runs.map((run) => ({ id: run.id, status: run.status, workflowId: run.workflowId })).sort((a, b) => a.id.localeCompare(b.id)),
    connections: connections.map((connection) => ({ id: connection.id, externalId: connection.externalId, status: connection.status })).sort((a, b) => a.id.localeCompare(b.id)),
  }
}

function assertSameData({ before, after, label }) {
  assert(JSON.stringify(before.workflows) === JSON.stringify(after.workflows), `${label}：工作流不一致 ${JSON.stringify(before.workflows).slice(0, 200)} / ${JSON.stringify(after.workflows).slice(0, 200)}`)
  const settledRuns = before.runs.filter((run) => !['RUNNING', 'QUEUED', 'PAUSED'].includes(run.status))
  const lostRuns = settledRuns.filter((run) => !after.runs.some((other) => other.id === run.id && other.status === run.status))
  assert(lostRuns.length === 0, `${label}：丢了或改了运行记录 ${JSON.stringify(lostRuns).slice(0, 300)}`)
  assert(JSON.stringify(before.connections) === JSON.stringify(after.connections), `${label}：连接不一致`)
}

function assertNoTableShrank({ before, after, label }) {
  const shrunk = Object.entries(before).filter(([table, count]) => table in after && after[table] < count && table !== 'migrations')
  assert(shrunk.length === 0, `${label}：这些表的行数变少了 ${JSON.stringify(shrunk)}`)
  const vanished = Object.keys(before).filter((table) => !(table in after))
  assert(vanished.length === 0, `${label}：这些表没了 ${JSON.stringify(vanished)}`)
}

async function onboardsNewEmployee({ id }) {
  const jobNumber = `E${id}`
  const mobile = `139${String(id).padStart(8, '0')}`
  const before = (await (await fetch(`${MOCK_URL}/__admin/state`)).json()).feishuUsers.length
  await fetch(`${MOCK_URL}/__admin/employees`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      records: [{
        employeeInfo: { userID: id, name: `升级${jobNumber}`, mobilePhone: mobile, workEmail: `${jobNumber.toLowerCase()}@example.com`, objectId: `00000000-0000-0000-0000-${String(id).padStart(12, '0')}` },
        recordInfo: { userID: id, jobNumber, oIdDepartment: 20301, employeeStatus: '2', changeTypeOID: '1', approvalStatus: 4, startDate: '2026-10-08T00:00:00', lastWorkDate: null },
      }],
    }),
  })
  return waitFor({
    what: `新员工 ${jobNumber} 在飞书开通`,
    timeoutMs: 180000,
    stepMs: 5000,
    probe: async () => {
      const state = await (await fetch(`${MOCK_URL}/__admin/state`)).json()
      return state.feishuUsers.length > before && state.feishuUsers.some((user) => user.mobile === `+86${mobile}`) ? state.feishuUsers.length : null
    },
  })
}

const seeded = await apiSnapshot()
const countsBeforeUpgrade = tableCounts()
const migrationsBeforeUpgrade = executedMigrations()
const oldManifest = JSON.parse(fs.readFileSync(OLD_MANIFEST, 'utf8'))

await check('起点：旧版本库里有数据（工作流、运行、连接、迁移记录），且不含本轮新增的表与列', async () => {
  assert(seeded.workflows.length >= 3 && seeded.runs.length >= 3 && seeded.connections.length >= 2, `数据不够 ${JSON.stringify({ workflows: seeded.workflows.length, runs: seeded.runs.length, connections: seeded.connections.length })}`)
  assert(JSON.stringify(migrationsBeforeUpgrade) === JSON.stringify(oldManifest), `旧库迁移记录与旧清单不一致 ${migrationsBeforeUpgrade.length}/${oldManifest.length}`)
  ADDED_TABLES.forEach((table) => assert(!(table in countsBeforeUpgrade), `旧库不应有表 ${table}`))
  return { workflows: seeded.workflows.length, runs: seeded.runs.length, connections: seeded.connections.length, tables: Object.keys(countsBeforeUpgrade).length, rows: Object.values(countsBeforeUpgrade).reduce((sum, count) => sum + count, 0) }
})

stopStack()
await sleep(2000)
startStack({ root: NEW_ROOT })

await check('升级：新构建产物在带数据的真实 Postgres 上启动，迁移全部执行，新表新列到位', async () => {
  const health = await http({ method: 'GET', path: '/health' })
  assert(health.ok, `健康检查 ${health.status}`)
  const migrations = executedMigrations()
  const newOnes = migrations.filter((name) => !oldManifest.includes(name))
  assert(newOnes.length >= 8, `新增迁移只有 ${newOnes.length} 个`)
  ADDED_TABLES.forEach((table) => assert(table in tableCounts(), `缺少新表 ${table}`))
  ADDED_COLUMNS.forEach((entry) => assert(columnExists(entry), `缺少新列 ${entry.table}.${entry.column}`))
  const log = fs.readFileSync(path.join(stateDir, 'api.log'), 'utf8')
  const errors = log.split('\n').filter((line) => line.includes('"level":"error"'))
  assert(errors.length === 0, `启动日志里有 error：${errors[0]?.slice(0, 300)}`)
  return { newMigrations: newOnes.length }
})

await check('升级：数据不丢——所有旧表行数不减，工作流、运行记录、连接逐项一致', async () => {
  const afterCounts = tableCounts()
  assertNoTableShrank({ before: countsBeforeUpgrade, after: afterCounts, label: '升级后' })
  const after = await apiSnapshot()
  assertSameData({ before: seeded, after, label: '升级后' })
  return { workflows: after.workflows.length, runs: after.runs.length }
})

await check('升级：老工作流在新版本上继续跑通——旧连接能解密，新员工被开通，运行成功', async () => {
  const total = await onboardsNewEmployee({ id: RUN_ID + 1 })
  return { feishuUsers: total }
})

await check('升级：新功能页在升级后的库上可用（系统总览、备份、发布变更）', async () => {
  const session = await ensureAdmin()
  const overview = await http({ method: 'GET', path: '/health/overview', token: session.token })
  assert(overview.ok, `系统总览 ${overview.status} ${overview.text.slice(0, 200)}`)
  const backups = await http({ method: 'GET', path: '/backups', token: session.token })
  assert(backups.ok, `备份列表 ${backups.status} ${backups.text.slice(0, 200)}`)
  return { overview: overview.status, backups: backups.status }
})

const afterUpgradeCounts = tableCounts()
const afterUpgradeSnapshot = await apiSnapshot()

stopStack()
await sleep(2000)

await check(`回滚保护：npm run rollback -- --to ${OLD_VERSION_CEILING} 会撤销带破坏性的迁移，没加 --force 时整体拒绝，一条都不撤`, async () => {
  const before = executedMigrations()
  let failed = false
  let output = ''
  try {
    output = rollback({ args: ['--to', OLD_VERSION_CEILING] })
  }
  catch (error) {
    failed = true
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`
  }
  assert(failed && output.includes('Use --force'), `应拒绝并提示 --force：${output.slice(-300)}`)
  assert(JSON.stringify(executedMigrations()) === JSON.stringify(before), '拒绝后迁移记录不应变化')
})

await check('回滚（按清单）：npm run rollback -- --manifest <旧镜像里的迁移清单> 回到上一个版本的迁移状态，新表新列消失', async () => {
  const output = rollback({ args: ['--manifest', JSON.stringify(oldManifest)] })
  assert(output.includes('Rollback complete'), `没有看到完成提示：${output.slice(-300)}`)
  assert(JSON.stringify(executedMigrations()) === JSON.stringify(oldManifest), '回滚后迁移记录与旧清单不一致')
  ADDED_TABLES.forEach((table) => assert(!(table in tableCounts()), `回滚后表 ${table} 仍在`))
  ADDED_COLUMNS.forEach((entry) => assert(!columnExists(entry), `回滚后列 ${entry.table}.${entry.column} 仍在`))
  return { reverted: (output.match(/Reverted successfully/g) ?? []).length }
})

await check('回滚（按清单）：旧表数据全部保留，旧版本重新启动后一切如常，还能继续开通新员工', async () => {
  const counts = tableCounts()
  const shrunk = Object.entries(afterUpgradeCounts).filter(([table, count]) => table in counts && counts[table] < count && !ADDED_TABLES.includes(table) && table !== 'migrations')
  assert(shrunk.length === 0, `回滚后这些表行数变少 ${JSON.stringify(shrunk)}`)
  startStack({ root: OLD_ROOT })
  const after = await apiSnapshot()
  assertSameData({ before: afterUpgradeSnapshot, after, label: '回滚后用旧版本启动' })
  const total = await onboardsNewEmployee({ id: RUN_ID + 2 })
  return { feishuUsers: total }
})

stopStack()
await sleep(2000)
startStack({ root: NEW_ROOT })

await check('再次升级：回滚过的库可以再升级一次（迁移可重复执行），数据不丢', async () => {
  assert(executedMigrations().length === oldManifest.length + 8, `迁移条数 ${executedMigrations().length}`)
  const after = await apiSnapshot()
  assertSameData({ before: afterUpgradeSnapshot, after, label: '再次升级后' })
})

summary()
