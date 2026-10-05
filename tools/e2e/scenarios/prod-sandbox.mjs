import { prodKit } from './lib/prod-kit.mjs'

const { check, assert, summary, ensureAdmin, publishFlow, runFlow, runDetail, stepsOf, codeStep, connectorStep, webhookTrigger, createConnection } = prodKit

const MODE = process.env.E2E_EXPECT_MODE ?? 'SANDBOX_CODE_ONLY'
const MOCK_URL = process.env.E2E_MOCK_URL ?? 'http://127.0.0.1:18901'
const PG_PORT = Number(process.env.E2E_PG_PORT ?? 55441)
const PG_DATABASE = process.env.E2E_PG_DATABASE ?? 'fema_prod'
const PG_PASSWORD = process.env.E2E_PG_PASSWORD ?? 'femapw'
const STEP_TIMEOUT_SECONDS = Number(process.env.E2E_STEP_TIMEOUT_SECONDS ?? 0)
const RUN_TIMEOUT_SECONDS = Number(process.env.E2E_RUN_TIMEOUT_SECONDS ?? 0)
const GLOBAL_NAMES = ['console', 'fetch', 'require', 'process', 'Buffer', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'structuredClone', 'setTimeout', 'atob', 'btoa', 'Intl', 'crypto', 'Promise', 'JSON', 'Date', 'Math', 'BigInt']

const session = await ensureAdmin()

function messageOf({ step }) {
  return JSON.stringify(step?.errorMessage ?? step?.error ?? '')
}

const flows = await check('准备：发布沙箱探测工作流', async () => {
  const globals = await publishFlow({
    session,
    displayName: 'prod-沙箱-全局对象',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '探测全局对象',
        code: `export const code = async () => { const names = ${JSON.stringify(GLOBAL_NAMES)}; const out = {}; for (const n of names) { out[n] = typeof globalThis[n] } return out }`,
        input: {},
      }),
    }),
  })
  const basic = await publishFlow({
    session,
    displayName: 'prod-沙箱-常规计算',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '常规计算',
        code: "export const code = async (inputs) => ({ total: inputs.items.reduce((sum, item) => sum + item.price * item.qty, 0), upper: String(inputs.name).toUpperCase(), iso: new Date(0).toISOString(), parsed: JSON.parse('{\"a\":[1,2]}').a.length, regex: /(\\d+)-(\\d+)/.exec('10-20').slice(1), awaited: await Promise.resolve(7) })",
        input: { items: [{ price: 3, qty: 2 }, { price: 5, qty: 1 }], name: 'abc' },
      }),
    }),
  })
  const consoleFlow = await publishFlow({
    session,
    displayName: 'prod-沙箱-console',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '调用 console.log',
        code: "export const code = async (inputs) => { console.log('hello', inputs.x); return { ok: true } }",
        input: { x: 1 },
      }),
    }),
  })
  const escape = await publishFlow({
    session,
    displayName: 'prod-沙箱-越权',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '尝试读取宿主',
        code: "export const code = async () => { const fs = require('fs'); return fs.readdirSync('/') }",
        input: {},
      }),
    }),
  })
  const fetchFlow = await publishFlow({
    session,
    displayName: 'prod-沙箱-fetch',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '在代码里联网',
        code: "export const code = async (inputs) => { const response = await fetch(inputs.url); return { status: response.status } }",
        input: { url: `${MOCK_URL}/__admin/state` },
      }),
    }),
  })
  const loop = await publishFlow({
    session,
    displayName: 'prod-沙箱-死循环',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '占满内存',
        code: "export const code = async () => { const chunks = []; for (;;) { chunks.push('x'.repeat(1024 * 1024)) } }",
        input: {},
      }),
    }),
  })
  const spin = await publishFlow({
    session,
    displayName: 'prod-沙箱-同步死循环',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '同步死循环',
        code: 'export const code = async () => { for (;;) { } }',
        input: {},
      }),
    }),
  })
  const http = await publishFlow({
    session,
    displayName: 'prod-沙箱-HTTP连接器',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: connectorStep({
        name: 'step_1',
        displayName: '请求模拟服务',
        connectorName: '@fema-ipaas/connector-http',
        connectorVersion: '~0.11.0',
        actionName: 'send_request',
        input: { method: 'GET', url: `${MOCK_URL}/__admin/state`, headers: {}, queryParams: {}, authType: 'NONE', body_type: 'none', body: {}, response_is_binary: false, use_proxy: false, authFields: {}, timeout: 10, failsafe: false, followRedirects: true },
      }),
    }),
  })
  return { globals, basic, consoleFlow, escape, fetchFlow, loop, spin, http }
})

if (flows) {
  const runOf = async ({ workflowId }) => {
    const run = await runFlow({ session, workflowId })
    const detail = await runDetail({ session, runId: run.id })
    return { run, steps: stepsOf({ detail }) }
  }

  await check(`执行模式确认：flags 与系统页都报告 ${MODE}`, async () => {
    const flags = await prodKit.http({ method: 'GET', path: '/flags' })
    assert(flags.body.ALLOW_NPM_PACKAGES_IN_CODE_STEP === (MODE !== 'SANDBOX_CODE_ONLY'), `ALLOW_NPM_PACKAGES_IN_CODE_STEP=${flags.body.ALLOW_NPM_PACKAGES_IN_CODE_STEP}`)
    return { allowNpm: flags.body.ALLOW_NPM_PACKAGES_IN_CODE_STEP }
  })

  await check('代码步骤：常规计算（数组、字符串、JSON、正则、await）在沙箱里正常', async () => {
    const { run, steps } = await runOf({ workflowId: flows.basic })
    assert(run.status === 'SUCCEEDED', `状态 ${run.status} ${JSON.stringify(steps.step_1?.errorMessage ?? steps.step_1?.error ?? '')}`)
    const output = steps.step_1.output
    assert(output.total === 11 && output.upper === 'ABC' && output.iso === '1970-01-01T00:00:00.000Z' && output.parsed === 2 && output.regex[1] === '20' && output.awaited === 7, JSON.stringify(output))
    return output
  })

  const matrix = await check('代码步骤：列出沙箱里可用与不可用的全局对象', async () => {
    const { run, steps } = await runOf({ workflowId: flows.globals })
    assert(run.status === 'SUCCEEDED', `状态 ${run.status}`)
    return steps.step_1.output
  })

  await check('代码步骤：require 与宿主文件系统不可达（沙箱隔离有效）', async () => {
    const { run, steps } = await runOf({ workflowId: flows.escape })
    assert(run.status === 'FAILED', `应失败，实际 ${run.status}`)
    const message = messageOf({ step: steps.step_1 })
    assert(message.includes('require is not defined'), `失败原因应是 require 不存在，实际 ${message.slice(0, 200)}`)
    return { status: run.status, message: message.slice(0, 160) }
  })

  await check('代码步骤：console.log 不会让整个步骤失败', async () => {
    const { run, steps } = await runOf({ workflowId: flows.consoleFlow })
    assert(run.status === 'SUCCEEDED', `状态 ${run.status} ${JSON.stringify(steps.step_1?.errorMessage ?? steps.step_1?.error ?? '').slice(0, 200)}`)
    return steps.step_1.output
  })

  await check('代码步骤：代码里直接联网在沙箱模式下被拒绝，且失败说明可读', async () => {
    const { run, steps } = await runOf({ workflowId: flows.fetchFlow })
    assert(run.status === 'FAILED', `应失败，实际 ${run.status}`)
    const message = messageOf({ step: steps.step_1 })
    assert(message.includes('fetch is not defined'), `失败原因应是 fetch 不存在，实际 ${message.slice(0, 200)}`)
    return { status: run.status, message: message.slice(0, 160) }
  })

  await check('代码步骤：吃内存的代码被 128MB 隔离区终止，运行失败而不是拖垮 worker', async () => {
    const { run, steps } = await runOf({ workflowId: flows.loop })
    assert(run.status === 'FAILED', `应失败，实际 ${run.status}`)
    const message = messageOf({ step: steps.step_1 })
    assert(message.includes('128 MB of memory'), `失败原因应写明内存上限，实际 ${message.slice(0, 200)}`)
    const health = await prodKit.http({ method: 'GET', path: '/health' })
    assert(health.ok, 'API 健康检查失败')
    return { status: run.status, message: message.slice(0, 160) }
  })

  if (STEP_TIMEOUT_SECONDS > 0) {
    await check(`代码步骤：同步死循环在 FEMA_STEP_TIMEOUT=${STEP_TIMEOUT_SECONDS} 秒后被终止，说明原因`, async () => {
      const { run, steps } = await runOf({ workflowId: flows.spin })
      assert(run.status === 'FAILED', `应失败，实际 ${run.status}`)
      const message = messageOf({ step: steps.step_1 })
      assert(message.includes(`longer than ${STEP_TIMEOUT_SECONDS} seconds`), `失败原因应写明超时，实际 ${message.slice(0, 200)}`)
      return { status: run.status, message: message.slice(0, 160) }
    })
  }

  if (STEP_TIMEOUT_SECONDS === 0 && RUN_TIMEOUT_SECONDS > 0) {
    await check(`代码步骤：没配 FEMA_STEP_TIMEOUT 时，同步死循环要等到运行超时（${RUN_TIMEOUT_SECONDS} 秒）才结束，之后工作节点恢复可用`, async () => {
      const run = await runFlow({ session, workflowId: flows.spin, timeoutMs: (RUN_TIMEOUT_SECONDS + 120) * 1000 })
      assert(['TIMEOUT', 'FAILED'].includes(run.status), `应超时或失败，实际 ${run.status}`)
      const after = await runOf({ workflowId: flows.basic })
      assert(after.run.status === 'SUCCEEDED', `死循环结束后同一个节点应恢复，实际 ${after.run.status}`)
      return { status: run.status }
    })
  }

  await check('连接器步骤：HTTP 请求访问模拟服务（连接器跑在沙箱模式的引擎子进程里）', async () => {
    const { run, steps } = await runOf({ workflowId: flows.http })
    assert(run.status === 'SUCCEEDED', `状态 ${run.status} ${JSON.stringify(steps.step_1?.errorMessage ?? steps.step_1?.error ?? '').slice(0, 200)}`)
    assert(steps.step_1.output?.status === 200, JSON.stringify(steps.step_1.output).slice(0, 200))
    return { status: steps.step_1.output.status }
  })

  const postgresFlow = await check('准备：PostgreSQL 连接与查询工作流', async () => {
    await createConnection({
      session,
      externalId: 'prod-pg',
      displayName: '本机 PostgreSQL',
      connectorName: '@fema-ipaas/connector-postgres',
      props: { host: '127.0.0.1', port: PG_PORT, user: 'fema', password: PG_PASSWORD, database: PG_DATABASE, enable_ssl: false, reject_unauthorized: false },
    })
    return publishFlow({
      session,
      displayName: 'prod-沙箱-PostgreSQL连接器',
      trigger: webhookTrigger({
        displayName: '接收请求',
        nextAction: connectorStep({
          name: 'step_1',
          displayName: '查询',
          connectorName: '@fema-ipaas/connector-postgres',
          connectorVersion: '~0.3.0',
          actionName: 'run-query',
          input: { auth: "{{connections['prod-pg']}}", query: 'select 1 as one', args: [] },
        }),
      }),
    })
  })
  if (postgresFlow) {
    await check('连接器步骤：PostgreSQL 连接器在沙箱模式下通过原生 TCP 连上真实数据库', async () => {
      const { run, steps } = await runOf({ workflowId: postgresFlow })
      assert(run.status === 'SUCCEEDED', `状态 ${run.status} ${JSON.stringify(steps.step_1?.errorMessage ?? steps.step_1?.error ?? '').slice(0, 300)}`)
      return steps.step_1.output
    })
  }
  if (matrix) {
    process.stdout.write(`GLOBALS ${JSON.stringify(matrix)}\n`)
  }
}

summary()
