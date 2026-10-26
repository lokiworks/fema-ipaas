import assert from 'node:assert/strict'
import { loadStack } from './lib/load-stack.mjs'
import { loadKit as kit } from './lib/load-kit.mjs'

const polling = process.env.APPROVAL_MODE === 'polling'
const count = Number(process.env.APPROVAL_COUNT ?? 100)
if (process.env.LOAD_REUSE !== '1') {
  const connectors = 'feishu,data-mapper,http,subflows'
  await loadStack.up({ db: 'pglite', redis: 'memory', workers: 1, apiEnv: { FEMA_DEV_CONNECTORS: connectors, FEMA_CONNECTORS_SYNC_MODE: 'NONE' }, workerEnv: { FEMA_DEV_CONNECTORS: connectors } })
}
await kit.connect()
const projectId = kit.session().projectId
await kit.api({ method: 'POST', path: '/connections', body: { projectId, externalId: 'feishu-approval', displayName: 'Approval test', connectorName: '@fema-ipaas/connector-feishu', type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props: { domain: 'https://open.feishu.cn', appId: 'cli_approval', appSecret: 'secret' } } } })
const connections = { '@fema-ipaas/connector-feishu': 'feishu-approval' }
const id = 'official-feishu-approval-ledger'
const checks = await kit.api({ method: 'POST', path: `/solutions/${id}/checks`, body: { projectId, connections } })
const installed = await kit.api({ method: 'POST', path: `/solutions/${id}/install`, body: { projectId, connections, config: { approvalCode: 'expense', verificationToken: 'approval-token', appToken: 'app_ledger', tableId: 'tbl_ledger' }, acknowledgedChecks: checks.results.filter((check) => check.kind === 'MANUAL').map((check) => check.key) } })
const table = await kit.api({ method: 'GET', path: `/mapping-tables/${installed.mappingTables[0].tableId}?projectId=${projectId}` })
await kit.api({ method: 'POST', path: `/mapping-tables/${table.id}`, body: { projectId, name: table.name, description: table.description, keyLabel: table.keyLabel, valueLabel: table.valueLabel, missingBehavior: table.missingBehavior, defaultValue: table.defaultValue, rows: [{ k: 'Travel', v: '6602' }] } })
await kit.mock({ method: 'POST', path: '/__admin/feishu-seed-users', body: { users: Array.from({ length: count }, (_, index) => ({ name: `e2e-applicant-${index}`, mobile: `+861380${String(index).padStart(7, '0')}`, employee_no: `e2e-${index}`, department_ids: ['od-rd'] })) } })
const instances = Array.from({ length: count }, (_, index) => ({ instance_code: `instance-${index}`, approval_code: 'expense', serial_number: `20261027${String(index).padStart(4, '0')}`, status: 'APPROVED', open_id: `ou_${index + 1}`, department_id: 'od-rd', start_time: String(Date.now() - 60000), end_time: String(Date.now()), form: [{ name: '金额', type: 'amount', value: String(100 + index) }, { name: '费用类型', type: 'input', value: 'Travel' }], task_list: [] }))
await kit.mock({ method: 'POST', path: '/__admin/approvals', body: { instances } })
const repair = installed.workflows.find((workflow) => workflow.key === 'repair')
const ledger = installed.workflows.find((workflow) => workflow.key === 'ledger')
assert(repair && ledger)
if (polling) {
  const workflow = await kit.api({ method: 'GET', path: `/workflows/${ledger.workflowId}?projectId=${projectId}` })
  const { lastUpdatedDate, ...trigger } = workflow.version.trigger
  await kit.api({ method: 'POST', path: `/workflows/${ledger.workflowId}?projectId=${projectId}`, body: { type: 'UPDATE_TRIGGER', request: { ...trigger, settings: { ...trigger.settings, triggerName: 'approval_instance_polled', input: { auth: trigger.settings.input.auth, approvalCode: 'expense', lookbackDays: 1, statuses: ['APPROVED', 'REVERTED', 'CANCELED', 'DELETED'] } } } } })
}
for (const workflow of [repair, ledger]) await kit.api({ method: 'POST', path: `/workflows/${workflow.workflowId}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
const url = `http://127.0.0.1:${loadStack.paths.API_PORT}/api/v1/webhooks/${ledger.workflowId}`
async function push(instance) { const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'approval-token', type: 'event_callback', uuid: `delivery-${instance.instance_code}-${instance.status}-${Math.random()}`, event: { type: 'approval_instance', approval_code: 'expense', instance_code: instance.instance_code, status: instance.status } }) }); assert.equal(response.status, 200, await response.text()) }
if (!polling) {
  for (const instance of instances) await push(instance)
  for (const instance of instances.slice(0, 10)) await push(instance)
}
await wait(async () => { const state = await kit.mock({ method: 'GET', path: '/__admin/state' }); return state.bitableRecords.length === count && state.messages.length === count ? state : null })
const revoked = instances.slice(0, 5).map((instance) => ({ ...instance, status: 'REVERTED' }))
await kit.mock({ method: 'POST', path: '/__admin/approvals', body: { instances: revoked } })
if (!polling) for (const instance of revoked) await push(instance)
const final = await wait(async () => { const state = await kit.mock({ method: 'GET', path: '/__admin/state' }); return state.messages.length === count + 5 && state.bitableRecords.filter((record) => record.fields['状态'] === '作废').length === 5 ? state : null })
assert.equal(final.bitableRecords.length, count)
const rules = await kit.api({ method: 'GET', path: `/reconciliation/rules?projectId=${projectId}` })
const rule = rules.find((item) => item.workflowId === repair.workflowId)
assert(rule)
const started = await kit.api({ method: 'POST', path: `/reconciliation/rules/${rule.id}/runs`, body: { projectId } })
const reconciled = await wait(async () => { const run = await kit.api({ method: 'GET', path: `/reconciliation/runs/${started.runId}?projectId=${projectId}` }); if (run.status === 'FAILED') throw new Error('Approval reconciliation failed'); return run.status === 'SUCCEEDED' ? run : null })
assert.equal(reconciled.differenceCount, 0)
assert.equal(reconciled.sourceCount, count - 5)
process.stdout.write(`PASS approval ledger: ${polling ? 'polling' : 'webhook'}, ${count} rows, ${polling ? 'status deduplication' : '10 repeated callbacks'}, 5 revoked rows, ${count + 5} notifications and zero reconciliation differences\n`)
async function wait(probe) { return kit.waitFor({ probe, timeoutMs: 20 * 60000, intervalMs: 2000 }) }
