import { createAction } from '@fema-ipaas/connector-sdk'
import { ExecutionStatus, RunEnvironment, WorkflowActionType, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import * as metadata from '../../../src/app/connectors/metadata/connector-metadata-service'
import * as executions from '../../../src/app/workflows/execution/execution-service'
import { issueService } from '../../../src/app/issue/issue.service'
import { db } from '../../helpers/db'
import { createMockConnectorMetadata, createMockExecution, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance
beforeAll(async () => { app = await setupTestEnvironment({ fresh: true }) })
afterAll(async () => { await teardownTestEnvironment() })
afterEach(() => vi.restoreAllMocks())

it('requires confirmation for the exact unsafe write before dispatching a replay', async () => {
    const ctx = await createTestContext(app)
    const workflow = createMockWorkflow({ projectId: ctx.project.id })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, trigger: {
        type: WorkflowTriggerType.EMPTY, name: 'trigger', displayName: 'Trigger', valid: true, settings: {}, lastUpdatedDate: new Date().toISOString(),
        nextAction: { type: WorkflowActionType.CONNECTOR, name: 'write', displayName: 'Send notification', valid: true, lastUpdatedDate: new Date().toISOString(), settings: { connectorName: 'test-unsafe', connectorVersion: '1.0.0', actionName: 'send', input: {}, propertySettings: {} } },
    } })
    await db.save('workflow_version', version)
    const execution = { ...createMockExecution({ projectId: ctx.project.id, workflowId: workflow.id, workflowVersionId: version.id, status: ExecutionStatus.FAILED, environment: RunEnvironment.PRODUCTION }), failedStep: { name: 'write', displayName: 'Send notification', message: JSON.stringify({ message: 'Target applied the write but returned HTTP 500', status: 500 }) } }
    await db.save('execution', execution)
    const failure = await issueService(app.log).recordFailure({ execution, workflowVersion: version })
    if (!failure) throw new Error('Expected issue')
    const action = createAction({ name: 'send', displayName: 'Send', description: '', classification: 'WRITE', reliability: { writeSafety: 'UNSAFE' }, props: {}, requireAuth: false, run: async () => undefined })
    const original = metadata.connectorMetadataService
    vi.spyOn(metadata, 'connectorMetadataService').mockImplementation((log) => ({ ...original(log), get: async () => createMockConnectorMetadata({ actions: { send: action } }) }))
    const retry = vi.fn().mockResolvedValue(execution)
    const originalExecutions = executions.executionService
    vi.spyOn(executions, 'executionService').mockImplementation((log) => ({ ...originalExecutions(log), retry }))
    const check = await ctx.post(`/v1/issues/${failure.issue.id}/replay-check`, {})
    expect(check.statusCode).toBe(200)
    expect(check.json().items[0].writeSteps).toEqual([{ stepName: 'write', displayName: 'Send notification', writeSafety: 'UNSAFE', willRun: true, needsConfirmation: true }])
    const body = { strategy: 'FROM_FAILED_STEP', includeDataProblems: true }
    for (const confirmedUnsafeSteps of [[], ['different-execution:write'], [`${execution.id}:different-step`]]) {
        const rejected = await ctx.post(`/v1/issues/${failure.issue.id}/replay`, { ...body, confirmedUnsafeSteps })
        expect(rejected.statusCode).toBe(400)
        expect(rejected.json().code).toBe('UNSAFE_REPLAY_NOT_CONFIRMED')
    }
    expect(retry).not.toHaveBeenCalled()
    const accepted = await ctx.post(`/v1/issues/${failure.issue.id}/replay`, { ...body, confirmedUnsafeSteps: [`${execution.id}:write`] })
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json()).toEqual({ queued: 1, skipped: 0 })
    expect(retry).toHaveBeenCalledTimes(1)
})
