import { WebhookRenewStrategy } from '@fema-ipaas/connector-sdk'
import {
    ApplicationEventName,
    Workflow,
    WorkflowOperationRequest,
    WorkflowOperationType,
    WorkflowStatus,
    WorkflowTrigger,
    WorkflowTriggerType,
    WorkflowVersion,
    WorkflowVersionState,
    PackageType,
    ConnectorType,
    PropertyExecutionType,
    TriggerStrategy,
    TriggerTestStrategy,
    WebhookHandshakeStrategy,
} from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { workflowService } from '../../../../src/app/workflows/workflow/workflow.service'
import * as applicationEventsModule from '../../../../src/app/helper/application-events'
import { actionsEmitted } from '../../../helpers/application-events'
import { db } from '../../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion, createMockConnectorMetadata } from '../../../helpers/mocks'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance
const originalApplicationEvents = applicationEventsModule.applicationEvents

beforeAll(async () => {
    app = await setupTestEnvironment({ fresh: true })
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Workflow application events', () => {
    let sendUserEventSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
        sendUserEventSpy = vi.fn()
        vi.spyOn(applicationEventsModule, 'applicationEvents').mockImplementation((log) => {
            const real = originalApplicationEvents(log)
            return {
                ...real,
                sendUserEvent: sendUserEventSpy,
            }
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('Create workflow', () => {
        it('emits WORKFLOW_CREATED when POST /v1/workflows succeeds', async () => {
            const ctx = await createTestContext(app)

            const response = await ctx.post('/v1/workflows', {
                displayName: 'My workflow',
                projectId: ctx.project.id,
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            expect(actionsEmitted(sendUserEventSpy)).toEqual([
                ApplicationEventName.WORKFLOW_CREATED,
            ])
        })
    })

    describe('Delete workflow', () => {
        it('emits WORKFLOW_DELETED when DELETE /v1/workflows/:id succeeds', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({
                ctx,
                initialStatus: WorkflowStatus.DISABLED,
                publishCurrentVersion: false,
            })

            const response = await ctx.delete(`/v1/workflows/${workflow.id}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
            expect(actionsEmitted(sendUserEventSpy)).toEqual([
                ApplicationEventName.WORKFLOW_DELETED,
            ])
        })
    })

    describe('CHANGE_STATUS operation', () => {
        it('emits WORKFLOW_ACTIVATED when going from DISABLED to ENABLED', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({ ctx, initialStatus: WorkflowStatus.DISABLED })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.CHANGE_STATUS,
                request: { status: WorkflowStatus.ENABLED },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(actionsEmitted(sendUserEventSpy)).toEqual([
                ApplicationEventName.WORKFLOW_UPDATED,
                ApplicationEventName.WORKFLOW_ACTIVATED,
            ])
        })

        it('emits WORKFLOW_DEACTIVATED when going from ENABLED to DISABLED', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({ ctx, initialStatus: WorkflowStatus.ENABLED })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.CHANGE_STATUS,
                request: { status: WorkflowStatus.DISABLED },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(actionsEmitted(sendUserEventSpy)).toEqual([
                ApplicationEventName.WORKFLOW_UPDATED,
                ApplicationEventName.WORKFLOW_DEACTIVATED,
            ])
        })

        it('does NOT emit a lifecycle event when status is unchanged (DISABLED -> DISABLED)', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({ ctx, initialStatus: WorkflowStatus.DISABLED })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.CHANGE_STATUS,
                request: { status: WorkflowStatus.DISABLED },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(actionsEmitted(sendUserEventSpy)).toEqual([
                ApplicationEventName.WORKFLOW_UPDATED,
            ])
            expect(actionsEmitted(sendUserEventSpy)).not.toContain(ApplicationEventName.WORKFLOW_ACTIVATED)
            expect(actionsEmitted(sendUserEventSpy)).not.toContain(ApplicationEventName.WORKFLOW_DEACTIVATED)
        })

        it('does NOT emit a lifecycle event when status is unchanged (ENABLED -> ENABLED)', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({ ctx, initialStatus: WorkflowStatus.ENABLED })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.CHANGE_STATUS,
                request: { status: WorkflowStatus.ENABLED },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(actionsEmitted(sendUserEventSpy)).toEqual([
                ApplicationEventName.WORKFLOW_UPDATED,
            ])
            expect(actionsEmitted(sendUserEventSpy)).not.toContain(ApplicationEventName.WORKFLOW_ACTIVATED)
            expect(actionsEmitted(sendUserEventSpy)).not.toContain(ApplicationEventName.WORKFLOW_DEACTIVATED)
        })
    })

    describe('LOCK_AND_PUBLISH operation', () => {
        it('emits WORKFLOW_PUBLISHED and WORKFLOW_ACTIVATED when publishing a previously DISABLED workflow (status defaults to ENABLED)', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({
                ctx,
                initialStatus: WorkflowStatus.DISABLED,
                publishCurrentVersion: false,
            })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.LOCK_AND_PUBLISH,
                request: {},
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(actionsEmitted(sendUserEventSpy)).toEqual([
                ApplicationEventName.WORKFLOW_UPDATED,
                ApplicationEventName.WORKFLOW_PUBLISHED,
                ApplicationEventName.WORKFLOW_ACTIVATED,
            ])
        })

        it('emits only WORKFLOW_PUBLISHED when re-publishing an already-ENABLED workflow', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({ ctx, initialStatus: WorkflowStatus.ENABLED })
            await seedAdditionalDraftVersion({ workflowId: workflow.id, userId: ctx.user.id })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.LOCK_AND_PUBLISH,
                request: { status: WorkflowStatus.ENABLED },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(actionsEmitted(sendUserEventSpy)).toEqual([
                ApplicationEventName.WORKFLOW_UPDATED,
                ApplicationEventName.WORKFLOW_PUBLISHED,
            ])
            expect(actionsEmitted(sendUserEventSpy)).not.toContain(ApplicationEventName.WORKFLOW_ACTIVATED)
            expect(actionsEmitted(sendUserEventSpy)).not.toContain(ApplicationEventName.WORKFLOW_DEACTIVATED)
        })

        it('emits only WORKFLOW_PUBLISHED when re-publishing an already-ENABLED workflow with no explicit status (defaults to ENABLED)', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({ ctx, initialStatus: WorkflowStatus.ENABLED })
            await seedAdditionalDraftVersion({ workflowId: workflow.id, userId: ctx.user.id })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.LOCK_AND_PUBLISH,
                request: {},
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(actionsEmitted(sendUserEventSpy)).toEqual([
                ApplicationEventName.WORKFLOW_UPDATED,
                ApplicationEventName.WORKFLOW_PUBLISHED,
            ])
            expect(actionsEmitted(sendUserEventSpy)).not.toContain(ApplicationEventName.WORKFLOW_ACTIVATED)
            expect(actionsEmitted(sendUserEventSpy)).not.toContain(ApplicationEventName.WORKFLOW_DEACTIVATED)
        })

        it('emits WORKFLOW_PUBLISHED and WORKFLOW_DEACTIVATED when publishing with explicit DISABLED status from an ENABLED workflow', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({ ctx, initialStatus: WorkflowStatus.ENABLED })
            await seedAdditionalDraftVersion({ workflowId: workflow.id, userId: ctx.user.id })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.LOCK_AND_PUBLISH,
                request: { status: WorkflowStatus.DISABLED },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(actionsEmitted(sendUserEventSpy)).toEqual([
                ApplicationEventName.WORKFLOW_UPDATED,
                ApplicationEventName.WORKFLOW_PUBLISHED,
                ApplicationEventName.WORKFLOW_DEACTIVATED,
            ])
        })
    })

    describe('Non-lifecycle operations', () => {
        it('does NOT emit any lifecycle events on UPDATE_METADATA', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({ ctx, initialStatus: WorkflowStatus.DISABLED })

            const response = await ctx.post(`/v1/workflows/${workflow.id}`, {
                type: WorkflowOperationType.UPDATE_METADATA,
                request: { metadata: { foo: 'bar' } },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const actions = actionsEmitted(sendUserEventSpy)
            expect(actions).toEqual([ApplicationEventName.WORKFLOW_UPDATED])
            expect(actions).not.toContain(ApplicationEventName.WORKFLOW_PUBLISHED)
            expect(actions).not.toContain(ApplicationEventName.WORKFLOW_ACTIVATED)
            expect(actions).not.toContain(ApplicationEventName.WORKFLOW_DEACTIVATED)
        })
    })

    describe('Callers other than the HTTP route', () => {
        it('emits WORKFLOW_UPDATED when workflowService is called directly, with no request and no controller', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({ ctx, initialStatus: WorkflowStatus.DISABLED, publishCurrentVersion: false })

            await workflowService(app.log).update({
                id: workflow.id,
                projectId: ctx.project.id,
                tenantId: ctx.tenant.id,
                userId: ctx.user.id,
                operation: renameOperation,
            })

            expect(actionsEmitted(sendUserEventSpy)).toEqual([ApplicationEventName.WORKFLOW_UPDATED])
        })

        it('emits nothing when the caller opts out with emitEvents: false', async () => {
            const ctx = await createTestContext(app)
            const { workflow } = await seedPublishableWorkflow({ ctx, initialStatus: WorkflowStatus.DISABLED, publishCurrentVersion: false })

            await workflowService(app.log).update({
                id: workflow.id,
                projectId: ctx.project.id,
                tenantId: ctx.tenant.id,
                userId: ctx.user.id,
                operation: renameOperation,
                emitEvents: false,
            })

            expect(actionsEmitted(sendUserEventSpy)).toEqual([])
        })
    })
})

const renameOperation: WorkflowOperationRequest = {
    type: WorkflowOperationType.CHANGE_NAME,
    request: { displayName: 'Renamed by the service' },
}

type SeedPublishableWorkflowParams = {
    ctx: TestContext
    initialStatus: WorkflowStatus
    publishCurrentVersion?: boolean
}

type SeedAdditionalDraftVersionParams = {
    workflowId: string
    userId: string
}

async function seedPublishableWorkflow({
    ctx,
    initialStatus,
    publishCurrentVersion,
}: SeedPublishableWorkflowParams): Promise<{ workflow: Workflow, workflowVersion: WorkflowVersion }> {
    const connectorMetadata = createMockConnectorMetadata({
        name: '@fema-ipaas/connector-schedule',
        version: '0.1.5',
        triggers: {
            every_hour: {
                name: 'every_hour',
                displayName: 'Every Hour',
                description: 'Triggers the current workflow every hour',
                requireAuth: true,
                props: {},
                type: TriggerStrategy.WEBHOOK,
                handshakeConfiguration: { strategy: WebhookHandshakeStrategy.NONE },
                renewConfiguration: { strategy: WebhookRenewStrategy.NONE },
                sampleData: {},
                testStrategy: TriggerTestStrategy.TEST_FUNCTION,
            },
        },
        connectorType: ConnectorType.OFFICIAL,
        packageType: PackageType.REGISTRY,
    })
    await db.save('connector_metadata', connectorMetadata)

    const workflow = createMockWorkflow({
        projectId: ctx.project.id,
        status: initialStatus,
    })
    await db.save('workflow', workflow)

    const trigger = scheduleTrigger()
    const shouldPublish = publishCurrentVersion ?? true
    const workflowVersion = createMockWorkflowVersion({
        workflowId: workflow.id,
        updatedBy: ctx.user.id,
        state: shouldPublish ? WorkflowVersionState.LOCKED : WorkflowVersionState.DRAFT,
        valid: true,
        trigger,
    })
    await db.save('workflow_version', workflowVersion)
    if (shouldPublish) {
        await db.update('workflow', workflow.id, { publishedVersionId: workflowVersion.id })
    }
    return { workflow, workflowVersion }
}

async function seedAdditionalDraftVersion({
    workflowId,
    userId,
}: SeedAdditionalDraftVersionParams): Promise<WorkflowVersion> {
    const draftVersion = createMockWorkflowVersion({
        workflowId,
        updatedBy: userId,
        state: WorkflowVersionState.DRAFT,
        valid: true,
        trigger: scheduleTrigger(),
    })
    await db.save('workflow_version', draftVersion)
    return draftVersion
}

function scheduleTrigger(): WorkflowTrigger {
    return {
        type: WorkflowTriggerType.CONNECTOR,
        settings: {
            connectorName: '@fema-ipaas/connector-schedule',
            connectorVersion: '0.1.5',
            input: { run_on_weekends: false },
            triggerName: 'every_hour',
            propertySettings: {
                run_on_weekends: { type: PropertyExecutionType.MANUAL },
            },
        },
        valid: true,
        name: 'trigger',
        displayName: 'Schedule',
        lastUpdatedDate: new Date().toISOString(),
    }
}

