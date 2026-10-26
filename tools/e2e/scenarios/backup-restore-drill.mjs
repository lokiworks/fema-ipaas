import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'

if (!process.env.E2E_STATE_ROOT) throw new Error('Set E2E_STATE_ROOT to an isolated test directory before running a destructive restore drill')
const beforeCount = Number(process.env.DRILL_BEFORE ?? 200)
const afterCount = Number(process.env.DRILL_AFTER ?? 50)
const connectors = 'beisen,feishu,data-mapper,org-sync,schedule,store,subflows,http,webhook'
await loadStack.up({ db: 'pglite', redis: 'memory', workers: 1, apiEnv: { FEMA_DEV_CONNECTORS: connectors, FEMA_CONNECTORS_SYNC_MODE: 'NONE' }, workerEnv: { FEMA_DEV_CONNECTORS: connectors } })
await kit.connect()
await kit.setupMainLine({ departments: 5 })
await kit.inject({ records: Array.from({ length: beforeCount }, (_, index) => kit.hireOf({ n: index + 1, departmentIndex: index % 5 })) })
await waitForPeople(beforeCount)
process.stdout.write(`PASS before backup: ${beforeCount} accounts and notices\n`)
const backup = await kit.api({ method: 'POST', path: '/backups', body: { note: 'Isolated people synchronization restore drill' } })
const completed = await kit.waitFor({ probe: async () => { const list = await kit.api({ method: 'GET', path: '/backups' }); const row = list.find((item) => item.id === backup.id); if (row?.status === 'FAILED') throw new Error(row.error); return row?.status === 'SUCCEEDED' ? row : null }, timeoutMs: 120000 })
await kit.inject({ records: Array.from({ length: afterCount }, (_, index) => kit.hireOf({ n: beforeCount + index + 1, departmentIndex: index % 5 })) })
await waitForPeople(beforeCount + afterCount)
process.stdout.write(`PASS after backup: ${beforeCount + afterCount} accounts and notices\n`)
await loadStack.stopProc({ name: 'worker1' })
await loadStack.stopProc({ name: 'api' })
const config = path.join(loadStack.paths.STATE_DIR, 'config')
const output = execFileSync(process.execPath, ['--import', 'tsx', 'packages/server/api/src/cli/restore.ts', path.join(config, 'backups', completed.fileName), '--offline'], { cwd: loadStack.paths.ROOT, env: { ...process.env, FEMA_CONFIG_PATH: config, FEMA_DB_TYPE: 'PGLITE', FEMA_REDIS_TYPE: 'MEMORY', FEMA_ENVIRONMENT: 'dev', FEMA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef', FEMA_JWT_SECRET: `e2e-slot-${process.env.E2E_SLOT ?? 2}-secret`, TSX_TSCONFIG_PATH: 'packages/server/api/tsconfig.app.json' }, encoding: 'utf8', timeout: 120000 })
assert(output.includes('Restore completed'), output.slice(-1000))
loadStack.startApi({ db: 'pglite', redis: 'memory' })
await loadStack.waitApi()
loadStack.startWorker({ index: 1 })
await loadStack.waitWorkerOnline({ count: 1 })
await kit.connect()
const projectId = kit.session().projectId
const rules = await kit.api({ method: 'GET', path: `/reconciliation/rules?projectId=${projectId}` })
assert(rules.length)
const started = await kit.api({ method: 'POST', path: `/reconciliation/rules/${rules[0].id}/runs`, body: { projectId } })
const run = await kit.waitFor({ probe: async () => { const run = await kit.api({ method: 'GET', path: `/reconciliation/runs/${started.runId}?projectId=${projectId}` }); if (run.status === 'FAILED') throw new Error('Restore reconciliation failed; inspect the isolated API log'); return run.status === 'SUCCEEDED' ? run : null }, timeoutMs: 600000 })
assert.equal(run.differenceCount, 0)
assert.equal(run.sourceCount, beforeCount + afterCount)
const state = await kit.mock({ method: 'GET', path: '/__admin/state' })
assert.equal(state.feishuUsers.length, beforeCount + afterCount)
assert.equal(new Set(state.feishuUsers.map((user) => user.employee_no)).size, beforeCount + afterCount)
process.stdout.write(`PASS backup/restore drill: ${beforeCount} + ${afterCount} people, real PGlite restore, zero reconciliation differences and no duplicate accounts\n`)

async function waitForPeople(count) {
  await kit.waitFor({ probe: async () => { const state = await kit.mock({ method: 'GET', path: '/__admin/state' }); return state.feishuUsers.length === count && state.messages.length === count ? state : null }, timeoutMs: Math.max(300000, count * 6000), intervalMs: 3000 })
}
