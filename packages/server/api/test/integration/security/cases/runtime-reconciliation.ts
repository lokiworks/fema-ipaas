import { generateId, Permission } from '@fema-ipaas/core-utils'
import { ReconciliationRuleBody } from '@fema-ipaas/shared'
import { reconciliationDifferenceRepo, reconciliationRuleRepo, reconciliationRunRepo } from '../../../../src/app/reconciliation/reconciliation.service'
import { verificationRunService } from '../../../../src/app/verification/verification-run.service'
import { MatrixCase } from '../support/matrix'
import { seed } from '../support/seed'
import { Scope, World } from '../support/world'

async function fixture({ world, scope }: { world: World, scope: Scope }) {
    const workflow = await seed.workflow({ world, scope })
    const projectId = world.scopes[scope].project.id
    const endpoint = { connectorName: 'security-source', actionName: 'enumerate', connectionExternalId: 'security-connection', keyPath: 'id', input: {} }
    const body = ReconciliationRuleBody.parse({ projectId, workflowId: workflow.id, name: 'Security reconciliation', source: endpoint, target: endpoint, expectations: [{ aspect: 'account', expect: { kind: 'EXISTS' } }], repair: { readActionName: 'get', keyInput: 'id' }, enabled: false, maxRepairsPerRun: 0 })
    const rule = await reconciliationRuleRepo().save({ ...body, id: generateId() })
    const run = await reconciliationRunRepo().save({ id: generateId(), projectId, ruleId: rule.id, status: 'SUCCEEDED', sourceCount: 1, targetCount: 0, matchedCount: 0, differenceCount: 1, repairedCount: 0, error: null, startedAt: null, finishedAt: null })
    const difference = await reconciliationDifferenceRepo().save({ id: generateId(), projectId, ruleId: rule.id, businessKey: 'security-person', aspect: 'account', status: 'IGNORED', kind: 'MISSING_IN_TARGET', expected: true, actual: null, firstSeenRunId: run.id, lastSeenRunId: run.id, repairExecutionId: null, resolvedAt: null })
    return { rule, run, difference, projectId, body }
}

const cases: MatrixCase[] = [
    { id: 'GET /v1/reconciliation/rules', access: { type: 'project', permission: Permission.READ_WORKFLOW }, scopedRead: true, prepare: async (params) => { const f = await fixture(params); return { request: { method: 'GET', url: '/v1/reconciliation/rules', query: { projectId: f.projectId } } } } },
    { id: 'POST /v1/reconciliation/rules', access: { type: 'project', permission: Permission.WRITE_WORKFLOW }, expectOk: [409], prepare: async (params) => { const f = await fixture(params); return { request: { method: 'POST', url: '/v1/reconciliation/rules', body: { ...f.body, cron: 'invalid-cron' } } } } },
    { id: 'POST /v1/reconciliation/rules/:id', access: { type: 'project', permission: Permission.WRITE_WORKFLOW }, expectOk: [409], prepare: async (params) => { const f = await fixture(params); return { request: { method: 'POST', url: `/v1/reconciliation/rules/${f.rule.id}`, body: { ...f.body, cron: 'invalid-cron' } } } } },
    { id: 'DELETE /v1/reconciliation/rules/:id', access: { type: 'project', permission: Permission.WRITE_WORKFLOW }, prepare: async (params) => { const f = await fixture(params); return { request: { method: 'DELETE', url: `/v1/reconciliation/rules/${f.rule.id}` } } } },
    { id: 'POST /v1/reconciliation/rules/:id/runs', access: { type: 'project', permission: Permission.WRITE_WORKFLOW }, prepare: async (params) => { const f = await fixture(params); return { request: { method: 'POST', url: `/v1/reconciliation/rules/${f.rule.id}/runs` } } } },
    { id: 'GET /v1/reconciliation/runs/:id', access: { type: 'project', permission: Permission.READ_WORKFLOW }, prepare: async (params) => { const f = await fixture(params); return { request: { method: 'GET', url: `/v1/reconciliation/runs/${f.run.id}`, query: { projectId: f.projectId } } } } },
    { id: 'GET /v1/reconciliation/rules/:id/differences', access: { type: 'project', permission: Permission.READ_WORKFLOW }, prepare: async (params) => { const f = await fixture(params); return { request: { method: 'GET', url: `/v1/reconciliation/rules/${f.rule.id}/differences`, query: { projectId: f.projectId } } } } },
    { id: 'POST /v1/reconciliation/differences/repair', access: { type: 'project', permission: Permission.WRITE_WORKFLOW }, prepare: async (params) => { const f = await fixture(params); return { request: { method: 'POST', url: '/v1/reconciliation/differences/repair', body: { projectId: f.projectId, ids: [f.difference.id] } } } } },
    { id: 'POST /v1/reconciliation/differences/ignore', access: { type: 'project', permission: Permission.WRITE_WORKFLOW }, prepare: async (params) => { const f = await fixture(params); return { request: { method: 'POST', url: '/v1/reconciliation/differences/ignore', body: { projectId: f.projectId, ids: [f.difference.id], reason: 'Reviewed test difference' } } } } },
    { id: 'GET /v1/verification/runs/:runId', access: { type: 'project', permission: Permission.READ_ISSUE }, prepare: async ({ world, scope }) => { const { project, tenant } = world.scopes[scope]; const started = await verificationRunService(world.app.log).start({ projectId: project.id, tenantId: tenant.id, sinceHours: 1 }); return { request: { method: 'GET', url: `/v1/verification/runs/${started.runId}`, query: { projectId: project.id } } } } },
]

export const runtimeReconciliationCases = cases
