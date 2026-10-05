import fs from 'node:fs'
import path from 'node:path'

import { prodKit } from './lib/prod-kit.mjs'

const { check, assert, summary, ensureAdmin, http, waitFor, stateDir } = prodKit

const API_LOG = path.join(stateDir, process.env.E2E_API_LOG ?? 'api.log')
const EXPECT_ENGINE = process.env.E2E_EXPECT_ENGINE ?? 'PG_DUMP'
const ALLOWED_WARNINGS = (process.env.E2E_ALLOWED_WARNINGS ?? '@fastify/reply-from').split('|').filter(Boolean)
const SECRETS = (process.env.E2E_SECRETS ?? '').split(',').filter((value) => value.length >= 16)

const session = await ensureAdmin()
const get = async (route) => (await http({ method: 'GET', path: route, token: session.token }))

await check('系统页：可选服务（邮件、对象存储、连接器仓库、模板仓库）全部显示未启用，没有问题提示', async () => {
  const overview = await get('/health/overview')
  assert(overview.ok, `系统总览 ${overview.status} ${overview.text.slice(0, 200)}`)
  const services = overview.body.optionalServices ?? overview.body.services ?? []
  assert(services.length === 4, `应有 4 项可选服务，实际 ${JSON.stringify(services).slice(0, 300)}`)
  const enabled = services.filter((service) => service.enabled)
  const withProblem = services.filter((service) => service.problem)
  assert(enabled.length === 0, `不应有已启用的：${JSON.stringify(enabled)}`)
  assert(withProblem.length === 0, `不应有问题提示：${JSON.stringify(withProblem)}`)
  return { release: overview.body.release?.current ?? overview.body.version ?? null }
})

await check('系统页：更新检查有缓存，第二次打开系统页、系统健康和组件健康不再等外网（连不上 GitHub 的内网也一样）', async () => {
  await get('/health/overview')
  await get('/health/system')
  await get('/health/components')
  const timings = []
  for (const route of ['/health/overview', '/health/system', '/health/components']) {
    const started = Date.now()
    const response = await get(route)
    assert(response.ok, `${route} ${response.status}`)
    timings.push({ route, ms: Date.now() - started })
  }
  const slow = timings.filter((entry) => entry.ms > 2500)
  assert(slow.length === 0, `仍然很慢：${JSON.stringify(slow)}`)
  return timings
})

await check('系统页：诊断包不含密码、密钥和令牌', async () => {
  const bundle = await get('/health/diagnostics-bundle')
  assert(bundle.ok, `诊断包 ${bundle.status}`)
  const leaked = SECRETS.filter((secret) => bundle.text.includes(secret))
  assert(leaked.length === 0, '诊断包里出现了密钥原文')
  assert(!bundle.text.includes(session.token), '诊断包里出现了登录令牌')
  return { bytes: bundle.text.length }
})

await check('系统页：基础设施健康（数据库、队列、工作节点）都正常', async () => {
  const system = await get('/health/system')
  assert(system.ok, `系统健康 ${system.status} ${system.text.slice(0, 200)}`)
  const components = await get('/health/components')
  assert(components.ok, `组件健康 ${components.status} ${components.text.slice(0, 200)}`)
  const diagnostics = await get('/health/diagnostics')
  assert(diagnostics.ok, `诊断 ${diagnostics.status}`)
  return { components: (components.body.checks ?? components.body.components ?? []).length }
})

await check(`备份：概览显示 ${EXPECT_ENGINE} 引擎可用，手动备份成功，恢复预检没有失败项`, async () => {
  const overview = await get('/backups/overview')
  assert(overview.ok, `备份概览 ${overview.status} ${overview.text.slice(0, 200)}`)
  assert(overview.body.engine.kind === EXPECT_ENGINE && overview.body.engine.available, `引擎 ${JSON.stringify(overview.body.engine)}`)
  const created = await http({ method: 'POST', path: '/backups', body: { note: '生产验证' }, token: session.token })
  assert(created.ok, `创建备份 ${created.status} ${created.text.slice(0, 200)}`)
  const done = await waitFor({
    what: '备份完成',
    timeoutMs: 180000,
    stepMs: 2000,
    probe: async () => {
      const list = await get('/backups')
      const item = list.body.find((entry) => entry.id === created.body.id)
      return item && item.status !== 'RUNNING' ? item : null
    },
  })
  assert(done.status === 'SUCCEEDED', `备份状态 ${done.status} ${done.error ?? ''}`)
  const precheck = await get(`/backups/${done.id}/restore-precheck`)
  assert(precheck.ok, `恢复预检 ${precheck.status} ${precheck.text.slice(0, 200)}`)
  const failures = (precheck.body.checks ?? []).filter((entry) => entry.level === 'ERROR' || entry.level === 'FAILED')
  assert(failures.length === 0, `预检失败项 ${JSON.stringify(failures)}`)
  return { size: done.sizeBytes ?? done.size ?? null, checks: (precheck.body.checks ?? []).length }
})

await check('日志：启动与运行日志里没有 error，warn 只有已知可忽略的几条', async () => {
  const lines = fs.readFileSync(API_LOG, 'utf8').split('\n').filter((line) => line.startsWith('{'))
  const parsed = lines.map((line) => {
    try {
      return JSON.parse(line)
    }
    catch {
      return null
    }
  }).filter(Boolean)
  const errors = parsed.filter((entry) => entry.level === 'error')
  assert(errors.length === 0, `有 error：${JSON.stringify(errors.slice(0, 2)).slice(0, 500)}`)
  const warnings = [...new Set(parsed.filter((entry) => entry.level === 'warn' && entry.path === undefined).map((entry) => String(entry.msg)))]
  const unexpected = warnings.filter((message) => !ALLOWED_WARNINGS.some((allowed) => message.includes(allowed)))
  assert(unexpected.length === 0, `未登记的 warn：${JSON.stringify(unexpected)}`)
  const raw = fs.readFileSync(API_LOG, 'utf8').split('\n').filter((line) => line.length > 0 && !line.startsWith('{') && !line.startsWith('FEMA_') && !line.startsWith('Auto-generating') && !line.startsWith('Starting FEMA') && !line.startsWith('Creating the embedded worker token'))
  assert(raw.length === 0, `有非结构化输出：${JSON.stringify(raw.slice(0, 3))}`)
  return { warnings }
})

summary()
