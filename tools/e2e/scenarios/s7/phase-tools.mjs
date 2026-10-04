import { api, check, env, go, openBrowser, shot, uiLogin, waitFor } from './lib.mjs'
import { connectorStep, createFlow, latestRun, runDraftSync, webhookTrigger } from './flow-kit.mjs'
import { ensureModelConnection, ensureServer } from './phase-agent.mjs'

const RICH_NAME = 'S7 复杂参数工具集'

export async function toolsPhase({ session }) {
  const { token, projectId } = session
  const server = await ensureRichServer({ token, projectId })
  await extState({ path: '/admin/reset', method: 'POST' })
  if (process.env.S7_TOOLS_ONLY !== 'picker') {
    await argumentsFormChecks({ session, server })
  }
  if (process.env.S7_TOOLS_ONLY !== 'form') {
    await pickerChecks({ session, richServer: server })
  }
}

export async function ensureRichServer({ token, projectId }) {
  const existing = ((await api({ url: '/v1/mcp-servers', token })).json ?? []).find((item) => item.displayName === RICH_NAME)
  if (existing) {
    return existing
  }
  const created = await api({
    method: 'POST',
    url: '/v1/mcp-servers',
    token,
    body: {
      projectId,
      displayName: RICH_NAME,
      description: '带复杂参数的测试工具集',
      url: `http://${env.lanHost}:${env.externalPort}/rich`,
      transport: 'streamable_http',
      auth: { type: 'bearer', token: bearer },
      allProjects: true,
      projectIds: [],
      saveWithoutPassingTest,
    },
  })
  return created.json.server
}

async function argumentsFormChecks({ session, server }) {
  const { browser, page } = await openBrowser({ height: 1000 })
  await uiLogin({ page })
  await go({ page, url: `${env.web}/tenant/connectors/mcp/${server.id}` })
  await page.getByText('提交报修单').first().waitFor({ timeout: 180000 })
  await page.getByRole('button', { name: '试用' }).first().click()
  const form = page.getByTestId('tool-arguments-form')
  await form.waitFor({ timeout: 60000 })

  const formText = await form.innerText()
  const labels = ['title', 'priority', 'estimateHours', 'urgent', 'labels', 'requester', 'items', 'meta']
  check({ name: '试用抽屉按工具的入参结构生成表单：每个参数一个控件，写明名称、类型、说明', ok: labels.every((label) => formText.includes(label)) && /报修标题，至少 3 个字/.test(formText) && /整数/.test(formText) && /一组字段/.test(formText) && /列表中选一个/.test(formText), detail: formText.replace(/\s+/g, ' ').slice(0, 260) })
  const requiredMarks = await form.locator('[data-field="title"] .text-destructive, [data-field="priority"] .text-destructive, [data-field="requester"] .text-destructive').count()
  check({ name: '必填参数带必填标记，必填项排在可选项前面', ok: requiredMarks >= 3 && formText.indexOf('title') < formText.indexOf('estimateHours'), detail: String(requiredMarks) })
  await shot({ page, name: 'tl-01-form-empty' })

  await page.getByRole('button', { name: '调用' }).click()
  const issues = page.getByTestId('tool-arguments-issues')
  await issues.waitFor({ timeout: 10000 })
  const issuesText = await issues.innerText()
  let calls = (await extState({ path: '/admin/state' })).calls
  check({ name: '什么都不填就调用：逐项写明哪个字段有问题，服务器没收到调用', ok: /title/.test(issuesText) && /priority/.test(issuesText) && /requester\.id/.test(issuesText) && !calls.some((call) => call.tool === 'file_ticket'), detail: issuesText.replace(/\s+/g, ' ') })
  await shot({ page, name: 'tl-02-form-issues' })

  await page.getByLabel('title', { exact: true }).fill('申')
  await page.getByRole('combobox', { name: 'priority' }).click()
  await page.getByRole('option', { name: 'high' }).click()
  await page.getByLabel('estimateHours', { exact: true }).fill('99')
  await page.getByLabel('id', { exact: true }).fill('E1004')
  await page.getByRole('button', { name: '调用' }).click()
  const second = await issues.innerText()
  check({ name: '值不合规：最短长度、最大值都按字段名报出来', ok: /title.*至少需要 3 个字符/.test(second) && /estimateHours.*不能大于 40/.test(second) && !/priority/.test(second), detail: second.replace(/\s+/g, ' ') })

  await page.getByLabel('title', { exact: true }).fill('电脑坏了')
  await page.getByLabel('estimateHours', { exact: true }).fill('8')
  const labelsBox = page.locator('[data-field="labels"]')
  await labelsBox.getByRole('button', { name: '添加一项' }).click()
  await labelsBox.getByLabel('#1', { exact: true }).fill('it')
  await labelsBox.getByRole('button', { name: '添加一项' }).click()
  await labelsBox.getByLabel('#2', { exact: true }).fill('onboarding')
  const itemsBox = page.locator('[data-field="items"]')
  await itemsBox.getByRole('button', { name: '添加一项' }).click()
  await itemsBox.getByLabel('sku', { exact: true }).fill('KB-01')
  await itemsBox.getByLabel('qty', { exact: true }).fill('2')
  await page.getByRole('combobox', { name: 'urgent' }).click()
  await page.getByRole('option', { name: '是' }).click()
  await page.locator('[data-field="meta"] textarea').fill('{"source":"hr-portal"}')
  await shot({ page, name: 'tl-03-form-filled' })
  await page.getByRole('button', { name: '调用' }).click()
  await page.getByText('received').first().waitFor({ timeout: 30000 })
  calls = (await extState({ path: '/admin/state' })).calls
  const sent = calls.find((call) => call.tool === 'file_ticket')?.args
  check({ name: '表单填好后调用：服务器收到的参数类型正确（整数是数字、布尔是 true、列表和嵌套对象成型、空项不发送）', ok: JSON.stringify(sent) === JSON.stringify({ title: '电脑坏了', priority: 'high', estimateHours: 8, urgent: true, labels: ['it', 'onboarding'], requester: { id: 'E1004' }, items: [{ sku: 'KB-01', qty: 2 }], meta: { source: 'hr-portal' } }) || deepEqualUnordered(sent, { title: '电脑坏了', priority: 'high', estimateHours: 8, urgent: true, labels: ['it', 'onboarding'], requester: { id: 'E1004' }, items: [{ sku: 'KB-01', qty: 2 }], meta: { source: 'hr-portal' } }), detail: JSON.stringify(sent) })
  await shot({ page, name: 'tl-04-form-result' })

  await page.getByRole('tab', { name: 'JSON' }).click()
  const jsonArea = page.getByLabel('JSON 格式的参数')
  const jsonValue = JSON.parse(await jsonArea.inputValue())
  check({ name: '表单切到 JSON：内容就是表单里填的那份，数据没丢', ok: deepEqualUnordered(jsonValue, sent), detail: JSON.stringify(jsonValue) })
  await shot({ page, name: 'tl-05-json' })

  await jsonArea.fill('{"title": "电脑坏了", ')
  await page.getByRole('tab', { name: '表单' }).click()
  const switchAlert = await page.getByText('暂时不能切换到表单').first().isVisible()
  const stillJson = await jsonArea.isVisible()
  check({ name: 'JSON 有语法错误时不能切回表单，写明原因，输入的内容保留', ok: switchAlert && stillJson && (await jsonArea.inputValue()).includes('"title"'), detail: `${switchAlert} ${stillJson}` })

  await jsonArea.fill(JSON.stringify({ title: '电脑坏了', priority: 'urgent', estimateHours: 'abc', urgent: 'yes', requester: { id: 7 }, labels: 'x', traceId: 't-1' }))
  const callsBefore = (await extState({ path: '/admin/state' })).calls.length
  await page.getByRole('button', { name: '调用' }).click()
  await issues.waitFor({ timeout: 10000 })
  const jsonIssues = await issues.innerText()
  const callsAfter = (await extState({ path: '/admin/state' })).calls.length
  check({ name: 'JSON 模式也按工具结构逐字段检查：类型不对、取值不在列表里都点名，服务器没收到调用', ok: /priority.*列出的值之一/.test(jsonIssues) && /estimateHours.*必须是数字/.test(jsonIssues) && /urgent.*true 或 false/.test(jsonIssues) && /requester\.id.*必须是文本/.test(jsonIssues) && /labels.*必须是列表/.test(jsonIssues) && callsBefore === callsAfter, detail: jsonIssues.replace(/\s+/g, ' ') })
  await shot({ page, name: 'tl-06-json-issues' })

  await jsonArea.fill(JSON.stringify({ title: '显示器闪烁', priority: 'low', requester: { id: 'E1001', department: '研发部' }, traceId: 't-9' }))
  await page.getByRole('tab', { name: '表单' }).click()
  await page.getByLabel('title', { exact: true }).waitFor({ timeout: 10000 })
  const backToForm = {
    title: await page.getByLabel('title', { exact: true }).inputValue(),
    department: await page.getByLabel('department', { exact: true }).inputValue(),
    extra: await page.getByText(/没有描述的字段会原样保留：traceId/).isVisible(),
  }
  check({ name: 'JSON 改好切回表单：值回填到对应控件，结构里没有的字段原样保留并提示', ok: backToForm.title === '显示器闪烁' && backToForm.department === '研发部' && backToForm.extra, detail: JSON.stringify(backToForm) })
  await page.getByRole('button', { name: '调用' }).click()
  await page.getByText('received').first().waitFor({ timeout: 30000 })
  const finalCalls = (await extState({ path: '/admin/state' })).rawCalls.filter((call) => call.tool === 'file_ticket')
  check({ name: '切回表单后调用，线上发出的参数带上保留的字段', ok: finalCalls.length === 2 && finalCalls[1].arguments.traceId === 't-9' && finalCalls[1].arguments.requester.department === '研发部', detail: JSON.stringify(finalCalls[1]?.arguments) })
  await browser.close()

  for (const variant of [{ suffix: 'dark', width: 1440, colorScheme: 'dark' }, { suffix: 'narrow', width: 420, colorScheme: 'light' }]) {
    const view = await openBrowser({ ...variant, height: 1000 })
    await uiLogin({ page: view.page })
    await go({ page: view.page, url: `${env.web}/tenant/connectors/mcp/${server.id}` })
    await view.page.getByText('提交报修单').first().waitFor({ timeout: 180000 })
    await view.page.getByRole('button', { name: '试用' }).first().click()
    await view.page.getByTestId('tool-arguments-form').waitFor({ timeout: 60000 })
    await view.page.getByRole('button', { name: '调用' }).click()
    await view.page.getByTestId('tool-arguments-issues').waitFor({ timeout: 10000 })
    await view.page.waitForTimeout(500)
    await shot({ page: view.page, name: `tl-07-form-issues-${variant.suffix}` })
    await view.browser.close()
  }
}

function deepEqualUnordered(left, right) {
  return stable(left) === stable(right)
}

function stable(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
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

async function openAgentInputs({ page }) {
  await page.getByText(/2\. AI 智能体/).first().click({ timeout: 180000 })
  await page.getByText('入参', { exact: true }).first().click({ timeout: 60000 })
  await page.getByTestId('agent-tools-editor').waitFor({ timeout: 120000 })
}

async function pickerChecks({ session, richServer }) {
  const { token, projectId } = session
  const hr = await ensureServer({ token, projectId })
  await ensureModelConnection({ token, projectId })
  await extState({ path: '/admin/reset', method: 'POST' })
  const staleFlows = ((await api({ url: `/v1/workflows?projectId=${projectId}&limit=100`, token })).json?.data ?? []).filter((item) => (item.version?.displayName ?? '').startsWith('s7-选择器'))
  for (const item of staleFlows) {
    await api({ method: 'DELETE', url: `/v1/workflows/${item.id}?projectId=${projectId}`, token })
  }
  await new Promise((resolve) => setTimeout(resolve, 3000))

  const flowId = await createFlow({
    session,
    displayName: 's7-选择器-智能体',
    trigger: webhookTrigger({
      nextAction: connectorStep({
        name: 'agent',
        displayName: 'AI 智能体',
        connectorName: '@fema-ipaas/connector-ai',
        actionName: 'run_agent',
        input: { auth: `{{connections['s7-fake-llm']}}`, instructions: '你是 HR 助手', input: 'case=lookup', mcpServers: [], maxSteps: 6, confirmWrites: true },
      }),
    }),
  })

  const { browser, page } = await openBrowser({ height: 1000 })
  await uiLogin({ page })
  await go({ page, url: `${env.web}/projects/${projectId}/workflows/${flowId}` })
  await openAgentInputs({ page })
  const editor = page.getByTestId('agent-tools-editor')
  const panelText = await page.locator('body').innerText()
  check({ name: '智能体节点里是服务器选择器：不再有手填的地址和授权输入框', ok: (await editor.getByLabel('服务器地址').count()) === 0 && (await editor.getByLabel('授权', { exact: true }).count()) === 0 && /选择要添加的 MCP 服务器/.test(panelText), detail: String(await editor.count()) })
  await shot({ page, name: 'pk-01-empty' })

  await editor.getByTestId('agent-add-server').click()
  const optionsText = await page.getByRole('listbox').innerText()
  check({ name: '下拉里列出已接入的服务器，写明连通状态和工具数', ok: /S7 企业人事工具/.test(optionsText) && /S7 复杂参数工具集/.test(optionsText) && /已连接 · 6 个工具/.test(optionsText) && /已连接 · 8 个工具/.test(optionsText) && /手动填写地址/.test(optionsText), detail: optionsText.replace(/\s+/g, ' ') })
  await shot({ page, name: 'pk-02-dropdown' })
  await page.getByRole('option', { name: /S7 企业人事工具/ }).click()

  const card = editor.locator(`[data-server="${hr.externalId}"]`)
  await card.waitFor({ timeout: 30000 })
  const cardText = await card.innerText()
  check({ name: '选中后出现服务器卡片：名称、已连接 · 6 个工具、地址，每个工具带名称和描述', ok: /S7 企业人事工具/.test(cardText) && /已连接 · 6 个工具/.test(cardText) && cardText.includes(hr.url) && /按姓名关键字查询员工/.test(cardText) && /为指定员工创建一张 IT 工单/.test(cardText), detail: cardText.replace(/\s+/g, ' ').slice(0, 300) })

  const saved = await waitForStepInput({ session, flowId, until: (input) => Array.isArray(input.mcpServers) && input.mcpServers.length === 1 })
  check({ name: '选中后自动写入地址和授权引用，没有手写表达式', ok: stable(saved.mcpServers[0]) === stable({ server: hr.externalId, url: hr.url, authorization: `{{connections['${hr.externalId}'].props.token}}` }), detail: JSON.stringify(saved.mcpServers) })

  const createRow = card.locator('[data-tool="create_ticket"]')
  const queryRow = card.locator('[data-tool="query_employee"]')
  const createSwitch = createRow.getByRole('switch')
  const querySwitch = queryRow.getByRole('switch')
  check({ name: '写操作工具（create_ticket）的「人工确认」开着且锁定，读工具（query_employee）关着', ok: (await createSwitch.isChecked()) && (await createSwitch.isDisabled()) && !(await querySwitch.isChecked()) && !(await querySwitch.isDisabled()), detail: `${await createSwitch.isChecked()} ${await createSwitch.isDisabled()} ${await querySwitch.isChecked()}` })
  await shot({ page, name: 'pk-03-server-added' })

  await card.getByRole('checkbox', { name: '允许工具 slow_tool' }).click()
  await card.getByRole('checkbox', { name: '允许工具 huge_output' }).click()
  const limited = await waitForStepInput({ session, flowId, until: (input) => Array.isArray(input.allowedTools) && input.allowedTools.length > 0 })
  check({ name: '取消勾选工具：允许列表写成其余工具，被取消的不在里面', ok: !limited.allowedTools.includes('slow_tool') && !limited.allowedTools.includes('huge_output') && limited.allowedTools.includes('query_employee') && limited.allowedTools.length === 4, detail: JSON.stringify(limited.allowedTools) })
  await card.getByText('已允许的工具：4 / 6').waitFor({ timeout: 10000 })

  await card.getByRole('checkbox', { name: '允许工具 always_error' }).click()
  await card.getByRole('checkbox', { name: '允许工具 drop_connection' }).click()
  await card.getByRole('checkbox', { name: '允许工具 create_ticket' }).click()
  const lastBox = card.getByRole('checkbox', { name: '允许工具 query_employee' })
  check({ name: '只剩一个允许的工具时，这一项的勾选框锁定，不会出现空列表（空列表等于全放开）', ok: await lastBox.isDisabled(), detail: String(await lastBox.isDisabled()) })
  await card.getByRole('checkbox', { name: '允许工具 create_ticket' }).click()
  await card.getByRole('checkbox', { name: '允许工具 always_error' }).click()
  await card.getByRole('checkbox', { name: '允许工具 drop_connection' }).click()
  await card.getByRole('checkbox', { name: '允许工具 slow_tool' }).click()
  await card.getByRole('checkbox', { name: '允许工具 huge_output' }).click()
  await page.getByText('允许全部工具').first().waitFor({ timeout: 10000 }).catch(() => undefined)

  await querySwitch.click()
  const confirmed = await waitForStepInput({ session, flowId, until: (input) => Array.isArray(input.confirmTools) && input.confirmTools.length > 0 })
  check({ name: '打开读工具的「人工确认」：写入 confirmTools', ok: JSON.stringify(confirmed.confirmTools) === JSON.stringify(['query_employee']), detail: JSON.stringify(confirmed.confirmTools) })

  await queryRow.getByRole('button', { name: '试用工具 query_employee' }).click()
  await page.getByTestId('tool-arguments-form').waitFor({ timeout: 30000 })
  check({ name: '工具行上的「试用」打开带表单的试用抽屉', ok: (await page.getByTestId('tool-arguments-form').innerText()).includes('keyword'), detail: '' })
  await shot({ page, name: 'pk-04-tool-try-drawer' })
  await page.keyboard.press('Escape')

  await runDraftSync({ workflowId: flowId, body: {}, timeoutMs: 35000 }).catch(() => undefined)
  const paused = await waitForRunStatus({ session, flowId, statuses: ['PAUSED', 'SUCCEEDED', 'FAILED'] })
  const pending = ((await api({ url: `/v1/agent-approvals?projectId=${projectId}&status=PENDING`, token })).json ?? []).find((item) => item.executionId === paused?.id)
  const callsWhilePaused = (await extState({ path: '/admin/state' })).calls
  check({ name: '界面选出来的配置能真跑：智能体用生成的地址和授权连上服务器；打开了确认的读工具，调用前暂停等人批', ok: paused?.status === 'PAUSED' && pending?.tool === 'query_employee' && !callsWhilePaused.some((call) => call.tool === 'query_employee'), detail: `${paused?.status} ${pending?.tool}` })
  if (pending) {
    const approved = await api({ method: 'POST', url: `/v1/agent-approvals/${pending.id}/decide?projectId=${projectId}`, token, body: { approved: true } })
    const finished = await waitForRunStatus({ session, flowId, statuses: ['SUCCEEDED', 'FAILED'] })
    check({ name: '批准后工具执行，智能体给出答案', ok: approved.status < 300 && finished?.status === 'SUCCEEDED' && (await extState({ path: '/admin/state' })).calls.some((call) => call.tool === 'query_employee'), detail: `${approved.status} ${finished?.status}` })
  }

  await go({ page, url: `${env.web}/projects/${projectId}/workflows/${flowId}` })
  await openAgentInputs({ page })
  const reopened = page.getByTestId('agent-tools-editor').locator(`[data-server="${hr.externalId}"]`)
  await reopened.waitFor({ timeout: 60000 })
  const reopenedText = await reopened.innerText()
  check({ name: '重新打开节点：服务器、已允许的工具、确认开关都是上次选的样子', ok: /已允许的工具：1 \/ 6|已允许的工具：6 \/ 6/.test(reopenedText) && (await reopened.locator('[data-tool="query_employee"]').getByRole('switch').isChecked()), detail: reopenedText.replace(/\s+/g, ' ').slice(0, 160) })
  await shot({ page, name: 'pk-04b-reopened' })
  await reopened.getByRole('button', { name: /移除服务器/ }).click()
  await reopened.waitFor({ state: 'detached', timeout: 15000 })
  const cleared = await waitForStepInput({ session, flowId, until: (input) => Array.isArray(input.mcpServers) && input.mcpServers.length === 0 })
  check({ name: '移除服务器：地址、允许列表和确认列表一并清掉', ok: cleared.mcpServers.length === 0 && (cleared.allowedTools ?? []).length === 0 && (cleared.confirmTools ?? []).length === 0, detail: JSON.stringify({ allowed: cleared.allowedTools, confirm: cleared.confirmTools }) })
  await browser.close()

  await removedServerChecks({ session })
}

async function removedServerChecks({ session }) {
  const { token, projectId } = session
  const healthy = await createTempServer({ token, projectId, label: '健康', bearer: env.externalToken })
  const broken = await createTempServer({ token, projectId, label: '坏令牌', bearer: 'wrong-token', saveWithoutPassingTest: true })
  const entryOf = (server) => ({ server: server.externalId, url: server.url, authorization: `{{connections['${server.externalId}'].props.token}}` })
  const agentFlow = ({ name, servers, allowedTools }) => createFlow({
    session,
    displayName: name,
    trigger: webhookTrigger({
      nextAction: connectorStep({
        name: 'agent',
        displayName: 'AI 智能体',
        connectorName: '@fema-ipaas/connector-ai',
        actionName: 'run_agent',
        input: { auth: `{{connections['s7-fake-llm']}}`, instructions: '你是 HR 助手', input: 'case=lookup', mcpServers: servers, ...(allowedTools ? { allowedTools } : {}), maxSteps: 6 },
      }),
    }),
  })

  const healthyFlow = await agentFlow({ name: 's7-选择器-健康服务器', servers: [entryOf(healthy)], allowedTools: ['query_employee'] })
  const published = await api({ method: 'POST', url: `/v1/workflows/${healthyFlow}?projectId=${projectId}`, token, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  check({ name: '服务器健康（范围是全部项目）时，带这个服务器的智能体流程能发布', ok: published.status < 300, detail: `${published.status} ${published.text.slice(0, 160)}` })
  const blockedByUse = await api({ method: 'DELETE', url: `/v1/mcp-servers/${healthy.id}`, token })
  check({ name: '服务器正被已发布流程使用时，直接删除被拦下并说明原因', ok: blockedByUse.status >= 400 && /still used by/.test(blockedByUse.text), detail: `${blockedByUse.status} ${blockedByUse.text.slice(0, 160)}` })

  const goneId = 'mcp-server-not-on-this-instance'
  const goneFlow = await agentFlow({ name: 's7-选择器-服务器不存在', servers: [{ server: goneId, url: 'https://gone.example.com/mcp', authorization: `{{connections['${goneId}'].props.token}}` }] })
  const brokenFlow = await agentFlow({ name: 's7-选择器-服务器连不上', servers: [entryOf(broken)] })
  const toolGoneFlow = await agentFlow({ name: 's7-选择器-工具已不存在', servers: [entryOf(healthy)], allowedTools: ['query_employee', 'drop_table'] })

  const { browser, page } = await openBrowser({ height: 1000 })
  await uiLogin({ page })

  await go({ page, url: `${env.web}/projects/${projectId}/workflows/${goneFlow}` })
  await openAgentInputs({ page })
  const gone = page.getByTestId('agent-tools-editor').locator(`[data-server="${goneId}"]`)
  await gone.waitFor({ timeout: 60000 })
  const goneText = await gone.innerText()
  check({ name: '导入或推广过来的流程里，引用了本实例没有的服务器：节点上写明「这台服务器没了」和不能发布', ok: (await gone.getAttribute('data-server-state')) === 'MISSING' && /已删除/.test(goneText) && /这台服务器没了/.test(goneText) && /不能发布/.test(goneText), detail: goneText.replace(/\s+/g, ' ') })
  await shot({ page, name: 'pk-05-server-missing' })
  const publish = page.getByRole('button', { name: '发布', exact: true })
  check({ name: '服务器不存在：发布按钮被禁用', ok: await publish.isDisabled(), detail: String(await publish.isDisabled()) })
  const refused = await api({ method: 'POST', url: `/v1/workflows/${goneFlow}?projectId=${projectId}`, token, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  const goneWorkflow = (await api({ url: `/v1/workflows/${goneFlow}?projectId=${projectId}`, token })).json
  check({ name: '绕过界面直接调接口发布：服务端同样拒绝，并点名这台服务器', ok: refused.status >= 400 && refused.text.includes(goneId) && !goneWorkflow.publishedVersionId, detail: `${refused.status} ${refused.text.slice(0, 220)}` })

  await go({ page, url: `${env.web}/projects/${projectId}/workflows/${brokenFlow}` })
  await openAgentInputs({ page })
  const brokenCard = page.getByTestId('agent-tools-editor').locator(`[data-server="${broken.externalId}"]`)
  await brokenCard.waitFor({ timeout: 60000 })
  const brokenText = await brokenCard.innerText()
  check({ name: '服务器连不上：节点上写明「这台服务器连不上」，带探测失败的原因，并写明恢复前不能发布', ok: (await brokenCard.getAttribute('data-server-state')) === 'BROKEN' && /连不上/.test(brokenText) && /401|令牌|Unauthorized|token/i.test(brokenText) && /不能发布/.test(brokenText), detail: brokenText.replace(/\s+/g, ' ').slice(0, 260) })
  await shot({ page, name: 'pk-06-server-broken' })
  check({ name: '服务器连不上：发布按钮被禁用', ok: await publish.isDisabled(), detail: String(await publish.isDisabled()) })
  const refusedBroken = await api({ method: 'POST', url: `/v1/workflows/${brokenFlow}?projectId=${projectId}`, token, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  check({ name: '服务器连不上：服务端发布同样拒绝', ok: refusedBroken.status >= 400 && /连不上/.test(refusedBroken.text), detail: `${refusedBroken.status} ${refusedBroken.text.slice(0, 200)}` })

  const refusedTool = await api({ method: 'POST', url: `/v1/workflows/${toolGoneFlow}?projectId=${projectId}`, token, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  check({ name: '允许的工具在服务器上已不存在：服务端发布拒绝并点名工具', ok: refusedTool.status >= 400 && refusedTool.text.includes('drop_table'), detail: `${refusedTool.status} ${refusedTool.text.slice(0, 200)}` })
  await browser.close()

  for (const variant of [{ suffix: 'dark', width: 1440, colorScheme: 'dark' }, { suffix: 'narrow', width: 440, colorScheme: 'light' }]) {
    const view = await openBrowser({ ...variant, height: 1000 })
    await uiLogin({ page: view.page })
    await go({ page: view.page, url: `${env.web}/projects/${projectId}/workflows/${brokenFlow}` })
    await openAgentInputs({ page: view.page })
    await view.page.waitForTimeout(1500)
    await shot({ page: view.page, name: `pk-07-broken-${variant.suffix}` })
    await view.browser.close()
  }
}

async function createTempServer({ token, projectId, label, bearer, saveWithoutPassingTest = false }) {
  const existing = ((await api({ url: '/v1/mcp-servers', token })).json ?? []).filter((item) => item.displayName.startsWith(`S7 临时服务器 ${label}`))
  for (const item of existing) {
    await api({ method: 'DELETE', url: `/v1/mcp-servers/${item.id}`, token })
  }
  const created = await api({
    method: 'POST',
    url: '/v1/mcp-servers',
    token,
    body: {
      projectId,
      displayName: `S7 临时服务器 ${label} ${Date.now()}`,
      description: '用完即删',
      url: `http://${env.lanHost}:${env.externalPort}/mcp`,
      transport: 'streamable_http',
      auth: { type: 'bearer', token: bearer },
      allProjects: true,
      projectIds: [],
      saveWithoutPassingTest,
    },
  })
  return created.json.server
}

async function waitForStepInput({ session, flowId, until, timeoutMs = 30000 }) {
  const started = Date.now()
  for (;;) {
    const workflow = (await api({ url: `/v1/workflows/${flowId}?projectId=${session.projectId}`, token: session.token })).json
    const input = workflow?.version?.trigger?.nextAction?.settings?.input ?? {}
    if (until(input) || Date.now() - started > timeoutMs) {
      return input
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}

async function waitForRunStatus({ session, flowId, statuses, timeoutMs = 120000 }) {
  const started = Date.now()
  for (;;) {
    const run = await latestRun({ session, workflowId: flowId, timeoutMs: 1 })
    if ((run !== null && statuses.includes(run.status)) || Date.now() - started > timeoutMs) {
      return run
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}
