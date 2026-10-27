import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'
import { reconciliationScale } from './lib/reconciliation-scale.mjs'
import { containerBackupDrill } from './lib/container-backup-drill.mjs'

const hostA = process.env.E2E_DOCKER_HOST_A
const hostB = process.env.E2E_DOCKER_HOST_B
assert(hostA && hostB && hostA !== hostB, 'Set two different E2E_DOCKER_HOST_A and E2E_DOCKER_HOST_B endpoints')
assert(process.env.E2E_STATE_ROOT && process.env.E2E_SLOT, 'Set an isolated E2E_STATE_ROOT and E2E_SLOT')
const prefix = `ipaas-gap-${process.env.E2E_SLOT}`
const image = process.env.E2E_IMAGE ?? 'ipaas-gap:validation'
const stateDir = path.join(loadStack.paths.STATE_DIR, 'containers')
const resultDir = path.join(process.env.E2E_RESULT_DIR ?? '/tmp/fema-e2e/results', 'two-host')
const apiUrl = `http://127.0.0.1:${loadStack.paths.API_PORT}`
const remoteUrl = process.env.E2E_HOST_GATEWAY_URL ?? `http://host.lima.internal:${loadStack.paths.API_PORT}`
const mockUrl = process.env.E2E_MOCK_GATEWAY_URL ?? `http://host.lima.internal:${loadStack.paths.MOCK_PORT}`
const jwtSecret = 'f391c07d856142b9a7436ed8c28a905fe01793ad4b6825cfa'
const encryptionKey = '64af25e093bc4817d29f8c3ae056b471'
const report = {}
const resume = process.env.E2E_RESUME_CONTAINERS === '1'
let succeeded = false
mkdirSync(stateDir, { recursive: true })
mkdirSync(resultDir, { recursive: true })

const infoA = JSON.parse(docker({ host: hostA, args: ['info', '--format', '{{json .}}'] }))
const infoB = JSON.parse(docker({ host: hostB, args: ['info', '--format', '{{json .}}'] }))
assert.notEqual(infoA.ID, infoB.ID, 'Both endpoints refer to the same Docker daemon')
assert.equal(infoA.OSType, 'linux')
assert.equal(infoB.OSType, 'linux')
const imageA = docker({ host: hostA, args: ['image', 'inspect', image, '--format', '{{.Id}}'] }).trim()
const imageB = docker({ host: hostB, args: ['image', 'inspect', image, '--format', '{{.Id}}'] }).trim()
assert.equal(imageA, imageB, 'Both hosts must run the same image')
const bootA = docker({ host: hostA, args: ['run', '--rm', '--entrypoint', 'cat', image, '/proc/sys/kernel/random/boot_id'] }).trim()
const bootB = docker({ host: hostB, args: ['run', '--rm', '--entrypoint', 'cat', image, '/proc/sys/kernel/random/boot_id'] }).trim()
assert.notEqual(bootA, bootB, 'Both Docker daemons share the same Linux kernel boot')
report.hosts = [{ id: infoA.ID, bootId: bootA, kernel: infoA.KernelVersion, os: infoA.OperatingSystem, memoryBytes: infoA.MemTotal, cpus: infoA.NCPU }, { id: infoB.ID, bootId: bootB, kernel: infoB.KernelVersion, os: infoB.OperatingSystem, memoryBytes: infoB.MemTotal, cpus: infoB.NCPU }]
report.image = imageA

const common = {
  FEMA_ENVIRONMENT: 'prod', FEMA_LOG_LEVEL: 'info', FEMA_TRIGGER_DEFAULT_POLL_INTERVAL: '1', FEMA_WORKER_CONCURRENCY: '2', FEMA_TELEMETRY_ENABLED: 'false', FEMA_CONNECTORS_SYNC_MODE: 'NONE',
  FEMA_JWT_SECRET: jwtSecret, FEMA_ENCRYPTION_KEY: encryptionKey,
  FEMA_FRONTEND_URL: remoteUrl, FEMA_INTERNAL_URL: remoteUrl,
  FEMA_BEISEN_BASE_URL: `${mockUrl}/beisen`, FEMA_FEISHU_BASE_URL: `${mockUrl}/feishu`,
  FEMA_SANDBOX_PROPAGATED_ENV_VARS: 'FEMA_BEISEN_BASE_URL,FEMA_FEISHU_BASE_URL',
  FEMA_SSRF_ALLOW_LIST: process.env.E2E_SSRF_ALLOW_LIST ?? '192.168.5.2,host.lima.internal',
}
const hostMap = ['host.lima.internal:host-gateway']
const a = { services: {
  postgres: { image: 'postgres:15-alpine', environment: { POSTGRES_DB: 'fema', POSTGRES_USER: 'fema', POSTGRES_PASSWORD: 'fema', POSTGRES_HOST_AUTH_METHOD: 'trust' }, ports: [`127.0.0.1:${loadStack.paths.PG_PORT}:5432`], volumes: ['postgres_data:/var/lib/postgresql/data'], healthcheck: { test: ['CMD-SHELL', 'pg_isready -U fema'], interval: '2s', retries: 30 } },
  redis: { image: 'redis:7-alpine', command: ['redis-server', '--appendonly', 'yes'], volumes: ['redis_data:/data'], healthcheck: { test: ['CMD', 'redis-cli', 'ping'], interval: '2s', retries: 30 } },
  app: { image, environment: { ...common, FEMA_CONTAINER_TYPE: 'APP', FEMA_DB_TYPE: 'POSTGRES', FEMA_POSTGRES_HOST: 'postgres', FEMA_POSTGRES_PORT: '5432', FEMA_POSTGRES_USERNAME: 'fema', FEMA_POSTGRES_PASSWORD: 'fema', FEMA_POSTGRES_DATABASE: 'fema', FEMA_REDIS_TYPE: 'STANDALONE', FEMA_REDIS_HOST: 'redis', FEMA_REDIS_PORT: '6379' }, extra_hosts: hostMap, ports: [`${loadStack.paths.API_PORT}:80`], volumes: ['app_data:/root/.fema'], depends_on: { postgres: { condition: 'service_healthy' }, redis: { condition: 'service_healthy' } } },
  worker: { image, environment: { ...common, FEMA_CONTAINER_TYPE: 'WORKER', FEMA_CACHE_BASE_PATH: '/usr/src/app/cache' }, extra_hosts: hostMap, volumes: ['worker_cache:/usr/src/app/cache'] },
}, volumes: { postgres_data: {}, redis_data: {}, app_data: {}, worker_cache: {} } }
const b = { services: { worker: { image, environment: { ...common, FEMA_CONTAINER_TYPE: 'WORKER', FEMA_CACHE_BASE_PATH: '/usr/src/app/cache' }, extra_hosts: hostMap, volumes: ['worker_cache:/usr/src/app/cache'] } }, volumes: { worker_cache: {} } }
for (const [name, value] of [['a', a], ['b', b]]) writeFileSync(path.join(stateDir, `${name}.json`), JSON.stringify(value, null, 2))
if (!resume) loadStack.startMock()
try {
  if (resume) {
    const previous = JSON.parse(readFileSync(path.join(resultDir, 'faults.json'), 'utf8'))
    assert.equal(previous.concurrency?.chainWrong, 0)
    assert.equal(previous.concurrency?.backWrong, 0)
    assert(loadStack.isAlive({ pid: loadStack.pidOf({ name: 'mock' }) }))
    await kit.connect()
    assert((await kit.mock({ method: 'GET', path: '/__admin/summary' })).employees >= 240)
    report.resumedAfterConcurrency = true
  }
  else {
    compose({ host: hostB, name: 'b', args: ['down', '--volumes'] })
    compose({ host: hostA, name: 'a', args: ['down', '--volumes'] })
    compose({ host: hostA, name: 'a', args: ['up', '-d'] })
    await loadStack.waitApi()
    await createAdmin()
    compose({ host: hostB, name: 'b', args: ['up', '-d'] })
    await loadStack.waitWorkerOnline({ count: 2 })
    await kit.connect()
    await kit.setupMainLine({ departments: 20 })
    process.env.LOAD_REUSE = '1'
    process.env.LOAD_SCENARIOS = 'concurrency'
    process.env.E2E_RESULT_DIR = resultDir
    await import('./load-faults.mjs')
    assert(!process.exitCode, 'Cross-host concurrency scenario failed')
  }
  const { completed, final, probe } = await containerBackupDrill.run({ host: hostA, app: compose({ host: hostA, name: 'a', args: ['ps', '-q', 'app'] }).trim(), postgres: compose({ host: hostA, name: 'a', args: ['ps', '-q', 'postgres'] }).trim(), seeded: resume })
  assert.equal(final.createAttemptsExtra, 0)
  assert.equal(final.duplicateMessageExtra, 0)
  assert.equal(kit.counts().failed, 0)
  const logsA = compose({ host: hostA, name: 'a', args: ['logs', '--no-color', 'worker'] })
  const logsB = compose({ host: hostB, name: 'b', args: ['logs', '--no-color', 'worker'] })
  assert(logsA.includes('EXECUTE_WORKFLOW') && logsB.includes('EXECUTE_WORKFLOW'), 'Both hosts must execute workflows')
  const precheck = await kit.api({ method: 'GET', path: `/backups/${completed.id}/restore-precheck` })
  report.backup = { id: completed.id, fileName: completed.fileName, precheck, probe }
  report.final = { users: final.users, messages: final.messages, duplicateAccounts: final.createAttemptsExtra, duplicateMessages: final.duplicateMessageExtra, counts: kit.counts() }
  compose({ host: hostA, name: 'a', args: ['stop', 'worker', 'app'] })
  compose({ host: hostB, name: 'b', args: ['stop', 'worker'] })
  const backupFile = `/root/.fema/backups/${completed.fileName}`
  const checked = compose({ host: hostA, name: 'a', args: ['run', '--rm', '--no-deps', 'app', 'fema-restore', backupFile, '--offline', '--check'] })
  assert(checked.includes('precheck') || checked.includes('Precheck') || checked.includes('check'), checked)
  const restored = compose({ host: hostA, name: 'a', args: ['run', '--rm', '--no-deps', 'app', 'fema-restore', backupFile, '--offline'] })
  assert(restored.includes('Restore completed'), restored)
  compose({ host: hostA, name: 'a', args: ['up', '-d'] })
  compose({ host: hostB, name: 'b', args: ['up', '-d'] })
  await loadStack.waitApi()
  await kit.connect()
  await loadStack.waitWorkerOnline({ count: 2 })
  const projectId = kit.session().projectId
  const rules = await kit.api({ method: 'GET', path: `/reconciliation/rules?projectId=${projectId}` })
  const rule = rules.find((item) => item.source.actionName === 'enumerate_employees')
  assert(rule)
  const started = await kit.api({ method: 'POST', path: `/reconciliation/rules/${rule.id}/runs`, body: { projectId } })
  const reconciled = await kit.waitFor({ timeoutMs: 600000, probe: async () => {
    const row = await kit.api({ method: 'GET', path: `/reconciliation/runs/${started.runId}?projectId=${projectId}` })
    if (row.status === 'FAILED') throw new Error(row.error)
    return row.status === 'SUCCEEDED' ? row : null
  } })
  assert.equal(reconciled.sourceCount, 250)
  assert.equal(reconciled.differenceCount, 0)
  const afterRestore = await kit.mock({ method: 'GET', path: '/__admin/summary' })
  assert.equal(afterRestore.users, 250)
  assert.equal(afterRestore.messages, 250)
  assert.equal(afterRestore.duplicateMessageExtra, 0)
  assert.equal(afterRestore.createAttemptsExtra, 0)
  report.volume = { backupReadableFromNewContainer: true, actualPostgresRestore: true, sourceCount: reconciled.sourceCount, differences: reconciled.differenceCount, accounts: afterRestore.users, messages: afterRestore.messages }
  const people = Number(process.env.E2E_RECONCILIATION_SCALE_N ?? 10000)
  if (people > 0) report.reconciliationScale = await reconciliationScale.run({ host: hostA, container: compose({ host: hostA, name: 'a', args: ['ps', '-q', 'app'] }).trim(), people, resultDir })
  writeFileSync(path.join(resultDir, 'containers.json'), JSON.stringify(report, null, 2))
  succeeded = true
  process.stdout.write(`PASS two independent Linux hosts, identical image, concurrent transfers, backup during committed writes, 200+50 actual restore and persistent Compose volumes\n`)
}
finally {
  writeFileSync(path.join(resultDir, 'containers-progress.json'), JSON.stringify({ ...report, passed: succeeded }, null, 2))
  for (const [host, name] of [[hostB, 'b'], [hostA, 'a']]) {
    try { writeFileSync(path.join(resultDir, `host-${name}.log`), compose({ host, name, args: ['logs', '--no-color'] })) } catch { void 0 }
    if (succeeded || process.env.E2E_KEEP_ON_FAILURE !== '1') {
      try { compose({ host, name, args: ['down'] }) } catch { void 0 }
    }
  }
  if (succeeded || process.env.E2E_KEEP_ON_FAILURE !== '1') await loadStack.stopProc({ name: 'mock' })
}

function docker({ host, args }) {
  return execFileSync('docker', ['--host', host, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
}

function compose({ host, name, args }) {
  return docker({ host, args: ['compose', '--project-name', `${prefix}-${name}`, '--file', path.join(stateDir, `${name}.json`), ...args] })
}

async function createAdmin() {
  const response = await fetch(`${apiUrl}/api/v1/authentication/sign-up`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.E2E_EMAIL ?? 'dev@ap.com', password: process.env.E2E_PASSWORD ?? '12345678', firstName: 'Container', lastName: 'Drill', trackEvents: false, newsLetter: false }) })
  assert(response.ok, `Container sign-up failed: ${response.status}`)
  const signedUp = await response.json()
  const completed = await fetch(`${apiUrl}/api/v1/authentication/complete-sign-up`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${signedUp.token}` }, body: JSON.stringify({ fullName: 'Container Drill', organizationName: 'Container Drill' }) })
  assert(completed.ok, `Container organization setup failed: ${completed.status}`)
}
