import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadKit as kit } from './load-kit.mjs'

async function run({ host, container, people = 10000, resultDir }) {
  const project = await kit.api({ method: 'POST', path: '/projects', body: { displayName: 'Reconciliation scale' } })
  assert(project.id)
  await kit.connect({ projectId: project.id })
  await kit.setupMainLine({ departments: 20, publish: false })
  const rules = await kit.api({ method: 'GET', path: `/reconciliation/rules?projectId=${project.id}` })
  const rule = rules.find((item) => item.source.actionName === 'enumerate_employees')
  assert(rule)
  await kit.api({ method: 'POST', path: `/reconciliation/rules/${rule.id}`, body: { ...rule, enabled: false } })
  const records = Array.from({ length: people }, (_, index) => kit.hireOf({ n: index + 1, departmentIndex: index % 20 }))
  await kit.inject({ records, changedAtOffsetSeconds: -1200 })
  for (let offset = 0; offset < people; offset += 1000) {
    await kit.mock({ method: 'POST', path: '/__admin/feishu-seed-users', body: { users: records.slice(offset, offset + 1000).map((record) => ({ name: record.employeeInfo.name, mobile: record.employeeInfo.mobilePhone, email: record.employeeInfo.workEmail, employee_no: record.recordInfo.jobNumber, department_ids: [kit.departmentOpenId({ index: record.recordInfo.oIdDepartment - kit.departmentOid({ index: 0 }) })], is_frozen: false })) } })
  }
  const memory = [sampleApi({ host, container })]
  const timer = setInterval(() => memory.push(sampleApi({ host, container })), 500)
  const startedAt = Date.now()
  let completed
  try {
    const started = await kit.api({ method: 'POST', path: `/reconciliation/rules/${rule.id}/runs`, body: { projectId: project.id } })
    completed = await kit.waitFor({ timeoutMs: 600000, intervalMs: 1000, probe: async () => {
      const current = await kit.api({ method: 'GET', path: `/reconciliation/runs/${started.runId}?projectId=${project.id}` })
      if (['FAILED', 'TRUNCATED'].includes(current.status)) throw new Error(`Scale reconciliation ${current.status}: ${current.error ?? ''}`)
      return current.status === 'SUCCEEDED' ? current : null
    } })
  }
  finally { clearInterval(timer) }
  memory.push(sampleApi({ host, container }))
  const durationMs = Date.now() - startedAt
  const peakRssMb = Math.max(...memory)
  const result = { people, sourceCount: completed.sourceCount, targetCount: completed.targetCount, matchedCount: completed.matchedCount, differenceCount: completed.differenceCount, durationMs, peakRssMb, samples: memory.length }
  writeFileSync(path.join(resultDir, `reconciliation-${people}.json`), JSON.stringify(result, null, 2))
  assert.equal(completed.sourceCount, people)
  assert.equal(completed.targetCount, people)
  assert.equal(completed.differenceCount, 0)
  assert(durationMs < 600000, `Reconciliation took ${durationMs} ms`)
  assert(peakRssMb < 500, `API peak RSS ${peakRssMb} MB exceeds 500 MB`)
  process.stdout.write(`PASS reconciliation scale: ${JSON.stringify(result)}\n`)
  return result
}

function sampleApi({ host, container }) {
  const value = execFileSync('docker', ['--host', host, 'exec', container, 'ps', '-o', 'rss=', '-p', '1'], { encoding: 'utf8' })
  const rss = Number(value.trim()) / 1024
  assert(Number.isFinite(rss) && rss > 0, 'Missing API RSS measurement')
  return Math.round(rss)
}

export const reconciliationScale = { run }
