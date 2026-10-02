import { generateId } from '@fema-ipaas/core-utils'
import { ExecutionStatus, IssueStatus, RunEnvironment, TriggerRunStatus, WorkflowStatus, WorkflowTriggerType, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { issueSideEffects } from '../../../src/app/issue/issue-side-effects'
import { issueRepo } from '../../../src/app/issue/issue.service'
import { triggerRunIssues } from '../../../src/app/trigger/trigger-run/trigger-run-issues'
import { db } from '../../helpers/db'
import { createMockExecution, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function seedPollingWorkflow({ ctx, mappingTableId }: { ctx: TestContext, mappingTableId?: string }): Promise<{ workflowId: string, versionId: string }> {
    const workflow = createMockWorkflow({ projectId: ctx.project.id, status: WorkflowStatus.ENABLED })
    const versionId = generateId()
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({
        id: versionId,
        workflowId: workflow.id,
        state: WorkflowVersionState.LOCKED,
        valid: true,
        trigger: {
            type: WorkflowTriggerType.CONNECTOR,
            name: 'trigger',
            displayName: 'Employee Changed',
            valid: true,
            lastUpdatedDate: dayjs().toISOString(),
            settings: {
                connectorName: '@fema-ipaas/connector-beisen',
                connectorVersion: '0.2.2',
                triggerName: 'employee_changed',
                propertySettings: {},
                input: {},
            },
            ...(mappingTableId ? {
                nextAction: {
                    type: 'CONNECTOR',
                    name: 'step_1',
                    displayName: 'Map fields',
                    valid: true,
                    skip: false,
                    lastUpdatedDate: dayjs().toISOString(),
                    settings: {
                        connectorName: '@fema-ipaas/connector-data-mapper',
                        connectorVersion: '0.4.0',
                        actionName: 'map_fields',
                        propertySettings: {},
                        input: { mapping: { fields: [{ id: 'f1', target: 'departmentId', source: '{{trigger.Dept}}', transforms: [{ type: 'LOOKUP', arg: mappingTableId }] }] } },
                    },
                },
            } : {}),
        } as never,
    })
    await db.save('workflow_version', version)
    await db.update('workflow', workflow.id, { publishedVersionId: version.id, updated: dayjs().subtract(20, 'minute').toISOString() })
    return { workflowId: workflow.id, versionId: version.id }
}

function pollFailure({ ctx, workflowId, versionId, message }: { ctx: TestContext, workflowId: string, versionId: string, message: string | null }) {
    return triggerRunIssues(app!.log).record({
        tenantId: ctx.tenant.id,
        connectorName: '@fema-ipaas/connector-beisen',
        status: TriggerRunStatus.FAILED,
        workflow: { id: workflowId, versionId, projectId: ctx.project.id, failureMessage: message },
    })
}

function pollRecovery({ ctx, workflowId, versionId }: { ctx: TestContext, workflowId: string, versionId: string }) {
    return triggerRunIssues(app!.log).record({
        tenantId: ctx.tenant.id,
        connectorName: '@fema-ipaas/connector-beisen',
        status: TriggerRunStatus.COMPLETED,
        workflow: { id: workflowId, versionId, projectId: ctx.project.id, failureMessage: null },
    })
}

describe('A polling trigger that cannot reach the source system', () => {
    const rateLimitMessage = JSON.stringify({ __apErrorVersion: 1, message: 'HTTP 429: Beisen API rate limit exceeded' })

    it('opens one issue for the workflow and classifies it from the error message', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedPollingWorkflow({ ctx })

        await pollFailure({ ctx, workflowId, versionId, message: rateLimitMessage })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(issues).toHaveLength(1)
        expect(issues[0].signature).toBe(`${workflowId}:trigger:HTTP_429`)
        expect(issues[0].errorCode).toBe('HTTP_429')
        expect(issues[0].workflowId).toBe(workflowId)
        expect(issues[0].stepName).toBe('trigger')
        expect(issues[0].status).toBe(IssueStatus.OPEN)
        expect(issues[0].occurrences).toBe(1)
    })

    it('does not count every failed poll of the same outage as another occurrence', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedPollingWorkflow({ ctx })

        await pollFailure({ ctx, workflowId, versionId, message: rateLimitMessage })
        await pollFailure({ ctx, workflowId, versionId, message: rateLimitMessage })
        await pollFailure({ ctx, workflowId, versionId, message: rateLimitMessage })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(issues).toHaveLength(1)
        expect(issues[0].occurrences).toBe(1)
    })

    it('resolves the issue when a later poll succeeds and reopens it when the outage returns', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedPollingWorkflow({ ctx })
        await pollFailure({ ctx, workflowId, versionId, message: rateLimitMessage })

        await pollRecovery({ ctx, workflowId, versionId })

        const [resolved] = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(resolved.status).toBe(IssueStatus.RESOLVED)
        expect(resolved.resolvedById).toBeNull()

        await pollFailure({ ctx, workflowId, versionId, message: rateLimitMessage })

        const [reopened] = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(reopened.status).toBe(IssueStatus.OPEN)
        expect(reopened.reopened).toBe(true)
        expect(reopened.occurrences).toBe(2)
    })

    it('still records an issue when the worker has no error text to pass on', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedPollingWorkflow({ ctx })

        await pollFailure({ ctx, workflowId, versionId, message: null })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(issues).toHaveLength(1)
        expect(issues[0].errorCode).toBe('STEP_FAILED')
    })

    it('does not touch issues of runs that failed in a step', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedPollingWorkflow({ ctx })
        const execution = {
            ...createMockExecution({ projectId: ctx.project.id, workflowId, workflowVersionId: versionId, status: ExecutionStatus.FAILED, environment: RunEnvironment.PRODUCTION }),
            failedStep: { name: 'step_1', displayName: 'Create account', message: JSON.stringify({ message: 'bad input' }) },
        }
        await db.save('execution', execution)
        await issueSideEffects(app!.log).onProductionFailure({ execution: await db.findOneByOrFail('execution', { id: execution.id }), workflowVersion: null })

        await pollRecovery({ ctx, workflowId, versionId })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(issues).toHaveLength(1)
        expect(issues[0].status).toBe(IssueStatus.OPEN)
    })
})

describe('Replaying after a mapping table was fixed', () => {
    async function seedFailureOnMappedStep({ ctx }: { ctx: TestContext }): Promise<{ issueId: string, tableId: string }> {
        const created = await ctx.post('/v1/mapping-tables', {
            projectId: ctx.project.id,
            name: 'Departments',
            description: '',
            keyLabel: 'Beisen',
            valueLabel: 'Feishu',
            missingBehavior: 'ERROR',
            defaultValue: null,
            rows: [{ k: 'R&D', v: 'od-rd' }],
        })
        expect(created.statusCode).toBe(StatusCodes.CREATED)
        const tableId = created.json().id
        await db.update('mapping_table', tableId, { updated: dayjs().subtract(30, 'minute').toISOString() })
        const { workflowId, versionId } = await seedPollingWorkflow({ ctx, mappingTableId: tableId })
        const execution = {
            ...createMockExecution({
                projectId: ctx.project.id,
                workflowId,
                workflowVersionId: versionId,
                status: ExecutionStatus.FAILED,
                environment: RunEnvironment.PRODUCTION,
                created: dayjs().subtract(10, 'minute').toISOString(),
                startTime: dayjs().subtract(10, 'minute').toISOString(),
                finishTime: dayjs().subtract(9, 'minute').toISOString(),
            }),
            failedStep: { name: 'step_1', displayName: 'Map fields', message: JSON.stringify({ message: 'departmentId: "Legal" is not in mapping table "Departments"' }) },
        }
        await db.save('execution', execution)
        await issueSideEffects(app!.log).onProductionFailure({ execution: await db.findOneByOrFail('execution', { id: execution.id }), workflowVersion: null })
        const [issue] = await issueRepo().findBy({ projectId: ctx.project.id })
        return { issueId: issue.id, tableId }
    }

    it('flags the run as a data problem while nothing changed since the failure', async () => {
        const ctx = await createTestContext(app!)
        const { issueId } = await seedFailureOnMappedStep({ ctx })

        const check = (await ctx.post(`/v1/issues/${issueId}/replay-check`, {})).json()

        expect(check.items).toHaveLength(1)
        expect(check.items[0].category).toBe('DATA_PROBLEM')
        expect(check.items[0].reason).toBe('UNCHANGED_SINCE_FAILURE')
    })

    it('treats a mapping table edited after the failure as a change worth replaying', async () => {
        const ctx = await createTestContext(app!)
        const { issueId, tableId } = await seedFailureOnMappedStep({ ctx })

        const updated = await ctx.post(`/v1/mapping-tables/${tableId}`, {
            projectId: ctx.project.id,
            name: 'Departments',
            description: '',
            keyLabel: 'Beisen',
            valueLabel: 'Feishu',
            missingBehavior: 'ERROR',
            defaultValue: null,
            rows: [{ k: 'R&D', v: 'od-rd' }, { k: 'Legal', v: 'od-legal' }],
        })
        expect(updated.statusCode).toBe(StatusCodes.OK)
        const check = (await ctx.post(`/v1/issues/${issueId}/replay-check`, {})).json()

        expect(check.items[0].category).toBe('REPLAYABLE')
        expect(check.items[0].reason).toBe('MAPPING_TABLE_CHANGED')
    })
})
