import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { prodKit } from './lib/prod-kit.mjs'

const { check, assert, summary, ensureAdmin, http, publishFlow, runFlow, codeStep, webhookTrigger, waitFor, stateDir } = prodKit

const SLOT = Number(process.env.E2E_SLOT ?? 1)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const API_PORT = Number(process.env.PROD_API_PORT ?? 3100 + SLOT)
const STATE_ROOT = path.dirname(stateDir)

function restartStack() {
  execFileSync(path.join(ROOT, 'tools/e2e/stack/start-prod-stack.sh'), [String(SLOT)], {
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      LC_ALL: 'en_US.UTF-8',
      E2E_STATE_ROOT: STATE_ROOT,
      PROD_API_PORT: String(API_PORT),
      PROD_ZERO: '1',
      PROD_MOCK_ENV: '0',
      PROD_MOCK: '0',
      PROD_ROOT: process.env.PROD_ROOT ?? '/tmp/fema-e2e/slot-1/run',
    },
    stdio: 'ignore',
  })
}

await check('零配置：只设端口，全新实例的环境检查没有错误，四个可选服务都未启用，工作节点已在线', async () => {
  const setup = await http({ method: 'GET', path: '/health/setup' })
  assert(setup.ok && setup.body.initialized === false, `setup ${setup.status} ${setup.text.slice(0, 200)}`)
  const errors = setup.body.checks.filter((entry) => entry.level === 'ERROR')
  assert(errors.length === 0, `有错误项 ${JSON.stringify(errors)}`)
  const workers = await waitFor({
    what: '内嵌工作节点上线',
    timeoutMs: 60000,
    stepMs: 1000,
    probe: async () => {
      const latest = await http({ method: 'GET', path: '/health/setup' })
      const entry = latest.body.checks.find((check) => check.kind === 'WORKERS')
      return entry.level === 'OK' && Number(entry.detail) >= 1 ? entry : null
    },
  })
  assert(workers.level === 'OK', `内嵌工作节点应在线 ${JSON.stringify(workers)}`)
  assert(setup.body.services.length === 4 && setup.body.services.every((service) => service.enabled === false && service.problem === null), JSON.stringify(setup.body.services))
  return { checks: setup.body.checks.map((entry) => `${entry.kind}:${entry.level}`) }
})

const session = await ensureAdmin()

const flowId = await check('零配置：内嵌工作节点（WORKER_AND_APP）真跑工作流', async () => {
  const id = await publishFlow({
    session,
    displayName: 'prod-零配置',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({ name: 'step_1', displayName: '计算', code: 'export const code = async (inputs) => ({ answer: inputs.n * 2 })', input: { n: 21 } }),
    }),
  })
  const run = await runFlow({ session, workflowId: id })
  assert(run.status === 'SUCCEEDED', `运行状态 ${run.status}`)
  return id
})

await check('零配置：密钥由平台生成并存在数据目录，重启后沿用——旧登录令牌仍有效，工作节点重新上线，流程继续能跑', async () => {
  const settingsFile = path.join(stateDir, 'config', 'settings.json')
  const before = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  assert(before.JWT_SECRET && before.ENCRYPTION_KEY, `settings.json 里应有两个密钥，实际 ${Object.keys(before)}`)
  restartStack()
  await waitFor({ what: 'API 重新可用', timeoutMs: 60000, stepMs: 500, probe: async () => ((await http({ method: 'GET', path: '/health' }).catch(() => null))?.ok ? true : null) })
  const after = JSON.parse(fs.readFileSync(settingsFile, 'utf8'))
  assert(after.JWT_SECRET === before.JWT_SECRET && after.ENCRYPTION_KEY === before.ENCRYPTION_KEY, '重启后密钥变了')
  const projects = await http({ method: 'GET', path: '/projects', token: session.token, headers: { 'x-real-ip': '10.1.2.3' } })
  assert(projects.ok, `重启前签发的令牌应仍有效，实际 ${projects.status}`)
  await waitFor({ what: '工作节点重新上线', timeoutMs: 60000, stepMs: 2000, probe: async () => ((await http({ method: 'GET', path: '/worker-machines', token: session.token })).body?.length >= 1 ? true : null) })
  const run = await runFlow({ session, workflowId: flowId })
  assert(run.status === 'SUCCEEDED', `重启后运行状态 ${run.status}`)
})

summary()
