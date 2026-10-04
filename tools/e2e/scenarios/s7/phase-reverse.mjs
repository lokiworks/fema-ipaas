import { api, check, env, go, openBrowser, shot, uiLogin, waitFor } from './lib.mjs'

export const SERVER_NAME = 'S7 企业人事工具'

export async function reversePhase({ session }) {
  const { token, projectId } = session
  await cleanup({ token, projectId })
  const lan = `http://${env.lanHost}:${env.externalPort}`

  const { browser, page } = await openBrowser()
  await uiLogin({ page })
  await go({ page, url: `${env.web}/tenant/connectors?cat=mcp` })
  await page.waitForTimeout(6000)
  await shot({ page, name: 'rv-00-empty-state' })
  const dialog = page.getByRole('dialog')
  const trial = (args) => runTest({ page, dialog, ...args })

  const loopback = await trial({ url: `http://127.0.0.1:${env.externalPort}/mcp`, token: env.externalToken, shotName: 'rv-01-loopback' })
  check({ name: '地址是 127.0.0.1：测试被拒绝并说明工作节点访问不到 localhost', ok: /工作节点自己|localhost/.test(loopback), detail: loopback.slice(0, 100) })
  check({ name: '测试没通过时「保存并接入」不可点', ok: await saveDisabled({ dialog }) })

  const wrongToken = await trial({ url: `${lan}/mcp`, token: 'wrong-token', shotName: 'rv-02-wrong-token' })
  check({ name: '令牌错误：提示 401 Token 无效或已过期', ok: /401/.test(wrongToken) && /Token/.test(wrongToken), detail: wrongToken.slice(0, 120) })

  const refused = await trial({ url: `http://${env.lanHost}:18999/mcp`, token: env.externalToken, shotName: 'rv-03-refused' })
  check({ name: '端口没人监听：说明连不上而不是卡死', ok: /无法连接|超时|连接/.test(refused) && refused.length > 0, detail: refused.slice(0, 120) })

  const mismatch = await trial({ url: `${lan}/sse`, token: env.externalToken, shotName: 'rv-04-mismatch' })
  check({ name: '把 SSE 地址按 Streamable HTTP 测试：给出可读的失败原因', ok: mismatch.length > 0 && !/undefined|\[object/.test(mismatch), detail: mismatch.slice(0, 160) })

  const notFound = await trial({ url: `${lan}/nope`, token: env.externalToken, shotName: 'rv-05-404' })
  check({ name: '地址路径写错（404）：给出可读的失败原因', ok: notFound.length > 0 && !/undefined|\[object/.test(notFound), detail: notFound.slice(0, 160) })

  const ok = await trial({ url: `${lan}/mcp`, token: env.externalToken, shotName: 'rv-06-ok' })
  check({ name: '地址令牌都对：测试通过并列出 6 个工具', ok: /6 个工具|6/.test(ok), detail: ok.slice(0, 160) })
  await dialog.getByRole('button', { name: '保存并接入' }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 60000 }).catch(async () => {
    await shot({ page, name: 'rv-save-stuck' })
    throw new Error(`保存没有完成：${(await dialog.innerText()).replace(/\s+/g, ' ').slice(-300)}`)
  })
  await page.waitForTimeout(1500)
  await shot({ page, name: 'rv-07-saved' })

  const servers = await api({ url: '/v1/mcp-servers', token })
  const saved = (servers.json ?? []).find((server) => server.displayName === SERVER_NAME)
  check({ name: '保存后服务器出现在列表里，工具数 6', ok: saved?.tools?.length === 6 && saved?.status === 'CONNECTED', detail: JSON.stringify({ status: saved?.status, tools: saved?.tools?.length }) })
  if (!saved) {
    await browser.close()
    return
  }

  await go({ page, url: `${env.web}/tenant/connectors/mcp/${saved.id}` })
  await page.getByText('query_employee').first().waitFor({ timeout: 180000 })
  await shot({ page, name: 'rv-08-detail' })

  await tryToolInDrawer({ page, tool: 'query_employee', values: { keyword: '张' }, expect: /张三/, name: '试用只读工具：返回员工列表', shotName: 'rv-09-try-ok' })
  await tryToolInDrawer({ page, tool: 'always_error', values: {}, expect: /E_DB_REFUSED|数据库连接被拒绝/, name: '试用会报错的工具：界面显示工具返回的错误原文', shotName: 'rv-10-try-error' })

  await browser.close()
  await flowChecks({ session, server: saved })
  return saved
}

async function openDialog({ page, dialog }) {
  await go({ page, url: `${env.web}/tenant/connectors` })
  await page.getByRole('button', { name: /接入 MCP 服务器/ }).click()
  await dialog.getByPlaceholder('例如：内部知识库').fill(SERVER_NAME)
  await dialog.getByPlaceholder(/这个服务器提供哪些能力/).fill('企业内部 HR 查询与工单工具，测试用')
  await dialog.getByText('全部项目', { exact: true }).click()
}

async function runTest({ page, dialog, url, token, shotName }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      if (!(await dialog.isVisible())) {
        await openDialog({ page, dialog })
      }
      await dialog.getByPlaceholder('https://mcp.your-company.com/mcp').fill(url)
      await dialog.getByPlaceholder(/粘贴服务器签发/).fill(token)
      await dialog.getByRole('button', { name: '测试连接' }).click()
      await waitForTestDone({ dialog })
      await page.waitForTimeout(800)
      const text = (await dialog.locator('[role="alert"]').last().innerText().catch(() => '')).replace(/\s+/g, ' ')
      if (/没有可用的工作节点|ENGINE_OPERATION_FAILURE/.test(text) && attempt < 3) {
        await page.waitForTimeout(3000)
        continue
      }
      await shot({ page, name: shotName })
      return text
    } catch (error) {
      if (attempt === 3) throw error
      await page.waitForTimeout(2000)
    }
  }
  return ''
}

async function waitForTestDone({ dialog }) {
  await dialog.getByRole('button', { name: '测试连接' }).waitFor({ timeout: 45000 })
  await dialog.locator('[role="alert"]').last().waitFor({ timeout: 45000 })
}

async function saveDisabled({ dialog }) {
  return dialog.getByRole('button', { name: '保存并接入' }).isDisabled()
}

async function tryToolInDrawer(args) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await tryToolOnce(args)
      return
    } catch (error) {
      if (attempt === 2) throw error
      await go({ page: args.page, url: args.page.url() })
      await args.page.getByText(args.tool, { exact: true }).first().waitFor({ timeout: 120000 })
    }
  }
}

async function tryToolOnce({ page, tool, values, expect, name, shotName }) {
  await page.getByText(tool, { exact: true }).first().locator('xpath=ancestor::div[.//button[normalize-space()="试用"]][1]').getByRole('button', { name: '试用' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.waitFor()
  for (const [key, value] of Object.entries(values)) {
    await sheet.locator('input').first().fill(value)
    void key
  }
  await sheet.getByRole('button', { name: '调用' }).click()
  await sheet.getByText('结果').first().waitFor({ timeout: 90000 }).catch(() => undefined)
  await page.waitForTimeout(1000)
  const text = await sheet.innerText()
  await shot({ page, name: shotName })
  check({ name, ok: expect.test(text), detail: text.replace(/\s+/g, ' ').slice(-200) })
  await page.keyboard.press('Escape')
  await sheet.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => undefined)
  await page.waitForTimeout(800)
}

async function cleanup({ token, projectId }) {
  const listFlows = async () => ((await api({ url: `/v1/workflows?projectId=${projectId}&limit=100`, token })).json?.data ?? []).filter((item) => (item.version?.displayName ?? '').startsWith('s7-'))
  for (const workflow of await listFlows()) {
    await api({ method: 'DELETE', url: `/v1/workflows/${workflow.id}?projectId=${projectId}`, token })
  }
  await waitFor({ fn: async () => (await listFlows()).length === 0, timeoutMs: 120000, intervalMs: 2000, what: 's7 workflows deleted' }).catch(() => undefined)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const servers = ((await api({ url: '/v1/mcp-servers', token })).json ?? []).filter((item) => item.displayName.startsWith('S7'))
    if (servers.length === 0) {
      return
    }
    for (const server of servers) {
      await api({ method: 'DELETE', url: `/v1/mcp-servers/${server.id}`, token })
    }
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }
}

export async function flowChecks({ session, server }) {
  const { createFlow, webhookTrigger, mcpCallStep, connectorStep, respondStep, runDraftSync, latestRun } = await import('./flow-kit.mjs')
  const externalId = server.externalId

  const lookupId = await createFlow({
    session,
    displayName: 's7-查员工并拼接',
    trigger: webhookTrigger({
      nextAction: mcpCallStep({
        name: 'find',
        displayName: '查询员工',
        externalId,
        tool: 'query_employee',
        args: { keyword: "{{trigger['output']['body']['keyword']}}" },
        nextAction: connectorStep({
          name: 'format',
          displayName: '拼接姓名和部门',
          connectorName: '@fema-ipaas/connector-text-helper',
          actionName: 'concat',
          input: { texts: ["{{find['output']['structured']['employees'][0]['name']}}", "{{find['output']['structured']['employees'][0]['dept']}}"], separator: '/' },
          nextAction: respondStep({
            body: { summary: "{{format['output']}}", total: "{{find['output']['structured']['total']}}", firstId: "{{find['output']['structured']['employees'][0]['id']}}", isError: "{{find['output']['isError']}}" },
          }),
        }),
      }),
    }),
  })
  const ok = await runDraftSync({ workflowId: lookupId, body: { keyword: '张' } })
  const parsed = safeJson(ok.text)
  check({ name: '工作流里的 MCP 步骤真跑：返回出参，后续步骤引用 structured 字段拼出「张三/研发部」', ok: ok.status === 200 && parsed?.summary === '张三/研发部' && String(parsed?.total) === '2' && parsed?.firstId === 'E1001', detail: `${ok.status} ${ok.text.slice(0, 200)}` })

  const errorFlowId = await createFlow({
    session,
    displayName: 's7-错误工具',
    trigger: webhookTrigger({
      nextAction: mcpCallStep({
        name: 'call',
        displayName: '调用工具',
        externalId,
        tool: "{{trigger['output']['body']['tool']}}",
        args: "{{trigger['output']['body']['args']}}",
        nextAction: respondStep({ body: { text: "{{call['output']['text']}}", size: "{{call['output']['text'].length}}" } }),
      }),
    }),
  })

  const toolError = await runDraftSync({ workflowId: errorFlowId, body: { tool: 'always_error', args: {} } })
  const toolErrorRun = await latestRun({ session, workflowId: errorFlowId })
  check({ name: '工具返回错误：步骤失败，失败说明里有工具的原话', ok: toolErrorRun?.status === 'FAILED' && /E_DB_REFUSED|数据库连接被拒绝/.test(JSON.stringify(toolErrorRun)), detail: `${toolError.status} ${toolErrorRun?.status} ${JSON.stringify(toolErrorRun?.failedStep ?? {}).slice(0, 240)}` })

  const dropped = await runDraftSync({ workflowId: errorFlowId, body: { tool: 'drop_connection', args: {} } })
  const droppedRun = await latestRun({ session, workflowId: errorFlowId })
  const droppedText = JSON.stringify(droppedRun?.failedStep ?? {})
  check({ name: '服务器中途掉线：步骤失败，失败说明写明连不上/连接被断开', ok: droppedRun?.status === 'FAILED' && /MCP server|无法|断开|reset|closed|terminated|fetch failed|socket/i.test(droppedText), detail: `${dropped.status} ${droppedRun?.status} ${droppedText.slice(0, 240)}` })

  const huge = await runDraftSync({ workflowId: errorFlowId, body: { tool: 'huge_output', args: { kb: 512 } } })
  const hugeRun = await latestRun({ session, workflowId: errorFlowId })
  const hugeBody = safeJson(huge.text)
  check({ name: '工具返回 512KB 超大内容：步骤结束且有明确结果（成功或写明太大的失败说明）', ok: hugeRun?.status === 'SUCCEEDED' || /大|size|limit|too/i.test(JSON.stringify(hugeRun?.failedStep ?? {})), detail: `${huge.status} ${hugeRun?.status} ${String(hugeBody?.size ?? '')} ${JSON.stringify(hugeRun?.failedStep ?? {}).slice(0, 200)}` })

  const started = Date.now()
  const slow = await runDraftSync({ workflowId: errorFlowId, body: { tool: 'slow_tool', args: { seconds: 75 } }, timeoutMs: 300000 })
  const slowRun = await latestRun({ session, workflowId: errorFlowId })
  const slowText = JSON.stringify(slowRun?.failedStep ?? {})
  check({ name: '工具耗时 75 秒超过 60 秒上限：步骤失败并写明超时，没有卡死', ok: slowRun?.status === 'FAILED' && /超时|timed out|did not respond|timeout/i.test(slowText) && Date.now() - started < 200000, detail: `${slow.status} ${slowRun?.status} ${Math.round((Date.now() - started) / 1000)}s ${slowText.slice(0, 240)}` })

  return { lookupId, errorFlowId }
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
