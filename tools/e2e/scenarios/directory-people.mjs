import assert from 'node:assert/strict'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'

const target = process.env.E2E_TARGET ?? 'wecom'
if (!['wecom', 'dingtalk'].includes(target)) throw new Error('E2E_TARGET must be wecom or dingtalk')
if (process.env.LOAD_REUSE !== '1') {
  const connectors = `beisen,${target},org-sync,data-mapper,schedule,store,subflows`
  await loadStack.up({ db: 'pglite', redis: 'memory', workers: 1, apiEnv: { FEMA_DEV_CONNECTORS: connectors, FEMA_CONNECTORS_SYNC_MODE: 'NONE' }, workerEnv: { FEMA_DEV_CONNECTORS: connectors } })
}
await kit.connect()
const projectId = kit.session().projectId
const connectorName = `@fema-ipaas/connector-${target}`
await kit.mock({ method: 'POST', path: `/__admin/${target}`, body: { reset: true, departments: [{ id: '1', name: 'Company', parentId: '0' }, { id: '99', name: 'Pending resignation', parentId: '1' }] } })
const root = '900100000'
await kit.mock({ method: 'POST', path: '/__admin/beisen-official', body: { orgs: [{ oId: Number(root), name: 'Company', parent: 0 }, { oId: 20301, name: 'Development', parent: Number(root) }, { oId: 20302, name: 'People', parent: Number(root) }] } })
const connections = { '@fema-ipaas/connector-beisen': 'beisen-directory', [connectorName]: `${target}-directory` }
for (const [name, props] of [ ['@fema-ipaas/connector-beisen', { appKey: 'mock-key', appSecret: 'mock-secret' }], [connectorName, target === 'wecom' ? { corpId: 'corp', contactSecret: 'contact', appSecret: 'app', agentId: '7' } : { appKey: 'app', appSecret: 'secret', agentId: '7' }] ]) await kit.api({ method: 'POST', path: '/connections', body: { projectId, externalId: connections[name], displayName: name, connectorName: name, type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props } } })
const org = await install({ id: `official-beisen-${target}-org`, config: { rootOrganizationId: root, rootDepartmentId: '1', itChatId: 'admin' } })
const core = org.workflows.find((workflow) => workflow.key === 'converge')
assert(core)
await publish(core.workflowId)
const coreFlow = await kit.api({ method: 'GET', path: `/workflows/${core.workflowId}?projectId=${projectId}` })
await call(core.workflowId)
const tree = await state()
assert.equal(tree.departments.filter((row) => ['Development', 'People'].includes(row.name)).length, 2)
const writes = tree.writes
await call(core.workflowId)
assert.equal((await state()).writes, writes, 'A second organization run must not write')
const people = await install({ id: `official-beisen-${target}`, config: { rootOrganizationId: root, orgWorkflow: coreFlow.externalId, hrChatId: 'admin', itChatId: 'admin', ...(target === 'dingtalk' ? { pendingDepartmentId: '99' } : {}) } })
for (const workflow of people.workflows) await publish(workflow.workflowId)
const employee = { employeeInfo: { userID: 7101, name: 'e2e-employee', mobilePhone: '13800007101', workEmail: 'e2e-7101@example.com', objectId: '00000000-0000-0000-0000-000000007101' }, recordInfo: { userID: 7101, jobNumber: 'e2e-7101', oIdDepartment: 20301, employeeStatus: '2', changeTypeOID: '1', approvalStatus: 4, startDate: new Date().toISOString(), lastWorkDate: null } }
await seed(employee)
await wait(async () => { const current = await state(); return current.messages.length === 1 && current.users.find((user) => user.userid === 'e2e-7101') })
assert.equal((await state()).users.length, 1)
assert.equal((await state()).messages.length, 1)
await seed(employee)
await new Promise((resolve) => setTimeout(resolve, 65000))
assert.equal((await state()).users.length, 1)
assert.equal((await state()).messages.length, 1)
const otherDepartment = tree.departments.find((row) => row.name === 'People').id
await seed({ ...employee, recordInfo: { ...employee.recordInfo, oIdDepartment: 20302, employeeStatus: '3', changeTypeOID: '7', startDate: new Date().toISOString() } })
await wait(async () => (await state()).users.find((user) => user.userid === 'e2e-7101' && user.department_ids.includes(otherDepartment)))
await seed({ ...employee, recordInfo: { ...employee.recordInfo, oIdDepartment: 20302, employeeStatus: '8', changeTypeOID: '13', lastWorkDate: new Date(Date.now() - 86400000).toISOString() } })
await wait(async () => { const current = await state(); const user = current.users.find((row) => row.userid === 'e2e-7101'); return current.messages.length === 2 && (target === 'wecom' ? user?.enable === 0 : user?.department_ids.includes('99')) })
const final = await state()
assert.equal(final.deletes, 0)
assert.equal(final.users.length, 1)
if (target === 'dingtalk') assert.equal(final.users[0].enable, 1, 'Moving departments must not be presented as account suspension')
process.stdout.write(`PASS ${target}: organization convergence, no repeat writes, onboarding, deduplication, transfer, departure handoff, notices and no deletion\n`)

async function install({ id, config }) { const checks = await kit.api({ method: 'POST', path: `/solutions/${id}/checks`, body: { projectId, connections } }); return kit.api({ method: 'POST', path: `/solutions/${id}/install`, body: { projectId, connections, config, acknowledgedChecks: checks.results.filter((check) => check.kind === 'MANUAL').map((check) => check.key) } }) }
async function publish(id) { return kit.api({ method: 'POST', path: `/workflows/${id}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } }) }
async function call(id) { const before = await kit.api({ method: 'GET', path: `/executions?projectId=${projectId}&workflowId=${id}&limit=1` }); const response = await fetch(`http://127.0.0.1:${loadStack.paths.API_PORT}/api/v1/webhooks/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"data":{}}' }); assert.equal(response.status, 200); const run = await wait(async () => { const list = await kit.api({ method: 'GET', path: `/executions?projectId=${projectId}&workflowId=${id}&limit=1` }); const run = list.data?.[0]; return run && run.id !== before.data?.[0]?.id && ['SUCCEEDED', 'FAILED', 'INTERNAL_ERROR'].includes(run.status) ? run : null }); assert.equal(run.status, 'SUCCEEDED', JSON.stringify(run.failedStep)) }
async function seed(record) { await kit.mock({ method: 'POST', path: '/__admin/employees', body: { records: [record] } }) }
async function state() { return kit.mock({ method: 'GET', path: `/__admin/${target}` }) }
async function wait(probe) { return kit.waitFor({ probe, timeoutMs: 300000, intervalMs: 1500 }) }
