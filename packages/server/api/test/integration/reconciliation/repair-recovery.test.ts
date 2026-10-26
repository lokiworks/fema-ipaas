import { createAction, Property } from '@fema-ipaas/connector-sdk'
import { generateId } from '@fema-ipaas/core-utils'
import { ExecutionStatus, ReconciliationRuleBody, RunEnvironment } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import * as actions from '../../../src/app/action-run/action-run.service'
import * as metadata from '../../../src/app/connectors/metadata/connector-metadata-service'
import * as executions from '../../../src/app/workflows/execution/execution-service'
import { reconciliationRepair } from '../../../src/app/reconciliation/reconciliation-repair'
import { reconciliationDifferenceRepo, reconciliationRuleRepo } from '../../../src/app/reconciliation/reconciliation.service'
import { db } from '../../helpers/db'
import { createMockExecution, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance
beforeAll(async () => { app = await setupTestEnvironment() })
afterAll(async () => { await teardownTestEnvironment() })
afterEach(() => vi.restoreAllMocks())

it('persists the repair ID before dispatch and recovers the same ID after a dispatch failure', async () => {
    const ctx = await createTestContext(app)
    const workflow = createMockWorkflow({ projectId: ctx.project.id })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id })
    await db.save('workflow_version', version)
    await db.update('workflow', workflow.id, { publishedVersionId: version.id })
    const endpoint = { connectorName: 'source', actionName: 'enumerate', connectionExternalId: 'connection', input: {}, keyPath: 'id' }
    const body = ReconciliationRuleBody.parse({ projectId: ctx.project.id, workflowId: workflow.id, name: 'Repair', source: endpoint, target: endpoint, expectations: [{ aspect: 'account', expect: { kind: 'EXISTS' } }], repair: { readActionName: 'get', keyInput: 'id' }, maxRepairsPerRun: 0 })
    const rule = await reconciliationRuleRepo().save({ ...body, id: generateId() })
    const runId = generateId()
    await db.save('reconciliation_run', { id: runId, projectId: ctx.project.id, ruleId: rule.id, status: 'SUCCEEDED', sourceCount: 1, targetCount: 0, matchedCount: 0, differenceCount: 1, repairedCount: 0 })
    const difference = await reconciliationDifferenceRepo().save({ id: generateId(), projectId: ctx.project.id, ruleId: rule.id, businessKey: 'person', aspect: 'account', kind: 'MISSING_IN_TARGET', expected: true, actual: null, status: 'OPEN', firstSeenRunId: runId, lastSeenRunId: runId, repairExecutionId: null, resolvedAt: null })
    const action = createAction({ name: 'get', displayName: 'Get', description: '', classification: 'READ', requireAuth: false, props: { id: Property.ShortText({ displayName: 'ID', required: true }) }, run: async () => undefined })
    const originalMetadata = metadata.connectorMetadataService
    vi.spyOn(metadata, 'connectorMetadataService').mockImplementation((log) => ({ ...originalMetadata(log), getOrThrow: async () => ({ actions: { get: action } }) }))
    const originalActions = actions.actionRunService
    vi.spyOn(actions, 'actionRunService').mockImplementation((log) => ({ ...originalActions(log), runConnectorAction: async () => ({ status: actions.ActionRunStatus.SUCCEEDED, output: { id: 'person' }, durationMs: 0, neverStarted: false, errorMessage: null }) }))
    const originalExecutions = executions.executionService
    const ids: string[] = []
    vi.spyOn(executions, 'executionService').mockImplementation((log) => ({ ...originalExecutions(log), start: async (params) => {
        if (!params.executionId) throw new Error('Missing reserved ID')
        const persisted = await reconciliationDifferenceRepo().findOneByOrFail({ id: difference.id, projectId: ctx.project.id })
        expect(persisted.status).toBe('REPAIRING')
        expect(persisted.repairExecutionId).toBe(params.executionId)
        ids.push(params.executionId)
        if (ids.length === 1) throw new Error('Dispatch interrupted')
        return createMockExecution({ id: params.executionId, projectId: ctx.project.id, workflowId: workflow.id, workflowVersionId: version.id, environment: RunEnvironment.PRODUCTION, status: ExecutionStatus.QUEUED })
    } }))
    await expect(reconciliationRepair(app.log).start({ differenceId: difference.id, projectId: ctx.project.id })).rejects.toThrow('Dispatch interrupted')
    const recovered = await reconciliationRepair(app.log).start({ differenceId: difference.id, projectId: ctx.project.id })
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(ids[1])
    expect(recovered).toBe(ids[0])
})
