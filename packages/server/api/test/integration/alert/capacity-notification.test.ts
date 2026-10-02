import { NotificationType, ProjectType, RunEnvironment, TenantRole } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { alertDispatcher } from '../../../src/app/alert/alert-dispatcher'
import { databaseConnection } from '../../../src/app/database/database-connection'
import { db } from '../../helpers/db'
import { createMockExecution, createMockProject, createMockWorkflow, createMockWorkflowVersion, mockBasicUser } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createProjectAtCapacity({ ctx, ownerId }: { ctx: TestContext, ownerId: string }): Promise<string> {
    const project = createMockProject({ ownerId, tenantId: ctx.tenant.id, type: ProjectType.TEAM })
    await db.save('project', project)
    await db.update('project', project.id, { monthlyRunsLimit: 2 })
    const workflow = createMockWorkflow({ projectId: project.id })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id })
    await db.save('workflow_version', version)
    const executions = [0, 1].map(() => createMockExecution({
        projectId: project.id,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        environment: RunEnvironment.PRODUCTION,
        created: new Date().toISOString(),
    }))
    await db.save('execution', executions)
    return project.id
}

async function createCapacityPolicy({ ctx, projectId }: { ctx: TestContext, projectId: string }): Promise<void> {
    const channel = await ctx.post('/v1/alerts/channels', { name: 'cap-channel', type: 'WEBHOOK', url: 'https://example.com/hook' })
    expect(channel.statusCode).toBe(StatusCodes.CREATED)
    const policy = await ctx.post('/v1/alerts/policies', {
        name: 'cap-policy',
        enabled: true,
        projectIds: [projectId],
        workflowIds: [],
        events: ['CAPACITY'],
        failureRate: null,
        capacityThresholdPercent: 80,
        groupWindowMinutes: 5,
        quietHours: { enabled: false, from: '22:00', to: '08:00', timezone: 'UTC' },
        escalation: { enabled: false, afterMinutes: 30, channelId: null },
        channelIds: [channel.json().id],
    })
    expect(policy.statusCode).toBe(StatusCodes.CREATED)
}

async function capacityNotifications({ userId }: { userId: string }): Promise<{ link: string, title: string, body: string }[]> {
    return databaseConnection().getRepository('notification').find({ where: { recipientId: userId, type: NotificationType.CAPACITY_THRESHOLD } }) as Promise<{ link: string, title: string, body: string }[]>
}

describe('capacity threshold in-app notifications', () => {
    it('tells the tenant admin and a non-admin project owner, each with a link they can open', async () => {
        const admin = await createTestContext(app!)
        const { mockUser: projectOwner } = await mockBasicUser({ user: { tenantId: admin.tenant.id, tenantRole: TenantRole.MEMBER } })
        const projectId = await createProjectAtCapacity({ ctx: admin, ownerId: projectOwner.id })
        await createCapacityPolicy({ ctx: admin, projectId })

        await alertDispatcher(app!.log).runScheduledWork()

        const forAdmin = await capacityNotifications({ userId: admin.user.id })
        const forOwner = await capacityNotifications({ userId: projectOwner.id })
        expect(forAdmin).toHaveLength(1)
        expect(forAdmin[0].link).toBe('/tenant/limits/usage')
        expect(forOwner).toHaveLength(1)
        expect(forOwner[0].link).toBe(`/projects/${projectId}/automations`)
        expect(forOwner[0].body).toContain('2 / 2')
    })

    it('sends one notification when the project owner is also the tenant admin, and only once per month', async () => {
        const admin = await createTestContext(app!)
        const projectId = await createProjectAtCapacity({ ctx: admin, ownerId: admin.user.id })
        await createCapacityPolicy({ ctx: admin, projectId })

        await alertDispatcher(app!.log).runScheduledWork()
        await alertDispatcher(app!.log).runScheduledWork()

        const received = await capacityNotifications({ userId: admin.user.id })
        expect(received).toHaveLength(1)
        expect(received[0].link).toBe('/tenant/limits/usage')
        const records = await databaseConnection().getRepository('alert_record').findBy({ projectId, kind: 'CAPACITY' })
        expect(records).toHaveLength(1)
    })

    it('does not notify members of an unrelated project', async () => {
        const admin = await createTestContext(app!)
        const bystander = await createTestContext(app!)
        const projectId = await createProjectAtCapacity({ ctx: admin, ownerId: admin.user.id })
        await createCapacityPolicy({ ctx: admin, projectId })

        await alertDispatcher(app!.log).runScheduledWork()

        expect(await capacityNotifications({ userId: bystander.user.id })).toHaveLength(0)
    })
})
