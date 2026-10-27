import assert from 'node:assert/strict'
import { loadKit as kit } from './load-kit.mjs'

async function run({ target, departments, hrChatId, itChatId, publish, upsertConnection }) {
  const projectId = kit.session().projectId
  const name = `@fema-ipaas/connector-${target}`
  const rootOrganizationId = '900100000'
  await kit.mock({ method: 'POST', path: '/__admin/reset' })
  await kit.mock({ method: 'POST', path: `/__admin/${target}`, body: { reset: true, departments: [{ id: '1', name: 'Company', parentId: '0' }, { id: '99', name: 'Pending resignation', parentId: '1' }, ...Array.from({ length: departments }, (_, index) => ({ id: String(100 + index), name: `Load department ${index + 1}`, parentId: '1', customId: `bs-${kit.departmentOid({ index })}` }))] } })
  await kit.mock({ method: 'POST', path: '/__admin/beisen-official', body: { orgs: [{ oId: Number(rootOrganizationId), name: 'Load company', parent: 0 }, ...Array.from({ length: departments }, (_, index) => ({ oId: kit.departmentOid({ index }), name: `Load department ${index + 1}`, parent: Number(rootOrganizationId) }))] } })
  await upsertConnection({ externalId: 'beisen-main', displayName: 'Source', connectorName: '@fema-ipaas/connector-beisen', props: { appKey: 'mock-key', appSecret: 'mock-secret' } })
  await upsertConnection({ externalId: `${target}-main`, displayName: target, connectorName: name, props: target === 'wecom' ? { corpId: 'corp', contactSecret: 'contact', appSecret: 'app', agentId: '7' } : { appKey: 'app', appSecret: 'secret', agentId: '7' } })
  await upsertConnection({ externalId: 'feishu-main', displayName: 'Unsafe-write probe', connectorName: '@fema-ipaas/connector-feishu', props: { domain: 'https://open.feishu.cn', appId: 'cli_mock', appSecret: 'mock-secret' } })
  const connections = { '@fema-ipaas/connector-beisen': 'beisen-main', [name]: `${target}-main` }
  const org = await install({ id: `official-beisen-${target}-org`, connections, config: { rootOrganizationId, rootDepartmentId: '1', itChatId } })
  const converge = org.workflows.find((workflow) => workflow.key === 'converge')
  assert(converge)
  await publishWorkflow({ id: converge.workflowId })
  const flow = await kit.api({ method: 'GET', path: `/workflows/${converge.workflowId}?projectId=${projectId}` })
  const installed = await install({ id: `official-beisen-${target}`, connections, config: { rootOrganizationId, orgWorkflow: flow.externalId, hrChatId, itChatId, ...(target === 'dingtalk' ? { pendingDepartmentId: '99' } : {}) } })
  if (publish) for (const workflow of installed.workflows) await publishWorkflow({ id: workflow.workflowId })
  const tableId = installed.mappingTables[0].tableId
  const table = await kit.api({ method: 'GET', path: `/mapping-tables/${tableId}?projectId=${projectId}` })
  const departmentIds = Array.from({ length: departments }, (_, index) => String(100 + index))
  await kit.api({ method: 'POST', path: `/mapping-tables/${tableId}`, body: { projectId, name: table.name, description: table.description, keyLabel: table.keyLabel, valueLabel: table.valueLabel, missingBehavior: table.missingBehavior, defaultValue: table.defaultValue, rows: departmentIds.map((id, index) => ({ k: String(kit.departmentOid({ index })), v: id })) } })
  return { workflowIds: installed.workflows.map((workflow) => workflow.workflowId), tableId, onboardId: installed.workflows.find((workflow) => workflow.key === 'onboard')?.workflowId, departmentIds }
}

async function install({ id, connections, config }) {
  const projectId = kit.session().projectId
  const checks = await kit.api({ method: 'POST', path: `/solutions/${id}/checks`, body: { projectId, connections } })
  return kit.api({ method: 'POST', path: `/solutions/${id}/install`, body: { projectId, connections, config, acknowledgedChecks: checks.results.filter((check) => check.kind === 'MANUAL').map((check) => check.key) } })
}

async function publishWorkflow({ id }) {
  return kit.api({ method: 'POST', path: `/workflows/${id}?projectId=${kit.session().projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
}

export const directorySetup = { run }
