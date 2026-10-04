import { createRequire } from 'node:module'
import { API, api, assert, check, codeStep, deleteFlowsNamed, http, secretsOf, sleep, waitFor, webhookTrigger } from './s5-kit.mjs'

const require = createRequire(new URL('../../../../packages/web/package.json', import.meta.url))
const { io } = require('socket.io-client')

const SOCKET_ORIGIN = API.replace(/\/api\/v1$/, '')

export async function websocketChecks({ admin, member }) {
  const tag = String(1000 + Math.floor(Math.random() * 8999))
  const secrets = secretsOf({ tag })
  const flow = await check('编辑器测试：准备草稿工作流（含手机号步骤、敏感节点、引用敏感节点的下游步骤）', async () => {
    await deleteFlowsNamed({ session: admin, prefix: 'S5WS ' })
    return createDraft({ admin, secrets })
  })
  if (!flow) {
    return
  }
  const listeners = [await listen({ user: admin, name: 'admin' }), await listen({ user: { ...member, projectId: admin.projectId }, name: 'member' })]
  await sleep(1500)

  const plain = await check('编辑器测试：测试含手机号的步骤，管理员和成员同时在线', async () => {
    const results = await testStep({ admin, flow, stepName: 'step_1', listeners })
    assert(results.admin && results.member, `两边都应收到结果 ${JSON.stringify({ admin: !!results.admin, member: !!results.member })}`)
    return results
  })
  if (plain) {
    await check('编辑器测试：无查看原文权限的成员收到的结果不含手机号、身份证、邮箱原文', async () => {
      const text = JSON.stringify(plain.member)
      const leaks = [secrets.mobile, secrets.idCard, secrets.email, secrets.token].filter((value) => text.includes(value))
      assert(leaks.length === 0, `成员收到原文：${leaks}`)
      assert(text.includes('139****'), `成员收到的结果里没有脱敏形态 ${text.slice(0, 300)}`)
    })
    await check('编辑器测试：有查看原文权限的管理员仍收到原文（编辑器要用它搭映射）', async () => {
      const text = JSON.stringify(plain.admin)
      assert(text.includes(secrets.mobile) && text.includes(secrets.idCard), `管理员没收到原文 ${text.slice(0, 300)}`)
    })
    await check('编辑器测试：嵌套的敏感字段（对象里数组里的手机号）和错误输出也被遮住', async () => {
      const text = JSON.stringify(plain.member)
      assert(!text.includes(secrets.contactPlain) && !text.includes(secrets.spouseMobile), `嵌套字段泄露 ${text.slice(0, 400)}`)
    })
  }

  const sensitive = await check('编辑器测试：测试标了「出参敏感」的节点', async () => {
    const results = await testStep({ admin, flow, stepName: 'step_2', listeners })
    assert(results.admin && results.member, '两边都应收到结果')
    return results
  })
  if (sensitive) {
    await check('编辑器测试：敏感节点的出参对所有人（包括有查看原文权限的管理员）都已遮住', async () => {
      const leaks = [secrets.grade, secrets.memo, String(secrets.salary)].filter((value) => JSON.stringify(sensitive.member).includes(value) || JSON.stringify(sensitive.admin).includes(value))
      assert(leaks.length === 0, `敏感出参泄露：${leaks}`)
    })
    await saveSampleData({ admin, flow, stepName: 'step_2', payload: { salary: secrets.salary, grade: secrets.grade, memo: secrets.memo } })
    await check('编辑器测试：下游步骤入参里来自敏感节点的值，成员和管理员收到的都已遮住', async () => {
      const results = await testStep({ admin, flow, stepName: 'step_3', listeners })
      assert(results.admin && results.member, '两边都应收到结果')
      const leaks = [secrets.grade, secrets.memo].filter((value) => JSON.stringify(results.member).includes(value) || JSON.stringify(results.admin).includes(value))
      assert(leaks.length === 0, `下游泄露：${leaks} ${JSON.stringify(results.member).slice(0, 300)}`)
    })
  }

  await check('编辑器测试：把成员加入「可以查看原文」后，成员也收到原文', async () => {
    const settings = await api({ method: 'GET', path: '/privacy-settings', token: admin.token })
    await api({ method: 'POST', path: '/privacy-settings', body: { ...pickSettings(settings), rawViewRoles: ['OWNER', 'ADMIN', 'MEMBER'] }, token: admin.token })
    try {
      const results = await testStep({ admin, flow, stepName: 'step_1', listeners })
      assert(JSON.stringify(results.member).includes(secrets.mobile), '成员有权限后仍没收到原文')
    }
    finally {
      await api({ method: 'POST', path: '/privacy-settings', body: pickSettings(settings), token: admin.token })
    }
  })
  await check('编辑器测试：被拒绝的连接（别人的令牌连别人的项目）收不到任何测试结果', async () => {
    const intruder = await listen({ user: { token: 'invalid-token', projectId: admin.projectId }, name: 'intruder', expectConnected: false })
    const results = await testStep({ admin, flow, stepName: 'step_1', listeners: [...listeners, intruder] })
    assert(results.intruder === undefined, '无效令牌的连接收到了结果')
    intruder.close()
  })
  listeners.forEach((listener) => listener.close())
}

function pickSettings(settings) {
  const { logRetentionDays, payloadLevel, rawPayloadRetentionDays, maskRules, rawViewRoles, requireRawViewReason } = settings
  return { logRetentionDays, payloadLevel, rawPayloadRetentionDays, maskRules, rawViewRoles, requireRawViewReason }
}

async function createDraft({ admin, secrets }) {
  const displayName = 'S5WS 编辑器测试'
  const created = await api({ method: 'POST', path: '/workflows', body: { displayName, projectId: admin.projectId }, token: admin.token })
  const trigger = webhookTrigger({
    displayName: '接收员工数据',
    nextAction: codeStep({
      name: 'step_1',
      displayName: '整理员工资料',
      code: 'export const code = async (inputs) => ({ profile: inputs.employee, contacts: inputs.contacts, family: inputs.family, note: inputs.note, failNote: inputs.employee.mobile })',
      input: {
        employee: { mobile: secrets.mobile, idCard: secrets.idCard, email: secrets.email, name: secrets.name, apiToken: secrets.token },
        contacts: [{ phone: secrets.contactPlain }, { phone: secrets.contactSpaced }],
        family: { spouse: { contactMobile: secrets.spouseMobile } },
        note: `紧急联系人手机 ${secrets.noteMobile}`,
      },
      nextAction: codeStep({
        name: 'step_2',
        displayName: '薪资核算',
        sensitive: true,
        code: `export const code = async () => ({ salary: ${secrets.salary}, grade: '${secrets.grade}', memo: '${secrets.memo}' })`,
        input: {},
        nextAction: codeStep({
          name: 'step_3',
          displayName: '通知 HR',
          code: 'export const code = async (inputs) => ({ sent: true, text: inputs.text })',
          input: { text: "备注：{{step_2['output']['memo']}}，职级 {{step_2['output']['grade']}}" },
        }),
      }),
    }),
  })
  await api({ method: 'POST', path: `/workflows/${created.id}?projectId=${admin.projectId}`, body: { type: 'IMPORT_WORKFLOW', request: { displayName, trigger, schemaVersion: null, notes: null } }, token: admin.token })
  const draft = await api({ method: 'GET', path: `/workflows/${created.id}?projectId=${admin.projectId}`, token: admin.token })
  return { workflowId: created.id, versionId: draft.version.id }
}

async function saveSampleData({ admin, flow, stepName, payload }) {
  await api({
    method: 'POST',
    path: `/workflows/${flow.workflowId}?projectId=${admin.projectId}`,
    body: { type: 'SAVE_SAMPLE_DATA', request: { stepName, payload, type: 'OUTPUT' } },
    token: admin.token,
  })
}

async function listen({ user, name, expectConnected = true }) {
  const received = []
  const socket = io(SOCKET_ORIGIN, {
    transports: ['websocket'],
    path: '/api/socket.io',
    auth: { token: user.token, projectId: user.projectId },
    reconnection: false,
  })
  ;['TEST_STEP_FINISHED', 'TEST_STEP_PROGRESS', 'UPDATE_RUN_PROGRESS'].forEach((event) => {
    socket.on(event, (payload) => received.push({ event, payload }))
  })
  if (expectConnected) {
    await waitFor({ what: `${name} 的 websocket 连上`, timeoutMs: 20000, stepMs: 300, probe: async () => socket.connected })
  }
  return {
    name,
    received,
    close: () => socket.close(),
  }
}

async function testStep({ admin, flow, stepName, listeners }) {
  listeners.forEach((listener) => { listener.received.length = 0 })
  const started = await http({
    method: 'POST',
    path: '/sample-data/test-step',
    body: { projectId: admin.projectId, workflowVersionId: flow.versionId, stepName },
    token: admin.token,
  })
  assert(started.ok, `测试步骤 ${stepName} 返回 ${started.status} ${started.text.slice(0, 200)}`)
  const runId = started.body.id
  await waitFor({
    what: `${stepName} 的测试结果送达`,
    timeoutMs: 60000,
    stepMs: 500,
    probe: async () => listeners.some((listener) => listener.received.some((item) => item.event === 'TEST_STEP_FINISHED' && item.payload.runId === runId)),
  })
  await sleep(800)
  return Object.fromEntries(listeners.map((listener) => [listener.name, finishedOf({ listener, runId })]).filter(([, value]) => value !== undefined))
}

function finishedOf({ listener, runId }) {
  const matching = listener.received.filter((item) => item.payload?.runId === runId || item.payload?.execution?.id === runId)
  const finished = matching.find((item) => item.event === 'TEST_STEP_FINISHED')
  if (finished === undefined) {
    return undefined
  }
  return { finished: finished.payload, all: matching.map((item) => item.payload) }
}
