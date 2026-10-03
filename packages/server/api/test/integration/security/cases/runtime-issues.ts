import { Permission } from '@fema-ipaas/core-utils'
import { IssueStatus, WorkflowRetryStrategy } from '@fema-ipaas/shared'
import { MatrixCase } from '../support/matrix'
import { runtimeChecks } from '../support/runtime-checks'
import { runtimeSeed } from '../support/runtime-seed'
import { Scope, World } from '../support/world'

async function issueWithAlert({ world, scope }: { world: World, scope: Scope }): Promise<{ id: string }> {
    const issue = await runtimeSeed.issueWithRun({ world, scope })
    const admin = scope === 'T2' ? 'otherTenantAdmin' : 'tenantAdmin'
    const channelId = await runtimeSeed.alertChannelFor({ world, identity: admin })
    const policyId = await runtimeSeed.alertPolicyFor({ world, identity: admin, channelId })
    await runtimeSeed.alertRecord({ world, scope, policyId, issueId: issue.id })
    return { id: issue.id }
}

const readIssueCases: MatrixCase[] = [
    {
        id: 'GET /v1/issues/:id',
        access: { type: 'project', permission: Permission.READ_ISSUE },
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issue({ world, scope })
            return { request: { method: 'GET', url: `/v1/issues/${issue.id}` } }
        },
    },
    {
        id: 'GET /v1/issues/:id/activities',
        access: { type: 'project', permission: Permission.READ_ISSUE },
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issue({ world, scope })
            return { request: { method: 'GET', url: `/v1/issues/${issue.id}/activities` } }
        },
    },
    {
        id: 'GET /v1/issues/:id/alerts',
        access: { type: 'project', permission: Permission.READ_ISSUE },
        prepare: async ({ world, scope }) => {
            const issue = await issueWithAlert({ world, scope })
            return { request: { method: 'GET', url: `/v1/issues/${issue.id}/alerts` } }
        },
    },
    {
        id: 'GET /v1/issues/:id/executions',
        access: { type: 'project', permission: Permission.READ_ISSUE },
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issueWithRun({ world, scope })
            return { request: { method: 'GET', url: `/v1/issues/${issue.id}/executions` } }
        },
    },
    {
        id: 'GET /v1/issues/:id/insight',
        access: { type: 'project', permission: Permission.READ_ISSUE },
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issue({ world, scope })
            return { request: { method: 'GET', url: `/v1/issues/${issue.id}/insight` } }
        },
    },
    {
        id: 'GET /v1/issues/:id/trend',
        access: { type: 'project', permission: Permission.READ_ISSUE },
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issueWithRun({ world, scope })
            return { request: { method: 'GET', url: `/v1/issues/${issue.id}/trend` } }
        },
    },
    {
        id: 'GET /v1/issues/:id/workflows',
        access: { type: 'project', permission: Permission.READ_ISSUE },
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issueWithRun({ world, scope })
            return { request: { method: 'GET', url: `/v1/issues/${issue.id}/workflows` } }
        },
    },
]

const listIssueCases: MatrixCase[] = [
    {
        id: 'GET /v1/issues',
        access: { type: 'project', permission: Permission.READ_ISSUE },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await runtimeSeed.issuesInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/issues', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/issues/summary',
        access: { type: 'project', permission: Permission.READ_ISSUE },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await runtimeSeed.issuesInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/issues/summary', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/issues/overview',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => runtimeSeed.visibleOnlyTo({ world, identity }),
        prepare: async ({ world }) => {
            await runtimeSeed.issuesInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/issues/overview' } }
        },
    },
]

const writeIssueCases: MatrixCase[] = [
    {
        id: 'POST /v1/issues/:id',
        access: { type: 'project', permission: Permission.WRITE_ISSUE },
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issue({ world, scope })
            return {
                request: { method: 'POST', url: `/v1/issues/${issue.id}`, body: { status: IssueStatus.INVESTIGATING } },
                state: { issueId: issue.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const issueId = runtimeChecks.stateString({ prepared, key: 'issueId' })
            expect(await runtimeChecks.column({ entity: 'issue', id: issueId, name: 'status' })).toBe(IssueStatus.OPEN)
        },
    },
    {
        id: 'POST /v1/issues/:id/notes',
        access: { type: 'project', permission: Permission.WRITE_ISSUE },
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issue({ world, scope })
            return {
                request: { method: 'POST', url: `/v1/issues/${issue.id}/notes`, body: { text: 'security audit note' } },
                state: { issueId: issue.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const issueId = runtimeChecks.stateString({ prepared, key: 'issueId' })
            expect(await runtimeChecks.rowExists({ entity: 'issue_activity', where: { issueId } })).toBe(false)
        },
    },
    {
        id: 'POST /v1/issues/:id/replay-check',
        access: { type: 'project', permission: Permission.WRITE_ISSUE },
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issueWithRun({ world, scope })
            return { request: { method: 'POST', url: `/v1/issues/${issue.id}/replay-check` } }
        },
    },
    {
        id: 'POST /v1/issues/:id/replay',
        access: { type: 'project', permission: Permission.WRITE_RUN },
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issue({ world, scope })
            return {
                request: { method: 'POST', url: `/v1/issues/${issue.id}/replay`, body: { strategy: WorkflowRetryStrategy.ON_LATEST_VERSION } },
                state: { issueId: issue.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const issueId = runtimeChecks.stateString({ prepared, key: 'issueId' })
            expect(await runtimeChecks.rowExists({ entity: 'issue_activity', where: { issueId } })).toBe(false)
        },
    },
    {
        id: 'POST /v1/issues/batch',
        access: { type: 'project', permission: Permission.WRITE_ISSUE },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const issue = await runtimeSeed.issue({ world, scope })
            return {
                request: { method: 'POST', url: '/v1/issues/batch', body: { projectId: world.scopes[scope].project.id, ids: [issue.id], status: IssueStatus.INVESTIGATING } },
                state: { issueId: issue.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const issueId = runtimeChecks.stateString({ prepared, key: 'issueId' })
            expect(await runtimeChecks.column({ entity: 'issue', id: issueId, name: 'status' })).toBe(IssueStatus.OPEN)
        },
    },
]

export const runtimeIssueCases: MatrixCase[] = [...listIssueCases, ...readIssueCases, ...writeIssueCases]
