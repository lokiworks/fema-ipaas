import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { api, check, env, login, portOpen, startProcess, summary, waitFor } from './s7/lib.mjs'
import { createFlow, latestRun, mcpCallStep, runDraftSync, webhookTrigger } from './s7/flow-kit.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const stackDir = path.resolve(here, '../stack')
const SLOT = '7'

const children = []

try {
  children.push(startProcess({ file: 'external-mcp-server.mjs', extraEnv: { EXTERNAL_MCP_PORT: String(env.externalPort) }, name: 'ext-mcp' }))
  await waitFor({ fn: () => portOpen({ port: env.externalPort }), what: 'external mcp server' })

  await restartStack({ allowList: '127.0.0.1' })
  const strict = await probe()
  check({ name: '严格网络模式、没放行：内网地址被拒绝，并提示 FEMA_SSRF_ALLOW_LIST', ok: strict.result?.ok === false && /FEMA_SSRF_ALLOW_LIST|SSRF|安全策略/.test(JSON.stringify(strict.result) + strict.message), detail: `${strict.result?.error?.failure} ${strict.message}` })
  const strictLoop = await probe({ url: `http://127.0.0.1:${env.externalPort}/mcp` })
  check({ name: '严格网络模式：127.0.0.1 同样被拒绝，说明工作节点访问不到 localhost', ok: strictLoop.result?.ok === false && strictLoop.result?.error?.failure === 'LOOPBACK', detail: strictLoop.result?.error?.failure })
  const blockedRun = await runCallToolFlow()
  check({ name: '严格网络模式：工作流里调用同一地址，步骤失败，失败说明不是空白', ok: blockedRun.status === 'FAILED' && blockedRun.failure.length > 0, detail: `${blockedRun.status} ${blockedRun.failure.slice(0, 200)}` })

  await restartStack({ allowList: `127.0.0.1,${env.lanHost}` })
  const allowed = await probe()
  check({ name: '把内网地址加入 FEMA_SSRF_ALLOW_LIST 后：测试通过并列出工具', ok: allowed.result?.ok === true && allowed.result.tools.length === 6, detail: allowed.message })
  const allowedRun = await runCallToolFlow()
  check({ name: '放行后工作流里调用成功', ok: allowedRun.status === 'SUCCEEDED', detail: `${allowedRun.status} ${allowedRun.failure.slice(0, 200)}` })

  await restartStack({ allowList: '' })
} finally {
  children.forEach((child) => child.kill())
}

process.exit(summary() === 0 ? 0 : 1)

async function probe({ url = `http://${env.lanHost}:${env.externalPort}/mcp` } = {}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const outcome = await probeOnce({ url })
    if (outcome.result?.error?.failure !== 'WORKER_UNAVAILABLE') {
      return outcome
    }
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
  return probeOnce({ url })
}

async function probeOnce({ url }) {
  const session = await login()
  const response = await api({
    method: 'POST',
    url: '/v1/mcp-servers/test',
    token: session.token,
    body: { projectId: session.projectId, url, transport: 'streamable_http', auth: { type: 'bearer', token: env.externalToken } },
  })
  return { result: response.json, message: response.json?.error?.detail ?? '' }
}

async function runCallToolFlow() {
  const session = await login()
  const staleFlows = ((await api({ url: `/v1/workflows?projectId=${session.projectId}&limit=100`, token: session.token })).json?.data ?? []).filter((item) => (item.version?.displayName ?? '').startsWith('s7-ssrf'))
  for (const item of staleFlows) {
    await api({ method: 'DELETE', url: `/v1/workflows/${item.id}?projectId=${session.projectId}`, token: session.token })
  }
  await new Promise((resolve) => setTimeout(resolve, 3000))
  const stale = ((await api({ url: '/v1/mcp-servers', token: session.token })).json ?? []).filter((item) => item.displayName.startsWith('S7 SSRF'))
  for (const item of stale) {
    await api({ method: 'DELETE', url: `/v1/mcp-servers/${item.id}`, token: session.token })
  }
  const created = await api({
    method: 'POST',
    url: '/v1/mcp-servers',
    token: session.token,
    body: {
      projectId: session.projectId,
      displayName: `S7 SSRF 测试服务器 ${Date.now()}`,
      description: '测试用',
      url: `http://${env.lanHost}:${env.externalPort}/mcp`,
      transport: 'streamable_http',
      auth: { type: 'bearer', token: env.externalToken },
      allProjects: true,
      projectIds: [],
      saveWithoutPassingTest: true,
    },
  })
  const server = created.json?.server
  if (!server) {
    return { status: 'NO_SERVER', failure: created.text }
  }
  const flowId = await createFlow({
    session,
    displayName: `s7-ssrf-${Date.now()}`,
    trigger: webhookTrigger({
      nextAction: mcpCallStep({ name: 'call', displayName: '调用工具', externalId: server.externalId, tool: 'query_employee', args: { keyword: '张' } }),
    }),
  })
  await runDraftSync({ workflowId: flowId, body: {}, timeoutMs: 40000 }).catch(() => undefined)
  const run = await latestRun({ session, workflowId: flowId, timeoutMs: 120000 })
  const message = run?.failedStep?.message ?? ''
  let failure = message
  try {
    failure = JSON.parse(message).message ?? message
  } catch {
    failure = message
  }
  return { status: run?.status ?? 'NO_RUN', failure }
}

async function restartStack({ allowList }) {
  const stateEnv = { ...process.env, FEMA_NETWORK_MODE: 'STRICT', FEMA_SSRF_ALLOW_LIST: allowList.length > 0 ? allowList : '203.0.113.9' }
  if (allowList === '') {
    delete stateEnv.FEMA_NETWORK_MODE
    stateEnv.FEMA_SSRF_ALLOW_LIST = '127.0.0.1'
  }
  execFileSync(path.join(stackDir, 'stop-worker.sh'), [SLOT], { env: stateEnv, stdio: 'ignore' })
  execFileSync(path.join(stackDir, 'stop-stack.sh'), [SLOT], { env: stateEnv, stdio: 'ignore' })
  await new Promise((resolve) => setTimeout(resolve, 3000))
  execFileSync(path.join(stackDir, 'start-stack.sh'), [SLOT], { env: stateEnv, stdio: 'ignore' })
  await waitFor({ fn: async () => (await fetch(`${env.api}/v1/flags`).then((response) => response.ok).catch(() => false)), timeoutMs: 180000, intervalMs: 2000, what: 'api' })
  execFileSync(path.join(stackDir, 'start-worker.sh'), [SLOT], { env: stateEnv, stdio: 'ignore' })
  await new Promise((resolve) => setTimeout(resolve, 20000))
}

