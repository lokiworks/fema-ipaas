import assert from 'node:assert/strict'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'

const count = Number(process.env.ORG_COUNT ?? 300)
if (!Number.isInteger(count) || count < 42 || count > 5000) throw new Error('ORG_COUNT must be between 42 and 5000')
const reuse = process.env.LOAD_REUSE === '1'
if (!reuse) await loadStack.up({ db: 'pglite', redis: 'memory', workers: 1 })
await kit.connect()
const projectId = kit.session().projectId
await kit.mock({ method: 'POST', path: '/__admin/reset' })
const root = 900100000
let orgs = [{ oId: root, name: 'e2e-company', parent: 0 }, ...Array.from({ length: count }, (_, index) => ({ oId: 30000 + index, name: `e2e-department-${index}`, parent: index < 10 ? root : 30000 + index % 10 }))]
await kit.mock({ method: 'POST', path: '/__admin/beisen-official', body: { orgs } })
await kit.mock({ method: 'POST', path: '/__admin/feishu-official', body: { departments: [{ id: 'od-archive', name: 'e2e-archive', parent: '0' }] } })
for (const connection of [
  { externalId: 'beisen-org', connectorName: '@fema-ipaas/connector-beisen', props: { appKey: 'mock-key', appSecret: 'mock-secret' } },
  { externalId: 'feishu-org', connectorName: '@fema-ipaas/connector-feishu', props: { domain: 'https://open.feishu.cn', appId: 'cli_org', appSecret: 'mock-secret' } },
]) await kit.api({ method: 'POST', path: '/connections', body: { projectId, externalId: connection.externalId, displayName: connection.externalId, connectorName: connection.connectorName, type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props: connection.props } } })
const connections = { '@fema-ipaas/connector-beisen': 'beisen-org', '@fema-ipaas/connector-feishu': 'feishu-org' }
const id = 'official-beisen-feishu-org'
const config = { rootOrganizationId: String(root), rootDepartmentId: '0', archiveParentId: 'od-archive', itChatId: 'oc_it' }
const checks = await kit.api({ method: 'POST', path: `/solutions/${id}/checks`, body: { projectId, connections } })
const installed = await kit.api({ method: 'POST', path: `/solutions/${id}/install`, body: { projectId, connections, config, acknowledgedChecks: checks.results.filter((check) => check.kind === 'MANUAL').map((check) => check.key) } })
const core = installed.workflows.find((workflow) => workflow.key === 'converge')
assert(core, 'Missing convergence workflow')
await kit.api({ method: 'POST', path: `/workflows/${core.workflowId}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })

async function run() {
  const previous = await kit.api({ method: 'GET', path: `/executions?projectId=${projectId}&workflowId=${core.workflowId}&limit=1` })
  const previousId = previous.data?.[0]?.id
  const response = await fetch(`http://127.0.0.1:${loadStack.paths.API_PORT}/api/v1/webhooks/${core.workflowId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: {} }) })
  assert.equal(response.status, 200)
  return kit.waitFor({ probe: async () => {
    const runs = await kit.api({ method: 'GET', path: `/executions?projectId=${projectId}&workflowId=${core.workflowId}&limit=1` })
    const latest = runs.data?.[0]
    return latest && latest.id !== previousId && ['SUCCEEDED', 'FAILED', 'INTERNAL_ERROR', 'TIMEOUT'].includes(latest.status) ? latest : null
  }, timeoutMs: Math.max(600000, count * 2500), intervalMs: 2000 })
}

function assertTree({ tree, disabled = [] }) {
  for (const org of orgs.filter((org) => org.oId !== root)) {
    const target = tree.departments.find((department) => department.customId === `bs-${org.oId}`)
    assert(target, `Missing ${org.oId}`)
    assert.equal(target.name, org.name)
    const expected = disabled.includes(org.oId) ? 'od-archive' : org.parent === root ? '0' : tree.departments.find((department) => department.customId === `bs-${org.parent}`)?.id
    assert.equal(target.parent, expected, `Wrong parent for ${org.oId}`)
  }
  assert.equal(tree.departmentDeletes, 0)
}

const first = await run()
assert.equal(first.status, 'SUCCEEDED', JSON.stringify(first.failedStep))
let tree = await kit.mock({ method: 'GET', path: '/__admin/feishu-official' })
assertTree({ tree })
const before = tree.departmentWrites
const second = await run()
assert.equal(second.status, 'SUCCEEDED', JSON.stringify(second.failedStep))
tree = await kit.mock({ method: 'GET', path: '/__admin/feishu-official' })
assert.equal(tree.departmentWrites, before, 'A converged tree produced more writes')
orgs = orgs.map((org, index) => ({ ...org, ...(index > 0 && index <= 5 ? { name: `${org.name}-renamed` } : {}), ...(index > 10 && index <= 13 ? { parent: 30009 } : {}), ...(index > 20 && index <= 22 ? { disabled: true } : {}) }))
await kit.mock({ method: 'POST', path: '/__admin/beisen-official', body: { orgs } })
const changed = await run()
assert.equal(changed.status, 'SUCCEEDED', JSON.stringify(changed.failedStep))
tree = await kit.mock({ method: 'GET', path: '/__admin/feishu-official' })
assertTree({ tree, disabled: orgs.filter((org) => org.disabled).map((org) => org.oId) })
const settled = tree.departmentWrites
orgs = orgs.map((org, index) => ({ ...org, ...(index > 30 && index <= 41 ? { disabled: true } : {}) }))
await kit.mock({ method: 'POST', path: '/__admin/beisen-official', body: { orgs } })
const blocked = await run()
assert.equal(blocked.status, 'FAILED')
assert.match(blocked.failedStep?.message ?? '', /gate exceeded/)
tree = await kit.mock({ method: 'GET', path: '/__admin/feishu-official' })
assert.equal(tree.departmentWrites, settled, 'The safety gate allowed partial writes')
assert.equal(tree.departmentDeletes, 0)
process.stdout.write(`PASS organization synchronization: ${count} departments, convergence, rename, move, archive and safety gate\n`)
