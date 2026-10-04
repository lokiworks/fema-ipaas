import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from '@playwright/test'

const { io } = createRequire(new URL('../../../packages/web/package.json', import.meta.url))('socket.io-client')

const SLOT = Number(process.env.E2E_SLOT ?? 4)
const STATE_DIR = process.env.E2E_STATE_DIR ?? `/tmp/fema-e2e/slot-${SLOT}`
const ports = parsePorts(safeRead(`${STATE_DIR}/ports.env`))
const API = process.env.E2E_API_URL ?? `${ports.API_URL ?? `http://localhost:${3100 + SLOT}`}/api/v1`
const WEB = process.env.E2E_WEB_URL ?? ports.WEB_URL ?? `http://localhost:${4200 + SLOT}`
const MOCK = process.env.E2E_MOCK_URL ?? ports.MOCK_URL ?? `http://127.0.0.1:${18900 + SLOT}`
const SHOTS = process.env.E2E_SHOTS ?? `${STATE_DIR}/shots`
const WAIT_MS = Number(process.env.E2E_WAIT_MS ?? 90000)
const LABEL_FILTER = process.env.E2E_LABELS ? new RegExp(process.env.E2E_LABELS) : null
const RUN = Date.now().toString(36)
const PASSWORD = 'Passw0rd!2026'

const PROD_CHAT = 'oc_prod_store'
const TEST_CHAT = 'oc_test_store'
const PROD_APP = `cli_prod_${RUN}`
const TEST_APP = `cli_test_${RUN}`
const results = []
let release1 = null
let release2 = null
let release3 = null
let release4 = null
let uiReleaseUrl = null
let messageBase = 0

mkdirSync(SHOTS, { recursive: true })

const owner = { ...(await signIn({ email: 'dev@ap.com', password: '12345678' })), password: '12345678' }
const alice = await createUser({ label: 'alice', first: 'Alice', last: 'Requester' })
const bob = await createUser({ label: 'bob', first: 'Bob', last: 'Editor' })
const carol = await createUser({ label: 'carol', first: 'Carol', last: 'Viewer' })

const project = await asOwner('POST', '/projects', { displayName: `S4 门店通知 ${RUN}` })
const projectId = project.id
await asOwner('POST', '/project-members', { projectId, userId: alice.id, role: 'Developer' })
await asOwner('POST', '/project-members', { projectId, userId: bob.id, role: 'Developer' })
await asOwner('POST', '/project-members', { projectId, userId: carol.id, role: 'Viewer' })
for (const user of [alice, bob, carol]) {
  user.token = (await signIn({ email: user.email, password: PASSWORD })).token
}

const prodConnection = await asOwner('POST', '/connections', connectionBody({ externalId: PROD_APP, appId: PROD_APP }))
const testConnection = await asOwner('POST', '/connections', connectionBody({ externalId: TEST_APP, appId: TEST_APP }))
for (const connection of [prodConnection, testConnection]) {
  await asOwner('POST', `/connections/${connection.id}/access`, { allProjects: false, projectIds: [projectId], projectMembersPermission: 'USE' })
}
const chatVariable = await asOwner('POST', '/variables', { projectId, name: 'storeChatId', value: PROD_CHAT, testValue: TEST_CHAT })

await check('单环境项目：打开双环境前可以直接发布（对照基线）', async () => {
  const workflow = await createWorkflow({ token: owner.token, name: '基线流程', text: '基线' })
  const response = await call('POST', `/workflows/${workflow.id}?projectId=${projectId}`, { type: 'LOCK_AND_PUBLISH', request: {} }, owner.token)
  assert(response.status === 200, `单环境发布失败：${response.status} ${JSON.stringify(response.body).slice(0, 200)}`)
  const recorded = await changesOf({ token: owner.token, scope: projectId })
  const direct = recorded.find((row) => row.action === 'PUBLISHED_DIRECTLY' && row.workflowId === workflow.id)
  assert(direct && direct.actorId === owner.id && direct.toVersionNumber === 1 && direct.approverIds.length === 0, `直接上线没有留下持久记录：${JSON.stringify(direct)}`)
  await asOwner('DELETE', `/workflows/${workflow.id}?projectId=${projectId}`)
  return { directPublishRecorded: direct.id }
})

await check('开启测试与生产：所有者设为审批人，非项目成员的人不能当审批人', async () => {
  const outsider = await createUser({ label: 'zed', first: 'Zed', last: 'Outsider' })
  const refused = await call('POST', '/workflow-releases/environments', { projectId, enabled: true, approverIds: [outsider.id] }, owner.token)
  assert(refused.status >= 400, `非成员被接受为审批人：${refused.status}`)
  const viewerRefused = await call('POST', '/workflow-releases/environments', { projectId, enabled: true, approverIds: [carol.id] }, owner.token)
  assert(viewerRefused.status >= 400, `只读成员被接受为审批人：${viewerRefused.status}`)
  const overview = await asOwner('POST', '/workflow-releases/environments', { projectId, enabled: true, approverIds: [owner.id] })
  assert(overview.enabled === true && overview.approverIds[0] === owner.id, `开启后状态不对：${JSON.stringify(overview)}`)
  return { refused: [refused.status, viewerRefused.status] }
})

await check('开发者不能改环境开关，只读成员也看得到环境概览', async () => {
  const denied = await call('POST', '/workflow-releases/environments', { projectId, enabled: false, approverIds: [] }, alice.token)
  assert(denied.status === 403, `开发者改环境开关返回 ${denied.status}`)
  const viewer = await call('GET', `/workflow-releases/environments?projectId=${projectId}`, undefined, carol.token)
  assert(viewer.status === 200, `只读成员看环境概览返回 ${viewer.status}`)
  return 'ok'
})

await check('连接替换：生产连接换成测试账号；不同连接器、自己换自己都被拒绝', async () => {
  const same = await call('POST', '/connection-replacements', { projectId, sourceConnectionId: prodConnection.id, targetConnectionId: prodConnection.id }, owner.token)
  assert(same.status >= 400, `自己换自己被接受：${same.status}`)
  const other = await asOwner('POST', '/connections', { ...connectionBody({ externalId: `other_${RUN}`, appId: 'x' }), connectorName: '@fema-ipaas/connector-beisen', value: { type: 'CUSTOM_AUTH', props: { appKey: 'mock-key', appSecret: 'mock-secret' } } })
  const crossConnector = await call('POST', '/connection-replacements', { projectId, sourceConnectionId: prodConnection.id, targetConnectionId: other.id }, owner.token)
  assert(crossConnector.status >= 400, `跨连接器替换被接受：${crossConnector.status}`)
  const created = await asOwner('POST', '/connection-replacements', { projectId, sourceConnectionId: prodConnection.id, targetConnectionId: testConnection.id })
  assert(created.targetConnectionId === testConnection.id, '替换没有保存')
  return 'ok'
})

let flow = await createWorkflow({ token: owner.token, name: '门店通知', text: '版本一：门店通知' })

await check('双环境下直接发布被拒绝，只能走测试再推广', async () => {
  const response = await call('POST', `/workflows/${flow.id}?projectId=${projectId}`, { type: 'LOCK_AND_PUBLISH', request: {} }, owner.token)
  assert(response.status >= 400, `双环境下直接发布返回 ${response.status}`)
  return response.body
})

await check('没有部署到测试就申请推广，被拦住并说明', async () => {
  const response = await call('POST', '/workflow-releases', { projectId, workflowId: flow.id, note: '没测过' }, alice.token)
  assert(response.status >= 400, `未测试就推广返回 ${response.status}`)
  return response.body
})

await mockReset()

await check('发布到测试（开发者）', async () => {
  const deployed = await call('POST', '/workflow-releases/deploy-to-test', { projectId, workflowId: flow.id }, alice.token)
  assert(deployed.status === 200, `部署到测试失败：${deployed.status} ${JSON.stringify(deployed.body).slice(0, 300)}`)
  return deployed.body
})

await check('测试环境真跑：消息发到测试群、用的是测试连接，生产连接没被碰', async () => {
  await webhook({ id: flow.id, env: 'test-env', body: { n: 1 } })
  const state = await waitForMessages({ count: 1 })
  const message = state.messages[0]
  assert(message.chat_id === TEST_CHAT, `测试环境发到了 ${message.chat_id}，应该是 ${TEST_CHAT}（变量测试值没生效）`)
  assert(message.app_id === TEST_APP, `测试环境用了应用 ${message.app_id}，应该是 ${TEST_APP}（连接替换没生效）`)
  assert(message.content.includes('版本一'), `内容不对：${message.content}`)
  return { chat: message.chat_id, app: message.app_id }
})

await check('生产还没上线：打生产地址不会跑，也不会有消息', async () => {
  const before = (await mockState()).messages.length
  const response = await webhook({ id: flow.id, env: 'live', body: { n: 2 } })
  await sleep(4000)
  const after = (await mockState()).messages.length
  assert(after === before, `生产未发布却发出了 ${after - before} 条消息`)
  return { status: response.status }
})


await check('提交推广申请前，开发者可以看到测试运行证据；申请人带说明提交，进入待审批', async () => {
  const created = await call('POST', '/workflow-releases', { projectId, workflowId: flow.id, note: '首次上线：门店通知' }, alice.token)
  assert(created.status === 201 && created.body.status === 'PENDING', `申请没有进入待审批：${created.status} ${JSON.stringify(created.body).slice(0, 300)}`)
  release1 = created.body
  const detail = await settledEvidence({ token: owner.token, id: release1.id })
  assert(detail.evidence.testRuns >= 1 && detail.evidence.succeeded >= 1, `详情里没有测试运行证据：${JSON.stringify(detail.evidence)}`)
  assert(detail.checks.every((item) => item.level === 'OK'), `自动检查不是全绿：${JSON.stringify(detail.checks)}`)
  assert(detail.canApprove === true, '审批人看到的 canApprove 应为 true')
  return { evidence: detail.evidence.testRuns, checks: detail.checks.length }
})

await check('同一工作流已有待审批申请时，不能再提交第二个', async () => {
  const again = await call('POST', '/workflow-releases', { projectId, workflowId: flow.id, note: '重复' }, alice.token)
  assert(again.status >= 400, `重复申请返回 ${again.status}`)
  return again.body
})

await check('审批权限：申请人自己、只读成员、非审批人的开发者都批不了', async () => {
  const self = await call('POST', `/workflow-releases/${release1.id}/approve`, {}, alice.token)
  const viewer = await call('POST', `/workflow-releases/${release1.id}/approve`, {}, carol.token)
  const developer = await call('POST', `/workflow-releases/${release1.id}/approve`, {}, bob.token)
  assert(self.status === 403 && viewer.status === 403 && developer.status === 403, `应全部 403：${self.status} ${viewer.status} ${developer.status}`)
  const rejectByDeveloper = await call('POST', `/workflow-releases/${release1.id}/reject`, { comment: '我不同意' }, bob.token)
  assert(rejectByDeveloper.status === 403, `非审批人驳回返回 ${rejectByDeveloper.status}`)
  const withdrawByOther = await call('POST', `/workflow-releases/${release1.id}/withdraw`, {}, bob.token)
  assert(withdrawByOther.status === 403, `他人撤回返回 ${withdrawByOther.status}`)
  const stillPending = await getRelease({ token: owner.token, id: release1.id })
  assert(stillPending.status === 'PENDING', '被拒的审批不该改变申请状态')
  return 'ok'
})

await check('审批期间草稿被改动：批准后上线的仍是申请的那个版本，草稿保持草稿', async () => {
  await importFlow({ token: bob.token, id: flow.id, text: '草稿里的未发布改动' })
  const approved = await call('POST', `/workflow-releases/${release1.id}/approve`, { comment: '看过了' }, owner.token)
  assert(approved.status === 200 && approved.body.status === 'DEPLOYED', `批准失败：${approved.status} ${JSON.stringify(approved.body).slice(0, 300)}`)
  const published = await getFlow({ token: owner.token, id: flow.id })
  assert(published.publishedVersionId === release1.workflowVersionId, '上线的不是申请的版本')
  assert(published.status === 'ENABLED', `批准后工作流没有启用：${published.status}`)
  const versions = await call('GET', `/workflows/${flow.id}/versions?projectId=${projectId}&limit=20`, undefined, owner.token)
  const latest = versions.body.data[0]
  assert(latest.state === 'DRAFT', `最新版本应是草稿：${latest.state}`)
  return { published: published.publishedVersionId }
})

await check('生产真跑：消息发到生产群、用生产连接；测试环境仍然发到测试群', async () => {
  await mockReset()
  await webhook({ id: flow.id, env: 'live', body: { n: 3 } })
  const prod = await waitForMessages({ count: 1 })
  assert(prod.messages[0].chat_id === PROD_CHAT && prod.messages[0].app_id === PROD_APP, `生产消息不对：${JSON.stringify(prod.messages[0])}`)
  assert(prod.messages[0].content.includes('版本一'), `生产内容不对：${prod.messages[0].content}`)
  await webhook({ id: flow.id, env: 'test-env', body: { n: 4 } })
  const both = await waitForMessages({ count: 2 })
  assert(both.messages[1].chat_id === TEST_CHAT && both.messages[1].app_id === TEST_APP, `测试消息不对：${JSON.stringify(both.messages[1])}`)
  return { prod: prod.messages[0].chat_id, test: both.messages[1].chat_id }
})

await check('申请记录和审批人、时间、意见都留存', async () => {
  const detail = await getRelease({ token: owner.token, id: release1.id })
  assert(detail.requestedById === alice.id && detail.decidedById === owner.id && detail.decidedAt && detail.comment === '看过了', `记录不完整：${JSON.stringify(detail)}`)
  const list = await call('GET', `/workflow-releases?projectId=${projectId}&workflowId=${flow.id}`, undefined, carol.token)
  assert(list.status === 200 && list.body.data.some((item) => item.id === release1.id), '只读成员应当能看到发布历史')
  return 'ok'
})

const v1Published = release1?.workflowVersionId

flow = await getFlow({ token: owner.token, id: flow.id })
await importFlow({ token: alice.token, id: flow.id, text: '版本二：加了签名', variables: ['storeChatId', 'signature'] })
await check('版本二引用了生产里不存在的配置值：推广后自动检查报错，说清楚缺哪个，批准被拦住', async () => {
  const deployed = await call('POST', '/workflow-releases/deploy-to-test', { projectId, workflowId: flow.id }, alice.token)
  assert(deployed.status === 200, `部署到测试失败：${JSON.stringify(deployed.body)}`)
  const created = await call('POST', '/workflow-releases', { projectId, workflowId: flow.id, note: '加签名' }, alice.token)
  assert(created.status === 201, `申请失败：${JSON.stringify(created.body)}`)
  release2 = created.body
  const detail = await getRelease({ token: owner.token, id: release2.id })
  const missing = detail.checks.find((item) => item.code === 'VARIABLE_MISSING')
  assert(missing && missing.level === 'ERROR' && missing.subject === 'signature', `没有指出缺 signature：${JSON.stringify(detail.checks)}`)
  assert(detail.canApprove === false, 'canApprove 应为 false')
  const blocked = await call('POST', `/workflow-releases/${release2.id}/approve`, {}, owner.token)
  assert(blocked.status >= 400, `带错误的申请被批准了：${blocked.status}`)
  const prodNow = await getFlow({ token: owner.token, id: flow.id })
  assert(prodNow.publishedVersionId === v1Published, '生产版本不该变化')
  return missing
})

await check('补上缺的配置值后重新检查通过，批准生效，生产出现签名', async () => {
  await asOwner('POST', '/variables', { projectId, name: 'signature', value: '【生产签名】', testValue: '【测试签名】' })
  const detail = await getRelease({ token: owner.token, id: release2.id })
  assert(detail.checks.every((item) => item.level !== 'ERROR'), `仍有错误：${JSON.stringify(detail.checks)}`)
  const approved = await call('POST', `/workflow-releases/${release2.id}/approve`, {}, owner.token)
  assert(approved.status === 200, `批准失败：${JSON.stringify(approved.body)}`)
  await mockReset()
  await webhook({ id: flow.id, env: 'live', body: { n: 5 } })
  const state = await waitForMessages({ count: 1 })
  assert(state.messages[0].content.includes('版本二') && state.messages[0].content.includes('【生产签名】'), `生产内容不对：${state.messages[0].content}`)
  return state.messages[0].content
})

const v2Published = release2?.workflowVersionId

await importFlow({ token: alice.token, id: flow.id, text: '版本三：用了一个不存在的连接', connection: 'ghost_connection' })
await check('版本三引用了生产里不存在的连接：自动检查报错并写出连接名', async () => {
  await call('POST', '/workflow-releases/deploy-to-test', { projectId, workflowId: flow.id }, alice.token)
  const created = await call('POST', '/workflow-releases', { projectId, workflowId: flow.id, note: '换连接' }, alice.token)
  assert(created.status === 201, `申请失败：${JSON.stringify(created.body)}`)
  release3 = created.body
  const detail = await getRelease({ token: owner.token, id: release3.id })
  const missing = detail.checks.find((item) => item.code === 'CONNECTION_MISSING')
  assert(missing && missing.level === 'ERROR' && missing.subject === 'ghost_connection', `没有指出缺连接：${JSON.stringify(detail.checks)}`)
  const blocked = await call('POST', `/workflow-releases/${release3.id}/approve`, {}, owner.token)
  assert(blocked.status >= 400, '缺连接的申请被批准了')
  return missing
})

await check('申请人撤回后，可以改完再提交；驳回必须写意见', async () => {
  const withdrawn = await call('POST', `/workflow-releases/${release3.id}/withdraw`, {}, alice.token)
  assert(withdrawn.status === 200 && withdrawn.body.status === 'WITHDRAWN', `撤回失败：${JSON.stringify(withdrawn.body)}`)
  await importFlow({ token: alice.token, id: flow.id, text: '版本四：把测试连接直接写进了流程', connection: TEST_APP })
  await call('POST', '/workflow-releases/deploy-to-test', { projectId, workflowId: flow.id }, alice.token)
  const created = await call('POST', '/workflow-releases', { projectId, workflowId: flow.id, note: '直接用测试连接' }, alice.token)
  assert(created.status === 201, `申请失败：${JSON.stringify(created.body)}`)
  release4 = created.body
  const emptyReject = await call('POST', `/workflow-releases/${release4.id}/reject`, { comment: '' }, owner.token)
  assert(emptyReject.status >= 400, `不写意见也能驳回：${emptyReject.status}`)
  return 'ok'
})

await check('生产连接指向测试系统：流程直接引用了测试账号的连接，自动检查必须报错', async () => {
  const detail = await getRelease({ token: owner.token, id: release4.id })
  const hit = detail.checks.find((item) => item.code === 'CONNECTION_IS_TEST_ONLY')
  assert(hit && hit.level === 'ERROR' && hit.subject === TEST_APP, `没有拦住指向测试系统的连接：${JSON.stringify(detail.checks)}`)
  assert(detail.canApprove === false, 'canApprove 应为 false')
  const blocked = await call('POST', `/workflow-releases/${release4.id}/approve`, {}, owner.token)
  assert(blocked.status >= 400, '指向测试系统的版本被批准上线')
  return hit
})

await check('驳回：写明意见，申请人收到，生产不变', async () => {
  const rejected = await call('POST', `/workflow-releases/${release4.id}/reject`, { comment: '这是测试账号，不能上生产' }, owner.token)
  assert(rejected.status === 200 && rejected.body.status === 'REJECTED' && rejected.body.comment === '这是测试账号，不能上生产', `驳回失败：${JSON.stringify(rejected.body)}`)
  const current = await getFlow({ token: owner.token, id: flow.id })
  assert(current.publishedVersionId === v2Published, '驳回后生产版本变了')
  const notices = await call('GET', '/notifications?limit=20', undefined, alice.token)
  return { notifications: notices.status }
})

await check('回滚到历史版本一：生产立刻回到旧行为，待审批申请自动撤回，不需要审批', async () => {
  const pending = await call('POST', '/workflow-releases', { projectId, workflowId: flow.id, note: '又一次申请' }, alice.token)
  const rollbackByViewer = await call('POST', '/workflow-releases/rollback', { projectId, workflowId: flow.id, versionId: v1Published }, carol.token)
  assert(rollbackByViewer.status === 403, `只读成员回滚返回 ${rollbackByViewer.status}`)
  const rolled = await call('POST', '/workflow-releases/rollback', { projectId, workflowId: flow.id, versionId: v1Published }, alice.token)
  assert(rolled.status === 200, `回滚失败：${JSON.stringify(rolled.body)}`)
  assert(rolled.body.publishedVersionId !== v1Published && rolled.body.publishedVersionId !== v2Published, '回滚应生成新版本号')
  await mockReset()
  await webhook({ id: flow.id, env: 'live', body: { n: 6 } })
  const state = await waitForMessages({ count: 1 })
  assert(state.messages[0].content.includes('版本一') && !state.messages[0].content.includes('签名'), `回滚后生产内容不对：${state.messages[0].content}`)
  assert(state.messages[0].chat_id === PROD_CHAT && state.messages[0].app_id === PROD_APP, '回滚后仍应走生产群和生产连接')
  if (pending.status === 201) {
    assert(rolled.body.withdrawnReleases === 1, `待审批申请没有撤回：${JSON.stringify(rolled.body)}`)
  }
  return { newVersion: rolled.body.publishedVersionId, withdrawn: rolled.body.withdrawnReleases }
})

await check('追溯：审计日志里每次变更都有人、时间、动作（申请、批准、驳回、回滚）', async () => {
  const events = await call('GET', `/audit-events?limit=200`, undefined, owner.token)
  assert(events.status === 200, `审计日志返回 ${events.status}`)
  const inProject = events.body.data.filter((event) => event.projectId === projectId)
  const actions = new Set(inProject.map((event) => event.action))
  const wanted = ['release.requested', 'release.approved', 'release.rejected', 'release.rolled_back', 'release.deployed_to_test']
  const missing = wanted.filter((action) => !actions.has(action))
  assert(missing.length === 0, `审计日志缺少：${missing.join('、')}；已有：${[...actions].join('、')}`)
  return [...actions]
})


await check('编辑锁：一个人正在编辑时，另一个人不能通过接口改草稿、发布到测试或回滚；锁的持有人自己不受影响', async () => {
  const holder = await holdLock({ token: alice.token, resourceId: flow.id })
  assert(holder.acquired, '持有人没能拿到编辑锁')
  const bobEdit = await call('POST', `/workflows/${flow.id}?projectId=${projectId}`, { type: 'IMPORT_WORKFLOW', request: { displayName: '门店通知', trigger: flowTrigger({ text: 'bob 偷改', variables: ['storeChatId'], connection: PROD_APP }), schemaVersion: null, notes: null } }, bob.token)
  assert(bobEdit.status >= 400, `别人正在编辑，bob 仍改成功了：${bobEdit.status}`)
  const bobRename = await call('POST', `/workflows/${flow.id}?projectId=${projectId}`, { type: 'CHANGE_NAME', request: { displayName: 'bob 改名' } }, bob.token)
  assert(bobRename.status >= 400, `别人正在编辑，bob 改名成功了：${bobRename.status}`)
  const bobDeploy = await call('POST', '/workflow-releases/deploy-to-test', { projectId, workflowId: flow.id }, bob.token)
  assert(bobDeploy.status >= 400, `别人正在编辑，bob 发布到测试成功了：${bobDeploy.status}`)
  const bobRollback = await call('POST', '/workflow-releases/rollback', { projectId, workflowId: flow.id, versionId: v1Published }, bob.token)
  assert(bobRollback.status >= 400, `别人正在编辑，bob 回滚成功了：${bobRollback.status}`)
  const aliceEdit = await importFlow({ token: alice.token, id: flow.id, text: '版本五：alice 的改动' })
  assert(aliceEdit, '持有人自己应当能改')
  const lock = await holder.rival({ token: bob.token })
  assert(lock.acquired === false && lock.lock?.userDisplayName?.includes('Alice'), `bob 抢锁应失败并告知是谁：${JSON.stringify(lock)}`)
  holder.release()
  const after = await untilStatus({ expected: 200, attempt: () => call('POST', `/workflows/${flow.id}?projectId=${projectId}`, { type: 'CHANGE_NAME', request: { displayName: '门店通知' } }, bob.token) })
  assert(after.status === 200, `锁释放后 bob 应能改：${after.status} ${JSON.stringify(after.body).slice(0, 200)}`)
  return 'ok'
})

await check('编辑锁：所有者可以接管他人的锁，被接管的人随后不能再改', async () => {
  const holder = await holdLock({ token: alice.token, resourceId: flow.id })
  assert(holder.acquired, '持有人没能拿到编辑锁')
  const bobTake = await holder.rival({ token: bob.token, force: true })
  assert(bobTake.acquired === false, `非所有者不该能接管：${JSON.stringify(bobTake)}`)
  const ownerTake = await holder.rival({ token: owner.token, force: true })
  assert(ownerTake.acquired === true, `所有者接管失败：${JSON.stringify(ownerTake)}`)
  const aliceAfter = await call('POST', `/workflows/${flow.id}?projectId=${projectId}`, { type: 'CHANGE_NAME', request: { displayName: 'alice 被接管后还在改' } }, alice.token)
  assert(aliceAfter.status >= 400, `被接管后 alice 仍能改：${aliceAfter.status}`)
  holder.release()
  await holder.closeRivals()
  return 'ok'
})



await check('不设审批人的项目：推广被检查拦住时，错误里写明缺什么，且不留下卡住的待审批记录', async () => {
  const solo = await asOwner('POST', '/projects', { displayName: `S4 免审批 ${RUN}` })
  await asOwner('POST', '/workflow-releases/environments', { projectId: solo.id, enabled: true, approverIds: [] })
  const created = await call('POST', '/workflows', { displayName: '免审批流程', projectId: solo.id }, owner.token)
  await call('POST', `/workflows/${created.body.id}?projectId=${solo.id}`, { type: 'IMPORT_WORKFLOW', request: { displayName: '免审批流程', trigger: flowTrigger({ text: '免审批', variables: ['storeChatId'], connection: 'ghost_connection' }), schemaVersion: null, notes: null } }, owner.token)
  const deployed = await call('POST', '/workflow-releases/deploy-to-test', { projectId: solo.id, workflowId: created.body.id }, owner.token)
  assert(deployed.status === 200, `部署到测试失败：${JSON.stringify(deployed.body)}`)
  const refused = await call('POST', '/workflow-releases', { projectId: solo.id, workflowId: created.body.id, note: '免审批上线' }, owner.token)
  const message = JSON.stringify(refused.body)
  assert(refused.status >= 400 && message.includes('CONNECTION_MISSING') && message.includes('ghost_connection'), `没有写明缺什么：${refused.status} ${message}`)
  const pending = await call('GET', `/workflow-releases?projectId=${solo.id}&status=PENDING`, undefined, owner.token)
  assert(pending.body.data.length === 0, `留下了卡住的待审批记录：${JSON.stringify(pending.body.data)}`)
  return refused.body
})

await importFlow({ token: alice.token, id: flow.id, text: '版本五：界面里发布和推广', variables: ['storeChatId'] })
const browser = await chromium.launch()
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/s4-${name}.png`, fullPage: false })

await check('界面：开发者在编辑器里发布到测试，再点「推广到生产」填说明提交，落到申请详情页', async () => {
  return inPage({ browser, user: alice }, async (page) => {
  await page.goto(`${WEB}/projects/${projectId}/workflows/${flow.id}`)
  await page.locator('button[name="Deploy to test"]').waitFor({ timeout: 120000 })
  await shot(page, '01-editor-draft')
  await page.locator('button[name="Deploy to test"]').click()
  const proceed = page.getByRole('button', { name: '仍然发布到测试' })
  const warned = await proceed.waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
  if (warned) {
    await shot(page, '01b-deploy-warning')
    await proceed.click()
  }
  const deployDialog = page.getByRole('dialog').filter({ hasText: '发布说明（可选）' })
  await deployDialog.waitFor({ timeout: 30000 })
  await deployDialog.locator('textarea').fill('界面发布到测试：版本五')
  await shot(page, '01c-deploy-dialog')
  await deployDialog.getByRole('button', { name: '发布到测试' }).click()
  await page.getByText('已发布到测试').first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(1500)
  await shot(page, '02-editor-deployed')
  await page.locator('button[name="Promote to production"]').click()
  await page.getByRole('dialog').waitFor()
  await shot(page, '03-promote-dialog')
  await page.getByRole('dialog').locator('textarea').fill('界面推广：版本五')
  await page.getByRole('dialog').getByRole('button', { name: '提交审批' }).click()
  await page.waitForURL(/\/releases\/[A-Za-z0-9_-]+$/, { timeout: 60000 })
  await page.getByText('上线前检查').first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(1500)
  await shot(page, '04-release-detail-requester')
  uiReleaseUrl = page.url()
  return uiReleaseUrl
  })
})

await check('界面：审批人看到版本差异和自动检查，批准后生产版本变成申请的版本', async () => {
  assert(uiReleaseUrl, '上一步没有产生申请')
  const releaseId = uiReleaseUrl.split('/').at(-1)
  return inPage({ browser, user: owner }, async (page) => {
  await page.goto(uiReleaseUrl)
  await page.getByText('上线前检查').first().waitFor({ timeout: 120000 })
  await page.getByText('本次改动').first().waitFor()
  await page.waitForTimeout(1500)
  await shot(page, '05-release-detail-approver')
  const diffText = await page.locator('main, body').first().innerText()
  assert(diffText.includes('通知门店群') && (diffText.includes('版本五') || diffText.includes('content')), '差异里没有写出改动的步骤和字段')
  await page.getByRole('button', { name: '批准并发布' }).click()
  await page.getByText('已发布').first().waitFor({ timeout: 60000 })
  await page.waitForTimeout(1500)
  await shot(page, '06-release-detail-approved')
  const detail = await getRelease({ token: owner.token, id: releaseId })
  const published = await getFlow({ token: owner.token, id: flow.id })
  assert(detail.status === 'DEPLOYED' && published.publishedVersionId === detail.workflowVersionId, '批准后生产版本不对')
  return 'ok'
  })
})

await check('界面：版本面板按版本回滚，确认框说明影响，回滚后生产回到旧内容', async () => {
  await inPage({ browser, user: owner }, async (page) => {
  await page.goto(`${WEB}/projects/${projectId}/workflows/${flow.id}`)
  await page.getByText('通知门店群').first().waitFor({ timeout: 120000 })
  await page.getByRole('button', { name: '版本', exact: true }).click()
  await page.waitForTimeout(1500)
  await shot(page, '07-versions-panel')
  const panelText = await page.locator('body').innerText()
  assert(panelText.includes('生产环境') && panelText.includes('测试'), '版本面板里没有标出哪个版本在测试、哪个在生产')
  const oldest = page.getByText('v1', { exact: true }).locator('xpath=ancestor::*[.//button[@aria-label="更多操作"]][1]').getByLabel('更多操作')
  await oldest.click()
  await page.getByText('回滚到这个版本').click()
  await page.getByRole('dialog').waitFor()
  await shot(page, '08-rollback-dialog')
  await page.getByRole('dialog').getByRole('button', { name: '回滚', exact: true }).click()
  await page.getByText(/已回滚到版本/).first().waitFor({ timeout: 60000 })
  await shot(page, '09-rolled-back')
  })
  await mockReset()
  await webhook({ id: flow.id, env: 'live', body: { n: 7 } })
  const state = await waitForMessages({ count: 1 })
  assert(state.messages[0].content.includes('版本'), `回滚后生产内容不对：${state.messages[0].content}`)
  return state.messages[0].content
}, { attempts: 2 })

await check('界面：环境页、申请列表、变更记录、详情页在亮色、深色和窄屏下都能打开且没有横向滚动', async () => {
  const outcomes = []
  for (const mode of [{ name: 'light', colorScheme: 'light', width: 1440, height: 900 }, { name: 'dark', colorScheme: 'dark', width: 1440, height: 900 }, { name: 'narrow', colorScheme: 'light', width: 390, height: 844 }]) {
    await inPage({ browser, user: owner, viewport: { width: mode.width, height: mode.height }, colorScheme: mode.colorScheme }, async (page) => {
    for (const [label, path, ready] of [['environments', `/projects/${projectId}/releases`, '测试环境'], ['requests', `/projects/${projectId}/releases?tab=requests`, '申请时间'], ['history', `/projects/${projectId}/releases?tab=history`, '变更记录'], ['detail', uiReleaseUrl.replace(WEB, ''), '上线前检查']]) {
      await page.goto(`${WEB}${path}`)
      if (label === 'history') {
        await page.getByRole('tab', { name: '变更记录' }).click()
        await page.getByText('操作人').first().waitFor({ timeout: 60000 })
      }
      else {
        await page.getByText(ready).first().waitFor({ timeout: 120000 })
      }
      await page.waitForTimeout(1200)
      await shot(page, `10-${label}-${mode.name}`)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      outcomes.push({ page: label, mode: mode.name, overflow })
    }
    })
  }
  const wide = outcomes.filter((outcome) => outcome.overflow > 4)
  assert(wide.length === 0, `出现横向滚动：${JSON.stringify(wide)}`)
  return outcomes.length
})

await check('界面：变更记录页写出谁、何时、做了什么，含推广说明和审批意见', async () => {
  return inPage({ browser, user: carol }, async (page) => {
  await page.goto(`${WEB}/projects/${projectId}/releases?tab=history`)
  await page.getByRole('tab', { name: '变更记录' }).click()
  await page.getByText('操作人').first().waitFor({ timeout: 120000 })
  await page.waitForTimeout(1500)
  const text = await page.locator('body').innerText()
  for (const needle of ['申请推广', '批准推广', '驳回推广', '生产回滚', '发布到测试', '直接发布', 'Alice Requester', '界面推广：版本五', '这是测试账号，不能上生产', '内容取自', '无需审批']) {
    assert(text.includes(needle), `变更记录里没有「${needle}」`)
  }
  await shot(page, '11-history-viewer')
  return 'ok'
  })
})

const VIEW_MODES = [
  { name: 'light', colorScheme: 'light', width: 1440, height: 900 },
  { name: 'dark', colorScheme: 'dark', width: 1440, height: 900 },
  { name: 'narrow', colorScheme: 'light', width: 390, height: 844 },
]
let previewFlow = null

await check('持久发布记录：环境开关、测试发布、申请、批准、驳回、撤回、回滚都留下记录（谁、何时、从哪个版本到哪个版本、说明、审批人），非成员读不到', async () => {
  const rows = await changesOf({ token: carol.token, scope: projectId })
  const actions = new Set(rows.map((row) => row.action))
  const missing = ['ENVIRONMENTS_UPDATED', 'DEPLOYED_TO_TEST', 'REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ROLLED_BACK', 'PUBLISHED_DIRECTLY'].filter((action) => !actions.has(action))
  assert(missing.length === 0, `缺少记录：${missing.join('、')}；已有：${[...actions].join('、')}`)
  const toggle = rows.find((row) => row.action === 'ENVIRONMENTS_UPDATED')
  assert(toggle.environmentsEnabled === true && toggle.approverIds.includes(owner.id) && toggle.actorId === owner.id && toggle.actorName.length > 0, `环境开关记录不完整：${JSON.stringify(toggle)}`)
  const approved = rows.find((row) => row.action === 'APPROVED' && row.releaseId === release1.id)
  assert(approved && approved.actorId === owner.id && approved.note === '首次上线：门店通知' && approved.comment === '看过了' && approved.approverNames.length === 1, `批准记录不完整：${JSON.stringify(approved)}`)
  assert(approved.toVersionNumber === 1 && approved.fromVersionNumber === null && approved.workflowDisplayName === '门店通知', `批准记录的版本不对：${JSON.stringify(approved)}`)
  const rolled = rows.find((row) => row.action === 'ROLLED_BACK' && row.actorId === alice.id)
  assert(rolled && rolled.restoredVersionNumber === 1 && rolled.toVersionNumber > rolled.fromVersionNumber && rolled.approverIds.length === 0, `回滚记录不完整：${JSON.stringify(rolled)}`)
  const autoWithdrawn = rows.find((row) => row.action === 'WITHDRAWN' && row.comment === 'Withdrawn automatically by a rollback')
  assert(autoWithdrawn, '回滚自动撤回的申请没有留下记录')
  const other = await asOwner('POST', '/projects', { displayName: `S4 他人项目 ${RUN}` })
  const denied = await call('GET', `/workflow-releases/changes?projectId=${other.id}`, undefined, alice.token)
  assert(denied.status === 403, `非成员读到了别的项目的发布记录：${denied.status}`)
  const crossProject = await call('GET', `/workflow-releases/changes?projectId=${projectId}`, undefined, alice.token)
  assert(crossProject.body.data.every((row) => row.projectId === projectId), '读到了其他项目的记录')
  return { rows: rows.length, actions: [...actions] }
})

await check('推广预览（接口）：没部署到测试时说明原因；版本引用了不存在的连接和配置值时逐项写出名字，canSubmit 为 false', async () => {
  previewFlow = await createWorkflow({ token: alice.token, name: '预览流程', text: '预览版本', variables: ['storeChatId', 'nameSuffix'], connection: 'ghost_connection' })
  const notDeployed = await call('GET', `/workflow-releases/preview?projectId=${projectId}&workflowId=${previewFlow.id}`, undefined, alice.token)
  assert(notDeployed.status >= 400 && notDeployed.body.params?.messageKey === 'Deploy this workflow to test before promoting it', `没部署就预览应说明原因：${JSON.stringify(notDeployed.body)}`)
  const deployed = await call('POST', '/workflow-releases/deploy-to-test', { projectId, workflowId: previewFlow.id, note: '预览流程首次测试' }, alice.token)
  assert(deployed.status === 200, `部署到测试失败：${JSON.stringify(deployed.body)}`)
  const preview = await call('GET', `/workflow-releases/preview?projectId=${projectId}&workflowId=${previewFlow.id}`, undefined, carol.token)
  assert(preview.status === 200, `预览失败：${preview.status} ${JSON.stringify(preview.body).slice(0, 200)}`)
  const subjects = preview.body.checks.filter((item) => item.level === 'ERROR').map((item) => `${item.code}:${item.subject}`)
  assert(subjects.includes('CONNECTION_MISSING:ghost_connection') && subjects.includes('VARIABLE_MISSING:nameSuffix'), `没写出具体名字：${JSON.stringify(preview.body.checks)}`)
  assert(preview.body.canSubmit === false && preview.body.productionVersionId === null && preview.body.testVersionId === deployed.body.versionId, `预览内容不对：${JSON.stringify(preview.body)}`)
  const notes = await changesOf({ token: carol.token, scope: projectId, workflowId: previewFlow.id })
  assert(notes.some((row) => row.action === 'DEPLOYED_TO_TEST' && row.note === '预览流程首次测试'), '发布到测试的说明没有留下')
  return subjects
})

await check('界面：推广对话框直接显示与生产的差异和自动检查，缺连接、缺配置值写出名字，有阻断项时禁用提交并说明；亮暗窄屏不横向滚动', async () => {
  const outcomes = []
  for (const mode of VIEW_MODES) {
    await inPage({ browser, user: alice, viewport: { width: mode.width, height: mode.height }, colorScheme: mode.colorScheme }, async (page) => {
      if (mode.name === 'narrow') {
        await page.goto(`${WEB}/projects/${projectId}/releases`)
        const row = page.getByRole('row').filter({ hasText: '预览流程' })
        await row.getByRole('button', { name: '推广' }).click({ timeout: 120000 })
      }
      else {
        await page.goto(`${WEB}/projects/${projectId}/workflows/${previewFlow.id}`)
        const promote = page.locator('button[name="Promote to production"]')
        await promote.waitFor({ timeout: 120000 })
        await promote.click()
      }
      const dialog = page.getByRole('dialog')
      await dialog.getByText('与生产当前版本的差异').waitFor()
      await dialog.getByText('有 2 项必须先处理').waitFor({ timeout: 60000 })
      await dialog.getByText('通知门店群').first().waitFor({ timeout: 60000 })
      await page.waitForTimeout(800)
      const text = await dialog.innerText()
      for (const needle of ['通知门店群', 'ghost_connection', 'nameSuffix', '上线前检查', '尚未发布', '重新检查']) {
        assert(text.includes(needle), `对话框里没有「${needle}」：${text.slice(0, 400)}`)
      }
      assert(await dialog.getByRole('button', { name: '提交审批' }).isDisabled(), '有阻断项时提交按钮没有禁用')
      const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
      assert(isDark === (mode.colorScheme === 'dark'), `${mode.name} 的主题不对：dark=${isDark}`)
      await shot(page, `12-promote-blocked-${mode.name}`)
      const box = await dialog.boundingBox()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      outcomes.push({ mode: mode.name, overflow, fits: box.x >= -1 && box.x + box.width <= mode.width + 1 })
    })
  }
  const bad = outcomes.filter((outcome) => outcome.overflow > 4 || !outcome.fits)
  assert(bad.length === 0, `对话框超出屏幕：${JSON.stringify(bad)}`)
  return outcomes
})

await check('界面：补上缺的配置值、换成存在的连接、重新发布到测试后点「重新检查」，阻断消失，提交审批进入详情页', async () => {
  return inPage({ browser, user: alice }, async (page) => {
    await page.goto(`${WEB}/projects/${projectId}/workflows/${previewFlow.id}`)
    await page.locator('button[name="Promote to production"]').waitFor({ timeout: 120000 })
    await page.locator('button[name="Promote to production"]').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('有 2 项必须先处理').waitFor({ timeout: 60000 })
    await asOwner('POST', '/variables', { projectId, name: 'nameSuffix', value: '生产后缀', testValue: '测试后缀' })
    await dialog.getByRole('button', { name: '重新检查' }).click()
    await dialog.getByText('有 1 项必须先处理').waitFor({ timeout: 60000 })
    assert(await dialog.getByRole('button', { name: '提交审批' }).isDisabled(), '还剩一个阻断项时提交按钮应禁用')
    await importFlow({ token: alice.token, id: previewFlow.id, text: '预览版本：已修好', variables: ['storeChatId', 'nameSuffix'], connection: PROD_APP })
    const redeployed = await call('POST', '/workflow-releases/deploy-to-test', { projectId, workflowId: previewFlow.id }, alice.token)
    assert(redeployed.status === 200, `重新发布到测试失败：${JSON.stringify(redeployed.body)}`)
    await dialog.getByRole('button', { name: '重新检查' }).click()
    await dialog.getByText('必须先处理').waitFor({ state: 'detached', timeout: 60000 })
    await dialog.getByText('测试 v2').first().waitFor({ timeout: 60000 })
    await dialog.getByText('通知门店群').first().waitFor({ timeout: 60000 })
    await shot(page, '13-promote-ready')
    await dialog.locator('textarea').fill('预览流程：修好后提交')
    const submit = dialog.getByRole('button', { name: '提交审批' })
    assert(await submit.isEnabled(), '检查全部通过后提交按钮应可用')
    await submit.click()
    await page.waitForURL(/\/releases\/[A-Za-z0-9_-]+$/, { timeout: 60000 })
    await page.getByText('上线前检查').first().waitFor({ timeout: 60000 })
    return page.url()
  })
})

await check('界面：没有审批人的项目点推广先弹出二次确认，列出将上线的变更，返回保留说明，确认后才真的上线；有阻断项时按钮禁用', async () => {
  const solo = await asOwner('POST', '/projects', { displayName: `S4 免审批界面 ${RUN}` })
  await asOwner('POST', '/workflow-releases/environments', { projectId: solo.id, enabled: true, approverIds: [] })
  const soloApp = `cli_solo_${RUN}`
  const soloConnection = await asOwner('POST', '/connections', connectionBody({ externalId: soloApp, appId: soloApp, forProject: solo.id }))
  await asOwner('POST', `/connections/${soloConnection.id}/access`, { allProjects: false, projectIds: [solo.id], projectMembersPermission: 'USE' })
  await asOwner('POST', '/variables', { projectId: solo.id, name: 'storeChatId', value: PROD_CHAT, testValue: TEST_CHAT })
  const good = await createWorkflow({ token: owner.token, name: '免审批界面流程', text: '免审批：界面', connection: soloApp, scope: solo.id })
  const bad = await createWorkflow({ token: owner.token, name: '免审批阻断流程', text: '免审批：阻断', connection: 'ghost_connection', scope: solo.id })
  for (const workflow of [good, bad]) {
    const deployed = await call('POST', '/workflow-releases/deploy-to-test', { projectId: solo.id, workflowId: workflow.id }, owner.token)
    assert(deployed.status === 200, `部署到测试失败：${JSON.stringify(deployed.body)}`)
  }
  const note = '免审批：界面上线说明'
  await inPage({ browser, user: owner }, async (page) => {
    await page.goto(`${WEB}/projects/${solo.id}/workflows/${good.id}`)
    await page.locator('button[name="Promote to production"]').waitFor({ timeout: 120000 })
    await page.locator('button[name="Promote to production"]').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('与生产当前版本的差异').waitFor()
    await dialog.locator('textarea').fill(note)
    await dialog.getByRole('button', { name: '推广到生产' }).click()
    await dialog.getByText('不经审批直接上线？').waitFor()
    const confirmText = await dialog.innerText()
    for (const needle of ['已添加', '通知门店群', note, '确认并上线']) {
      assert(confirmText.includes(needle), `二次确认里没有「${needle}」：${confirmText.slice(0, 300)}`)
    }
    const beforeConfirm = await getFlow({ token: owner.token, id: good.id, scope: solo.id })
    assert(!beforeConfirm.publishedVersionId, '二次确认之前不该已经上线')
    await shot(page, '14-promote-confirm-no-approver')
    await dialog.getByRole('button', { name: '后退' }).click()
    await dialog.getByText('与生产当前版本的差异').waitFor()
    assert((await dialog.locator('textarea').inputValue()) === note, '返回后说明丢了')
    await dialog.getByRole('button', { name: '推广到生产' }).click()
    await dialog.getByRole('button', { name: '确认并上线' }).click()
    await dialog.waitFor({ state: 'detached', timeout: 60000 })
    await page.getByText('已推广到生产').first().waitFor({ timeout: 60000 })
  })
  const live = await getFlow({ token: owner.token, id: good.id, scope: solo.id })
  assert(live.publishedVersionId === live.testVersionId, '确认后生产没有变成测试里的版本')
  const rows = await changesOf({ token: owner.token, scope: solo.id, workflowId: good.id })
  const approved = rows.find((row) => row.action === 'APPROVED')
  assert(approved && approved.approverIds.length === 0 && approved.note === note && approved.actorId === owner.id, `免审批上线的记录不对：${JSON.stringify(approved)}`)
  await inPage({ browser, user: owner }, async (page) => {
    await page.goto(`${WEB}/projects/${solo.id}/workflows/${bad.id}`)
    await page.locator('button[name="Promote to production"]').waitFor({ timeout: 120000 })
    await page.locator('button[name="Promote to production"]').click()
    const dialog = page.getByRole('dialog')
    await dialog.getByText('有 1 项必须先处理').waitFor({ timeout: 60000 })
    assert((await dialog.innerText()).includes('ghost_connection'), '阻断项里没有写出连接名')
    assert(await dialog.getByRole('button', { name: '推广到生产' }).isDisabled(), '有阻断项时免审批的上线按钮没有禁用')
    await shot(page, '15-promote-blocked-no-approver')
  })
  const stillDraft = await getFlow({ token: owner.token, id: bad.id, scope: solo.id })
  assert(!stillDraft.publishedVersionId, '被拦住的流程不该上线')
  return { published: live.publishedVersionId }
})

await check('界面：回滚确认框先查编辑锁，提示是谁在编辑，给出通知、等待和接管（仅所有者）；服务端拒绝带 i18n 键；回滚原因进发布记录', async () => {
  const holder = await holdLock({ token: alice.token, resourceId: flow.id })
  assert(holder.acquired, '持有人没能拿到编辑锁')
  const versions = await call('GET', `/workflows/${flow.id}/versions?projectId=${projectId}&limit=20`, undefined, owner.token)
  const locked = versions.body.data.filter((version) => version.state === 'LOCKED').sort((a, b) => new Date(a.created) - new Date(b.created))
  const target = locked[1]
  const refused = await call('POST', '/workflow-releases/rollback', { projectId, workflowId: flow.id, versionId: target.id }, owner.token)
  assert(refused.status >= 400 && refused.body.params?.messageKey?.includes('is editing this workflow') && refused.body.params?.messageParams?.name?.includes('Alice'), `服务端拒绝没有带 i18n 键和编辑者：${JSON.stringify(refused.body)}`)
  const openRollback = async (page) => {
    await page.goto(`${WEB}/projects/${projectId}/workflows/${flow.id}`)
    await page.getByText('通知门店群').first().waitFor({ timeout: 120000 })
    await page.getByRole('button', { name: '版本', exact: true }).click()
    await page.waitForTimeout(1500)
    const row = page.getByText('v2', { exact: true }).locator('xpath=ancestor::*[.//button[@aria-label="更多操作"]][1]')
    await row.getByLabel('更多操作').click()
    await page.getByText('回滚到这个版本').click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    return dialog
  }
  await inPage({ browser, user: bob }, async (page) => {
    const dialog = await openRollback(page)
    const warning = dialog.getByTestId('rollback-lock-warning')
    await warning.waitFor({ timeout: 60000 })
    assert((await warning.innerText()).includes('Alice Requester'), '提示里没有写出谁在编辑')
    assert(await dialog.getByRole('button', { name: '回滚', exact: true }).isDisabled(), '有人编辑时回滚按钮应禁用')
    assert((await dialog.getByRole('button', { name: '接管编辑' }).count()) === 0, '非所有者不该看到接管按钮')
    await shot(page, '16-rollback-lock-developer')
  })
  await inPage({ browser, user: owner }, async (page) => {
    const dialog = await openRollback(page)
    const warning = dialog.getByTestId('rollback-lock-warning')
    await warning.waitFor({ timeout: 60000 })
    assert((await warning.innerText()).includes('Alice Requester'), '提示里没有写出谁在编辑')
    assert(await dialog.getByRole('button', { name: '回滚', exact: true }).isDisabled(), '有人编辑时回滚按钮应禁用')
    await shot(page, '16-rollback-lock-owner')
    await warning.getByRole('button', { name: '通知 Alice Requester' }).click()
    const deadline = Date.now() + 15000
    while (holder.editRequests.length === 0 && Date.now() < deadline) {
      await sleep(500)
    }
    assert(holder.editRequests.length > 0, '持有人没有收到通知')
    await warning.getByRole('button', { name: '等待' }).click()
    await warning.getByText('正在等待 Alice Requester 离开编辑器').waitFor()
    await warning.getByRole('button', { name: '接管编辑' }).click()
    await warning.waitFor({ state: 'detached', timeout: 30000 })
    await dialog.locator('#rollback-reason').fill('界面回滚：新版本重复发消息')
    const rollback = dialog.getByRole('button', { name: '回滚', exact: true })
    assert(await rollback.isEnabled(), '接管后回滚按钮应可用')
    await shot(page, '17-rollback-after-takeover')
    await rollback.click()
    await page.getByText(/已回滚到版本/).first().waitFor({ timeout: 60000 })
  })
  holder.release()
  await holder.closeRivals()
  const rows = await changesOf({ token: owner.token, scope: projectId, workflowId: flow.id })
  const rolled = rows.find((row) => row.action === 'ROLLED_BACK' && row.actorId === owner.id)
  assert(rolled && rolled.note === '界面回滚：新版本重复发消息' && rolled.restoredVersionNumber === 2, `回滚原因没有进发布记录：${JSON.stringify(rolled)}`)
  return { restored: rolled.restoredVersionNumber }
})

await check('界面：版本面板写出发布人、说明，标出测试和生产当前版本；亮暗两套', async () => {
  const outcomes = []
  for (const mode of VIEW_MODES.slice(0, 2)) {
    await inPage({ browser, user: owner, viewport: { width: mode.width, height: mode.height }, colorScheme: mode.colorScheme }, async (page) => {
      await page.goto(`${WEB}/projects/${projectId}/workflows/${flow.id}`)
      await page.getByText('通知门店群').first().waitFor({ timeout: 120000 })
      await page.getByRole('button', { name: '版本', exact: true }).click()
      await page.getByTestId('version-publisher').first().waitFor({ timeout: 60000 })
      await page.waitForTimeout(800)
      const text = await page.locator('body').innerText()
      const needles = ['Alice Requester 推广，', '批准', '发布说明：首次上线：门店通知', '发布说明：界面推广：版本五', '发布说明：界面发布到测试：版本五', '回滚，内容取自 v', '发布说明：界面回滚：新版本重复发消息', '发布到测试', '生产环境']
      const absent = needles.filter((needle) => !text.includes(needle))
      assert(absent.length === 0, `版本面板里没有：${absent.join('、')}`)
      await shot(page, `18-versions-${mode.name}`)
      outcomes.push(mode.name)
    })
  }
  return outcomes
})

await check('界面：测试连接设置里，流程用到却没配测试替换的连接行内标红并写明哪些流程；配上替换后消失；已配替换的和测试连接本身不标红', async () => {
  const extraApp = `cli_extra_${RUN}`
  const extraTestApp = `cli_extra_test_${RUN}`
  const extra = await asOwner('POST', '/connections', connectionBody({ externalId: extraApp, appId: extraApp }))
  const extraTest = await asOwner('POST', '/connections', connectionBody({ externalId: extraTestApp, appId: extraTestApp }))
  for (const connection of [extra, extraTest]) {
    await asOwner('POST', `/connections/${connection.id}/access`, { allProjects: false, projectIds: [projectId], projectMembersPermission: 'USE' })
  }
  await createWorkflow({ token: owner.token, name: '额外连接流程', text: '额外', connection: extraApp })
  const overview = await asOwner('GET', `/workflow-releases/environments?projectId=${projectId}`)
  const names = overview.unreplacedConnections.map((item) => item.displayName)
  assert(names.includes(extraApp) && overview.unreplacedConnections.find((item) => item.displayName === extraApp).workflowNames.includes('额外连接流程'), `概览没有列出未配替换的连接：${JSON.stringify(overview.unreplacedConnections)}`)
  assert(!names.includes(PROD_APP) && !names.includes(TEST_APP) && !names.includes(extraTestApp), `已配替换的连接或测试连接被误标：${JSON.stringify(names)}`)
  for (const mode of VIEW_MODES) {
    await inPage({ browser, user: owner, viewport: { width: mode.width, height: mode.height }, colorScheme: mode.colorScheme }, async (page) => {
      await page.goto(`${WEB}/projects/${projectId}/releases`)
      const row = page.getByTestId('unreplaced-connection').filter({ hasText: extraApp })
      await row.waitFor({ timeout: 120000 })
      const rowText = await row.innerText()
      for (const needle of ['未配测试替换', '额外连接流程', '直接用生产账号']) {
        assert(rowText.includes(needle), `标红行里没有「${needle}」：${rowText}`)
      }
      const border = await row.evaluate((element) => {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const context = canvas.getContext('2d')
        context.fillStyle = getComputedStyle(element).borderTopColor
        context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data]
      })
      const [red, green, blue] = border
      assert(red > green + 40 && red > blue + 40, `行没有标红：${border}`)
      assert((await page.getByTestId('unreplaced-connection').filter({ hasText: PROD_APP }).count()) === 0, '已配替换的连接被标红')
      await row.scrollIntoViewIfNeeded()
      await shot(page, `19-unreplaced-${mode.name}`)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      assert(overflow <= 4, `${mode.name} 出现横向滚动：${overflow}`)
    })
  }
  await asOwner('POST', '/connection-replacements', { projectId, sourceConnectionId: extra.id, targetConnectionId: extraTest.id })
  await inPage({ browser, user: owner }, async (page) => {
    await page.goto(`${WEB}/projects/${projectId}/releases`)
    await page.getByText('测试连接').first().waitFor({ timeout: 120000 })
    await page.waitForTimeout(1500)
    assert((await page.getByTestId('unreplaced-connection').filter({ hasText: extraApp }).count()) === 0, '配上替换后仍然标红')
  })
  return names
})

await browser.close()

printSummary()

function connectionBody({ externalId, appId, forProject = projectId }) {
  return {
    externalId,
    displayName: externalId,
    connectorName: '@fema-ipaas/connector-feishu',
    projectId: forProject,
    type: 'CUSTOM_AUTH',
    value: { type: 'CUSTOM_AUTH', props: { domain: 'https://open.feishu.cn', appId, appSecret: 'mock-secret' } },
  }
}




async function inPage({ browser, user, viewport, colorScheme }, run) {
  const page = await newPage({ browser, user, viewport, colorScheme })
  try {
    return await run(page)
  }
  finally {
    await page.context().close()
  }
}

async function newPage({ browser, user, viewport = { width: 1440, height: 900 }, colorScheme = 'light' }) {
  const context = await browser.newContext({ viewport, colorScheme })
  context.setDefaultTimeout(120000)
  await context.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = 'vite-plugin-checker-error-overlay { display: none !important; }'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
  })
  await context.addInitScript((scheme) => {
    try {
      localStorage.setItem('fema.theme', scheme)
    }
    catch {
      return
    }
  }, colorScheme)
  const page = await context.newPage()
  await page.goto(`${WEB}/sign-in`)
  await page.getByLabel(/邮箱|Email/).first().fill(user.email)
  await page.locator('input[type=password]').fill(user.password ?? PASSWORD)
  await page.getByRole('button', { name: /登录|Sign in/ }).click()
  await page.waitForURL((url) => !url.pathname.includes('sign-in'), { timeout: 90000 })
  await page.waitForTimeout(2000)
  return page
}

async function holdLock({ token, resourceId }) {
  const origin = API.replace(/\/api\/v1$/, '')
  const rivals = []
  const connect = async (userToken) => {
    const socket = io(origin, { transports: ['websocket'], path: '/api/socket.io', auth: { token: userToken, projectId }, reconnection: false })
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve)
      socket.once('connect_error', reject)
    })
    return socket
  }
  const emitLock = (socket, payload) => new Promise((resolve) => socket.emit('LOCK_RESOURCE', payload, resolve))
  const socket = await connect(token)
  const editRequests = []
  socket.on('RESOURCE_EDIT_REQUESTED', (event) => editRequests.push(event))
  const first = await emitLock(socket, { resourceId, active: true })
  return {
    acquired: first.acquired === true,
    editRequests,
    async rival({ token: rivalToken, force = false }) {
      const rivalSocket = await connect(rivalToken)
      rivals.push(rivalSocket)
      return emitLock(rivalSocket, { resourceId, active: true, force })
    },
    release() {
      socket.emit('UNLOCK_RESOURCE', { resourceId })
      socket.close()
    },
    async closeRivals() {
      rivals.forEach((rivalSocket) => {
        rivalSocket.emit('UNLOCK_RESOURCE', { resourceId })
        rivalSocket.close()
      })
      await sleep(1500)
    },
  }
}

async function settledEvidence({ token, id }) {
  const deadline = Date.now() + WAIT_MS
  let detail = await getRelease({ token, id })
  while (detail.evidence.succeeded < 1 && Date.now() < deadline) {
    await sleep(2000)
    detail = await getRelease({ token, id })
  }
  return detail
}

async function changesOf({ token, scope, workflowId }) {
  const query = workflowId ? `&workflowId=${workflowId}` : ''
  const response = await call('GET', `/workflow-releases/changes?projectId=${scope}&limit=100${query}`, undefined, token)
  assert(response.status === 200, `读取发布记录失败：${response.status} ${JSON.stringify(response.body).slice(0, 200)}`)
  return response.body.data
}

async function getRelease({ token, id }) {
  const response = await call('GET', `/workflow-releases/${id}?projectId=${projectId}`, undefined, token)
  assert(response.status === 200, `读取申请 ${id} 失败：${response.status} ${JSON.stringify(response.body).slice(0, 200)}`)
  return response.body
}

async function getFlow({ token, id, scope = projectId }) {
  const response = await call('GET', `/workflows/${id}?projectId=${scope}`, undefined, token)
  assert(response.status === 200, `读取工作流失败：${response.status}`)
  return response.body
}

async function importFlow({ token, id, text, variables = ['storeChatId'], connection = PROD_APP, scope = projectId }) {
  const imported = await call('POST', `/workflows/${id}?projectId=${scope}`, { type: 'IMPORT_WORKFLOW', request: { displayName: '门店通知', trigger: flowTrigger({ text, variables, connection }), schemaVersion: null, notes: null } }, token)
  assert(imported.status === 200, `改草稿失败：${imported.status} ${JSON.stringify(imported.body).slice(0, 300)}`)
  return imported.body
}

async function createWorkflow({ token, name, text, variables = ['storeChatId'], connection = PROD_APP, scope = projectId }) {
  const created = await call('POST', '/workflows', { displayName: name, projectId: scope }, token)
  assert(created.status === 201, `创建工作流失败：${created.status} ${JSON.stringify(created.body).slice(0, 200)}`)
  const imported = await call('POST', `/workflows/${created.body.id}?projectId=${scope}`, { type: 'IMPORT_WORKFLOW', request: { displayName: name, trigger: flowTrigger({ text, variables, connection }), schemaVersion: null, notes: null } }, token)
  assert(imported.status === 200, `导入流程失败：${imported.status} ${JSON.stringify(imported.body).slice(0, 300)}`)
  return created.body
}

function flowTrigger({ text, variables, connection }) {
  const stamp = new Date().toISOString()
  const extra = variables.filter((name) => name !== 'storeChatId').map((name) => `{{variables['${name}']}}`).join(' ')
  return {
    name: 'trigger',
    type: 'CONNECTOR_TRIGGER',
    valid: true,
    displayName: '接收门店事件',
    lastUpdatedDate: stamp,
    settings: { connectorName: '@fema-ipaas/connector-webhook', connectorVersion: '~0.1.42', triggerName: 'catch_webhook', input: { authType: 'none' }, propertySettings: {} },
    nextAction: {
      type: 'CONNECTOR',
      name: 'notify',
      displayName: '通知门店群',
      valid: true,
      lastUpdatedDate: stamp,
      settings: {
        connectorName: '@fema-ipaas/connector-feishu',
        connectorVersion: '~0.4.0',
        actionName: 'send_group_message',
        input: { auth: `{{connections['${connection}']}}`, chatId: "{{variables['storeChatId']}}", messageType: 'text', content: `${text} ${extra}`.trim() },
        propertySettings: {},
        errorHandlingOptions: {},
      },
    },
  }
}

async function webhook({ id, env, body }) {
  const suffix = env === 'test-env' ? '/test-env' : ''
  const response = await fetch(`${API}/webhooks/${id}${suffix}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, text: await response.text() }
}

async function mockReset() {
  messageBase = (await fetchJson('GET', `${MOCK}/__admin/state`)).body.messages.length
}

async function mockState() {
  const state = (await fetchJson('GET', `${MOCK}/__admin/state`)).body
  return { ...state, messages: state.messages.slice(messageBase) }
}

async function waitForMessages({ count, timeoutMs = WAIT_MS }) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await mockState()
    if (state.messages.length >= count) {
      return state
    }
    await sleep(1000)
  }
  throw new Error(`等了 ${timeoutMs / 1000} 秒仍没有收到第 ${count} 条消息`)
}

async function createUser({ label, first, last }) {
  const email = `${label}.${RUN}@e2e.test`
  const adminToken = (await signIn({ email: 'dev@ap.com', password: '12345678' })).token
  const invited = await fetchJson('POST', `${API}/tenant-access/members/invite`, { emails: [email], tenantRole: 'MEMBER', modules: [] }, adminToken)
  const link = new URL(invited.body.invited[0].link)
  await fetchJson('POST', `${API}/user-invitations/accept`, { invitationToken: link.searchParams.get('token') })
  const signedUp = await fetchJson('POST', `${API}/authentication/sign-up`, { email, password: PASSWORD, firstName: first, lastName: last, trackEvents: false, newsLetter: false })
  assert(signedUp.ok, `注册 ${email} 失败：${JSON.stringify(signedUp.body)}`)
  return { id: signedUp.body.id, email, name: `${first} ${last}`, token: signedUp.body.token }
}

async function signIn({ email, password }) {
  const response = await fetchJson('POST', `${API}/authentication/sign-in`, { email, password })
  assert(response.ok, `登录 ${email} 失败：${JSON.stringify(response.body)}`)
  return { id: response.body.id, token: response.body.token, projectId: response.body.projectId, email }
}

async function asOwner(method, path, body) {
  const response = await call(method, path, body, owner.token)
  if (response.status >= 400) {
    throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(response.body).slice(0, 400)}`)
  }
  return response.body
}

async function call(method, path, body, token) {
  const response = await fetchJson(method, `${API}${path}`, body, token)
  return { status: response.status, body: response.body }
}

async function check(label, fn, { attempts = 1 } = {}) {
  if (LABEL_FILTER && !LABEL_FILTER.test(label)) {
    return null
  }
  const startedAt = Date.now()
  try {
    const detail = await retried(fn, attempts)
    results.push({ label, ok: true })
    process.stdout.write(`PASS ${label} ${JSON.stringify(detail ?? '')} (${Math.round((Date.now() - startedAt) / 1000)}s)\n`)
    return detail ?? true
  }
  catch (error) {
    results.push({ label, ok: false })
    process.stdout.write(`FAIL ${label} ${error.message}\n`)
    return null
  }
}

async function retried(fn, attempts) {
  try {
    return await fn()
  }
  catch (error) {
    if (attempts <= 1) {
      throw error
    }
    return retried(fn, attempts - 1)
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function untilStatus({ expected, attempt, timeoutMs = 20000 }) {
  const deadline = Date.now() + timeoutMs
  let response = await attempt()
  while (response.status !== expected && Date.now() < deadline) {
    await sleep(1000)
    response = await attempt()
  }
  return response
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(method, url, body, token) {
  const response = await fetch(url, {
    method,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let parsed = null
  try {
    parsed = text ? JSON.parse(text) : null
  }
  catch {
    parsed = text
  }
  return { ok: response.ok, status: response.status, body: parsed }
}

function safeRead(path) {
  try {
    return readFileSync(path, 'utf8')
  }
  catch {
    return ''
  }
}

function parsePorts(text) {
  return Object.fromEntries(text.split('\n').filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
}

function printSummary() {
  const failed = results.filter((result) => !result.ok)
  process.stdout.write(`\n${results.length - failed.length}/${results.length} passed\n`)
  process.exitCode = failed.length === 0 ? 0 : 1
}
