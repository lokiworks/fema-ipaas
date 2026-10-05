import fs from 'node:fs'
import path from 'node:path'

import { prodKit } from './lib/prod-kit.mjs'

const { check, assert, summary, ensureAdmin, api, http, publishFlow, runFlow, codeStep, connectorStep, webhookTrigger, waitFor, stateDir } = prodKit

const EXPECTED_WORKERS = Number(process.env.E2E_EXPECT_WORKERS ?? 3)
const RUNS = Number(process.env.E2E_RUNS ?? 90)
const MOCK_URL = process.env.E2E_MOCK_URL ?? 'http://127.0.0.1:18901'
const LOG_FILES = ['worker.log', ...Array.from({ length: EXPECTED_WORKERS - 1 }, (_, index) => `worker-${index + 1}.log`)].map((name) => path.join(stateDir, name))

const session = await ensureAdmin()

await check(`拓扑：${EXPECTED_WORKERS} 个工作节点共用同一个缓存目录（与 docker-compose 的做法一致）都在线`, async () => {
  const workers = await waitFor({
    what: '工作节点上线',
    timeoutMs: 60000,
    probe: async () => {
      const response = await http({ method: 'GET', path: '/worker-machines', token: session.token })
      return response.ok && Array.isArray(response.body) && response.body.length >= EXPECTED_WORKERS ? response.body : null
    },
  })
  return { online: workers.length }
})

await check('并发发布：12 个带代码步骤的工作流同时发布，各节点同时预热编译，之后每个都能跑，没有留下编译失败的缓存', async () => {
  const flows = await Promise.all(Array.from({ length: 12 }, (_, index) => publishFlow({
    session,
    displayName: `prod-并发发布-${index}`,
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({ name: 'step_1', displayName: '计算', code: `export const code = async (inputs) => ({ value: inputs.n + ${index} })`, input: { n: 1 } }),
    }),
  })))
  const runs = await Promise.all(flows.map((workflowId) => runFlow({ session, workflowId, timeoutMs: 180000 })))
  const failed = runs.filter((run) => run.status !== 'SUCCEEDED')
  assert(failed.length === 0, `${failed.length} 个运行失败：${JSON.stringify(failed.slice(0, 3).map((run) => run.status))}`)
  return { flows: flows.length }
})

const flowId = await check('准备：一个带代码步骤和连接器步骤的工作流', async () => {
  return publishFlow({
    session,
    displayName: 'prod-多节点并发',
    trigger: webhookTrigger({
      displayName: '接收请求',
      nextAction: codeStep({
        name: 'step_1',
        displayName: '计算',
        code: 'export const code = async (inputs) => ({ doubled: inputs.n * 2 })',
        input: { n: "{{trigger['output']['body']['n']}}" },
        nextAction: connectorStep({
          name: 'step_2',
          displayName: '请求模拟服务',
          connectorName: '@fema-ipaas/connector-http',
          connectorVersion: '~0.11.0',
          actionName: 'send_request',
          input: { method: 'GET', url: `${MOCK_URL}/__admin/state`, headers: {}, queryParams: {}, authType: 'NONE', body_type: 'none', body: {}, response_is_binary: false, use_proxy: false, authFields: {}, timeout: 20, failsafe: false, followRedirects: true },
        }),
      }),
    }),
  })
})

if (flowId) {
  await check(`并发：同时触发 ${RUNS} 次，全部运行成功，没有因共享缓存而失败`, async () => {
    const started = Date.now()
    const responses = await Promise.all(Array.from({ length: RUNS }, (_, index) => http({ method: 'POST', path: `/webhooks/${flowId}`, body: { n: index } })))
    const rejected = responses.filter((response) => !response.ok)
    assert(rejected.length === 0, `触发被拒绝 ${rejected.length} 次：${rejected[0]?.status} ${rejected[0]?.text.slice(0, 120)}`)
    const finished = await waitFor({
      what: `${RUNS} 次运行结束`,
      timeoutMs: 300000,
      stepMs: 3000,
      probe: async () => {
        const runs = await api({ method: 'GET', path: `/run-logs?projectId=${session.projectId}&workflowId=${flowId}&type=ALL&limit=100`, token: session.token })
        const done = runs.data.filter((run) => !['RUNNING', 'QUEUED'].includes(run.status))
        return done.length >= RUNS ? runs.data : null
      },
    })
    const byStatus = finished.reduce((counts, run) => ({ ...counts, [run.status]: (counts[run.status] ?? 0) + 1 }), {})
    assert(byStatus.SUCCEEDED === RUNS, `运行结果 ${JSON.stringify(byStatus)}`)
    return { runs: RUNS, seconds: Math.round((Date.now() - started) / 1000), byStatus }
  })

  await check('分担：每个工作节点都实际执行了作业', async () => {
    const counts = LOG_FILES.map((file) => ({ file: path.basename(file), jobs: (fs.readFileSync(file, 'utf8').match(/"event":"job\.execute"/g) ?? []).length }))
    const idle = counts.filter((entry) => entry.jobs === 0)
    assert(idle.length === 0, `这些节点没接到作业：${JSON.stringify(idle)}`)
    return counts
  })

  await check('日志：工作节点日志里没有 error 级别的行', async () => {
    const errors = LOG_FILES.flatMap((file) => fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.includes('"level":"error"')).map((line) => `${path.basename(file)}: ${line.slice(0, 200)}`))
    assert(errors.length === 0, errors.slice(0, 3).join('\n'))
  })
}

summary()
