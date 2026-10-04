import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { api, check, env, go, login, openBrowser, portOpen, shot, startProcess, summary, uiLogin, waitFor } from './s7/lib.mjs'
import { createFlow, latestRun, mcpCallStep, runDraftSync, webhookTrigger } from './s7/flow-kit.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const stackDir = path.resolve(here, '../stack')
const SLOT = '7'
const LOOPBACK_URL = `http://127.0.0.1:${env.externalPort}/mcp`
const LAN_URL = `http://${env.lanHost}:${env.externalPort}/mcp`

const children = []

try {
  children.push(startProcess({ file: 'external-mcp-server.mjs', extraEnv: { EXTERNAL_MCP_PORT: String(env.externalPort) }, name: 'ext-mcp' }))
  await waitFor({ fn: () => portOpen({ port: env.externalPort }), what: 'external mcp server' })

  await restartStack({ allowList: env.defaultAllowList, strict: false })
  const loopbackBlocked = await probe({ url: LOOPBACK_URL })
  check({ name: '没放行：127.0.0.1 被拒绝（LOOPBACK）', ok: loopbackBlocked.result?.ok === false && loopbackBlocked.result?.error?.failure === 'LOOPBACK', detail: loopbackBlocked.result?.error?.failure })
  const spellings = await Promise.all([
    probe({ url: `http://2130706433:${env.externalPort}/mcp` }),
    probe({ url: `http://0x7f000001:${env.externalPort}/mcp` }),
    probe({ url: `http://[::1]:${env.externalPort}/mcp` }),
    probe({ url: `http://[::ffff:127.0.0.1]:${env.externalPort}/mcp` }),
    probe({ url: `http://[::ffff:7f00:1]:${env.externalPort}/mcp` }),
  ])
  check({ name: '没放行时，十进制、十六进制、IPv6 环回、IPv4 映射 IPv6 的 127.0.0.1 写法一样被拒绝', ok: spellings.every((item) => item.result?.ok === false && item.result?.error?.failure === 'LOOPBACK'), detail: spellings.map((item) => item.result?.error?.failure).join(',') })
  const metadata = await probe({ url: 'http://169.254.169.254/latest/meta-data' })
  check({ name: '没放行时，云厂商元数据地址被拒绝（LINK_LOCAL）', ok: metadata.result?.ok === false && metadata.result?.error?.failure === 'LINK_LOCAL', detail: metadata.result?.error?.failure })
  const dialogText = await uiProbeText({ url: LOOPBACK_URL })
  check({ name: '界面上对没放行的 127.0.0.1：中文说明指向工作节点自己，并写明由运维加入 FEMA_SSRF_ALLOW_LIST', ok: /指向工作节点自己/.test(dialogText) && /FEMA_SSRF_ALLOW_LIST/.test(dialogText), detail: dialogText.slice(0, 220) })

  await restartStack({ allowList: '127.0.0.1', strict: true })
  const lanBlocked = await probe({ url: LAN_URL })
  check({ name: '严格网络模式、只放行 127.0.0.1：内网地址被拒绝，并提示 FEMA_SSRF_ALLOW_LIST', ok: lanBlocked.result?.ok === false && /FEMA_SSRF_ALLOW_LIST|SSRF|安全策略/.test(JSON.stringify(lanBlocked.result) + lanBlocked.message), detail: `${lanBlocked.result?.error?.failure} ${lanBlocked.message}` })
  const blockedRun = await runCallToolFlow({ url: LAN_URL })
  check({ name: '严格网络模式：工作流里调用没放行的内网地址，步骤失败，失败说明不是空白', ok: blockedRun.status === 'FAILED' && blockedRun.failure.length > 0, detail: `${blockedRun.status} ${blockedRun.failure.slice(0, 200)}` })
  const loopbackAllowed = await probe({ url: LOOPBACK_URL })
  check({ name: '放行 127.0.0.1 后：探测通过并列出 6 个工具（之前无论放不放行都被拒绝）', ok: loopbackAllowed.result?.ok === true && loopbackAllowed.result.tools.length === 6, detail: loopbackAllowed.message || JSON.stringify(loopbackAllowed.result?.error) })
  const decimalAllowed = await probe({ url: `http://2130706433:${env.externalPort}/mcp` })
  check({ name: '放行 127.0.0.1 后：它的十进制写法按同一个地址对待，一样通过', ok: decimalAllowed.result?.ok === true, detail: decimalAllowed.message || JSON.stringify(decimalAllowed.result?.error) })
  const neighbourBlocked = await probe({ url: `http://127.0.0.2:${env.externalPort}/mcp` })
  check({ name: '放行 127.0.0.1 不放行它的邻居 127.0.0.2', ok: neighbourBlocked.result?.ok === false && neighbourBlocked.result?.error?.failure === 'LOOPBACK', detail: neighbourBlocked.result?.error?.failure })
  const metadataStill = await probe({ url: 'http://169.254.169.254/latest/meta-data' })
  check({ name: '放行 127.0.0.1 后元数据地址仍被拒绝', ok: metadataStill.result?.ok === false && metadataStill.result?.error?.failure === 'LINK_LOCAL', detail: metadataStill.result?.error?.failure })
  const loopbackRun = await runCallToolFlow({ url: LOOPBACK_URL })
  check({ name: '放行 127.0.0.1 后工作流里用 127.0.0.1 地址调用成功', ok: loopbackRun.status === 'SUCCEEDED', detail: `${loopbackRun.status} ${loopbackRun.failure.slice(0, 200)}` })

  await restartStack({ allowList: `127.0.0.1,${env.lanHost}`, strict: true })
  const allowed = await probe({ url: LAN_URL })
  check({ name: '把内网地址加入 FEMA_SSRF_ALLOW_LIST 后：测试通过并列出工具', ok: allowed.result?.ok === true && allowed.result.tools.length === 6, detail: allowed.message })
  const allowedRun = await runCallToolFlow({ url: LAN_URL })
  check({ name: '放行后工作流里调用成功', ok: allowedRun.status === 'SUCCEEDED', detail: `${allowedRun.status} ${allowedRun.failure.slice(0, 200)}` })

  await restartStack({ allowList: env.defaultAllowList, strict: false })
} finally {
  children.forEach((child) => child.kill())
}

process.exit(summary() === 0 ? 0 : 1)

async function probe({ url }) {
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

async function uiProbeText({ url }) {
  const { browser, page } = await openBrowser()
  try {
    await uiLogin({ page })
    await go({ page, url: `${env.web}/tenant/connectors?cat=mcp` })
    await page.getByRole('button', { name: /接入 MCP 服务器/ }).first().click({ timeout: 120000 })
    const dialog = page.getByRole('dialog')
    await dialog.getByPlaceholder('例如：内部知识库').fill('S7 SSRF 界面探测')
    await dialog.getByText('全部项目', { exact: true }).click()
    await dialog.getByPlaceholder('https://mcp.your-company.com/mcp').fill(url)
    await dialog.getByPlaceholder(/粘贴服务器签发/).fill(env.externalToken)
    await dialog.getByRole('button', { name: '测试连接' }).click()
    await dialog.locator('[role="alert"]').last().waitFor({ timeout: 90000 })
    await page.waitForTimeout(800)
    const text = (await dialog.locator('[role="alert"]').last().innerText().catch(() => '')).replace(/\s+/g, ' ')
    await shot({ page, name: 'ss-01-loopback-blocked' })
    return text
  } finally {
    await browser.close()
  }
}

async function runCallToolFlow({ url }) {
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
      url,
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

async function restartStack({ allowList, strict }) {
  const stateEnv = { ...process.env, FEMA_SSRF_ALLOW_LIST: allowList }
  if (strict) {
    stateEnv.FEMA_NETWORK_MODE = 'STRICT'
  } else {
    delete stateEnv.FEMA_NETWORK_MODE
  }
  execFileSync(path.join(stackDir, 'stop-worker.sh'), [SLOT], { env: stateEnv, stdio: 'ignore' })
  execFileSync(path.join(stackDir, 'stop-stack.sh'), [SLOT], { env: stateEnv, stdio: 'ignore' })
  await new Promise((resolve) => setTimeout(resolve, 3000))
  execFileSync(path.join(stackDir, 'start-stack.sh'), [SLOT], { env: stateEnv, stdio: 'ignore' })
  await waitFor({ fn: async () => (await fetch(`${env.api}/v1/flags`).then((response) => response.ok).catch(() => false)), timeoutMs: 180000, intervalMs: 2000, what: 'api' })
  execFileSync(path.join(stackDir, 'start-worker.sh'), [SLOT], { env: stateEnv, stdio: 'ignore' })
  await new Promise((resolve) => setTimeout(resolve, 20000))
}
