import { chromium } from '@playwright/test'
import { AA_NORMAL_TEXT, belowAa, describeFailures, measureText } from './lib/contrast.mjs'
import { createHarness } from './lib/s1-harness.mjs'
import { startMockLlm } from './lib/s1-mock-llm.mjs'
import { freshStack } from './lib/s1-stack.mjs'

const SLOT = Number(process.env.E2E_SLOT ?? 1)
const EMAIL = process.env.E2E_EMAIL ?? 'dev@ap.com'
const PASSWORD = process.env.E2E_PASSWORD ?? '12345678'
const SCENARIO = '员工入职后在飞书建档、按部门开通账号并通知 HR 群'
const BEISEN = '@fema-ipaas/connector-beisen'
const FEISHU = '@fema-ipaas/connector-feishu'
const AI_CONNECTOR = '@fema-ipaas/connector-ai'
const HR_CHAT = 'oc_hr_notice'
const DEMO_BITABLE = 'https://example.feishu.cn/base/bascnDemo1234567890'
const DEMO_BITABLE_TOKEN = 'bascnDemo1234567890'
const NOTIFY_STEP = '通知HR 群'
const DEMO_MOBILE = '+8613800000000'

if (process.env.E2E_REUSE !== '1') {
  await freshStack({ slot: SLOT })
}
const h = createHarness({ slot: SLOT })
const { env, check, assert } = h
const phases = process.env.E2E_PHASES ?? ''
const step = (label, fn) => (phases === '' || phases.includes(label[0]) ? check(label, async () => {
  try {
    return await fn()
  }
  catch (error) {
    await page.screenshot({ path: `${env.shotDir}/s1-fail-${label.split(' ')[0]}.png` }).catch(() => undefined)
    throw error
  }
}) : null)
await h.signIn({ email: EMAIL, password: PASSWORD })
const projectId = h.session.projectId
const llm = await startMockLlm({ port: env.llmPort })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
await context.addInitScript(() => {
  const removeOverlays = () => document.querySelectorAll('vite-error-overlay, vite-plugin-checker-error-overlay').forEach((node) => node.remove())
  new MutationObserver(removeOverlays).observe(document, { childList: true, subtree: true })
})
const page = await context.newPage()
page.setDefaultTimeout(60000)
const shot = (name) => page.screenshot({ path: `${env.shotDir}/s1-${name}.png` })

await resetState()
await login()

await step('A1 无模型：接口用规则规划出场景里的三个步骤、待确认问题、去重键和推荐答案', async () => {
  const plan = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: SCENARIO } })
  assert(plan.source === 'RULES', `来源应为规则，实际 ${plan.source}`)
  assert(plan.steps.map((step) => step.operationName).join() === 'create_bitable_record,provision_user,send_group_message', `步骤不对：${plan.steps.map((step) => step.operationName)}`)
  assert(plan.questions.length === 3, `应有 3 个待确认问题，实际 ${plan.questions.length}`)
  assert(plan.steps[1].input.employeeNo.includes('jobNumber'), '员工字段没有预填')
  assert(plan.dedupe?.keyPath === 'recordInfo.jobNumber' && plan.dedupe.windowSeconds === 2592000, `规划应带工号去重键：${JSON.stringify(plan.dedupe)}`)
  assert(plan.recommendations.length === plan.questions.length && plan.recommendations.every((recommendation) => recommendation.basis.length > 10), '每个待确认问题都应有带依据的推荐项')
  const department = plan.recommendations.find((recommendation) => recommendation.question.startsWith('新员工放进哪个飞书部门'))
  assert(department?.value === '0' && department.basis.includes('根部门'), `没有历史可参考时，部门推荐飞书根部门：${JSON.stringify(department)}`)
  const chat = plan.recommendations.find((recommendation) => recommendation.question.startsWith('通知哪个飞书群'))
  assert(chat?.value === null && chat.basis.includes('没有工作流往群里发过消息'), `没有历史时群 ID 不编造推荐值，并说明原因：${JSON.stringify(chat)}`)
  assert(plan.missingMappingTable?.name === '部门对照', '缺部门映射表时应带建表建议')
  return { steps: plan.steps.length, questions: plan.questions.length }
})

await step('A2 无模型：听不懂、系统里没有的连接器、删除账号都给出可读结果，并给出最接近的模板', async () => {
  const vague = await h.call({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '帮我自动化一下' } })
  assert(vague.status >= 400 && JSON.stringify(vague.body).includes('没有听出要做的事'), `模糊描述应被拒绝：${vague.status} ${JSON.stringify(vague.body)}`)
  const closest = await h.api({ method: 'GET', path: `/ai/plan-templates?projectId=${projectId}&prompt=${encodeURIComponent('帮我自动化一下')}` })
  assert(closest.length === 3 && closest.every((template) => template.examplePrompt.length > 0), `听不懂时应给最接近的三个模板：${JSON.stringify(closest)}`)
  const daily = await h.api({ method: 'GET', path: `/ai/plan-templates?projectId=${projectId}&prompt=${encodeURIComponent('每天定时核对一下花名册')}` })
  assert(daily[0].id === 'RECONCILE', `按词排序，对账模板应排第一：${daily.map((template) => template.id)}`)
  const english = await h.api({ method: 'GET', path: `/ai/plan-templates?projectId=${projectId}&prompt=${encodeURIComponent('do something clever')}` })
  assert(/[A-Za-z]/.test(english[0].name) && !/[一-鿿]/.test(english[0].name), '英文描述应返回英文模板名')
  const sap = await h.call({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '员工入职后在 SAP 里建档' } })
  assert(sap.status >= 400 && JSON.stringify(sap.body).includes('SAP'), `只提到没有的系统应被拒绝并点名：${JSON.stringify(sap.body)}`)
  const mixed = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '北森员工入职后开通飞书账号，再同步到金蝶' } })
  assert(mixed.unavailableSystems.join() === '金蝶' && mixed.steps.length === 1, `应只生成能做的步骤并点名金蝶：${JSON.stringify(mixed.unavailableSystems)}`)
  const del = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '员工离职后删除飞书账号并通知 IT 群' } })
  assert(del.steps.some((step) => step.operationName === 'suspend_user') && !del.steps.some((step) => step.operationName.includes('delete')), '删除账号应改为暂停')
  assert(del.warnings.some((warning) => warning.includes('不提供删除飞书账号')), '应说明为什么不删除')
})

await step('A3 首页：一句话输入后，无模型也能规划，列出步骤、待确认问题、去重键和连接', async () => {
  await openPage({ path: '/', ready: 'textarea[aria-label]' })
  await page.getByLabel('描述你想自动化的事情').fill(SCENARIO)
  await shot('a3-home-input')
  await page.getByRole('button', { name: '开始规划' }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByTestId('plan-no-model').waitFor()
  await page.getByTestId('plan-review').waitFor()
  await shot('a3-plan-rules')
  const text = await page.getByTestId('plan-review').innerText()
  assert(text.includes('规则规划'), '应标明由规则规划')
  assert(text.includes('在飞书多维表格建档') && text.includes('开通飞书账号') && text.includes('通知HR 群'), `步骤不全：${text}`)
  assert(text.includes('待确认的问题') && text.includes('通知哪个飞书群'), '应列出待确认问题')
  assert(text.includes('这个项目里还没有可用的连接'), '没有连接时应明确说出')
  const dedupe = await page.getByTestId('plan-dedupe').innerText()
  assert(dedupe.includes('业务键：工号') && dedupe.includes('30 天') && dedupe.includes('待确认'), `去重键卡片内容不对：${dedupe}`)
  const recommendations = await page.getByTestId('plan-recommendation').count()
  assert(recommendations === 3, `三个问题都应有推荐项，实际 ${recommendations}`)
})

let draftId = null
await step('A4 无连接、问题未回答也能创建草稿，进入编辑器后所有节点标待确认，触发器带去重键', async () => {
  await page.getByRole('dialog').getByRole('button', { name: '创建草稿' }).click()
  await page.waitForURL(/\/workflows\/[A-Za-z0-9_-]+$/)
  draftId = page.url().split('/').pop()
  await page.getByText('AI 生成的节点待确认').waitFor({ timeout: 90000 })
  await shot('a4-editor-draft')
  const pending = await page.getByText('待确认', { exact: true }).count()
  assert(pending >= 4, `应有 4 个节点标待确认，实际 ${pending}`)
  const workflow = await h.api({ method: 'GET', path: `/workflows/${draftId}?projectId=${projectId}` })
  const dedupe = workflow.version.trigger.settings.dedupe
  assert(dedupe?.enabled === true && dedupe.keyPath === 'recordInfo.jobNumber' && dedupe.windowSeconds === 2592000, `草稿的触发器应带去重设置：${JSON.stringify(dedupe)}`)
  assert(workflow.version.trigger.settings.pendingReview === true, '带去重键的触发器同样标待确认')
  return { draftId }
})

await step('A5 待确认节点未确认时发布被拦住，并说明原因', async () => {
  const publish = page.getByRole('button', { name: '发布', exact: true })
  assert(await publish.isDisabled(), '发布按钮应为禁用')
  await publish.hover({ force: true })
  const tip = page.getByRole('tooltip').first()
  await tip.waitFor()
  const tipText = await tip.innerText()
  assert(/修复|错误/.test(tipText), `禁用原因不可读：${tipText}`)
  await page.getByRole('button', { name: '校验', exact: true }).click()
  await page.getByText('未选择连接').first().waitFor()
  const panelText = await page.locator('body').innerText()
  await shot('a5-publish-blocked')
  assert(panelText.includes('未选择连接'), '校验面板应列出缺少连接')
  const workflow = await h.api({ method: 'GET', path: `/workflows/${draftId}?projectId=${projectId}` })
  assert(!workflow.publishedVersionId, '拦截失败：工作流被发布了')
  return tipText
})

await step('A6 绕过界面直接调接口发布，服务端同样拒绝未确认的 AI 节点', async () => {
  const response = await h.call({ method: 'POST', path: `/workflows/${draftId}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  assert(response.status >= 400, `服务端放行了：${response.status}`)
  assert(JSON.stringify(response.body).includes('Confirm every AI-generated step'), `原因不对：${JSON.stringify(response.body)}`)
  const workflow = await h.api({ method: 'GET', path: `/workflows/${draftId}?projectId=${projectId}` })
  assert(!workflow.publishedVersionId, '拦截失败：工作流被发布了')
})

await step('I1 绕过界面发布缺必填项、没选连接的流程：服务端逐步骤说出字段级原因，不放行', async () => {
  await dropPendingReview({ workflowId: draftId })
  const blocked = await h.call({ method: 'POST', path: `/workflows/${draftId}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  assert(blocked.status >= 400, `缺必填项的流程被放行了：${blocked.status}`)
  const message = String(blocked.body?.params?.message ?? JSON.stringify(blocked.body))
  assert(message.includes('流程还有') && message.includes('修好后才能发布'), `原因不是一句可读的话：${message}`)
  assert(message.includes('「通知HR 群」还没有选择连接') && message.includes('缺少必填项「群聊」'), `没有说清哪一步缺什么：${message}`)
  assert(message.includes('缺少必填项「内容」') === false, '已经填了的字段不应被报缺')
  const workflow = await h.api({ method: 'GET', path: `/workflows/${draftId}?projectId=${projectId}` })
  assert(!workflow.publishedVersionId, '拦截失败：工作流被发布了')
  return message
})

await step('I2 引用了已删除的步骤也被服务端拦住，写明引用的是哪一段', async () => {
  await setStepInput({ workflowId: draftId, stepName: 'step_3', patch: { content: "{{step_9['output']['x']}} 已入职" } })
  const blocked = await h.call({ method: 'POST', path: `/workflows/${draftId}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  assert(blocked.status >= 400, `引用已删除步骤的流程被放行了：${blocked.status}`)
  const message = String(blocked.body?.params?.message ?? JSON.stringify(blocked.body))
  assert(message.includes('引用了已删除的步骤：{{step_9'), `没有说清引用了哪一段：${message}`)
  return message
})

await step('B1 建好北森和飞书连接（保存时校验凭据）', async () => {
  await upsertConnection({ externalId: 'beisen-main', displayName: '北森', connectorName: BEISEN, props: { appKey: 'mock-key', appSecret: 'mock-secret' } })
  await upsertConnection({ externalId: 'feishu-main', displayName: '飞书', connectorName: FEISHU, props: { domain: 'https://open.feishu.cn', appId: 'cli_mock', appSecret: 'mock-secret' } })
})

let draft2 = null
await step('B2 首页一句话：用上已有连接，回答三个问题后重新规划，问题清零', async () => {
  await openPage({ path: '/', ready: 'textarea[aria-label]' })
  await page.getByLabel('描述你想自动化的事情').fill(SCENARIO)
  await page.getByRole('button', { name: '开始规划' }).click()
  const dialog = page.getByRole('dialog')
  await page.getByTestId('plan-review').waitFor()
  const first = await page.getByTestId('plan-connections').innerText()
  assert(first.includes('使用连接「北森」') && first.includes('使用连接「飞书」'), `应自动选上已有连接：${first}`)
  assert(!first.includes('还没有可用的连接'), '不应再提示缺连接')
  await page.getByLabel(/新员工放进哪个飞书部门/).fill('od-rd')
  await page.getByLabel(/建档写进哪张多维表格/).fill(DEMO_BITABLE)
  await page.getByLabel(/通知哪个飞书群/).fill(HR_CHAT)
  await shot('b2-answers-filled')
  await dialog.getByRole('button', { name: '带上回答重新规划' }).click()
  await page.getByText('已全部确认').waitFor()
  await shot('b2-plan-answered')
  const footer = await page.getByTestId('plan-footer-info').innerText()
  assert(!footer.includes('未回答'), `问题都答了，页脚不该再说未回答：${footer}`)
  await dialog.getByRole('button', { name: '创建草稿' }).click()
  await page.waitForURL(/\/workflows\/[A-Za-z0-9_-]+$/)
  draft2 = page.url().split('/').pop()
  await page.getByText('AI 生成的节点待确认').waitFor({ timeout: 90000 })
  const workflow = await h.api({ method: 'GET', path: `/workflows/${draft2}?projectId=${projectId}` })
  const steps = flattenSteps(workflow.version.trigger)
  const notify = steps.find((step) => step.settings.actionName === 'send_group_message')
  const provision = steps.find((step) => step.settings.actionName === 'provision_user')
  assert(notify.settings.input.chatId === HR_CHAT, `群 ID 没带进草稿：${JSON.stringify(notify.settings.input)}`)
  assert(provision.settings.input.departmentId === 'od-rd', '部门没带进草稿')
  assert(provision.settings.input.auth.includes('feishu-main'), '连接没带进草稿')
  assert(steps.every((step) => step.settings.pendingReview === true), '所有节点都应标待确认')
  return { draft2, valid: workflow.version.valid }
})

const names = ['北森员工入职', '在飞书多维表格建档', '开通飞书账号', NOTIFY_STEP]
let mockBefore = null
await step('B3 逐个确认节点，补选数据表，确认完后没有任何错误和待确认', async () => {
  await page.waitForTimeout(500)
  await confirmNodes(names)
  await selectNode(names[1])
  await page.getByText('入参', { exact: true }).first().click()
  await page.getByText('数据表', { exact: true }).first().waitFor()
  await page.locator('button[role="combobox"]').last().click({ timeout: 120000 })
  await page.getByRole('option', { name: '员工花名册' }).click({ timeout: 120000 })
  await page.getByText('AI 生成的节点待确认').waitFor({ state: 'detached', timeout: 60000 })
  await shot('b3-all-confirmed')
  const workflow = await waitFor(async () => {
    const current = await h.api({ method: 'GET', path: `/workflows/${draft2}?projectId=${projectId}` })
    const saved = flattenSteps(current.version.trigger)
    return saved.every((node) => node.settings.pendingReview !== true) && current.version.valid === true ? current : null
  })
  const steps = flattenSteps(workflow.version.trigger)
  assert(steps.every((node) => node.settings.pendingReview !== true), '确认后 pendingReview 应被清掉')
  assert(workflow.version.valid === true, '确认并补全后版本应有效')
  assert(await page.getByText('需要修复').count() === 0, '画布上不应再有「需要修复」')
  const verification = await debugVerification({ workflowId: draft2 })
  assert(verification.verified === false, `还没调试过，不该显示已调试通过：${JSON.stringify(verification)}`)
})

await step('B4 调试失败：停在运行视图，点一次「编辑工作流」回到编辑视图，出错的节点仍选中，失败的运行不算调试通过', async () => {
  mockBefore = await mockState()
  await mockAdmin({ path: '/__admin/feishu-failure', body: { target: 'messages', code: 230001, msg: 'bot not in chat' } })
  try {
    await selectNode(names[2])
    await startDebug()
    await page.getByText(/运行失败|失败/).first().waitFor({ timeout: 120000 })
    await shot('b4-debug-failed')
    const edit = page.getByRole('button', { name: '编辑工作流' })
    await edit.last().waitFor()
    const before = await edit.count()
    await edit.last().click({ timeout: 5000 })
    await page.getByRole('button', { name: '编辑工作流' }).first().waitFor({ state: 'detached', timeout: 5000 })
    await shot('b4-back-to-edit')
    assert(await page.getByRole('button', { name: '调试', exact: true }).isEnabled(), '回到编辑视图后调试按钮应可用')
    const selected = await page.locator('[data-tour="builder-step"].border-primary').innerText()
    assert(selected.includes(NOTIFY_STEP), `出错的节点应仍选中，实际选中：${selected}`)
    const verification = await debugVerification({ workflowId: draft2 })
    assert(verification.verified === false, `失败的运行不能算调试通过：${JSON.stringify(verification)}`)
    return { editButtons: before }
  }
  finally {
    await mockAdmin({ path: '/__admin/feishu-failure', body: { target: 'messages', code: null } })
  }
})

let verifiedAt = null
await step('B5 调试通过：自动回到编辑视图并保留调试前选中的节点；可以从提示进入调试记录；服务端记下已调试通过和真正执行了的写入步骤', async () => {
  await selectNode(names[1])
  await startDebug()
  await page.getByText('调试通过，草稿可以继续编辑').waitFor({ timeout: 120000 })
  await page.getByRole('button', { name: '编辑工作流' }).first().waitFor({ state: 'detached', timeout: 10000 })
  await shot('b5-debug-done')
  assert(await page.getByRole('button', { name: '调试', exact: true }).isEnabled(), '调试结束后应回到可编辑的视图')
  const selected = await page.locator('[data-tour="builder-step"].border-primary').innerText()
  assert(selected.includes(names[1]), `应保留调试前选中的节点「${names[1]}」，实际：${selected}`)
  await page.getByRole('button', { name: '查看调试记录' }).click({ timeout: 10000 })
  await page.getByText(/运行成功/).first().waitFor({ timeout: 30000 })
  await shot('b5-debug-records')
  const records = await page.locator('body').innerText()
  assert(records.includes('调试记录') && records.includes(NOTIFY_STEP), '从提示应能回到调试记录，看到每一步')
  await page.getByRole('button', { name: '编辑工作流' }).last().click({ timeout: 5000 })
  await page.getByRole('button', { name: '编辑工作流' }).first().waitFor({ state: 'detached', timeout: 5000 })
  const state = await waitFor(async () => {
    const now = await mockState()
    const records = now.bitableRecords.length - mockBefore.bitableRecords.length
    const users = now.feishuUsers.filter((user) => user.mobile === DEMO_MOBILE).length
    const notes = now.messages.filter((message) => message.chat_id === HR_CHAT).length - mockBefore.messages.filter((message) => message.chat_id === HR_CHAT).length
    return records >= 1 && users === 1 && notes === 1 ? { records, users, notes } : null
  })
  const verification = await waitFor(async () => {
    const found = await debugVerification({ workflowId: draft2 })
    return found.verified ? found : null
  })
  const workflow = await h.api({ method: 'GET', path: `/workflows/${draft2}?projectId=${projectId}` })
  const writeSteps = flattenSteps(workflow.version.trigger).filter((node) => ['create_bitable_record', 'provision_user', 'send_group_message'].includes(node.settings.actionName)).map((node) => node.name)
  assert(writeSteps.length === 3 && writeSteps.every((name) => verification.executedStepNames.includes(name)), `服务端应记下三个写入步骤都执行了：${JSON.stringify({ writeSteps, executed: verification.executedStepNames })}`)
  verifiedAt = verification.verifiedAt
  return state
})

await step('B6 改动流程后记录失效：服务端不再认账，发布时重新提示写入步骤没测过', async () => {
  await selectNode(NOTIFY_STEP)
  await page.getByText('入参', { exact: true }).first().click()
  const content = page.locator('[contenteditable="true"]').last()
  await content.click()
  await page.keyboard.press('End')
  await page.keyboard.type('，请回收设备')
  await waitFor(async () => (await debugVerification({ workflowId: draft2 })).verified === false ? true : null)
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const reminder = page.getByRole('dialog').filter({ hasText: '存在警告' })
  await reminder.waitFor({ timeout: 15000 })
  await shot('b6-republish-warns')
  const text = await reminder.innerText()
  assert(text.includes('会写入数据，且自上次修改后还没有测试过'), `应提示写入步骤没测过：${text}`)
  await reminder.getByRole('button', { name: '取消' }).click()
  const workflow = await h.api({ method: 'GET', path: `/workflows/${draft2}?projectId=${projectId}` })
  assert(!workflow.publishedVersionId, '取消后不应已发布')
  return { stillVerified: false, verifiedAtBeforeEdit: verifiedAt }
})

await step('B7 重新调试通过后发布：不再提示「写入数据且没测过」，服务端状态是已发布', async () => {
  await startDebug()
  await page.getByText('调试通过，草稿可以继续编辑').waitFor({ timeout: 120000 })
  await waitFor(async () => (await debugVerification({ workflowId: draft2 })).verified ? true : null)
  await page.getByRole('button', { name: '发布', exact: true }).click()
  const reminder = page.getByRole('dialog').filter({ hasText: '存在警告' })
  const shown = await reminder.waitFor({ timeout: 4000 }).then(() => true).catch(() => false)
  await shot('b7-published')
  assert(!shown, '调试通过的版本发布时不该再提示写入数据没测过')
  const workflow = await waitFor(async () => {
    const current = await h.api({ method: 'GET', path: `/workflows/${draft2}?projectId=${projectId}` })
    return current.publishedVersionId && current.status === 'ENABLED' ? current : null
  })
  return { status: workflow.status }
})

let modelReady = false
await step('C0 模型连接：能连上的保存成功，连不上的在保存时就被拒绝并说明原因', async () => {
  await upsertConnection({ externalId: 'model-mock', displayName: '模拟模型', connectorName: AI_CONNECTOR, props: { provider: 'OPENAI_COMPATIBLE', apiKey: 'mock-key', model: 'mock-1', baseUrl: llm.baseUrl } })
  const models = await h.api({ method: 'GET', path: `/ai/model-connections?projectId=${projectId}` })
  assert(models.length >= 1, `应有模型连接：${JSON.stringify(models)}`)
  modelReady = true
  const dead = await h.call({
    method: 'POST',
    path: '/connections',
    body: { externalId: 'model-dead', displayName: '连不上的模型', connectorName: AI_CONNECTOR, projectId, type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props: { provider: 'OPENAI_COMPATIBLE', apiKey: 'mock-key', model: 'mock-1', baseUrl: 'http://127.0.0.1:9/v1' } } },
  })
  assert(dead.status >= 400 && JSON.stringify(dead.body).includes('Could not reach the model provider'), `连不上的模型应被拒绝：${JSON.stringify(dead.body)}`)
})

let draft3 = null
await step('C1 项目页入口：用模型规划，回答问题后生成草稿，字段按回答预填，触发器带去重键', async () => {
  assert(modelReady, '没有模型连接')
  await openPage({ path: `/projects/${projectId}/home`, ready: 'button:has-text("用 AI 创建")' })
  await page.getByRole('button', { name: '用 AI 创建' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/这个工作流要做什么/).fill(SCENARIO)
  await dialog.getByRole('button', { name: '规划', exact: true }).click()
  await page.getByTestId('plan-review').waitFor()
  assert((await page.getByTestId('plan-source').innerText()).includes('模型规划'), '应标明由模型规划')
  assert((await page.getByTestId('plan-dedupe').innerText()).includes('业务键：工号'), '模型规划也要带业务键与去重卡片')
  await shot('c1-plan-model')
  await page.getByLabel(/通知哪个飞书群/).fill(HR_CHAT)
  await page.getByLabel(/新员工放进哪个飞书部门/).fill('od-rd')
  await dialog.getByRole('button', { name: '带上回答重新规划' }).click()
  await page.getByText('已全部确认').waitFor()
  await dialog.getByRole('button', { name: '创建草稿' }).click()
  await page.waitForURL(/\/workflows\/[A-Za-z0-9_-]+$/)
  draft3 = page.url().split('/').pop()
  const workflow = await h.api({ method: 'GET', path: `/workflows/${draft3}?projectId=${projectId}` })
  const steps = flattenSteps(workflow.version.trigger)
  const notify = steps.find((node) => node.settings.actionName === 'send_group_message')
  assert(notify.settings.input.chatId === HR_CHAT, `群 ID 没带进草稿：${JSON.stringify(notify.settings.input)}`)
  assert(steps.every((node) => node.settings.pendingReview === true), '模型生成的节点也应标待确认')
  assert(workflow.version.trigger.settings.dedupe?.keyPath === 'recordInfo.jobNumber', `模型给的去重键应带进草稿触发器：${JSON.stringify(workflow.version.trigger.settings.dedupe)}`)
  assert(llm.calls.length >= 2, '应真的调用了模型')
})

await step('C2 模型回了不可用的内容：给出可读原因，并能一键改用内置规则', async () => {
  await openPage({ path: `/projects/${projectId}/home`, ready: 'button:has-text("用 AI 创建")' })
  await page.getByRole('button', { name: '用 AI 创建' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/这个工作流要做什么/).fill('乱码乱码 员工入职')
  await dialog.getByRole('button', { name: '规划', exact: true }).click()
  await page.getByTestId('plan-error').waitFor()
  const text = await page.getByTestId('plan-error').innerText()
  await shot('c2-model-bad-reply')
  assert(text.length > 10, '应有错误说明')
  await page.getByTestId('plan-closest-templates').waitFor()
  await page.getByRole('button', { name: '改用内置规则规划' }).click()
  await page.getByTestId('plan-review').waitFor()
  assert((await page.getByTestId('plan-source').innerText()).includes('规则规划'), '改用规则后应标规则规划')
  return text
})

await step('C3 模型规划里提到了系统里没有的连接器：点名并说明少了哪些步骤', async () => {
  await openPage({ path: `/projects/${projectId}/home`, ready: 'button:has-text("用 AI 创建")' })
  await page.getByRole('button', { name: '用 AI 创建' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/这个工作流要做什么/).fill('北森员工入职后同步到 SAP，并通知 HR 群')
  await dialog.getByRole('button', { name: '规划', exact: true }).click()
  await page.getByTestId('plan-notes').waitFor()
  const notes = await page.getByTestId('plan-notes').innerText()
  await shot('c3-unavailable-system')
  assert(notes.includes('SAP') && notes.includes('略过'), `应点名 SAP 并说明略过步骤：${notes}`)
  const review = await page.getByTestId('plan-review').innerText()
  assert(!review.includes('在 SAP 建档'), '不存在的连接器步骤不应出现在步骤里')
})

await step('C4 模型服务报错（HTTP 500）：把对方的原因原样告诉用户，不静默失败', async () => {
  await openPage({ path: `/projects/${projectId}/home`, ready: 'button:has-text("用 AI 创建")' })
  await page.getByRole('button', { name: '用 AI 创建' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/这个工作流要做什么/).fill('模型故障 员工入职')
  await dialog.getByRole('button', { name: '规划', exact: true }).click()
  await page.getByTestId('plan-error').waitFor({ timeout: 60000 })
  const text = await page.getByTestId('plan-error').innerText()
  await shot('c4-model-unreachable')
  assert(text.includes('HTTP 500') && text.includes('upstream overloaded'), `应带上对方的报错：${text}`)
  return text
})

await step('C5 模型规划没给去重键时，按触发器示例数据挑一个业务键并说明依据', async () => {
  const plan = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, modelConnectionExternalId: 'model-mock', prompt: '员工入职后通知 HR 群 无去重' } })
  assert(plan.source === 'MODEL', '应由模型规划')
  assert(plan.dedupe?.keyPath === 'employeeInfo.userID', `应从示例数据里挑出业务键：${JSON.stringify(plan.dedupe)}`)
  assert(plan.dedupe.reason.includes('示例数据') || plan.dedupe.reason.includes('sample data'), `应说明这个键是从示例数据里挑的：${plan.dedupe.reason}`)
  const applied = await h.api({ method: 'POST', path: '/ai/workflow-plans/apply', body: { projectId, plan } })
  const workflow = await h.api({ method: 'GET', path: `/workflows/${applied.workflowId}?projectId=${projectId}` })
  assert(workflow.version.trigger.settings.dedupe?.keyPath === 'employeeInfo.userID', '挑出的键应写进草稿触发器')
  const recommended = plan.recommendations.length === plan.questions.length
  assert(recommended, '模型规划的问题也要有推荐项条目')
  await dropConnections({ externalIds: ['model-mock'] })
})

await step('D1 新建工作流弹窗入口：「用 AI 生成」打开规划弹窗，项目已带上', async () => {
  await openPage({ path: `/projects/${projectId}/home`, ready: 'button:has-text("新建工作流")' })
  await page.getByRole('button', { name: '新建工作流' }).first().click()
  await page.getByRole('button', { name: '用 AI 生成' }).click()
  const dialog = page.getByRole('dialog').filter({ hasText: '用 AI 创建' })
  await dialog.waitFor()
  assert((await dialog.innerText()).includes('个人项目') || (await dialog.innerText()).includes('Dev'), '应显示目标项目')
  await shot('d1-new-workflow-entry')
})

await step('D2 工作流侧栏入口：「用 AI 创建」可用', async () => {
  await openPage({ path: `/projects/${projectId}/home`, ready: 'button:has-text("用 AI 创建")' })
  await page.getByRole('button', { name: '新建工作流' }).last().click({ trial: true }).catch(() => undefined)
  const tree = await page.getByRole('button', { name: /用 AI 创建|AI/ }).count()
  assert(tree >= 1, '项目页应至少有一个 AI 入口')
})

await step('E1 AI 草稿确认完节点后，没回答的群聊仍被通用的必填规则拦住，发布保持禁用', async () => {
  const prompt = '员工入职后开通飞书账号并通知 HR 群'
  const plan = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt } })
  assert(plan.questions.some((question) => question.startsWith('通知哪个飞书群')), '没回答时群 ID 应留空')
  const applied = await h.api({ method: 'POST', path: '/ai/workflow-plans/apply', body: { projectId, plan } })
  await openPage({ path: `/projects/${projectId}/workflows/${applied.workflowId}`, ready: '[data-tour="builder-step"]' })
  await page.getByText('AI 生成的节点待确认').waitFor({ timeout: 120000 })
  await confirmNodes(['北森员工入职', '开通飞书账号', NOTIFY_STEP])
  await page.getByText('AI 生成的节点待确认').waitFor({ state: 'detached', timeout: 60000 })
  await page.getByRole('button', { name: '校验', exact: true }).click()
  await page.getByText('群聊是必填项').first().waitFor({ timeout: 60000 })
  await shot('e1-required-after-confirm')
  assert(await page.getByRole('button', { name: '发布', exact: true }).isDisabled(), '缺群聊时发布应禁用')
  const panel = await page.locator('body').innerText()
  assert(!panel.includes('AI 生成的节点还没有确认'), '节点都确认了，不应再有待确认错误')
  const serverBlocked = await h.call({ method: 'POST', path: `/workflows/${applied.workflowId}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  assert(serverBlocked.status >= 400, '服务端不能比界面更松')
})

await step('G1 规则规划：北森员工信息变更归档到飞书多维表格，草稿带去重键', async () => {
  const plan = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '北森员工信息变更后归档到飞书多维表格' } })
  assert(plan.source === 'RULES' && plan.trigger.operationName === 'employee_changed', '触发器应是北森员工变更')
  assert(plan.steps.map((node) => node.operationName).join() === 'create_bitable_record', `步骤不对：${plan.steps.map((node) => node.operationName)}`)
  assert(plan.questions.some((question) => question.startsWith('建档写进哪张多维表格')), '应问写进哪张多维表格')
  assert(plan.dedupe.keyPath.includes('jobNumber') && plan.dedupe.keyPath.includes('startDate') && plan.dedupe.windowSeconds === 86400, `去重键不对：${JSON.stringify(plan.dedupe)}`)
  assert(plan.warnings.some((warning) => warning.includes('生效日期去重')), '要说明去重会把同一天的第二次变更当重复')
  const applied = await h.api({ method: 'POST', path: '/ai/workflow-plans/apply', body: { projectId, plan } })
  const workflow = await h.api({ method: 'GET', path: `/workflows/${applied.workflowId}?projectId=${projectId}` })
  const trigger = workflow.version.trigger
  assert(trigger.settings.dedupe?.enabled === true && trigger.settings.dedupe.keyPath === plan.dedupe.keyPath, '去重设置应写进触发器')
  assert(flattenSteps(trigger).length === 2, '草稿应有触发器加一个步骤')
})

await step('G2 规则规划：飞书事件通知到群，问事件类型和群，提示要在飞书开放平台配置', async () => {
  const plan = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '飞书收到机器人消息事件后通知 IT 群' } })
  assert(plan.trigger.connectorName === FEISHU && plan.trigger.operationName === 'event_received', '触发器应是飞书事件')
  assert(plan.steps.map((node) => node.operationName).join() === 'send_group_message', '步骤应是发群消息')
  assert(plan.questions.length === 2 && plan.questions[0].startsWith('要响应哪类飞书事件') && plan.questions[1].startsWith('通知哪个飞书群'), `问题不对：${plan.questions}`)
  const event = plan.recommendations.find((recommendation) => recommendation.question.startsWith('要响应哪类飞书事件'))
  assert(event.value === 'im.message.receive_v1' && event.basis.includes('机器人收到消息'), `事件类型推荐不对：${JSON.stringify(event)}`)
  assert(plan.dedupe.keyPath === 'header.event_id', `应按事件 ID 去重：${JSON.stringify(plan.dedupe)}`)
  assert(plan.warnings.some((warning) => warning.includes('Verification Token')) && plan.warnings.some((warning) => warning.includes('飞书开放平台')), '要提示令牌没填、订阅要在飞书开放平台配置')
  const answered = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '飞书收到机器人消息事件后通知 IT 群', answers: [{ question: plan.questions[0], answer: 'im.message.receive_v1' }, { question: plan.questions[1], answer: 'oc_it_notice' }] } })
  assert(answered.questions.length === 0 && answered.trigger.input.eventType === 'im.message.receive_v1' && answered.steps[0].input.chatId === 'oc_it_notice', `回答没带进规划：${JSON.stringify(answered.trigger.input)}`)
})

await step('G3 规则规划：每天对账北森员工变动，24 小时窗口按步骤串起来，只做汇总并说清不逐人比对', async () => {
  const plan = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '每天对账北森入职员工并通知 HR 群' } })
  assert(plan.trigger.connectorName === '@fema-ipaas/connector-schedule' && plan.trigger.operationName === 'every_day', '触发器应是每天定时')
  assert(plan.steps.map((node) => node.operationName).join() === 'get_current_date,add_subtract_date,search_changed_employees,send_group_message', `步骤不对：${plan.steps.map((node) => node.operationName)}`)
  const search = plan.steps[2].input
  assert(search.startTime.includes('step_2') && search.stopTime.includes('step_1') && search.statusScope === 'ONBOARDING', `时间窗口没串起来：${JSON.stringify(search)}`)
  assert(plan.steps[3].input.content.includes('step_3'), '通知内容应引用查询结果的数量')
  assert(plan.dedupe === null || plan.dedupe === undefined, '定时触发不需要去重')
  assert(plan.warnings.some((warning) => warning.includes('不会逐人比对')), '要说清只做汇总、不逐人比对')
  const applied = await h.api({ method: 'POST', path: '/ai/workflow-plans/apply', body: { projectId, plan } })
  const workflow = await h.api({ method: 'GET', path: `/workflows/${applied.workflowId}?projectId=${projectId}` })
  const steps = flattenSteps(workflow.version.trigger)
  assert(steps.length === 5, `草稿应有触发器加四个步骤，实际 ${steps.length}`)
  assert(steps[3].settings.input.startTime === "{{step_2['output']['result']}}", '草稿里时间窗口引用应保持')
  assert(workflow.version.trigger.settings.dedupe === undefined, '定时触发的草稿不带去重设置')
})

await step('H1 推荐答案：每个待确认问题带依据的推荐值，默认不选中，「全部采用」只填答案、不替用户提交', async () => {
  await openPage({ path: '/', ready: 'textarea[aria-label]' })
  await page.getByLabel('描述你想自动化的事情').fill(SCENARIO)
  await page.getByRole('button', { name: '开始规划' }).click()
  await page.getByTestId('plan-review').waitFor()
  const recommendations = page.getByTestId('plan-recommendation')
  assert(await recommendations.count() === 3, `三个问题都应有推荐项：${await recommendations.count()}`)
  const text = await page.getByTestId('plan-questions').innerText()
  assert(text.includes(`推荐：${HR_CHAT}`) && text.includes('已经在用这个值'), `群应推荐项目里已在用的群，并写明依据：${text}`)
  assert(text.includes(`推荐：${DEMO_BITABLE_TOKEN}`), '多维表格应推荐项目里已在写的那张')
  assert(text.includes('推荐：od-rd'), '部门应推荐项目里已用的部门')
  for (const label of [/通知哪个飞书群/, /建档写进哪张多维表格/, /新员工放进哪个飞书部门/]) {
    assert((await page.getByLabel(label).inputValue()) === '', '推荐值默认不能替用户填进回答框')
  }
  await shot('h1-recommendations')
  await page.getByRole('button', { name: '全部采用推荐答案' }).click()
  assert((await page.getByLabel(/通知哪个飞书群/).inputValue()) === HR_CHAT, '全部采用后群 ID 应填进回答框')
  assert((await page.getByLabel(/新员工放进哪个飞书部门/).inputValue()) === 'od-rd', '全部采用后部门应填进回答框')
  const footer = await page.getByTestId('plan-footer-info').innerText()
  assert(footer.includes('3 个问题未回答'), `采用只是填答案，规划要等用户点重新规划：${footer}`)
  await page.getByRole('dialog').getByRole('button', { name: '带上回答重新规划' }).click()
  await page.getByText('已全部确认').waitFor()
  await shot('h1-recommendations-applied')
})

await step('H2 步骤级移除：移除一步后重新规划并保持其余答案，可以恢复，触发器不能移除，创建的草稿没有被移除的步骤', async () => {
  const dialog = page.getByRole('dialog')
  const triggerRow = page.getByTestId('plan-step').first()
  assert(await triggerRow.getByRole('button', { name: '移除这一步' }).count() === 0, '触发器不应有移除按钮')
  await triggerRow.getByRole('img', { name: /触发器不能移除/ }).waitFor()
  assert(await page.getByTestId('plan-step').count() === 4, '移除前应有触发器加三个步骤')
  await page.getByTestId('plan-step').filter({ hasText: '在飞书多维表格建档' }).getByRole('button', { name: '移除这一步' }).click()
  await page.getByTestId('plan-removed-steps').waitFor()
  assert(await page.getByTestId('plan-step').count() === 3, '移除后应剩触发器加两个步骤')
  const removed = await page.getByTestId('plan-removed-steps').innerText()
  assert(removed.includes('在飞书多维表格建档'), `应列出已移除的步骤：${removed}`)
  const answered = await page.getByTestId('plan-questions').innerText()
  assert(answered.includes(HR_CHAT) && answered.includes('od-rd') && answered.includes('已全部确认'), `其余答案应保持：${answered}`)
  await shot('h2-step-removed')
  await page.getByTestId('plan-removed-steps').getByRole('button', { name: '恢复' }).click()
  await page.getByTestId('plan-step').nth(3).waitFor()
  assert(await page.getByTestId('plan-step').count() === 4, '恢复后应回到四行')
  await page.getByTestId('plan-step').filter({ hasText: '在飞书多维表格建档' }).getByRole('button', { name: '移除这一步' }).click()
  await page.getByTestId('plan-removed-steps').waitFor()
  await dialog.getByRole('button', { name: '创建草稿' }).click()
  await page.waitForURL(/\/workflows\/[A-Za-z0-9_-]+$/)
  const created = page.url().split('/').pop()
  const workflow = await h.api({ method: 'GET', path: `/workflows/${created}?projectId=${projectId}` })
  const steps = flattenSteps(workflow.version.trigger)
  assert(!steps.some((node) => node.settings.actionName === 'create_bitable_record'), '被移除的步骤不该出现在草稿里')
  assert(steps.map((node) => node.settings.actionName ?? node.settings.triggerName).join() === 'employee_changed,provision_user,send_group_message', `草稿步骤不对：${steps.map((node) => node.name)}`)
  assert(steps.find((node) => node.settings.actionName === 'send_group_message').settings.input.chatId === HR_CHAT, '保留的答案应带进草稿')
})

await step('K1 深色与窄窗口：弹窗里每段文字达到 WCAG AA 对比度，窄窗口不出横向滚动条，关键按钮都在视口内', async () => {
  await openPage({ path: '/', ready: 'textarea[aria-label]' })
  await page.getByLabel('描述你想自动化的事情').fill(SCENARIO)
  await page.getByRole('button', { name: '开始规划' }).click()
  await page.getByTestId('plan-review').waitFor({ timeout: 60000 })
  await page.getByTestId('plan-mapping-table-hint').waitFor()
  await page.getByRole('button', { name: '全部采用推荐答案' }).click()
  const light = await measureAll({ name: 'light-1440', dark: false, width: 1440, height: 900, requireNotice: true })
  const dark = await measureAll({ name: 'dark-1440', dark: true, width: 1440, height: 900, requireNotice: true })
  const before = await noticeWithOldColor()
  const darkMedium = await measureAll({ name: 'dark-820', dark: true, width: 820, height: 900, requireNotice: true })
  const darkNarrow = await measureAll({ name: 'dark-390', dark: true, width: 390, height: 800, requireNotice: true })
  const lightNarrow = await measureAll({ name: 'light-390', dark: false, width: 390, height: 800, requireNotice: true })
  await setTheme({ dark: false })
  await page.setViewportSize({ width: 1440, height: 900 })
  return { 对比度最低值: { 浅色: light.min, 深色: dark.min, 深色820: darkMedium.min, 深色390: darkNarrow.min, 浅色390: lightNarrow.min }, 蓝色提示: { 浅色: light.notice, 深色: dark.notice, 修复前深色: before }, 门槛: AA_NORMAL_TEXT }
})

await step('H3 弹窗里直接新建映射表：缺部门对照表时建好后自动重新规划，部门对照步骤带进草稿', async () => {
  await openPage({ path: '/', ready: 'textarea[aria-label]' })
  await page.getByLabel('描述你想自动化的事情').fill('员工入职后在飞书开通账号')
  await page.getByRole('button', { name: '开始规划' }).click()
  await page.getByTestId('plan-review').waitFor()
  const hint = page.getByTestId('plan-mapping-table-hint')
  await hint.waitFor()
  assert((await hint.innerText()).includes('项目里还没有部门对照表'), '缺映射表时应在弹窗里说出来')
  await shot('h3-mapping-hint')
  await hint.getByRole('button', { name: '新建映射表' }).click()
  const form = page.getByRole('dialog').filter({ hasText: '新建部门对照表' })
  await form.waitFor()
  await form.getByLabel('对照数据').fill('20301, od-rd\n20302, od-hr')
  await shot('h3-mapping-form')
  await form.getByRole('button', { name: '创建并重新规划' }).click()
  await form.waitFor({ state: 'detached' })
  await page.getByTestId('plan-mapping-table-hint').waitFor({ state: 'detached', timeout: 30000 })
  const stepsText = await page.getByTestId('plan-review').innerText()
  assert(stepsText.includes('部门对照') && !stepsText.includes('新员工放进哪个飞书部门'), `建好后规划应带上部门对照步骤、不再问部门：${stepsText}`)
  await shot('h3-planned-with-table')
  await page.getByRole('dialog').getByRole('button', { name: '创建草稿' }).click()
  await page.waitForURL(/\/workflows\/[A-Za-z0-9_-]+$/)
  const created = page.url().split('/').pop()
  const tables = await h.api({ method: 'GET', path: `/mapping-tables?projectId=${projectId}` })
  const table = tables.find((candidate) => candidate.name === '部门对照')
  assert(table && table.rowCount === 2, `映射表应建好并带两行：${JSON.stringify(table)}`)
  const workflow = await h.api({ method: 'GET', path: `/workflows/${created}?projectId=${projectId}` })
  const mapping = flattenSteps(workflow.version.trigger).find((node) => node.settings.actionName === 'map_fields')
  assert(mapping && JSON.stringify(mapping.settings.input).includes(table.id), '草稿里的对照步骤应引用新建的映射表')
})

await step('H4 听不懂时界面给出最接近的模板，点一个就填好描述并规划', async () => {
  await openPage({ path: '/', ready: 'textarea[aria-label]' })
  await page.getByLabel('描述你想自动化的事情').fill('帮我自动化一下')
  await page.getByRole('button', { name: '开始规划' }).click()
  await page.getByTestId('plan-error').waitFor()
  const templates = page.getByTestId('plan-closest-templates')
  await templates.waitFor()
  assert(await templates.getByRole('button').count() === 3, '应给出三个最接近的模板')
  await shot('h4-closest-templates')
  await templates.getByRole('button').first().click()
  await page.getByTestId('plan-review').waitFor()
  const description = await page.getByRole('dialog').getByLabel(/这个工作流要做什么/).inputValue()
  assert(description.length > 5 && description !== '帮我自动化一下', `点模板应把描述填好：${description}`)
  assert(await page.getByTestId('plan-error').count() === 0, '规划成功后错误提示应消失')
})

await step('K2 出错状态也过 AA：深色下的错误提示、最接近的模板，窄窗口不溢出', async () => {
  await openPage({ path: '/', ready: 'textarea[aria-label]' })
  await page.getByLabel('描述你想自动化的事情').fill('帮我自动化一下')
  await page.getByRole('button', { name: '开始规划' }).click()
  await page.getByTestId('plan-closest-templates').waitFor()
  const dark = await measureAll({ name: 'error-dark-1440', dark: true, width: 1440, height: 900, requireNotice: false })
  const narrow = await measureAll({ name: 'error-dark-390', dark: true, width: 390, height: 800, requireNotice: false })
  await setTheme({ dark: false })
  await page.setViewportSize({ width: 1440, height: 900 })
  return { 深色最低: dark.min, 窄窗口最低: narrow.min }
})

await step('F1 键盘与焦点：弹窗打开焦点在描述框，Ctrl+Enter 规划，Esc 关闭', async () => {
  await openPage({ path: `/projects/${projectId}/home`, ready: 'button:has-text("用 AI 创建")' })
  await page.getByRole('button', { name: '用 AI 创建' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByLabel(/这个工作流要做什么/).waitFor()
  await page.getByTestId('plan-no-model').or(dialog.locator('#ai-plan-model')).waitFor()
  const focused = await page.evaluate(() => document.activeElement?.tagName)
  assert(focused === 'TEXTAREA', `焦点应在描述框，实际 ${focused}`)
  await page.keyboard.type(SCENARIO)
  await page.keyboard.press('Control+Enter')
  await page.getByTestId('plan-review').waitFor({ timeout: 60000 })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
})

await browser.close()
await llm.close()
const failed = h.summary()
process.exit(failed === 0 ? 0 : 1)

async function measureAll({ name, dark, width, height, requireNotice }) {
  await setTheme({ dark })
  await page.setViewportSize({ width, height })
  await page.waitForTimeout(400)
  await shot(`k1-${name}`)
  const rows = await measureText({ page, rootSelector: '[role="dialog"]' })
  assert(rows.length > 20, `${name}：应测到弹窗里的文字，实际只有 ${rows.length} 段`)
  const failures = belowAa(rows)
  assert(failures.length === 0, `${name}：有 ${failures.length} 段文字对比度低于 AA：${describeFailures(rows)}`)
  const layout = await page.evaluate(() => {
    const dialogBox = document.querySelector('[role="dialog"]').getBoundingClientRect()
    const buttons = [...document.querySelectorAll('[role="dialog"] button')].filter((button) => /创建草稿|取消/.test(button.textContent ?? ''))
    return {
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      dialogRight: Math.round(dialogBox.right),
      dialogLeft: Math.round(dialogBox.left),
      buttonsInside: buttons.length === 2 && buttons.every((button) => {
        const box = button.getBoundingClientRect()
        return box.left >= 0 && box.right <= window.innerWidth
      }),
      width: window.innerWidth,
    }
  })
  assert(layout.overflowX <= 0, `${name}：页面出现横向滚动条，多出 ${layout.overflowX}px`)
  assert(layout.dialogLeft >= 0 && layout.dialogRight <= layout.width, `${name}：弹窗超出视口（${layout.dialogLeft} 到 ${layout.dialogRight}，视口 ${layout.width}）`)
  const cancelVisible = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].some((button) => /取消/.test(button.textContent ?? '')))
  assert(cancelVisible, `${name}：找不到「取消」`)
  if (!requireNotice) {
    return { min: Math.min(...rows.map((row) => row.ratio)), notice: null }
  }
  assert(layout.buttonsInside, `${name}：「创建草稿」「取消」没有完整落在视口内`)
  const noticeRow = rows.find((row) => row.text.startsWith('生成的每个步骤都标为'))
  assert(noticeRow, `${name}：没找到蓝色提示`)
  assert(noticeRow.ratio >= AA_NORMAL_TEXT, `${name}：蓝色提示对比度 ${noticeRow.ratio} 低于 ${AA_NORMAL_TEXT}`)
  return { min: Math.min(...rows.map((row) => row.ratio)), notice: noticeRow.ratio }
}

async function noticeWithOldColor() {
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="plan-review"] [data-slot="alert"] *').forEach((node) => {
      node.setAttribute('data-old-color', '1')
      node.style.color = 'hsl(var(--primary))'
    })
  })
  const rows = await measureText({ page, rootSelector: '[data-testid="plan-review"] [data-slot="alert"]' })
  await page.evaluate(() => {
    document.querySelectorAll('[data-old-color]').forEach((node) => {
      node.style.removeProperty('color')
      node.removeAttribute('data-old-color')
    })
  })
  return rows.find((row) => row.text.startsWith('生成的每个步骤都标为'))?.ratio ?? null
}

async function setTheme({ dark }) {
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' })
  await page.evaluate((isDark) => {
    document.documentElement.classList.remove('light', 'dark')
    document.documentElement.classList.add(isDark ? 'dark' : 'light')
  }, dark)
}

async function mockAdmin({ path, body }) {
  const response = await fetch(`${env.mock}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return response.json()
}

async function debugVerification({ workflowId }) {
  const workflow = await h.api({ method: 'GET', path: `/workflows/${workflowId}?projectId=${projectId}` })
  return h.api({ method: 'GET', path: `/workflows/${workflowId}/versions/${workflow.version.id}/debug-verification?projectId=${projectId}` })
}

async function startDebug() {
  await page.getByRole('button', { name: '调试', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[role="dialog"] textarea')?.value.includes('employeeInfo'), null, { timeout: 60000 })
  await page.getByRole('button', { name: '开始调试' }).click()
}

async function dropPendingReview({ workflowId }) {
  const workflow = await h.api({ method: 'GET', path: `/workflows/${workflowId}?projectId=${projectId}` })
  for (const node of flattenSteps(workflow.version.trigger)) {
    const { pendingReview: _dropped, ...settings } = node.settings
    const isTrigger = node.name === 'trigger'
    await h.api({
      method: 'POST',
      path: `/workflows/${workflowId}?projectId=${projectId}`,
      body: {
        type: isTrigger ? 'UPDATE_TRIGGER' : 'UPDATE_ACTION',
        request: { name: node.name, type: node.type, displayName: node.displayName, valid: node.valid, settings },
      },
    })
  }
}

async function setStepInput({ workflowId, stepName, patch }) {
  const workflow = await h.api({ method: 'GET', path: `/workflows/${workflowId}?projectId=${projectId}` })
  const node = flattenSteps(workflow.version.trigger).find((candidate) => candidate.name === stepName)
  await h.api({
    method: 'POST',
    path: `/workflows/${workflowId}?projectId=${projectId}`,
    body: {
      type: 'UPDATE_ACTION',
      request: { name: node.name, type: node.type, displayName: node.displayName, valid: node.valid, settings: { ...node.settings, input: { ...node.settings.input, ...patch } } },
    },
  })
}

async function upsertConnection({ externalId, displayName, connectorName, props }) {
  return h.api({
    method: 'POST',
    path: '/connections',
    body: { externalId, displayName, connectorName, projectId, type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props } },
  })
}

function flattenSteps(step) {
  if (!step) {
    return []
  }
  return [step, ...flattenSteps(step.nextAction), ...(step.children ?? []).flatMap(flattenSteps)]
}

async function resetState() {
  await dropConnections({ externalIds: ['beisen-main', 'feishu-main', 'model-mock', 'model-dead'] })
}

async function dropConnections({ externalIds }) {
  const existing = await h.api({ method: 'GET', path: `/connections?projectId=${projectId}&limit=100` })
  const ours = new Set(externalIds)
  await Promise.all(existing.data.filter((connection) => ours.has(connection.externalId)).map((connection) => h.call({ method: 'DELETE', path: `/connections/${connection.id}?projectId=${projectId}` })))
}

async function selectNode(name) {
  await page.locator('[data-tour="builder-step"]').filter({ hasText: name }).click({ force: true })
}

async function confirmNodes(nodeNames) {
  for (const name of nodeNames) {
    const card = page.locator('[data-tour="builder-step"]').filter({ hasText: name })
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if ((await card.getByText('待确认').count()) === 0) {
        break
      }
      await selectNode(name)
      const confirm = page.getByRole('button', { name: '确认无误' })
      const visible = await confirm.waitFor({ timeout: 20000 }).then(() => true).catch(() => false)
      if (visible) {
        await confirm.click()
        await page.waitForTimeout(2500)
      }
    }
  }
}

async function mockState() {
  const response = await fetch(`${env.mock}/__admin/state`)
  return response.json()
}

async function waitFor(probe) {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const value = await probe()
    if (value) {
      return value
    }
    await page.waitForTimeout(3000)
  }
  throw new Error('等了 120 秒仍没有出现预期结果')
}

async function login() {
  await openPage({ path: '/sign-in', ready: '[data-testid="sign-in-email"]' })
  await page.getByTestId('sign-in-email').fill(EMAIL)
  await page.getByTestId('sign-in-password').fill(PASSWORD)
  await page.getByTestId('sign-in-button').click()
  await page.waitForURL(`${env.web}/`)
}

async function openPage({ path, ready }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${env.web}${path}`, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => undefined)
    const found = await page.waitForSelector(ready, { timeout: 25000 }).then(() => true).catch(() => false)
    if (found) {
      return
    }
    await page.waitForTimeout(3000)
  }
  throw new Error(`页面没有加载出来：${path}`)
}

export { BEISEN, FEISHU, AI_CONNECTOR, HR_CHAT, shot, openPage }
