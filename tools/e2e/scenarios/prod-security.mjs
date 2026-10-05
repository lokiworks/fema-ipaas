import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'

import { prodKit } from './lib/prod-kit.mjs'

const { check, assert, summary, ensureAdmin, http, stateDir } = prodKit

const SLOT = Number(process.env.E2E_SLOT ?? 1)
const API = process.env.E2E_API_URL ?? `http://localhost:${3100 + SLOT}/api/v1`
const ORIGIN = API.replace(/\/api\/v1$/, '')
const PROD_ROOT = process.env.PROD_ROOT ?? path.join(stateDir, 'run')
const JWT_SECRET = process.env.PROD_JWT_SECRET ?? '8f3a1c5e7b9d2046a8c1e3f5071b9d2c4e6f80a1b3c5d7e9f102a4c6e8b0d2f4'
const PG_PORT = 55440 + SLOT
const LEAK_MARKERS = ['"stack"', 'node_modules', '/private/tmp', '/usr/src', '.ts:', 'at Object.', 'at async', 'QueryFailedError', 'pg_catalog', 'relation "']

const session = await ensureAdmin()
const probeIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
const authed = (init) => http({ ...init, token: session.token, headers: { 'x-real-ip': probeIp() } })

function assertNoLeak({ text, label }) {
  const hit = LEAK_MARKERS.find((marker) => text.includes(marker))
  assert(hit === undefined, `${label} 的响应里出现了「${hit}」：${text.slice(0, 200)}`)
}

await check('环境：flags 报告 prod，没有开发模式的标记', async () => {
  const flags = await http({ method: 'GET', path: '/flags' })
  assert(flags.body.ENVIRONMENT === 'prod', `ENVIRONMENT=${flags.body.ENVIRONMENT}`)
  return { environment: flags.body.ENVIRONMENT }
})

await check('账号：开发种子账号 dev@ap.com 不存在，登录失败的提示与不存在的账号完全一致', async () => {
  const seeded = await http({ method: 'POST', path: '/authentication/sign-in', body: { email: 'dev@ap.com', password: '12345678' }, headers: { 'x-real-ip': probeIp() } })
  const unknown = await http({ method: 'POST', path: '/authentication/sign-in', body: { email: `nobody-${randomBytes(3).toString('hex')}@corp.test`, password: '12345678' }, headers: { 'x-real-ip': probeIp() } })
  assert(seeded.status === 401 && unknown.status === 401, `状态 ${seeded.status}/${unknown.status}`)
  assert(JSON.stringify(seeded.body) === JSON.stringify(unknown.body), `提示不一致 ${seeded.text} / ${unknown.text}`)
  const wrongPassword = await http({ method: 'POST', path: '/authentication/sign-in', body: { email: 'admin@corp.test', password: 'wrong-password-1' }, headers: { 'x-real-ip': probeIp() } })
  assert(JSON.stringify(wrongPassword.body) === JSON.stringify(unknown.body), `存在的账号密码错时提示与不存在的账号不一致：${wrongPassword.text}`)
  return { status: seeded.status }
})

await check('账号：装好之后陌生人不能自助注册（只能被邀请）', async () => {
  const response = await http({ method: 'POST', path: '/authentication/sign-up', body: { email: `stranger-${randomBytes(3).toString('hex')}@corp.test`, password: 'Passw0rd!x1', firstName: '外', lastName: '人', trackEvents: false, newsLetter: false }, headers: { 'x-real-ip': probeIp() } })
  assert(response.status === 403 && response.body.code === 'INVITATION_ONLY_SIGN_UP', `状态 ${response.status} ${response.text.slice(0, 200)}`)
})

await check('安装向导：装好之后公开的 setup 接口不再泄露数据库、队列版本和数据目录', async () => {
  const setup = await http({ method: 'GET', path: '/health/setup' })
  assert(setup.body.initialized === true && setup.body.checks.length === 0 && setup.body.services.length === 0, setup.text.slice(0, 300))
  const serviceCheck = await http({ method: 'POST', path: '/health/setup/service-check', body: { kind: 'SMTP' } })
  assert(serviceCheck.status === 403, `装好后向导的服务检查应被拒绝，实际 ${serviceCheck.status}`)
})

await check('管理接口：未登录访问系统健康、组件、诊断、概览一律被拒绝', async () => {
  const paths = ['/health/system', '/health/components', '/health/diagnostics', '/health/overview', '/health/diagnostics-bundle', '/health/run-metrics', '/health/queue-metrics', '/audit-events', '/users', '/projects']
  const statuses = await Promise.all(paths.map(async (item) => ({ item, status: (await http({ method: 'GET', path: item })).status })))
  const open = statuses.filter((entry) => ![401, 403].includes(entry.status))
  assert(open.length === 0, `未登录可访问：${JSON.stringify(open)}`)
})

await check('调试入口：队列面板默认关闭，没有 /api/ui、没有 heap/debug/metrics 之类的接口', async () => {
  const candidates = ['/api/ui', '/api/ui/', '/api/debug', '/api/v1/debug', '/api/metrics', '/api/v1/metrics', '/metrics', '/debug', '/api/v1/heapdump', '/api/documentation', '/api/docs', '/api/docs/static/index.html']
  const responses = await Promise.all(candidates.map(async (item) => {
    const response = await fetch(`${ORIGIN}${item}`, { headers: { accept: 'application/json' } })
    const text = await response.text()
    return { item, status: response.status, isHtmlShell: text.includes('<div id="root"') }
  }))
  const exposed = responses.filter((entry) => entry.status === 200 && !entry.isHtmlShell)
  assert(exposed.length === 0, `暴露了：${JSON.stringify(exposed)}`)
})

await check('响应头：API 与静态页都带 nosniff、HSTS、frame-ancestors，不泄露 x-powered-by 和服务器版本', async () => {
  for (const url of [`${API}/flags`, `${ORIGIN}/`, `${ORIGIN}/sign-in`]) {
    const response = await fetch(url)
    const headers = Object.fromEntries(response.headers.entries())
    assert(headers['x-content-type-options'] === 'nosniff', `${url} 缺 nosniff`)
    assert((headers['strict-transport-security'] ?? '').includes('max-age'), `${url} 缺 HSTS`)
    assert((headers['content-security-policy'] ?? '').includes('frame-ancestors'), `${url} 缺 frame-ancestors`)
    assert(headers['x-powered-by'] === undefined && headers.server === undefined, `${url} 泄露 ${headers['x-powered-by'] ?? headers.server}`)
  }
})

await check('静态资源缓存：带哈希的资源长期缓存，入口页面不缓存', async () => {
  const index = await fetch(`${ORIGIN}/`)
  assert((index.headers.get('cache-control') ?? '').includes('no-cache'), `入口页缓存头 ${index.headers.get('cache-control')}`)
  const html = await index.text()
  const asset = html.match(/\/assets\/[^"']+\.js/)?.[0]
  assert(asset, '入口页里找不到脚本')
  const script = await fetch(`${ORIGIN}${asset}`)
  assert(script.status === 200 && (script.headers.get('cache-control') ?? '').includes('immutable'), `脚本缓存头 ${script.headers.get('cache-control')}`)
  const map = await fetch(`${ORIGIN}${asset}.map`)
  assert(map.status === 404, `不应提供 source map，实际 ${map.status}`)
})

await check('错误响应：非法 JSON、非法参数、越界数字、坏时间、未知路由都不带堆栈、SQL 或文件路径', async () => {
  const projectId = session.projectId
  const probes = [
    { label: '非法 JSON', method: 'POST', path: '/workflows', body: '{bad' },
    { label: '越界 limit', method: 'GET', path: `/workflows?projectId=${projectId}&limit=99999999999999999999` },
    { label: '坏时间', method: 'GET', path: `/executions?projectId=${projectId}&createdAfter=notadate` },
    { label: '坏 id', method: 'GET', path: '/files/x' },
    { label: '未知路由', method: 'GET', path: '/nope/nope' },
    { label: '错误方法', method: 'PUT', path: '/workflows' },
  ]
  const results = []
  for (const probe of probes) {
    const response = await authed({ method: probe.method, path: probe.path, body: probe.body })
    assertNoLeak({ text: response.text, label: probe.label })
    results.push({ label: probe.label, status: response.status })
  }
  const bigLimit = results.find((entry) => entry.label === '越界 limit')
  const badDate = results.find((entry) => entry.label === '坏时间')
  assert(bigLimit.status === 400 && badDate.status === 400, `数据库拒绝的参数应是 400，实际 ${JSON.stringify({ bigLimit, badDate })}`)
  return results
})

await check('令牌：alg=none、被篡改、用错误密钥签发的令牌都被拒绝', async () => {
  const require = createRequire(path.join(PROD_ROOT, 'package.json'))
  const jwt = require('jsonwebtoken')
  const [header, payload] = session.token.split('.')
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
  const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${payload}.`
  const tampered = `${header}.${Buffer.from(JSON.stringify({ ...claims, id: 'someoneelse0123456789' })).toString('base64url')}.${session.token.split('.')[2]}`
  const wrongKey = jwt.sign(claims, 'not-the-real-secret-not-the-real-secret', { algorithm: 'HS256', keyid: '1', issuer: 'fema' })
  const statuses = []
  for (const token of [none, tampered, wrongKey, 'garbage']) {
    const response = await http({ method: 'GET', path: '/projects', token, headers: { 'x-real-ip': probeIp() } })
    statuses.push(response.status)
  }
  assert(statuses.every((status) => status === 401 || status === 403), `被接受或报错不当：${statuses}`)
  const valid = await authed({ method: 'GET', path: '/projects' })
  assert(valid.ok, `有效令牌被拒绝 ${valid.status}`)
  return statuses
})

await check('限流：登录失败 60 次被限流；换一个来源不受影响；没有代理头时按连接地址限流而不是全员共用', async () => {
  const bucket = probeIp()
  const statuses = []
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await http({ method: 'POST', path: '/authentication/sign-in', body: { email: `nobody${attempt}@corp.test`, password: 'x' }, headers: { 'x-real-ip': bucket } })
    statuses.push(response.status)
  }
  assert(statuses.includes(429), '60 次失败没有触发限流')
  const other = await http({ method: 'POST', path: '/authentication/sign-in', body: { email: 'admin@corp.test', password: 'Passw0rd!x1' }, headers: { 'x-real-ip': probeIp() } })
  assert(other.ok, `换来源后仍被拒绝 ${other.status}`)
})

await check('CORS：响应对任意来源开放但不允许带凭据（认证只走 Authorization 头，不用 Cookie）', async () => {
  const response = await fetch(`${API}/flags`, { headers: { origin: 'https://evil.example' } })
  assert(response.headers.get('access-control-allow-credentials') === null, '不应允许带凭据的跨域请求')
  assert(response.headers.get('set-cookie') === null, '不应下发 Cookie')
  const signIn = await http({ method: 'POST', path: '/authentication/sign-in', body: { email: 'admin@corp.test', password: 'Passw0rd!x1' }, headers: { 'x-real-ip': probeIp() } })
  assert(signIn.ok, '登录失败')
  const cookies = await fetch(`${API}/authentication/sign-in`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': probeIp() }, body: JSON.stringify({ email: 'admin@corp.test', password: 'Passw0rd!x1' }) })
  assert(cookies.headers.get('set-cookie') === null, '登录响应不应下发 Cookie')
})

const refuse = async ({ env, label, expected }) => {
  const child = spawn('node', ['--enable-source-maps', 'packages/server/api/dist/src/bootstrap.js'], {
    cwd: PROD_ROOT,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'production',
      FEMA_CONTAINER_TYPE: 'APP',
      FEMA_ENVIRONMENT: 'prod',
      FEMA_PORT: String(3180 + SLOT),
      FEMA_DB_TYPE: 'POSTGRES',
      FEMA_POSTGRES_HOST: '127.0.0.1',
      FEMA_POSTGRES_PORT: String(PG_PORT),
      FEMA_POSTGRES_DATABASE: 'fema_weak_secret_probe',
      FEMA_POSTGRES_USERNAME: 'fema',
      FEMA_POSTGRES_PASSWORD: 'femapw',
      FEMA_REDIS_TYPE: 'STANDALONE',
      FEMA_REDIS_HOST: '127.0.0.1',
      FEMA_REDIS_PORT: String(56440 + SLOT),
      FEMA_CONFIG_PATH: path.join(stateDir, 'weak-secret-probe'),
      FEMA_JWT_SECRET: JWT_SECRET,
      FEMA_ENCRYPTION_KEY: randomBytes(16).toString('hex'),
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })
  const exit = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill()
      resolve({ code: 'timeout' })
    }, 60000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code })
    })
  })
  assert(exit.code !== 'timeout' && exit.code !== 0, `${label} 应当启动失败，实际 ${JSON.stringify(exit)}：${output.slice(-300)}`)
  assert(output.includes(expected), `${label} 的报错里应有「${expected}」：${output.slice(-400)}`)
  assert(!output.includes('Server listening'), `${label} 不应开始监听`)
}

await check('密钥：生产环境连外部 PostgreSQL 时，过短的 JWT 密钥让服务拒绝启动并说明原因', async () => {
  await refuse({ env: { FEMA_JWT_SECRET: 'e2e-slot-1-secret' }, label: '弱 JWT 密钥', expected: 'FEMA_JWT_SECRET must be at least 32 characters' })
})

await check('密钥：生产环境下 0123456789abcdef 重复的占位加密密钥被拒绝启动', async () => {
  await refuse({ env: { FEMA_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef' }, label: '占位加密密钥', expected: 'FEMA_ENCRYPTION_KEY looks like a placeholder' })
})

summary()
