import assert from 'node:assert/strict'
import { loadKit as kit } from './load-kit.mjs'
import { loadStack } from './load-stack.mjs'

export async function unsafeWrite500() {
  const { projectId } = kit.session()
  const externalId = 'unsafe-write-feishu'
  await kit.api({ method: 'POST', path: '/connections', body: { projectId, externalId, displayName: 'Unsafe write test', connectorName: '@fema-ipaas/connector-feishu', type: 'CUSTOM_AUTH', value: { type: 'CUSTOM_AUTH', props: { domain: 'https://open.feishu.cn', appId: 'cli_unsafe', appSecret: 'secret' } } } })
  const connections = { '@fema-ipaas/connector-feishu': externalId }
  const solution = '/solutions/official-feishu-approval-ledger'
  const checks = await kit.api({ method: 'POST', path: `${solution}/checks`, body: { projectId, connections } })
  const installed = await kit.api({ method: 'POST', path: `${solution}/install`, body: { projectId, connections, config: { approvalCode: 'unsafe-test', verificationToken: 'unsafe-token', appToken: 'app_unsafe', tableId: 'tbl_unsafe' }, acknowledgedChecks: checks.results.filter((item) => item.kind === 'MANUAL').map((item) => item.key) } })
  const table = await kit.api({ method: 'GET', path: `/mapping-tables/${installed.mappingTables[0].tableId}?projectId=${projectId}` })
  await kit.api({ method: 'POST', path: `/mapping-tables/${table.id}`, body: { projectId, name: table.name, description: table.description, keyLabel: table.keyLabel, valueLabel: table.valueLabel, missingBehavior: table.missingBehavior, defaultValue: table.defaultValue, rows: [{ k: 'Travel', v: '6602' }] } })
  const ledger = installed.workflows.find((item) => item.key === 'ledger')
  assert(ledger)
  const workflow = await kit.api({ method: 'GET', path: `/workflows/${ledger.workflowId}?projectId=${projectId}` })
  const create = findStep({ step: workflow.version.trigger, name: 'create' })
  assert(create)
  const { lastUpdatedDate, ...request } = create
  await kit.api({ method: 'POST', path: `/workflows/${ledger.workflowId}?projectId=${projectId}`, body: { type: 'UPDATE_ACTION', request: { ...request, settings: { ...request.settings, input: { ...request.settings.input, dedupeKey: '' }, errorHandlingOptions: { retryOnFailure: { value: true } } } } } })
  await kit.api({ method: 'POST', path: `/workflows/${ledger.workflowId}?projectId=${projectId}`, body: { type: 'LOCK_AND_PUBLISH', request: {} } })
  await kit.mock({ method: 'POST', path: '/__admin/approvals', body: { instances: [{ instance_code: 'unsafe-instance', approval_code: 'unsafe-test', serial_number: 'UNSAFE-001', status: 'APPROVED', open_id: 'ou_unsafe', department_id: 'od-rd', start_time: String(Date.now()), end_time: String(Date.now()), form: [{ name: '金额', type: 'amount', value: '100' }, { name: '费用类型', type: 'input', value: 'Travel' }] }] } })
  const before = (await kit.mock({ method: 'GET', path: '/__admin/state' })).bitableRecords.length
  await kit.mock({ method: 'POST', path: '/__admin/faults', body: { rules: [{ id: 'unsafe-write-500', method: 'POST', path: '/bitable/v1/apps/app_unsafe/tables/tbl_unsafe/records$', mode: 'apply_then_status', status: 500, probability: 1, times: 1 }] } })
  const response = await fetch(`http://127.0.0.1:${loadStack.paths.API_PORT}/api/v1/webhooks/${ledger.workflowId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'unsafe-token', type: 'event_callback', uuid: 'unsafe-callback', event: { type: 'approval_instance', approval_code: 'unsafe-test', instance_code: 'unsafe-instance', status: 'APPROVED' } }) })
  assert.equal(response.status, 200)
  const issue = await kit.waitFor({ timeoutMs: 120000, probe: async () => { const result = await kit.api({ method: 'GET', path: `/issues?projectId=${projectId}` }); return result.data.find((item) => item.workflowId === ledger.workflowId && item.stepName === 'create') ?? result.data.find((item) => item.title.includes('首次登记台账')) } })
  assert(issue)
  await kit.sleep(10000)
  const state = await kit.mock({ method: 'GET', path: '/__admin/state' })
  assert.equal(state.bitableRecords.length, before + 1)
  const checked = await kit.api({ method: 'POST', path: `/issues/${issue.id}/replay-check`, body: {} })
  assert(checked.items.some((item) => item.writeSteps.some((step) => step.stepName === 'create' && step.needsConfirmation)))
  const replay = await kit.apiRaw({ method: 'POST', path: `/issues/${issue.id}/replay`, body: { strategy: 'FROM_FAILED_STEP', includeDataProblems: true } })
  assert.equal(replay.status, 400)
  assert.equal(replay.body.code, 'UNSAFE_REPLAY_NOT_CONFIRMED')
  await kit.mock({ method: 'POST', path: '/__admin/faults', body: { rules: [] } })
  process.stdout.write('PASS unsafe-write-500: one applied record, no automatic duplicate, one issue and explicit replay confirmation\n')
}

function findStep({ step, name }) {
  if (step?.name === name) return step
  const children = [step?.nextAction, ...(step?.children ?? []), step?.firstLoopAction, step?.continueOnFailureBranches?.onSuccess, step?.continueOnFailureBranches?.onFailure].filter(Boolean)
  for (const child of children) { const found = findStep({ step: child, name }); if (found) return found }
  return null
}
