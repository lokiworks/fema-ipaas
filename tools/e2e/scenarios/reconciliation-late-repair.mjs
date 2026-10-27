import assert from 'node:assert/strict'
import { loadKit as kit } from './lib/load-kit.mjs'

await kit.connect()
const projectId = kit.session().projectId
const rules = await kit.api({ method: 'GET', path: `/reconciliation/rules?projectId=${projectId}` })
const rule = rules.find((item) => item.source.actionName === 'enumerate_employees')
assert(rule, 'Install and publish the people and organization solutions first')
await kit.api({ method: 'POST', path: `/reconciliation/rules/${rule.id}`, body: { ...rule, maxRepairsPerRun: 0 } })
const n = 29001
const jobNumber = kit.jobNumberOf({ n })
const before = await kit.mock({ method: 'GET', path: '/__admin/state' })
assert(!before.feishuUsers.some((user) => user.employee_no === jobNumber))
await kit.inject({ records: [kit.hireOf({ n, departmentIndex: 0 })], changedAtOffsetSeconds: -1200 })
const missing = await scan()
assert.equal(missing.differenceCount, 2)
const differences = await kit.api({ method: 'GET', path: `/reconciliation/rules/${rule.id}/differences?projectId=${projectId}&status=OPEN` })
const person = differences.data.filter((item) => item.businessKey === jobNumber)
assert.equal(person.length, 2)
await kit.inject({ records: [kit.transferOf({ n, departmentIndex: 1, startDate: '2026-10-27T00:00:00' })], changedAtOffsetSeconds: -1200 })
const repaired = await kit.api({ method: 'POST', path: '/reconciliation/differences/repair', body: { projectId, ids: person.map((item) => item.id) } })
assert.equal(new Set(repaired.executionIds).size, 1)
const executionId = repaired.executionIds[0]
await kit.waitFor({ timeoutMs: 180000, probe: async () => { const state = await kit.mock({ method: 'GET', path: '/__admin/state' }); const user = state.feishuUsers.find((item) => item.employee_no === jobNumber); return user?.department_ids?.includes(kit.departmentOpenId({ index: 1 })) && state.messages.length === before.messages.length + 1 } })
const repeated = await kit.api({ method: 'POST', path: '/reconciliation/differences/repair', body: { projectId, ids: [person[0].id] } })
assert.deepEqual(repeated.executionIds, [executionId])
const closed = await scan()
assert.equal(closed.differenceCount, 0)
const final = await kit.mock({ method: 'GET', path: '/__admin/state' })
assert.equal(final.feishuUsers.filter((item) => item.employee_no === jobNumber).length, 1)
assert.equal(final.messages.length, before.messages.length + 1)
process.stdout.write('PASS late reconciliation: change older than 20 minutes, two differences, one repair execution, current department re-read, one account/notice and zero remaining differences\n')

async function scan() {
  const started = await kit.api({ method: 'POST', path: `/reconciliation/rules/${rule.id}/runs`, body: { projectId } })
  return kit.waitFor({ timeoutMs: 600000, probe: async () => { const result = await kit.api({ method: 'GET', path: `/reconciliation/runs/${started.runId}?projectId=${projectId}` }); if (result.status === 'FAILED') throw new Error(result.error); return result.status === 'SUCCEEDED' ? result : null } })
}
