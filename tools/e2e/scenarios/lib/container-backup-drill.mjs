import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { loadKit as kit } from './load-kit.mjs'

async function run({ host, app, postgres, seeded = false }) {
  if (!seeded) await kit.inject({ records: Array.from({ length: 180 }, (_, index) => kit.hireOf({ n: 10000 + index, departmentIndex: index % 20 })) })
  await waitForPeople({ count: 200 })
  const projectId = kit.session().projectId
  assert(/^[\w-]+$/.test(projectId))
  sql({ host, postgres, query: 'CREATE TABLE e2e_backup_probe ("projectId" text NOT NULL, seq integer NOT NULL, at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY ("projectId", seq))' })
  const writer = startWriter({ host, postgres, projectId })
  let blocker
  let completed
  let starts
  try {
    await kit.waitFor({ timeoutMs: 30000, intervalMs: 50, probe: async () => Number(sql({ host, postgres, query: `SELECT count(*) FROM e2e_backup_probe WHERE "projectId"='${projectId}'` })) >= 5 })
    blocker = startSql({ host, postgres, query: 'BEGIN; LOCK TABLE e2e_backup_probe IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(5); COMMIT;' })
    await kit.waitFor({ timeoutMs: 30000, intervalMs: 50, probe: async () => Number(sql({ host, postgres, query: "SELECT count(*) FROM pg_locks WHERE relation='public.e2e_backup_probe'::regclass AND mode='AccessExclusiveLock' AND granted" })) === 1 })
    starts = await Promise.all(Array.from({ length: 2 }, () => kit.apiRaw({ method: 'POST', path: '/backups', body: { note: 'Two-host probe' } })))
    const accepted = starts.filter((response) => response.ok)
    assert.equal(accepted.length, 1, `Concurrent backups: ${JSON.stringify(starts.map(({ status, body }) => ({ status, body })))}`)
    const rejected = starts.filter((response) => !response.ok)
    assert.equal(rejected[0].status, 409, `Concurrent backup rejection: ${JSON.stringify(rejected[0])}`)
    assert.equal(rejected[0].body.code, 'VALIDATION')
    const backup = accepted[0].body
    completed = await kit.waitFor({ timeoutMs: 180000, probe: async () => {
      const row = (await kit.api({ method: 'GET', path: '/backups' })).find((item) => item.id === backup.id)
      if (row?.status === 'FAILED') throw new Error(row.error)
      return row?.status === 'SUCCEEDED' ? row : null
    } })
    await blocker.finished
    await writer.finished
  }
  finally { blocker?.stop(); writer.stop(); await Promise.allSettled([blocker?.finished, writer.finished]) }
  const dump = docker({ host, args: ['exec', app, 'pg_restore', '--data-only', '--table=e2e_backup_probe', '--file=-', `/root/.fema/backups/${completed.fileName}`] })
  const lines = dump.split('\n')
  const first = lines.findIndex((line) => line.startsWith('COPY public.e2e_backup_probe '))
  assert(first >= 0, 'Backup does not contain the concurrent-write probe')
  const end = lines.indexOf('\\.', first + 1)
  assert(end > first)
  const rows = lines.slice(first + 1, end).map((line) => line.split('\t'))
  assert(rows.length > 0 && rows.length < 500, `Backup must capture an in-progress committed prefix: ${rows.length}/500`)
  assert(rows.every((row, index) => row[0] === projectId && Number(row[1]) === index + 1), 'Backup contains a non-contiguous committed prefix')
  assert.equal(Number(sql({ host, postgres, query: `SELECT count(*) FROM e2e_backup_probe WHERE "projectId"='${projectId}'` })), 500)
  await kit.inject({ records: Array.from({ length: 50 }, (_, index) => kit.hireOf({ n: 20000 + index, departmentIndex: index % 20 })) })
  await waitForPeople({ count: 250 })
  const final = await kit.mock({ method: 'GET', path: '/__admin/summary' })
  const probe = { concurrentStartStatuses: starts.map((response) => response.status), committedRows: 500, snapshotRows: rows.length, consistentPrefix: true }
  process.stdout.write(`PASS container backup: 200 people before backup, 50 after, ${JSON.stringify(probe)}\n`)
  return { completed, final, probe }
}

async function waitForPeople({ count }) {
  await kit.waitFor({ timeoutMs: 3600000, intervalMs: 3000, probe: async () => {
    const state = await kit.mock({ method: 'GET', path: '/__admin/summary' })
    return state.users === count && state.messages === count && kit.counts().unfinished === 0
  } })
}

function startWriter({ host, postgres, projectId }) {
  return startSql({ host, postgres, query: Array.from({ length: 500 }, (_, index) => `INSERT INTO e2e_backup_probe ("projectId", seq) VALUES ('${projectId}', ${index + 1});\nSELECT pg_sleep(0.02);`).join('\n') })
}

function startSql({ host, postgres, query }) {
  const child = spawn('docker', ['--host', host, 'exec', '-i', postgres, 'psql', '-q', '-U', 'fema', '-d', 'fema', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'ignore', 'pipe'] })
  let error = ''
  child.stderr.on('data', (chunk) => { error += chunk.toString() })
  const finished = new Promise((resolve, reject) => { child.once('error', reject); child.stdin.once('error', reject); child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`Backup SQL failed: ${error}`))) })
  child.stdin.end(query)
  return { finished, stop: () => { if (child.exitCode === null) child.kill('SIGTERM') } }
}

function sql({ host, postgres, query }) {
  return docker({ host, args: ['exec', postgres, 'psql', '-qAt', '-U', 'fema', '-d', 'fema', '-v', 'ON_ERROR_STOP=1', '-c', query] }).trim()
}

function docker({ host, args }) {
  return execFileSync('docker', ['--host', host, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
}

export const containerBackupDrill = { run }
