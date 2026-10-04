import { AgentApprovalInvalidReason, AgentApprovalStatus } from '@fema-ipaas/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    approvalRows: new Map<string, Record<string, unknown>>(),
    executionExists: vi.fn(),
    invalidateForRun: vi.fn(),
    resumeFromWaitpoint: vi.fn(),
    latestVersions: vi.fn(),
    resolveRole: vi.fn(),
}))

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({
        findOneBy: async ({ id }: { id: string }) => mocks.approvalRows.get(id) ?? null,
        find: async () => [...mocks.approvalRows.values()],
    }),
}))
vi.mock('../../../../src/app/workflows/execution/execution-service', () => ({
    executionRepo: () => ({ existsBy: mocks.executionExists }),
    findExecutionOrThrow: vi.fn(),
}))
vi.mock('../../../../src/app/workflows/execution/waitpoint/resume-service', () => ({
    resumeService: () => ({ resumeFromWaitpoint: mocks.resumeFromWaitpoint }),
}))
vi.mock('../../../../src/app/agent-approval/agent-approval-invalidation', () => ({
    agentApprovalInvalidation: { invalidateForRun: mocks.invalidateForRun },
}))
vi.mock('../../../../src/app/workflows/workflow-version/workflow-version.service', () => ({
    workflowVersionService: () => ({ getLatestVersionsByWorkflowIds: mocks.latestVersions }),
}))
vi.mock('../../../../src/app/project/project-access', () => ({
    projectAccess: () => ({ resolveRole: mocks.resolveRole }),
}))
vi.mock('../../../../src/app/notification/notification.service', () => ({ notificationService: () => ({}) }))
vi.mock('../../../../src/app/privacy/privacy.service', () => ({ privacyService: () => ({}) }))
vi.mock('../../../../src/app/project/project-service', () => ({ projectService: () => ({}) }))
vi.mock('../../../../src/app/workflows/workflow/workflow.repo', () => ({ workflowRepo: () => ({}) }))

import { FastifyBaseLogger } from 'fastify'
import { agentApprovalService } from '../../../../src/app/agent-approval/agent-approval.service'

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as FastifyBaseLogger

function approval(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 'ap1',
        created: '2026-10-04T00:00:00.000Z',
        updated: '2026-10-04T00:00:00.000Z',
        projectId: 'p1',
        workflowId: 'wf1',
        workflowDisplayName: '入职开通账号',
        executionId: 'run1',
        waitpointId: 'wp1',
        stepName: 'agent',
        tool: 'create_ticket',
        arguments: {},
        message: '',
        status: AgentApprovalStatus.PENDING,
        approverIds: ['u1'],
        decidedById: null,
        decidedAt: null,
        comment: null,
        invalidReason: null,
        expiresAt: '2099-01-01T00:00:00.000Z',
        ...overrides,
    }
}

describe('agentApprovalService.decide', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.approvalRows.clear()
        mocks.executionExists.mockResolvedValue(true)
    })

    it('says the run is gone, closes the request and resumes nothing', async () => {
        mocks.approvalRows.set('ap1', approval())
        mocks.executionExists.mockResolvedValue(false)
        await expect(agentApprovalService(log).decide({ id: 'ap1', projectId: 'p1', userId: 'u1', request: { approved: true } })).rejects.toMatchObject({
            error: { params: { message: 'This request is no longer valid because its run no longer exists. Nothing was run.' } },
        })
        expect(mocks.invalidateForRun).toHaveBeenCalledWith({ approvalId: 'ap1', projectId: 'p1' })
        expect(mocks.resumeFromWaitpoint).not.toHaveBeenCalled()
    })

    it('says the workflow was deleted when the request was already invalidated for that reason', async () => {
        mocks.approvalRows.set('ap1', approval({ status: AgentApprovalStatus.INVALIDATED, invalidReason: AgentApprovalInvalidReason.WORKFLOW_DELETED }))
        await expect(agentApprovalService(log).decide({ id: 'ap1', projectId: 'p1', userId: 'u1', request: { approved: false, comment: '不要' } })).rejects.toMatchObject({
            error: { params: { message: 'This request is no longer valid because its workflow was deleted. Nothing was run.' } },
        })
        expect(mocks.resumeFromWaitpoint).not.toHaveBeenCalled()
    })

    it('keeps the generic message for requests somebody else already decided', async () => {
        mocks.approvalRows.set('ap1', approval({ status: AgentApprovalStatus.APPROVED }))
        await expect(agentApprovalService(log).decide({ id: 'ap1', projectId: 'p1', userId: 'u1', request: { approved: true } })).rejects.toMatchObject({
            error: { params: { message: 'This request has already been handled' } },
        })
    })

    it('does not look at the run for people who are not approvers', async () => {
        mocks.approvalRows.set('ap1', approval({ approverIds: ['someone-else'] }))
        await expect(agentApprovalService(log).decide({ id: 'ap1', projectId: 'p1', userId: 'u1', request: { approved: true } })).rejects.toMatchObject({
            error: { params: { message: 'You are not an approver of this request' } },
        })
        expect(mocks.executionExists).not.toHaveBeenCalled()
    })
})

describe('agentApprovalService.list', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.approvalRows.clear()
        mocks.resolveRole.mockResolvedValue({ permissions: [] })
    })

    it('shows the live workflow name while the workflow exists', async () => {
        mocks.approvalRows.set('ap1', approval())
        mocks.latestVersions.mockResolvedValue(new Map([['wf1', { displayName: '入职开通账号（新）' }]]))
        const [row] = await agentApprovalService(log).list({ query: { projectId: 'p1' }, userId: 'u1' })
        expect(row.workflowDisplayName).toBe('入职开通账号（新）')
    })

    it('falls back to the name snapshot after the workflow was deleted, never to the raw id', async () => {
        mocks.approvalRows.set('ap1', approval({ status: AgentApprovalStatus.INVALIDATED }))
        mocks.latestVersions.mockResolvedValue(new Map())
        const [row] = await agentApprovalService(log).list({ query: { projectId: 'p1' }, userId: 'u1' })
        expect(row.workflowDisplayName).toBe('入职开通账号')
        expect(row.workflowDisplayName).not.toBe('wf1')
    })
})
