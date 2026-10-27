import { spawn, execFileSync, spawnSync } from 'node:child_process'
import { closeSync, cpSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const SLOT = Number(process.env.E2E_SLOT ?? 2)
const API_PORT = 3100 + SLOT
const WEB_PORT = 4200 + SLOT
const MOCK_PORT = 18900 + SLOT
const PG_PORT = 55440 + SLOT
const REDIS_PORT = 56440 + SLOT
const STATE_DIR = path.join(process.env.E2E_STATE_ROOT ?? '/tmp/fema-e2e', `slot-${SLOT}`)
const LOAD_DIR = path.join(STATE_DIR, 'load')
const PID_FILE = path.join(LOAD_DIR, 'pids.json')
const REDIS_BIN = process.env.E2E_REDIS_BIN ?? '/opt/homebrew/opt/redis/bin/redis-server'
const REDIS_CLI = path.join(path.dirname(REDIS_BIN), 'redis-cli')
const CONNECTORS = process.env.E2E_CONNECTORS ?? 'beisen,feishu,mysql,postgres,ai,connections,crypto,csv,data-mapper,org-sync,email,wecom,dingtalk,data-summarizer,date-helper,file-helper,forms,http,manual-trigger,math-helper,mcp,schedule,store,subflows,tags,text-helper,webhook,xml'
const JWT_SECRET = `e2e-slot-${SLOT}-secret`
const SNAPSHOT_DIR = path.join(process.env.E2E_STATE_ROOT ?? '/tmp/fema-e2e', `snap-${SLOT}`)

export const loadStack = {
  paths: { ROOT, STATE_DIR, LOAD_DIR, API_PORT, WEB_PORT, MOCK_PORT, PG_PORT, REDIS_PORT },
  up,
  down,
  startMock,
  startPostgres,
  startRedis,
  startApi,
  startWorker,
  stopProc,
  killProc,
  isAlive,
  pidOf,
  readPids,
  waitApi,
  waitWorkerOnline,
  redisCli,
  redisKillAndStart,
  tree,
  sampleTree,
  prepareSnapshot,
  psql,
  dbSizeBytes,
  logFile,
}

async function up({ db = 'pglite', redis = 'memory', workers = 1, web = false, clean = true, apiEnv = {}, workerEnv = {} }) {
  if (clean) {
    await down({ keepState: false })
    rmSync(STATE_DIR, { recursive: true, force: true })
    if (process.env.E2E_NO_SNAPSHOT !== '1') prepareSnapshot({ refresh: true })
  }
  mkdirSync(LOAD_DIR, { recursive: true })
  mkdirSync(path.join(STATE_DIR, 'config'), { recursive: true })
  startMock()
  if (db === 'real') {
    startPostgres()
  }
  if (redis === 'real') {
    startRedis()
  }
  await sleep(1500)
  startApi({ db, redis, apiEnv })
  await waitApi()
  for (let index = 1; index <= workers; index += 1) {
    startWorker({ index, workerEnv })
  }
  if (workers > 0) {
    await waitWorkerOnline({ count: workers })
  }
  writeFileSync(path.join(LOAD_DIR, 'mode.json'), JSON.stringify({ db, redis, workers, apiEnv, workerEnv }))
  return readPids()
}

async function down({ keepState = true } = {}) {
  const pids = readPids()
  const workers = Object.keys(pids).filter((name) => name.startsWith('worker'))
  await Promise.all(workers.map((name) => stopProc({ name })))
  await stopProc({ name: 'api' })
  for (const name of Object.keys(pids).filter((name) => !workers.includes(name) && name !== 'api')) await stopProc({ name })
  for (const port of [API_PORT, WEB_PORT, MOCK_PORT, PG_PORT, REDIS_PORT]) {
    const out = spawnSync('lsof', ['-nP', '-tiTCP:' + port, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout.trim()
    for (const pid of out.split('\n').filter(Boolean)) {
      try {
        process.kill(Number(pid), 'SIGTERM')
      }
      catch {
        void 0
      }
    }
  }
  if (!keepState) {
    writePids({})
  }
}

function baseEnv() {
  return {
    ...process.env,
    FEMA_PORT: String(API_PORT),
    FEMA_ENVIRONMENT: 'dev',
    FEMA_LOG_LEVEL: process.env.FEMA_LOG_LEVEL ?? 'info',
    FEMA_CONNECTORS_SYNC_MODE: 'NONE',
    FEMA_TELEMETRY_ENABLED: 'false',
    FEMA_EXECUTION_MODE: 'UNSANDBOXED',
    FEMA_FRONTEND_URL: `http://localhost:${WEB_PORT}`,
    FEMA_DEV_CONNECTORS: CONNECTORS,
    FEMA_BEISEN_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/beisen`,
    FEMA_FEISHU_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/feishu`,
    FEMA_WECOM_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/wecom`,
    FEMA_DINGTALK_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/dingtalk`,
    FEMA_SANDBOX_PROPAGATED_ENV_VARS: 'FEMA_BEISEN_BASE_URL,FEMA_FEISHU_BASE_URL,FEMA_WECOM_BASE_URL,FEMA_DINGTALK_BASE_URL',
    FEMA_SSRF_ALLOW_LIST: '127.0.0.1',
    FEMA_TRIGGER_DEFAULT_POLL_INTERVAL: process.env.FEMA_TRIGGER_DEFAULT_POLL_INTERVAL ?? '1',
    FEMA_DEV_API_PORT: String(API_PORT),
    FEMA_DEV_WEB_PORT: String(WEB_PORT),
  }
}

function startMock({ env = {} } = {}) {
  return launch({ name: 'mock', command: process.execPath, args: ['tools/e2e/main-line/mock-server.mjs'], env: { ...process.env, MOCK_PORT: String(MOCK_PORT), ...env } })
}

function startPostgres() {
  const dataDir = path.join(STATE_DIR, 'pgdata')
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) {
    execFileSync('initdb', ['-D', dataDir, '-U', 'fema', '--auth=trust', '-E', 'UTF8'], { stdio: 'ignore', env: { ...process.env, LC_ALL: 'en_US.UTF-8' } })
  }
  const proc = launch({ name: 'postgres', command: 'postgres', args: ['-D', dataDir, '-p', String(PG_PORT), '-k', STATE_DIR, '-c', 'listen_addresses=127.0.0.1', '-c', 'max_connections=200'], env: { ...process.env, LC_ALL: 'en_US.UTF-8' } })
  waitSync({ probe: () => spawnSync('pg_isready', ['-h', '127.0.0.1', '-p', String(PG_PORT)]).status === 0, label: 'postgres', timeoutMs: 30000 })
  const created = spawnSync('psql', ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'fema', '-d', 'postgres', '-tAc', "select 1 from pg_database where datname='fema'"], { encoding: 'utf8' }).stdout.trim()
  if (created !== '1') {
    execFileSync('createdb', ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'fema', 'fema'])
  }
  return proc
}

function startRedis() {
  const dir = path.join(STATE_DIR, 'redis')
  mkdirSync(dir, { recursive: true })
  const proc = launch({ name: 'redis', command: REDIS_BIN, args: ['--port', String(REDIS_PORT), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no', '--dir', dir, '--protected-mode', 'no'] })
  waitSync({ probe: () => redisCli({ args: ['ping'] }).trim() === 'PONG', label: 'redis', timeoutMs: 15000 })
  return proc
}

function dataEnv({ db, redis }) {
  return {
    ...(db === 'real'
      ? { FEMA_DB_TYPE: 'POSTGRES', FEMA_POSTGRES_HOST: '127.0.0.1', FEMA_POSTGRES_PORT: String(PG_PORT), FEMA_POSTGRES_USERNAME: 'fema', FEMA_POSTGRES_PASSWORD: 'fema', FEMA_POSTGRES_DATABASE: 'fema' }
      : { FEMA_DB_TYPE: 'PGLITE' }),
    ...(redis === 'real' ? { FEMA_REDIS_TYPE: 'STANDALONE', FEMA_REDIS_HOST: '127.0.0.1', FEMA_REDIS_PORT: String(REDIS_PORT), FEMA_REDIS_DB: '0' } : { FEMA_REDIS_TYPE: 'MEMORY' }),
  }
}

function startApi({ db, redis, apiEnv = {} }) {
  const mode = db === undefined ? readMode() : { db, redis }
  return launch({
    name: 'api',
    command: process.execPath,
    args: ['--import', 'tsx', 'packages/server/api/src/bootstrap.ts'],
    env: {
      ...baseEnv(),
      ...dataEnv(mode),
      TSX_TSCONFIG_PATH: 'packages/server/api/tsconfig.app.json',
      FEMA_CONTAINER_TYPE: 'APP',
      FEMA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef',
      FEMA_JWT_SECRET: JWT_SECRET,
      FEMA_CONFIG_PATH: path.join(STATE_DIR, 'config'),
      ...readMode().apiEnv,
      ...apiEnv,
    },
  })
}

function startWorker({ index, workerEnv = {} }) {
  const existing = pidOf({ name: `worker${index}` })
  if (existing && isAlive({ pid: existing })) return existing
  const cache = path.join(STATE_DIR, `worker-cache-${index}`)
  mkdirSync(cache, { recursive: true })
  const token = execFileSync(process.execPath, ['-e', 'const jwt=require("jsonwebtoken");process.stdout.write(jwt.sign({id:"e2e-worker-"+process.env.IDX,type:"WORKER"},process.env.JWT_SECRET,{algorithm:"HS256",issuer:"fema",expiresIn:"30d",keyid:"1"}))'], { cwd: ROOT, env: { ...process.env, JWT_SECRET, IDX: String(index) }, encoding: 'utf8' })
  return launch({
    name: `worker${index}`,
    command: process.execPath,
    args: ['--import', 'tsx', 'packages/server/worker/src/bootstrap.ts'],
    env: { ...baseEnv(), TSX_TSCONFIG_PATH: 'packages/server/worker/tsconfig.lib.json', FEMA_WORKER_TOKEN: token, FEMA_CACHE_BASE_PATH: cache, ...readMode().workerEnv, ...workerEnv },
  })
}

function prepareSnapshot({ refresh = false } = {}) {
  if (existsSync(SNAPSHOT_DIR) && !refresh) {
    return SNAPSHOT_DIR
  }
  rmSync(SNAPSHOT_DIR, { recursive: true, force: true })
  mkdirSync(path.join(SNAPSHOT_DIR, 'packages', 'connectors'), { recursive: true })
  for (const entry of readdirSync(ROOT)) {
    if (entry === 'dist') {
      cpSync(path.join(ROOT, 'dist', 'packages', 'engine'), path.join(SNAPSHOT_DIR, 'dist', 'packages', 'engine'), { recursive: true })
    }
    else if (entry !== 'packages' && entry !== '.git') {
      symlinkSync(path.join(ROOT, entry), path.join(SNAPSHOT_DIR, entry))
    }
  }
  for (const entry of readdirSync(path.join(ROOT, 'packages'))) {
    if (entry !== 'connectors') {
      symlinkSync(path.join(ROOT, 'packages', entry), path.join(SNAPSHOT_DIR, 'packages', entry))
    }
  }
  const source = path.join(ROOT, 'packages', 'connectors')
  cpSync(source, path.join(SNAPSHOT_DIR, 'packages', 'connectors'), {
    recursive: true,
    filter: (from) => !from.split(path.sep).includes('node_modules') && !from.split(path.sep).includes('.turbo'),
  })
  for (const dir of connectorDirs({ root: source })) {
    const relativeDir = path.relative(source, dir)
    const original = path.join(dir, 'node_modules')
    if (existsSync(original)) {
      symlinkSync(original, path.join(SNAPSHOT_DIR, 'packages', 'connectors', relativeDir, 'node_modules'))
    }
  }
  return SNAPSHOT_DIR
}

function connectorDirs({ root }) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name)
    if (!entry.isDirectory() || ['node_modules', 'dist', '.turbo', 'src', 'test'].includes(entry.name)) {
      return []
    }
    return existsSync(path.join(full, 'package.json')) ? [full] : connectorDirs({ root: full })
  })
}

function launch({ name, command, args, env = process.env }) {
  mkdirSync(LOAD_DIR, { recursive: true })
  const out = openSync(logFile({ name }), 'a')
  const cwd = process.env.E2E_NO_SNAPSHOT === '1' ? ROOT : prepareSnapshot()
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', out, out] })
  closeSync(out)
  child.unref()
  writePids({ ...readPids(), [name]: child.pid })
  return child.pid
}

async function stopProc({ name, graceMs = 20000 }) {
  const pid = readPids()[name]
  if (!pid || !isAlive({ pid })) {
    writePids(omit({ pids: readPids(), name }))
    return
  }
  process.kill(pid, 'SIGTERM')
  const deadline = Date.now() + graceMs
  while (Date.now() < deadline && isAlive({ pid })) {
    await sleep(200)
  }
  if (isAlive({ pid })) killProc({ name })
  writePids(omit({ pids: readPids(), name }))
}

function killProc({ name }) {
  const pid = readPids()[name]
  if (pid && isAlive({ pid })) {
    for (const child of tree({ pid }).slice(1)) {
      try {
        process.kill(child.pid, 'SIGKILL')
      }
      catch {
        void 0
      }
    }
    process.kill(pid, 'SIGKILL')
  }
  writePids(omit({ pids: readPids(), name }))
  return pid
}

async function redisKillAndStart({ flush = true } = {}) {
  await stopProc({ name: 'redis', graceMs: 10000 })
  if (flush) {
    rmSync(path.join(STATE_DIR, 'redis'), { recursive: true, force: true })
  }
  return startRedis()
}

function redisCli({ args }) {
  const result = spawnSync(REDIS_CLI, ['-h', '127.0.0.1', '-p', String(REDIS_PORT), ...args], { encoding: 'utf8' })
  return result.stdout ?? ''
}

function psql({ sql }) {
  return spawnSync('psql', ['-h', '127.0.0.1', '-p', String(PG_PORT), '-U', 'fema', '-d', 'fema', '-tAc', sql], { encoding: 'utf8' }).stdout.trim()
}

function dbSizeBytes() {
  return Number(psql({ sql: 'select pg_database_size(current_database())' }))
}

function isAlive({ pid }) {
  try {
    process.kill(pid, 0)
    return true
  }
  catch {
    return false
  }
}

function pidOf({ name }) {
  return readPids()[name]
}

function readPids() {
  try {
    return JSON.parse(readFileSync(PID_FILE, 'utf8'))
  }
  catch {
    return {}
  }
}

function writePids(pids) {
  mkdirSync(LOAD_DIR, { recursive: true })
  writeFileSync(PID_FILE, JSON.stringify(pids))
}

function omit({ pids, name }) {
  return Object.fromEntries(Object.entries(pids).filter(([key]) => key !== name))
}

function readMode() {
  try {
    return { db: 'pglite', redis: 'memory', apiEnv: {}, workerEnv: {}, ...JSON.parse(readFileSync(path.join(LOAD_DIR, 'mode.json'), 'utf8')) }
  }
  catch {
    return { db: 'pglite', redis: 'memory', apiEnv: {}, workerEnv: {} }
  }
}

function logFile({ name }) {
  return path.join(LOAD_DIR, `${name}.log`)
}

async function waitApi({ timeoutMs = 240000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/flags`)
      if (response.ok) {
        return
      }
    }
    catch {
      void 0
    }
    await sleep(1000)
  }
  throw new Error('api did not become ready')
}

async function waitWorkerOnline({ count, timeoutMs = 120000 }) {
  const signedIn = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/authentication/sign-in`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: process.env.E2E_EMAIL ?? 'dev@ap.com', password: process.env.E2E_PASSWORD ?? '12345678' }),
  })
  if (!signedIn.ok) throw new Error(`Worker readiness sign-in failed: ${signedIn.status}`)
  const session = await signedIn.json()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:${API_PORT}/api/v1/worker-machines`, { headers: { authorization: `Bearer ${session.token}` } })
    if (!response.ok) throw new Error(`Worker readiness failed: ${response.status}`)
    const workers = await response.json()
    if (Array.isArray(workers) && workers.filter((worker) => worker.status === 'ONLINE').length >= count) return
    await sleep(1000)
  }
  throw new Error(`Expected ${count} online workers`)
}

function processTable() {
  const out = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,time='], { encoding: 'utf8' })
  return out.trim().split('\n').map((line) => {
    const [pid, ppid, rss, time] = line.trim().split(/\s+/)
    return { pid: Number(pid), ppid: Number(ppid), rssKb: Number(rss), cpuSeconds: parseCpuTime({ text: time }) }
  })
}

function parseCpuTime({ text }) {
  const [minutes, seconds] = text.split(':')
  const parts = text.split(':')
  if (parts.length === 3) {
    return Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])
  }
  return Number(minutes) * 60 + Number(seconds)
}

function tree({ pid }) {
  const table = processTable()
  const byParent = new Map()
  for (const row of table) {
    byParent.set(row.ppid, [...(byParent.get(row.ppid) ?? []), row])
  }
  const root = table.find((row) => row.pid === pid)
  if (!root) {
    return []
  }
  const out = []
  const walk = (row) => {
    out.push(row)
    for (const child of byParent.get(row.pid) ?? []) {
      walk(child)
    }
  }
  walk(root)
  return out
}

function sampleTree({ name }) {
  const pid = pidOf({ name })
  if (!pid) {
    return null
  }
  const rows = tree({ pid })
  if (rows.length === 0) {
    return null
  }
  return { rssMb: rows.reduce((sum, row) => sum + row.rssKb, 0) / 1024, mainRssMb: rows[0].rssKb / 1024, cpuSeconds: rows[0].cpuSeconds, processes: rows.length }
}

function waitSync({ probe, label, timeoutMs }) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (probe()) {
      return
    }
    spawnSync('sleep', ['0.5'])
  }
  throw new Error(`${label} did not become ready`)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...rest] = process.argv.slice(2)
  const flag = (name, fallback) => {
    const index = rest.indexOf(`--${name}`)
    return index >= 0 ? rest[index + 1] : fallback
  }
  if (command === 'up') {
    const pids = await up({ db: flag('db', 'pglite'), redis: flag('redis', 'memory'), workers: Number(flag('workers', 1)), web: false })
    process.stdout.write(`${JSON.stringify(pids)}\n`)
  }
  else if (command === 'down') {
    await down({ keepState: true })
  }
  else if (command === 'status') {
    const pids = readPids()
    for (const [name, pid] of Object.entries(pids)) {
      process.stdout.write(`${name} ${pid} ${isAlive({ pid }) ? 'alive' : 'dead'} ${JSON.stringify(sampleTree({ name }))}\n`)
    }
  }
}
