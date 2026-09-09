import { ExecutionStatus } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockExecution, createMockProject, createMockWorkflowVersion } from '../../../../helpers/mocks'

const isConfigured = vi.fn()
const sendWorkflowFailure = vi.fn()
const getOneProject = vi.fn()
const getMetaInformation = vi.fn()
const runOnceWithin = vi.fn()

vi.mock('../../../../../src/app/helper/email/email-service', () => ({
    emailService: vi.fn(() => ({ isConfigured, sendWorkflowFailure })),
}))
vi.mock('../../../../../src/app/project/project-service', () => ({
    projectService: vi.fn(() => ({ getOne: getOneProject })),
}))
vi.mock('../../../../../src/app/user/user-service', () => ({
    userService: vi.fn(() => ({ getMetaInformation })),
}))
vi.mock('../../../../../src/app/database/redis-connections', async (importOriginal) => ({
    ...await importOriginal<typeof import('../../../../../src/app/database/redis-connections')>(),
    distributedStore: {
        runOnceWithin: (...args: unknown[]) => runOnceWithin(...args),
    },
}))
vi.mock('../../../../../src/app/helper/domain-helper', () => ({
    domainHelper: {
        getPublicUrl: ({ path }: { path: string }) => Promise.resolve(`https://app.example.com/${path}`),
    },
}))

import { executionFailureNotifier } from '../../../../../src/app/workflows/execution/execution-failure-notifier'

const log: FastifyBaseLogger = {
    level: 'info',
    fatal: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: vi.fn(),
}

function buildFixture(notifyWorkflowOwnerOnFailure: boolean) {
    const project = createMockProject({ displayName: 'Payroll', notifyWorkflowOwnerOnFailure })
    const workflowVersion = createMockWorkflowVersion({ displayName: 'Sync employees' })
    const execution = createMockExecution({
        projectId: project.id,
        workflowVersionId: workflowVersion.id,
        status: ExecutionStatus.FAILED,
        finishTime: '2026-09-09T10:00:00.000Z',
    })
    return {
        project,
        params: {
            execution: {
                ...execution,
                failedStep: { name: 'step_1', displayName: 'Create record', message: 'HTTP 500' },
            },
            workflowVersion,
        },
    }
}

describe('executionFailureNotifier.notifyOwner', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        isConfigured.mockReturnValue(true)
        getMetaInformation.mockResolvedValue({ email: 'owner@example.com' })
        sendWorkflowFailure.mockResolvedValue(undefined)
        runOnceWithin.mockImplementation(async (_key: string, _ttl: number, fn: () => Promise<unknown>) => {
            await fn()
            return true
        })
    })

    it('emails the owner with the failed step and a link to the run', async () => {
        const { project, params } = buildFixture(true)
        getOneProject.mockResolvedValue(project)

        await executionFailureNotifier(log).notifyOwner(params)

        expect(sendWorkflowFailure).toHaveBeenCalledTimes(1)
        expect(sendWorkflowFailure).toHaveBeenCalledWith(expect.objectContaining({
            to: 'owner@example.com',
            projectName: 'Payroll',
            workflowName: 'Sync employees',
            failedStepDisplayName: 'Create record',
            failedStepMessage: 'HTTP 500',
            failedAt: '2026-09-09T10:00:00.000Z',
            runUrl: `https://app.example.com/projects/${params.execution.projectId}/runs/${params.execution.id}`,
        }))
    })

    it('stays silent, and touches no database, when SMTP is unconfigured', async () => {
        isConfigured.mockReturnValue(false)
        const { project, params } = buildFixture(true)
        getOneProject.mockResolvedValue(project)

        await executionFailureNotifier(log).notifyOwner(params)

        expect(getOneProject).not.toHaveBeenCalled()
        expect(sendWorkflowFailure).not.toHaveBeenCalled()
    })

    it('stays silent when the project has the notification turned off', async () => {
        const { project, params } = buildFixture(false)
        getOneProject.mockResolvedValue(project)

        await executionFailureNotifier(log).notifyOwner(params)

        expect(sendWorkflowFailure).not.toHaveBeenCalled()
    })

    it('throttles per workflow so a broken workflow cannot flood the owner', async () => {
        const { project, params } = buildFixture(true)
        getOneProject.mockResolvedValue(project)
        runOnceWithin.mockResolvedValue(false)

        await executionFailureNotifier(log).notifyOwner(params)

        expect(runOnceWithin).toHaveBeenCalledWith(
            `execution-failure-notified:${params.execution.workflowId}`,
            3600,
            expect.any(Function),
        )
        expect(sendWorkflowFailure).not.toHaveBeenCalled()
    })

    it('swallows its own failures so a run never breaks on a notification', async () => {
        const { project, params } = buildFixture(true)
        getOneProject.mockResolvedValue(project)
        runOnceWithin.mockRejectedValue(new Error('redis is down'))

        await expect(executionFailureNotifier(log).notifyOwner(params)).resolves.toBeUndefined()
        expect(log.error).toHaveBeenCalled()
    })
})
