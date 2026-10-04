import { chromium } from '@playwright/test'
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
const page = await context.newPage()
page.setDefaultTimeout(60000)
const shot = (name) => page.screenshot({ path: `${env.shotDir}/s1-${name}.png` })

await resetState()
await login()

await step('A1 无模型：接口用规则规划出场景里的三个步骤和待确认问题', async () => {
  const plan = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: SCENARIO } })
  assert(plan.source === 'RULES', `来源应为规则，实际 ${plan.source}`)
  assert(plan.steps.map((step) => step.operationName).join() === 'create_bitable_record,provision_user,send_group_message', `步骤不对：${plan.steps.map((step) => step.operationName)}`)
  assert(plan.questions.length === 3, `应有 3 个待确认问题，实际 ${plan.questions.length}`)
  assert(plan.steps[1].input.employeeNo.includes('jobNumber'), '员工字段没有预填')
  return { steps: plan.steps.length, questions: plan.questions.length }
})

await step('A2 无模型：听不懂、系统里没有的连接器、删除账号都给出可读结果', async () => {
  const vague = await h.call({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '帮我自动化一下' } })
  assert(vague.status >= 400 && JSON.stringify(vague.body).includes('没有听出要做的事'), `模糊描述应被拒绝：${vague.status} ${JSON.stringify(vague.body)}`)
  const sap = await h.call({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '员工入职后在 SAP 里建档' } })
  assert(sap.status >= 400 && JSON.stringify(sap.body).includes('SAP'), `只提到没有的系统应被拒绝并点名：${JSON.stringify(sap.body)}`)
  const mixed = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '北森员工入职后开通飞书账号，再同步到金蝶' } })
  assert(mixed.unavailableSystems.join() === '金蝶' && mixed.steps.length === 1, `应只生成能做的步骤并点名金蝶：${JSON.stringify(mixed.unavailableSystems)}`)
  const del = await h.api({ method: 'POST', path: '/ai/workflow-plans', body: { projectId, prompt: '员工离职后删除飞书账号并通知 IT 群' } })
  assert(del.steps.some((step) => step.operationName === 'suspend_user') && !del.steps.some((step) => step.operationName.includes('delete')), '删除账号应改为暂停')
  assert(del.warnings.some((warning) => warning.includes('不提供删除飞书账号')), '应说明为什么不删除')
})

await step('A3 首页：一句话输入后，无模型也能规划，列出步骤、待确认问题和连接', async () => {
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
})

let draftId = null
await step('A4 无连接、问题未回答也能创建草稿，进入编辑器后所有节点标待确认', async () => {
  await page.getByRole('dialog').getByRole('button', { name: '创建草稿' }).click()
  await page.waitForURL(/\/workflows\/[A-Za-z0-9_-]+$/)
  draftId = page.url().split('/').pop()
  await page.getByText('AI 生成的节点待确认').waitFor({ timeout: 90000 })
  await shot('a4-editor-draft')
  const pending = await page.getByText('待确认', { exact: true }).count()
  assert(pending >= 4, `应有 4 个节点标待确认，实际 ${pending}`)
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
  await page.getByLabel(/建档写进哪张多维表格/).fill('https://example.feishu.cn/base/bascnDemo1234567890')
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


const names = ['北森员工入职', '在飞书多维表格建档', '开通飞书账号', '通知HR 群']
let mockBefore = null
await step('B3 逐个确认节点，补选数据表，确认完后没有任何错误和待确认', async () => {
  await page.waitForTimeout(500)
  await confirmNodes(names)
  await selectNode(names[1])
  await page.getByText('入参', { exact: true }).first().click()
  await page.getByText('数据表', { exact: true }).first().waitFor()
  await page.locator('button[role="combobox"]').last().click({ timeout: 120000 })
  await page.getByRole('option', { name: '员工花名册' }).click({ timeout: 120000 })
  await page.waitForTimeout(3000)
  await page.getByText('AI 生成的节点待确认').waitFor({ state: 'detached', timeout: 30000 })
  await shot('b3-all-confirmed')
  const workflow = await h.api({ method: 'GET', path: `/workflows/${draft2}?projectId=${projectId}` })
  const steps = flattenSteps(workflow.version.trigger)
  assert(steps.every((node) => node.settings.pendingReview !== true), '确认后 pendingReview 应被清掉')
  assert(workflow.version.valid === true, '确认并补全后版本应有效')
  assert(await page.getByText('需要修复').count() === 0, '画布上不应再有「需要修复」')
})

await step('B4 调试：生成默认触发数据，真的写入模拟的飞书和多维表格', async () => {
  mockBefore = await mockState()
  await page.getByRole('button', { name: '调试', exact: true }).click()
  const payload = page.getByRole('dialog').getByRole('textbox')
  await page.waitForFunction(() => document.querySelector('[role="dialog"] textarea')?.value.includes('employeeInfo'), null, { timeout: 60000 })
  assert((await payload.inputValue()).includes('employeeInfo'), '调试数据应默认带上触发器的示例数据，不用手写')
  await shot('b4-debug-dialog')
  await page.getByRole('button', { name: '开始调试' }).click()
  const state = await waitFor(async () => {
    const now = await mockState()
    const records = now.bitableRecords.length - mockBefore.bitableRecords.length
    const users = now.feishuUsers.length - mockBefore.feishuUsers.length
    const notes = now.messages.filter((message) => message.chat_id === HR_CHAT).length - mockBefore.messages.filter((message) => message.chat_id === HR_CHAT).length
    return records === 1 && users === 1 && notes === 1 ? { records, users, notes } : null
  })
  await shot('b4-debug-done')
  return state
})

await step('B5 发布：确认后可以发布，服务端状态是已发布', async () => {
  await openPage({ path: `/projects/${projectId}/workflows/${draft2}`, ready: 'button[name="Publish"]' })
  await page.waitForTimeout(3000)
  await page.locator('button[name="Publish"]').dispatchEvent('click')
  const reminder = page.getByRole('dialog').filter({ hasText: '仍要发布' })
  await reminder.waitFor({ timeout: 5000 }).catch(() => undefined)
  if (await reminder.isVisible().catch(() => false)) {
    await reminder.getByRole('button', { name: '仍然发布' }).click()
  }
  const workflow = await waitFor(async () => {
    const current = await h.api({ method: 'GET', path: `/workflows/${draft2}?projectId=${projectId}` })
    return current.publishedVersionId && current.status === 'ENABLED' ? current : null
  })
  await shot('b5-published')
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
await step('C1 项目页入口：用模型规划，回答问题后生成草稿，字段按回答预填', async () => {
  assert(modelReady, '没有模型连接')
  await openPage({ path: `/projects/${projectId}/home`, ready: 'button:has-text("用 AI 创建")' })
  await page.getByRole('button', { name: '用 AI 创建' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/这个工作流要做什么/).fill(SCENARIO)
  await dialog.getByRole('button', { name: '规划', exact: true }).click()
  await page.getByTestId('plan-review').waitFor()
  assert((await page.getByTestId('plan-source').innerText()).includes('模型规划'), '应标明由模型规划')
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
  await confirmNodes(['北森员工入职', '开通飞书账号', '通知HR 群'])
  await page.getByText('AI 生成的节点待确认').waitFor({ state: 'detached', timeout: 60000 })
  await page.getByRole('button', { name: '校验', exact: true }).click()
  await page.getByText('群聊是必填项').first().waitFor({ timeout: 60000 })
  await shot('e1-required-after-confirm')
  assert(await page.getByRole('button', { name: '发布', exact: true }).isDisabled(), '缺群聊时发布应禁用')
  const panel = await page.locator('body').innerText()
  assert(!panel.includes('AI 生成的节点还没有确认'), '节点都确认了，不应再有待确认错误')
})

await step('F1 键盘与焦点：弹窗打开焦点在描述框，Ctrl+Enter 规划，Esc 关闭', async () => {
  await openPage({ path: `/projects/${projectId}/home`, ready: 'button:has-text("用 AI 创建")' })
  await page.getByRole('button', { name: '用 AI 创建' }).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.waitFor()
  await dialog.getByText('规划方式').waitFor()
  const focused = await page.evaluate(() => document.activeElement?.tagName)
  assert(focused === 'TEXTAREA', `焦点应在描述框，实际 ${focused}`)
  await page.keyboard.type(SCENARIO)
  await page.keyboard.press('Control+Enter')
  await page.getByTestId('plan-review').waitFor({ timeout: 60000 })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
})

await step('F2 深色和窄窗口截图（人工对照记录差距）', async () => {
  await openPage({ path: '/', ready: 'textarea[aria-label]' })
  await page.getByRole('button', { name: '入职开通账号' }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByTestId('plan-review').waitFor({ timeout: 60000 })
  await shot('f2-light-1440')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.evaluate(() => { document.documentElement.classList.add('dark') })
  await shot('f2-dark-1440')
  await page.setViewportSize({ width: 820, height: 900 })
  await shot('f2-dark-820')
  await page.setViewportSize({ width: 390, height: 800 })
  await shot('f2-dark-390')
  await page.emulateMedia({ colorScheme: 'light' })
  await page.evaluate(() => { document.documentElement.classList.remove('dark') })
  await page.setViewportSize({ width: 390, height: 800 })
  await shot('f2-light-390')
  await page.setViewportSize({ width: 1440, height: 900 })
})

await browser.close()
await llm.close()
const failed = h.summary()
process.exit(failed === 0 ? 0 : 1)

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
  const existing = await h.api({ method: 'GET', path: `/connections?projectId=${projectId}&limit=100` })
  const ours = new Set(['beisen-main', 'feishu-main', 'model-mock', 'model-dead'])
  await Promise.all(existing.data.filter((connection) => ours.has(connection.externalId)).map((connection) => h.call({ method: 'DELETE', path: `/connections/${connection.id}?projectId=${projectId}` })))
}

async function selectNode(name) {
  await page.locator('[data-tour="builder-step"]').filter({ hasText: name }).click({ force: true })
}

async function pendingCount() {
  const text = await page.getByText('AI 生成的节点待确认').first().innerText().catch(() => '')
  const matched = text.match(/(\d+)\s*个/)
  return matched ? Number(matched[1]) : 0
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
    await page.goto(`${env.web}${path}`)
    const found = await page.waitForSelector(ready, { timeout: 25000 }).then(() => true).catch(() => false)
    if (found) {
      return
    }
    await page.waitForTimeout(3000)
  }
  throw new Error(`页面没有加载出来：${path}`)
}

export { BEISEN, FEISHU, AI_CONNECTOR, HR_CHAT, shot, openPage }
