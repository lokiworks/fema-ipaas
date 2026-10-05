import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { prodKit } from './lib/prod-kit.mjs'

const { check, assert, summary, ensureAdmin, http, publishFlow, runFlow, codeStep, webhookTrigger, waitFor, sleep, stateDir } = prodKit

const SLOT = Number(process.env.E2E_SLOT ?? 1)
const PG_PORT = 55440 + SLOT
const REDIS_PORT = 56440 + SLOT
const API_PORT = 3100 + SLOT
const PG_DIR = path.join(stateDir, 'pg')
const REDIS_DIR = path.join(stateDir, 'redis')
const REDIS_BINARY = process.env.E2E_REDIS_BINARY ?? findRedisBinary()
const env = { ...process.env, LC_ALL: 'en_US.UTF-8' }

const session = await ensureAdmin()

const flowId = await check('准备：一个简单的 webhook 到代码步骤的工作流', async () => {
  return publishFlow({
    session,
    displayName: 'prod-依赖重启',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({ name: 'step_1', displayName: '计算', code: 'export const code = async (inputs) => ({ ok: inputs.n + 1 })', input: { n: 1 } }),
    }),
  })
})

if (flowId) {
  const apiPid = pidOnPort({ port: API_PORT })
  const workerPids = fs.readFileSync(path.join(stateDir, 'worker.pid'), 'utf8').split('\n').filter(Boolean)

  await check('PostgreSQL 重启 10 秒：API 与工作节点进程不退出，恢复后健康检查转绿，新的运行照常成功', async () => {
    execFileSync('pg_ctl', ['-D', PG_DIR, '-m', 'fast', 'stop'], { env, stdio: 'ignore' })
    await sleep(10000)
    const during = await http({ method: 'GET', path: '/health' })
    execFileSync('pg_ctl', ['-D', PG_DIR, '-o', `-p ${PG_PORT} -c listen_addresses=127.0.0.1 -c unix_socket_directories=${stateDir}`, '-l', path.join(stateDir, 'pg.log'), '-w', 'start'], { env, stdio: 'ignore' })
    await waitFor({ what: '健康检查恢复', timeoutMs: 90000, stepMs: 2000, probe: async () => ((await http({ method: 'GET', path: '/health' })).ok ? true : null) })
    assert(pidOnPort({ port: API_PORT }) === apiPid, 'API 进程在数据库重启期间退出并被换掉了')
    workerPids.forEach((pid) => assert(isAlive({ pid }), `工作节点 ${pid} 在数据库重启期间退出了`))
    const run = await runFlow({ session, workflowId: flowId, body: { after: 'postgres' } })
    assert(run.status === 'SUCCEEDED', `重启后运行状态 ${run.status}`)
    return { healthDuring: during.status }
  })

  await check('Redis 重启 10 秒：进程不退出，恢复后队列重新连上，新的运行照常成功', async () => {
    killPort({ port: REDIS_PORT })
    await sleep(10000)
    startRedis()
    await waitFor({ what: 'Redis 重新监听', timeoutMs: 30000, stepMs: 500, probe: async () => (pidOnPort({ port: REDIS_PORT }) === null ? null : true) })
    await waitFor({ what: '健康检查恢复', timeoutMs: 90000, stepMs: 2000, probe: async () => ((await http({ method: 'GET', path: '/health' })).ok ? true : null) })
    assert(pidOnPort({ port: API_PORT }) === apiPid, 'API 进程在 Redis 重启期间退出并被换掉了')
    workerPids.forEach((pid) => assert(isAlive({ pid }), `工作节点 ${pid} 在 Redis 重启期间退出了`))
    const run = await runFlow({ session, workflowId: flowId, body: { after: 'redis' }, timeoutMs: 180000 })
    assert(run.status === 'SUCCEEDED', `重启后运行状态 ${run.status}`)
  })

  await check('停止：API 收到终止信号后 10 秒内退出（compose 的默认等待时间）', async () => {
    const started = Date.now()
    process.kill(Number(apiPid), 'SIGTERM')
    await waitFor({ what: 'API 退出', timeoutMs: 10000, stepMs: 200, probe: async () => (pidOnPort({ port: API_PORT }) === null ? true : null) })
    return { seconds: Math.round((Date.now() - started) / 100) / 10 }
  })
}

summary()

function pidOnPort({ port }) {
  try {
    const output = execFileSync('lsof', ['-nP', `-tiTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim()
    return output.length === 0 ? null : output.split('\n')[0]
  }
  catch {
    return null
  }
}

function killPort({ port }) {
  const pid = pidOnPort({ port })
  if (pid !== null) {
    process.kill(Number(pid), 'SIGTERM')
  }
}

function isAlive({ pid }) {
  try {
    process.kill(Number(pid), 0)
    return true
  }
  catch {
    return false
  }
}

function startRedis() {
  const child = spawn(REDIS_BINARY, ['--port', String(REDIS_PORT), '--bind', '127.0.0.1', '--dir', REDIS_DIR, '--save', '', '--appendonly', 'no'], { cwd: REDIS_DIR, detached: true, stdio: 'ignore' })
  child.unref()
}

function findRedisBinary() {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..', 'node_modules/.cache/redis-memory-server/redis-binaries')
  const version = fs.readdirSync(root)[0]
  return path.join(root, version, 'redis-server')
}
