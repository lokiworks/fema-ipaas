import { generateId, WorkflowStatus } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { webhookService } from '../../../src/app/webhooks/webhook.service'
import { db } from '../../helpers/db'
import { createMockWorkflow, createMockWorkflowVersion, mockAndSaveBasicSetup } from '../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null
const MAX_ENV = 'FEMA_WEBHOOK_RATE_LIMIT_MAX'
const WINDOW_ENV = 'FEMA_WEBHOOK_RATE_LIMIT_WINDOW_SECONDS'
const DEFAULT_MAX_REQUESTS = 600

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
})

function mockHandleWebhook() {
    return vi.spyOn(webhookService, 'handleWebhook').mockResolvedValue({
        status: StatusCodes.OK,
        body: {},
        headers: {},
    })
}

function configureLimit({ max, windowSeconds }: { max: number, windowSeconds: number }): void {
    vi.stubEnv(MAX_ENV, String(max))
    vi.stubEnv(WINDOW_ENV, String(windowSeconds))
}

async function hit({ workflowId, path = '', method = 'POST' }: { workflowId: string, path?: string, method?: 'POST' | 'GET' }) {
    return app!.inject({
        method,
        url: `/api/v1/webhooks/${workflowId}${path}`,
        body: method === 'POST' ? { test: true } : undefined,
    })
}

async function createEnabledWorkflow() {
    const { mockProject } = await mockAndSaveBasicSetup()
    const mockWorkflow = createMockWorkflow({
        projectId: mockProject.id,
        status: WorkflowStatus.ENABLED,
    })
    await db.save('workflow', [mockWorkflow])
    const mockWorkflowVersion = createMockWorkflowVersion({ workflowId: mockWorkflow.id })
    await db.save('workflow_version', [mockWorkflowVersion])
    await db.update('workflow', mockWorkflow.id, { publishedVersionId: mockWorkflowVersion.id })
    return mockWorkflow
}

describe('Webhook per-workflow rate limit', () => {
    it('rejects requests over the limit with 429 and Retry-After, without reaching the webhook service', async () => {
        configureLimit({ max: 3, windowSeconds: 30 })
        const handleWebhook = mockHandleWebhook()
        const workflowId = generateId()

        const accepted = await Promise.all([1, 2, 3].map(() => hit({ workflowId })))
        expect(accepted.map((response) => response.statusCode)).toEqual([200, 200, 200])
        expect(handleWebhook).toHaveBeenCalledTimes(3)

        const rejected = await hit({ workflowId })
        expect(rejected.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
        const retryAfter = Number(rejected.headers['retry-after'])
        expect(retryAfter).toBeGreaterThanOrEqual(1)
        expect(retryAfter).toBeLessThanOrEqual(30)
        expect(rejected.headers['x-ratelimit-limit']).toBe('3')
        expect(rejected.headers['x-ratelimit-remaining']).toBe('0')
        expect(rejected.json().statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
        expect(handleWebhook).toHaveBeenCalledTimes(3)
    })

    it('shares one counter across the sync, draft and test variants and across HTTP methods', async () => {
        configureLimit({ max: 4, windowSeconds: 30 })
        const handleWebhook = mockHandleWebhook()
        const workflowId = generateId()

        const statuses = []
        for (const request of [
            { path: '' },
            { path: '/sync' },
            { path: '/draft' },
            { path: '', method: 'GET' as const },
            { path: '/test-env/sync' },
            { path: '/draft/sync' },
        ]) {
            statuses.push((await hit({ workflowId, ...request })).statusCode)
        }

        expect(statuses).toEqual([200, 200, 200, 200, 429, 429])
        expect(handleWebhook).toHaveBeenCalledTimes(4)
    })

    it('counts each workflow separately', async () => {
        configureLimit({ max: 2, windowSeconds: 30 })
        const handleWebhook = mockHandleWebhook()
        const noisyWorkflowId = generateId()
        const quietWorkflowId = generateId()

        await hit({ workflowId: noisyWorkflowId })
        await hit({ workflowId: noisyWorkflowId })
        const noisyRejected = await hit({ workflowId: noisyWorkflowId })
        const quietAccepted = await hit({ workflowId: quietWorkflowId })

        expect(noisyRejected.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
        expect(quietAccepted.statusCode).toBe(StatusCodes.OK)
        expect(handleWebhook).toHaveBeenCalledTimes(3)
    })

    it('accepts requests again once the window has passed', async () => {
        configureLimit({ max: 1, windowSeconds: 1 })
        const handleWebhook = mockHandleWebhook()
        const workflowId = generateId()

        expect((await hit({ workflowId })).statusCode).toBe(StatusCodes.OK)
        expect((await hit({ workflowId })).statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)

        await new Promise((resolve) => setTimeout(resolve, 1300))

        expect((await hit({ workflowId })).statusCode).toBe(StatusCodes.OK)
        expect(handleWebhook).toHaveBeenCalledTimes(2)
    })

    it('does not limit anything when the limit is set to 0', async () => {
        configureLimit({ max: 0, windowSeconds: 30 })
        const handleWebhook = mockHandleWebhook()
        const workflowId = generateId()

        const responses = await Promise.all(Array.from({ length: 30 }, () => hit({ workflowId })))

        expect(responses.every((response) => response.statusCode === StatusCodes.OK)).toBe(true)
        expect(handleWebhook).toHaveBeenCalledTimes(30)
    })

    it('allows a normal burst under the built-in default and cuts off right after it', async () => {
        const handleWebhook = mockHandleWebhook()
        const workflowId = generateId()

        const burst = []
        for (let index = 0; index < DEFAULT_MAX_REQUESTS; index++) {
            burst.push((await hit({ workflowId })).statusCode)
        }
        const overflow = await hit({ workflowId })

        expect(burst.every((status) => status === StatusCodes.OK)).toBe(true)
        expect(overflow.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
        expect(handleWebhook).toHaveBeenCalledTimes(DEFAULT_MAX_REQUESTS)
    })

    it('does not count requests whose workflow id is malformed', async () => {
        configureLimit({ max: 1, windowSeconds: 30 })
        mockHandleWebhook()

        const statuses = []
        for (let index = 0; index < 3; index++) {
            statuses.push((await hit({ workflowId: 'not-a-valid-id' })).statusCode)
        }

        expect(statuses).toEqual([400, 400, 400])
    })

    it('still runs the real webhook service for a request under the limit', async () => {
        configureLimit({ max: 2, windowSeconds: 30 })
        const workflow = await createEnabledWorkflow()

        const first = await hit({ workflowId: workflow.id })
        const second = await hit({ workflowId: workflow.id })
        const third = await hit({ workflowId: workflow.id })

        expect([first.statusCode, second.statusCode, third.statusCode]).toEqual([200, 200, 429])
    })
})
