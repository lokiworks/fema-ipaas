import { api, check, env, go, openBrowser, shot, uiLogin, waitFor } from './lib.mjs'
import { connectorStep, createFlow, latestRun, runDetail, runDraftSync, webhookTrigger } from './flow-kit.mjs'

const SERVER_NAME = 'S7 企业人事工具'
const LLM_EXTERNAL_ID = 's7-fake-llm'

export async function agentPhase({ session }) {
  const { token, projectId } = session
  const server = await ensureServer({ token, projectId })
  await ensureModelConnection({ token, projectId })
  await cleanupFlows({ token, projectId })
  await extState({ path: '/admin/reset', method: 'POST' })

  if (process.env.S7_AGENT_ONLY === 'approval') {
    await approvalChecks({ session, server })
    await cleanupChecks({ session, server })
    return
  }
  const flow = (spec) => createAgentFlow({ session, server, ...spec })

  const lookup = await flow({ name: 's7-智能体-查询', caseName: 'lookup' })
  const lookupOut = await runAgent({ session, flowId: lookup })
  check({ name: '智能体自己调用外部 MCP 工具并给出答案（只读工具不需要确认）', ok: lookupOut.run?.status === 'SUCCEEDED' && lookupOut.output?.steps?.length === 1 && /张三/.test(lookupOut.output?.answer ?? '') && lookupOut.output?.stopReason === 'COMPLETED', detail: summarize(lookupOut) })
  check({ name: '步骤输出里有每一步工具调用记录和 Token 用量', ok: lookupOut.output?.steps?.[0]?.tool === 'query_employee' && lookupOut.output?.usage?.inputTokens > 0, detail: JSON.stringify(lookupOut.output?.usage) })

  const restricted = await flow({ name: 's7-智能体-限定工具', caseName: 'forbidden', allowedTools: ['query_employee'] })
  const restrictedOut = await runAgent({ session, flowId: restricted })
  const stateAfterRestricted = await extState({ path: '/admin/state' })
  check({ name: '允许的工具之外：模型点名也调不通，外部服务器没收到调用', ok: restrictedOut.output?.steps?.[0]?.isError === true && /not in the allowed tools/.test(restrictedOut.output?.steps?.[0]?.result ?? '') && !stateAfterRestricted.calls.some((call) => ['slow_tool', 'huge_output'].includes(call.tool)), detail: summarize(restrictedOut) })

  const loop = await flow({ name: 's7-智能体-步数', caseName: 'loop', maxSteps: 3 })
  const loopOut = await runAgent({ session, flowId: loop })
  check({ name: '最大步数 3：第 3 步后停止，输出写明停止原因 MAX_STEPS', ok: loopOut.run?.status === 'SUCCEEDED' && loopOut.output?.stopReason === 'MAX_STEPS' && loopOut.output?.steps?.length === 3 && /maximum of 3 steps/.test(loopOut.output?.stopMessage ?? ''), detail: summarize(loopOut) })

  const budget = await flow({ name: 's7-智能体-预算', caseName: 'budget', maxSteps: 10, tokenBudget: 1000 })
  const budgetOut = await runAgent({ session, flowId: budget })
  const used = (budgetOut.output?.usage?.inputTokens ?? 0) + (budgetOut.output?.usage?.outputTokens ?? 0)
  check({ name: 'Token 预算 1000：用量到达后停止，不再执行下一步，原因写明 TOKEN_BUDGET', ok: budgetOut.output?.stopReason === 'TOKEN_BUDGET' && used >= 1000 && budgetOut.output?.steps?.length < 10 && /token budget of 1000/.test(budgetOut.output?.stopMessage ?? ''), detail: `${used} ${summarize(budgetOut)}` })

  const errorFlow = await flow({ name: 's7-智能体-工具报错', caseName: 'error' })
  const errorOut = await runAgent({ session, flowId: errorFlow })
  check({ name: '工具报错：错误原文交给模型，智能体据此回答，运行不卡死', ok: errorOut.run?.status === 'SUCCEEDED' && errorOut.output?.steps?.[0]?.isError === true && /E_DB_REFUSED/.test(errorOut.output?.answer ?? ''), detail: summarize(errorOut) })

  const huge = await flow({ name: 's7-智能体-超大输出', caseName: 'huge' })
  const hugeOut = await runAgent({ session, flowId: huge })
  const hugeLength = Number(/长度 (\d+)/.exec(hugeOut.output?.answer ?? '')?.[1] ?? 0)
  check({ name: '工具返回 512KB：交给模型前截断到 2 万字符以内，运行成功', ok: hugeOut.run?.status === 'SUCCEEDED' && hugeLength > 0 && hugeLength <= 20100, detail: `${hugeLength} ${summarize(hugeOut)}` })

  const drop = await flow({ name: 's7-智能体-中途掉线', caseName: 'drop' })
  const dropOut = await runAgent({ session, flowId: drop })
  check({ name: '服务器在调用中途断开：这一步标为失败并带可读原因，智能体继续收尾', ok: dropOut.run?.status === 'SUCCEEDED' && dropOut.output?.steps?.[0]?.isError === true && /MCP server|MCP 服务器/.test(dropOut.output?.steps?.[0]?.result ?? ''), detail: summarize(dropOut) })

  await extState({ path: '/admin/down', method: 'POST' })
  const downFlow = await flow({ name: 's7-智能体-服务器宕机', caseName: 'lookup' })
  const downOut = await runAgent({ session, flowId: downFlow })
  await extState({ path: '/admin/up', method: 'POST' })
  check({ name: '开始前服务器就不可用：步骤失败，原因写明加载哪台服务器的工具失败', ok: downOut.run?.status === 'FAILED' && /Could not load the tools of MCP server/.test(downOut.failure ?? ''), detail: `${downOut.run?.status} ${downOut.failure}` })

  const noModel = await createAgentFlow({ session, server, name: 's7-智能体-没配模型', caseName: 'lookup', auth: '' })
  const noModelOut = await runAgent({ session, flowId: noModel })
  check({ name: '没有选模型连接：步骤失败并说明要先选择模型，而不是卡住', ok: noModelOut.run?.status === 'FAILED' && (noModelOut.failure ?? '').length > 0, detail: `${noModelOut.run?.status} ${noModelOut.failure}` })

  await approvalChecks({ session, server })
  await cleanupChecks({ session, server })

  const slow = await flow({ name: 's7-智能体-慢工具', caseName: 'slow' })
  const slowOut = await runAgent({ session, flowId: slow, timeoutMs: 240000 })
  check({ name: '工具耗时 75 秒：约 60 秒超时，这一步标为失败并说明超时，智能体收尾', ok: slowOut.run?.status === 'SUCCEEDED' && slowOut.output?.steps?.[0]?.isError === true && /did not respond|timeout|timed out|超时/i.test(slowOut.output?.steps?.[0]?.result ?? ''), detail: summarize(slowOut) })
}

async function approvalChecks({ session, server }) {
  const { token, projectId } = session
  const ticketFlow = await createAgentFlow({ session, server, name: 's7-智能体-审批', caseName: 'ticket' })
  await extState({ path: '/admin/reset', method: 'POST' })

  const first = await runAgent({ session, flowId: ticketFlow, stopOn: ['PAUSED'] })
  const pending = await waitFor({ fn: async () => ((await api({ url: `/v1/agent-approvals?projectId=${projectId}&status=PENDING`, token })).json ?? []).find((item) => item.executionId === first.run?.id), timeoutMs: 60000, what: 'pending approval' }).catch(() => null)
  const beforeApprove = await extState({ path: '/admin/state' })
  check({ name: '写入类工具 create_ticket：运行暂停并在智能体确认里出现待批，外部服务器还没收到调用', ok: first.run?.status === 'PAUSED' && pending?.tool === 'create_ticket' && !beforeApprove.calls.some((call) => call.tool === 'create_ticket'), detail: `${first.run?.status} ${pending?.tool}` })

  const { browser, page } = await openBrowser()
  await uiLogin({ page })
  await go({ page, url: `${env.web}/projects/${projectId}/agent-approvals` })
  await page.getByText('create_ticket').first().waitFor({ timeout: 120000 })
  await shot({ page, name: 'ag-01-approval-pending' })
  const cardText = await page.locator('body').innerText()
  check({ name: '待批卡片显示工具名、参数和批准/驳回按钮', ok: /create_ticket/.test(cardText) && /新员工电脑申请/.test(cardText) && /批准并继续/.test(cardText) && /驳回/.test(cardText), detail: cardText.replace(/\s+/g, ' ').slice(-240) })
  await page.getByRole('button', { name: '批准并继续' }).first().click()
  const afterApprove = await waitForRun({ session, flowId: ticketFlow, until: (run) => run.status !== 'PAUSED' })
  const approvedDetail = await runDetail({ session, runId: afterApprove.id })
  const approvedOutput = approvedDetail.steps?.agent?.output
  const stateApproved = await extState({ path: '/admin/state' })
  check({ name: '批准后运行继续：工具真的执行（工单已创建），智能体按结果回答', ok: afterApprove.status === 'SUCCEEDED' && stateApproved.tickets.length === 1 && /工单已创建/.test(approvedOutput?.answer ?? ''), detail: `${afterApprove.status} tickets=${stateApproved.tickets.length} ${(approvedOutput?.answer ?? '').slice(0, 80)}` })
  await shot({ page, name: 'ag-02-approval-approved' })

  const second = await runAgent({ session, flowId: ticketFlow, stopOn: ['PAUSED'] })
  await go({ page, url: `${env.web}/projects/${projectId}/agent-approvals` })
  await page.getByText('create_ticket').first().waitFor({ timeout: 120000 })
  await page.getByRole('button', { name: '驳回', exact: true }).first().click()
  await page.getByPlaceholder(/为什么驳回/).fill('这个员工不需要新电脑')
  await shot({ page, name: 'ag-03-approval-reject-form' })
  await page.locator('textarea').first().locator('xpath=following::button[normalize-space()="驳回"][1]').click()
  const afterReject = await waitForRun({ session, flowId: ticketFlow, until: (run) => run.id === second.run?.id && run.status !== 'PAUSED' })
  const rejectedDetail = await runDetail({ session, runId: afterReject.id })
  const rejectedOutput = rejectedDetail.steps?.agent?.output
  const stateRejected = await extState({ path: '/admin/state' })
  check({ name: '驳回后：工具不执行（工单仍只有 1 张），驳回理由交给智能体，运行正常结束', ok: afterReject.status === 'SUCCEEDED' && stateRejected.tickets.length === 1 && /驳回/.test(rejectedOutput?.answer ?? '') && /这个员工不需要新电脑/.test(JSON.stringify(rejectedOutput?.steps ?? [])), detail: `${afterReject.status} tickets=${stateRejected.tickets.length} ${(rejectedOutput?.answer ?? '').slice(0, 80)} ${JSON.stringify(rejectedOutput?.steps?.at(-1) ?? {}).slice(0, 160)}` })
  await shot({ page, name: 'ag-04-approval-all' })
  await browser.close()

  const confirmFlow = await createAgentFlow({ session, server, name: 's7-智能体-指定确认', caseName: 'lookup', confirmTools: ['query_employee'], confirmWrites: false })
  const third = await runAgent({ session, flowId: confirmFlow, stopOn: ['PAUSED'] })
  check({ name: '「这些工具调用前一律询问」：只读工具也能被指定为需要确认', ok: third.run?.status === 'PAUSED', detail: String(third.run?.status) })
  const thirdApproval = ((await api({ url: `/v1/agent-approvals?projectId=${projectId}&status=PENDING`, token })).json ?? []).find((item) => item.executionId === third.run?.id)
  if (thirdApproval) {
    await api({ method: 'POST', url: `/v1/agent-approvals/${thirdApproval.id}/decide?projectId=${projectId}`, token, body: { approved: false, comment: '测试驳回' } })
  }
}

async function pausedApproval({ session, server, name }) {
  const { token, projectId } = session
  const flowId = await createAgentFlow({ session, server, name, caseName: 'ticket' })
  const run = await runAgent({ session, flowId, stopOn: ['PAUSED'] })
  const approval = await waitFor({ fn: async () => ((await api({ url: `/v1/agent-approvals?projectId=${projectId}&status=PENDING`, token })).json ?? []).find((item) => item.executionId === run.run?.id), timeoutMs: 60000, what: 'pending approval' }).catch(() => null)
  return { flowId, approval, run: run.run }
}

async function approvalsOf({ session, executionId }) {
  const list = await api({ url: `/v1/agent-approvals?projectId=${session.projectId}&executionId=${executionId}`, token: session.token })
  return list.json ?? []
}

async function cleanupChecks({ session, server }) {
  const { token, projectId } = session
  const single = await pausedApproval({ session, server, name: 's7-智能体-删除清理-单个' })
  check({ name: '删除前：待批项在待批列表里，带着工作流名称', ok: single.approval?.workflowDisplayName === 's7-智能体-删除清理-单个', detail: JSON.stringify(single.approval?.workflowDisplayName) })

  const deleted = await api({ method: 'DELETE', url: `/v1/workflows/${single.flowId}?projectId=${projectId}`, token })
  const afterDelete = await waitFor({
    fn: async () => {
      const rows = await approvalsOf({ session, executionId: single.run.id })
      return rows.length > 0 && rows[0].status !== 'PENDING' ? rows[0] : null
    },
    timeoutMs: 30000,
    what: 'approval invalidated',
  }).catch(() => null)
  const pendingAfter = ((await api({ url: `/v1/agent-approvals?projectId=${projectId}&status=PENDING`, token })).json ?? []).filter((item) => item.executionId === single.run.id)
  check({ name: '删除工作流：待批项被标为已失效并从待批列表移出', ok: deleted.status < 300 && afterDelete?.status === 'INVALIDATED' && afterDelete?.invalidReason === 'WORKFLOW_DELETED' && pendingAfter.length === 0, detail: `${deleted.status} ${afterDelete?.status} ${afterDelete?.invalidReason} pending=${pendingAfter.length}` })
  check({ name: '历史里显示工作流名称快照，而不是原始 ID', ok: afterDelete?.workflowDisplayName === 's7-智能体-删除清理-单个' && afterDelete?.workflowDisplayName !== single.flowId, detail: String(afterDelete?.workflowDisplayName) })
  const decideAfter = await api({ method: 'POST', url: `/v1/agent-approvals/${single.approval.id}/decide?projectId=${projectId}`, token, body: { approved: true } })
  check({ name: '对已失效的待批项批准：返回可读错误，不是服务器错误', ok: decideAfter.status >= 400 && decideAfter.status < 500 && /no longer valid because its workflow was deleted/.test(decideAfter.text), detail: `${decideAfter.status} ${decideAfter.text.slice(0, 160)}` })
  const rejectAfter = await api({ method: 'POST', url: `/v1/agent-approvals/${single.approval.id}/decide?projectId=${projectId}`, token, body: { approved: false, comment: '不要了' } })
  check({ name: '对已失效的待批项驳回：同样返回可读错误', ok: rejectAfter.status >= 400 && rejectAfter.status < 500 && /no longer valid/.test(rejectAfter.text), detail: `${rejectAfter.status} ${rejectAfter.text.slice(0, 160)}` })

  const batchA = await pausedApproval({ session, server, name: 's7-智能体-删除清理-批量A' })
  const batchB = await pausedApproval({ session, server, name: 's7-智能体-删除清理-批量B' })
  const batchDeleted = await api({ method: 'DELETE', url: '/v1/project-workspace/batch', token, body: { projectId, workflowIds: [batchA.flowId, batchB.flowId] } })
  const batchRows = await waitFor({
    fn: async () => {
      const rows = [...(await approvalsOf({ session, executionId: batchA.run.id })), ...(await approvalsOf({ session, executionId: batchB.run.id }))]
      return rows.length === 2 && rows.every((row) => row.status === 'INVALIDATED') ? rows : null
    },
    timeoutMs: 30000,
    what: 'batch approvals invalidated',
  }).catch(() => null)
  check({ name: '批量删除工作流：名下的待批项全部失效，名称快照保留', ok: batchDeleted.status < 300 && batchRows?.length === 2 && batchRows.map((row) => row.workflowDisplayName).sort().join() === 's7-智能体-删除清理-批量A,s7-智能体-删除清理-批量B', detail: `${batchDeleted.status} ${JSON.stringify((batchRows ?? []).map((row) => row.workflowDisplayName))}` })

  const live = await pausedApproval({ session, server, name: 's7-智能体-删除清理-界面' })
  const { browser, page } = await openBrowser()
  await uiLogin({ page })
  await go({ page, url: `${env.web}/projects/${projectId}/agent-approvals` })
  await page.getByText('s7-智能体-删除清理-界面').first().waitFor({ timeout: 120000 })
  await api({ method: 'DELETE', url: `/v1/workflows/${live.flowId}?projectId=${projectId}`, token })
  await waitFor({ fn: async () => (await approvalsOf({ session, executionId: live.run.id }))[0]?.status === 'INVALIDATED', timeoutMs: 30000, what: 'ui approval invalidated' })
  await page.getByRole('button', { name: '批准并继续' }).first().click()
  await page.getByText(/已失效/).first().waitFor({ timeout: 20000 })
  const toastText = await page.locator('[data-sonner-toast]').first().innerText().catch(() => '')
  check({ name: '页面上对已删除工作流的待批项点批准：提示中文说明已失效，卡片退出待批列表', ok: /已失效|不再有效/.test(toastText) && !/This request is no longer valid/.test(toastText), detail: toastText.replace(/\s+/g, ' ') })
  await shot({ page, name: 'ag-05-approval-invalidated-toast' })
  await page.getByRole('tab', { name: '全部' }).click()
  await page.getByText(/工作流已被删除，这次调用已取消/).first().waitFor({ timeout: 20000 })
  const allText = await page.locator('body').innerText()
  check({ name: '「全部」里已失效项显示工作流名称、已失效徽标和原因，没有原始 ID，也没有批准按钮', ok: /s7-智能体-删除清理-界面/.test(allText) && /已失效/.test(allText) && /工作流已被删除/.test(allText) && !new RegExp(live.flowId).test(allText), detail: allText.replace(/\s+/g, ' ').slice(0, 300) })
  await shot({ page, name: 'ag-06-approval-invalidated-history' })
  await browser.close()
}

async function createAgentFlow({ session, server, name, caseName, maxSteps = 6, tokenBudget, allowedTools, confirmTools, confirmWrites = true, auth = `{{connections['${LLM_EXTERNAL_ID}']}}` }) {
  return createFlow({
    session,
    displayName: name,
    trigger: webhookTrigger({
      nextAction: connectorStep({
        name: 'agent',
        displayName: 'AI 智能体',
        connectorName: '@fema-ipaas/connector-ai',
        actionName: 'run_agent',
        input: {
          auth,
          instructions: '你是 HR 助手，可以查询员工、创建工单',
          input: `case=${caseName}`,
          mcpServers: [{ url: `http://${env.lanHost}:${env.externalPort}/mcp`, authorization: `{{connections['${server.externalId}'].props.token}}` }],
          maxSteps,
          confirmWrites,
          ...(tokenBudget === undefined ? {} : { tokenBudget }),
          ...(allowedTools === undefined ? {} : { allowedTools }),
          ...(confirmTools === undefined ? {} : { confirmTools }),
        },
      }),
    }),
  })
}

async function runAgent({ session, flowId, timeoutMs = 180000, stopOn = [] }) {
  await runDraftSync({ workflowId: flowId, body: {}, timeoutMs: 35000 }).catch(() => undefined)
  const run = await waitForRun({ session, flowId, until: (candidate) => !['RUNNING', 'QUEUED'].includes(candidate.status) || stopOn.includes(candidate.status), timeoutMs })
  const detail = run === null ? null : await runDetail({ session, runId: run.id })
  const output = detail?.steps?.agent?.output ?? null
  const failure = readableFailure(run?.failedStep?.message)
  return { run, output, failure }
}

async function waitForRun({ session, flowId, until, timeoutMs = 180000 }) {
  const started = Date.now()
  for (;;) {
    const run = await latestRun({ session, workflowId: flowId, timeoutMs: 1 })
    if (run !== null && until(run)) {
      return run
    }
    if (Date.now() - started > timeoutMs) {
      return run
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

function readableFailure(message) {
  if (!message) return ''
  try {
    const parsed = JSON.parse(message)
    return parsed.message ?? message
  } catch {
    return message
  }
}

function summarize({ run, output, failure }) {
  return `${run?.status} ${failure ?? ''} ${JSON.stringify({ answer: (output?.answer ?? '').slice(0, 60), steps: output?.steps?.length, stopReason: output?.stopReason, step0: (output?.steps?.[0]?.result ?? '').slice(0, 100) })}`
}

async function ensureServer({ token, projectId }) {
  const existing = ((await api({ url: '/v1/mcp-servers', token })).json ?? []).find((item) => item.displayName === SERVER_NAME)
  if (existing) {
    return existing
  }
  const created = await api({
    method: 'POST',
    url: '/v1/mcp-servers',
    token,
    body: {
      projectId,
      displayName: SERVER_NAME,
      description: '企业内部 HR 查询与工单工具，测试用',
      url: `http://${env.lanHost}:${env.externalPort}/mcp`,
      transport: 'streamable_http',
      auth: { type: 'bearer', token: env.externalToken },
      allProjects: true,
      projectIds: [],
      saveWithoutPassingTest: false,
    },
  })
  return created.json.server
}

async function ensureModelConnection({ token, projectId }) {
  const list = await api({ url: `/v1/connections?projectId=${projectId}&limit=100`, token })
  if ((list.json?.data ?? []).some((item) => item.externalId === LLM_EXTERNAL_ID)) {
    return
  }
  await api({
    method: 'POST',
    url: '/v1/connections',
    token,
    body: {
      externalId: LLM_EXTERNAL_ID,
      displayName: 'S7 本机假模型',
      connectorName: '@fema-ipaas/connector-ai',
      projectId,
      type: 'CUSTOM_AUTH',
      value: { type: 'CUSTOM_AUTH', props: { provider: 'OPENAI_COMPATIBLE', apiKey: 'sk-fake', model: 'fake-agent-1', baseUrl: `http://127.0.0.1:${env.llmPort}/v1` } },
    },
  })
}

async function cleanupFlows({ token, projectId }) {
  const workflows = await api({ url: `/v1/workflows?projectId=${projectId}&limit=100`, token })
  for (const workflow of (workflows.json?.data ?? []).filter((item) => (item.version?.displayName ?? '').startsWith('s7-智能体'))) {
    await api({ method: 'DELETE', url: `/v1/workflows/${workflow.id}?projectId=${projectId}`, token })
  }
}

async function extState({ path, method = 'GET' }) {
  const response = await fetch(`http://127.0.0.1:${env.externalPort}${path}`, { method })
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
