import { TENANTS } from './saas-fixtures.mjs'
import { api, assert, check, iam, iamState, sleep, waitFor } from './saas-kit.mjs'

const EVENT_TYPE = 'rental-agreement.contract.activate'

export async function connectorPhase({ ctx }) {
  const state = { workflowId: null }

  await check('C1 FEMA 业务事件触发器：打开工作流时以甲的应用身份到 fema 登记，验证请求被应答', async () => {
    const session = ctx.sessions.alice
    assert(session, '前置：甲属主未登录')
    const projectId = ctx.tenants.alpha.projectId
    const created = await api({ method: 'POST', path: '/v1/workflows', token: session.token, body: { displayName: '合同生效归档', projectId } })
    assert(created.status < 300, `建工作流失败：${created.status} ${created.text.slice(0, 300)}`)
    state.workflowId = created.json.id
    const imported = await api({ method: 'POST', path: `/v1/workflows/${state.workflowId}?projectId=${projectId}`, token: session.token, body: { type: 'IMPORT_WORKFLOW', request: { displayName: '合同生效归档', trigger: workflowTrigger(), schemaVersion: null, notes: null } } })
    assert(imported.status === 200, `导入工作流失败：${imported.status} ${imported.text.slice(0, 500)}`)
    const before = (await iamState()).log.subscriptions.length
    const published = await api({ method: 'POST', path: `/v1/workflows/${state.workflowId}?projectId=${projectId}`, token: session.token, body: { type: 'LOCK_AND_PUBLISH', request: { status: 'ENABLED' } } })
    assert(published.status === 200, `发布失败：${published.status} ${published.text.slice(0, 500)}`)
    const registration = await waitFor({
      what: 'fema 收到登记',
      timeoutMs: 120000,
      intervalMs: 1000,
      probe: async () => (await iamState()).log.subscriptions.slice(before).find((entry) => entry.action === 'create'),
    })
    assert(registration.tenant === TENANTS.alpha.code, `登记应以甲的身份发出：${JSON.stringify(registration)}`)
    assert(registration.endpoint.includes(state.workflowId), `推送地址应指向本工作流：${registration.endpoint}`)
    assert(JSON.stringify(registration.events) === JSON.stringify([EVENT_TYPE]), `事件类型不对：${JSON.stringify(registration.events)}`)
    const active = await waitFor({
      what: '验证请求被应答',
      timeoutMs: 30000,
      probe: async () => (await iamState()).subscriptions.find((subscription) => subscription.endpoint === registration.endpoint && subscription.status === 'ACTIVE'),
    })
    assert(active.verification?.echoed, `验证请求应原样回显 challenge：${JSON.stringify(active.verification)}`)
  })

  await check('C2 推送合同生效：签名通过的事件触发一次运行，「读取对象」读到甲自己的合同', async () => {
    assert(state.workflowId, '前置：工作流未建好')
    const session = ctx.sessions.alice
    const projectId = ctx.tenants.alpha.projectId
    const pushed = await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: EVENT_TYPE, id: `evt-${Date.now()}`, object: { code: 'contract', id: '981233', businessKey: 'HT-2026-0001' } } })
    assert(pushed.deliveries.length === 1 && pushed.deliveries[0].status < 300, `推送应送达：${JSON.stringify(pushed.deliveries)}`)
    state.eventId = pushed.event.id
    const run = await waitFor({ what: '运行结束', timeoutMs: 180000, intervalMs: 2000, probe: async () => finishedRun({ session, projectId, workflowId: state.workflowId }) })
    state.runCount = await runCount({ session, projectId, workflowId: state.workflowId })
    const detail = await api({ path: `/v1/executions/${run.id}?projectId=${projectId}`, token: session.token })
    const steps = detail.json?.steps ?? {}
    assert(run.status === 'SUCCEEDED', `运行应成功：${run.status} ${JSON.stringify(run.failedStep ?? null)} 触发器 ${JSON.stringify(steps.trigger?.output ?? null).slice(0, 400)} 读取 ${JSON.stringify(steps.read_contract ?? null).slice(0, 800)}`)
    const read = steps.read_contract?.output
    assert(read?.found === true && read.data?.code === 'HT-2026-0001', `应读到甲的合同：${JSON.stringify(read)}`)
  })

  await check('C3 同一事件重复送达、签名被篡改的推送都不再触发运行', async () => {
    assert(state.eventId && state.runCount !== undefined, '前置：C2 未推送事件')
    const session = ctx.sessions.alice
    const projectId = ctx.tenants.alpha.projectId
    await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: EVENT_TYPE, id: state.eventId, object: { code: 'contract', id: '981233' }, times: 2 } })
    await iam({ path: '/__control/events/push', body: { tenant: TENANTS.alpha.code, type: EVENT_TYPE, id: `evt-forged-${Date.now()}`, object: { code: 'contract', id: '981233' }, tamper: true } })
    await sleep(15000)
    const count = await runCount({ session, projectId, workflowId: state.workflowId })
    assert(count === state.runCount, `不应多出运行：之前 ${state.runCount}，现在 ${count}`)
  })

  await check('C4 关闭工作流时撤销 fema 的登记', async () => {
    assert(state.workflowId, '前置：工作流未建好')
    const session = ctx.sessions.alice
    const projectId = ctx.tenants.alpha.projectId
    const disabled = await api({ method: 'POST', path: `/v1/workflows/${state.workflowId}?projectId=${projectId}`, token: session.token, body: { type: 'CHANGE_STATUS', request: { status: 'DISABLED' } } })
    assert(disabled.status === 200, `停用失败：${disabled.status} ${disabled.text.slice(0, 300)}`)
    await waitFor({
      what: '登记被撤销',
      timeoutMs: 120000,
      intervalMs: 1000,
      probe: async () => (await iamState()).log.subscriptions.some((entry) => entry.action === 'delete' && entry.outcome === 'deleted' && entry.tenant === TENANTS.alpha.code),
    })
    const remaining = (await iamState()).subscriptions.filter((subscription) => subscription.endpoint.includes(state.workflowId))
    assert(remaining.length === 0, `登记应已不存在：${JSON.stringify(remaining)}`)
  })
}

function workflowTrigger() {
  const stamp = new Date().toISOString()
  return {
    name: 'trigger',
    type: 'CONNECTOR_TRIGGER',
    valid: true,
    displayName: 'FEMA 业务事件',
    lastUpdatedDate: stamp,
    settings: {
      connectorName: '@fema-ipaas/connector-fema',
      connectorVersion: '~0.0.1',
      triggerName: 'business_event',
      input: { auth: "{{connections['fema']}}", events: [EVENT_TYPE] },
      propertySettings: {},
    },
    nextAction: {
      name: 'read_contract',
      type: 'CONNECTOR',
      valid: true,
      displayName: '读取合同',
      lastUpdatedDate: stamp,
      settings: {
        connectorName: '@fema-ipaas/connector-fema',
        connectorVersion: '~0.0.1',
        actionName: 'read_object',
        input: { auth: "{{connections['fema']}}", objectPath: "{{trigger['output']['objectPath']}}", objectId: "{{trigger['output']['object']['id']}}" },
        propertySettings: {},
        errorHandlingOptions: {},
      },
    },
  }
}

async function finishedRun({ session, projectId, workflowId }) {
  const list = await api({ path: `/v1/executions?projectId=${projectId}&workflowId=${workflowId}&limit=5`, token: session.token })
  const run = (list.json?.data ?? [])[0]
  return run && !['RUNNING', 'QUEUED'].includes(run.status) ? run : null
}

async function runCount({ session, projectId, workflowId }) {
  const list = await api({ path: `/v1/executions?projectId=${projectId}&workflowId=${workflowId}&limit=100`, token: session.token })
  return (list.json?.data ?? []).length
}
