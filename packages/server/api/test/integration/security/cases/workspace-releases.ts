import { isNil, Permission } from '@fema-ipaas/core-utils'
import { WorkflowReleaseStatus } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { MatrixCase, PreparedRequest } from '../support/matrix'
import { workspaceSeed } from '../support/workspace-seed'
import { Identity, Scope, World } from '../support/world'

function userIdsOf({ world, identities }: { world: World, identities: readonly Identity[] }): string[] {
    return identities.map((identity) => world.actors[identity].userId).filter((userId): userId is string => !isNil(userId))
}

async function pendingRelease({ world, scope, requester, approvers }: { world: World, scope: Scope, requester: Identity | 'owner', approvers: readonly Identity[] }): Promise<{ releaseId: string, workflowId: string, projectId: string }> {
    const projectId = world.scopes[scope].project.id
    const approverIds = userIdsOf({ world, identities: approvers })
    await workspaceSeed.setReleaseMode({ projectId, enabled: true, approverIds })
    const workflow = await workspaceSeed.scheduledWorkflow({ world, scope })
    const requestedBy = requester === 'owner' ? world.scopes[scope].ownerId : world.actors[requester].userId ?? world.scopes[scope].ownerId
    const release = await workspaceSeed.release({ world, projectId, workflowId: workflow.id, versionId: workflow.versionId, requestedBy, approverIds })
    return { releaseId: release.id, workflowId: workflow.id, projectId }
}

async function assertStillPending({ releaseId }: { releaseId: string }): Promise<void> {
    const row = await db.findOneBy<{ status: string }>('workflow_release', { id: releaseId })
    expect(row?.status).toBe(WorkflowReleaseStatus.PENDING)
}

function decisionCase({ action, body, allow }: { action: 'approve' | 'reject', body: Record<string, unknown>, allow: readonly Identity[] }): MatrixCase {
    return {
        id: `POST /v1/workflow-releases/:id/${action}`,
        label: 'only a listed approver with release rights may decide',
        access: { type: 'custom', allow },
        prepare: async ({ world, scope }): Promise<PreparedRequest> => {
            const release = await pendingRelease({ world, scope, requester: 'owner', approvers: ['projectAdmin', 'developer'] })
            return { request: { method: 'POST', url: `/v1/workflow-releases/${release.releaseId}/${action}`, body }, state: { releaseId: release.releaseId } }
        },
        afterDenied: async ({ prepared }) => {
            await assertStillPending({ releaseId: String(prepared.state?.releaseId) })
        },
    }
}

export const workspaceReleaseCases: MatrixCase[] = [
    {
        id: 'GET /v1/workflow-releases',
        access: { type: 'project', permission: Permission.READ_PROJECT_RELEASE },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            const projectId = world.scopes[scope].project.id
            const workflow = await workspaceSeed.validWorkflow({ world, scope })
            await workspaceSeed.release({ world, projectId, workflowId: workflow.id, versionId: workflow.versionId, approverIds: [] })
            return { request: { method: 'GET', url: '/v1/workflow-releases', query: { projectId } } }
        },
    },
    {
        id: 'GET /v1/workflow-releases/:id',
        access: { type: 'project', permission: Permission.READ_PROJECT_RELEASE },
        prepare: async ({ world, scope }) => {
            const workflow = await workspaceSeed.validWorkflow({ world, scope })
            const release = await workspaceSeed.release({ world, projectId: world.scopes[scope].project.id, workflowId: workflow.id, versionId: workflow.versionId, approverIds: [] })
            return { request: { method: 'GET', url: `/v1/workflow-releases/${release.id}` } }
        },
    },
    {
        id: 'GET /v1/workflow-releases/environments',
        access: { type: 'project', permission: Permission.READ_PROJECT_RELEASE },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await workspaceSeed.validWorkflow({ world, scope })
            return { request: { method: 'GET', url: '/v1/workflow-releases/environments', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/workflow-releases/pending-count',
        access: { type: 'project', permission: Permission.READ_PROJECT_RELEASE },
        scopedRead: true,
        prepare: async ({ world, scope }) => ({
            request: { method: 'GET', url: '/v1/workflow-releases/pending-count', query: { projectId: world.scopes[scope].project.id } },
        }),
    },
    {
        id: 'POST /v1/workflow-releases',
        access: { type: 'project', permission: Permission.WRITE_PROJECT_RELEASE },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const projectId = world.scopes[scope].project.id
            await workspaceSeed.setReleaseMode({ projectId, enabled: true, approverIds: userIdsOf({ world, identities: ['projectAdmin'] }) })
            const workflow = await workspaceSeed.scheduledWorkflow({ world, scope })
            await db.update('workflow', workflow.id, { testVersionId: workflow.versionId })
            return {
                request: { method: 'POST', url: '/v1/workflow-releases', body: { projectId, workflowId: workflow.id, note: 'sec release' } },
                state: { workflowId: workflow.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('workflow_release', { workflowId: String(prepared.state?.workflowId) })).toBeNull()
        },
    },
    decisionCase({ action: 'approve', body: { comment: 'ok' }, allow: ['projectAdmin', 'developer'] }),
    decisionCase({ action: 'reject', body: { comment: 'no' }, allow: ['projectAdmin', 'developer'] }),
    {
        id: 'POST /v1/workflow-releases/:id/withdraw',
        label: 'only the requester may withdraw',
        access: { type: 'custom', allow: ['developer'] },
        prepare: async ({ world, scope }) => {
            const release = await pendingRelease({ world, scope, requester: 'developer', approvers: ['projectAdmin'] })
            return { request: { method: 'POST', url: `/v1/workflow-releases/${release.releaseId}/withdraw`, body: {} }, state: { releaseId: release.releaseId } }
        },
        afterDenied: async ({ prepared }) => {
            await assertStillPending({ releaseId: String(prepared.state?.releaseId) })
        },
    },
    {
        id: 'POST /v1/workflow-releases/deploy-to-test',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const projectId = world.scopes[scope].project.id
            await workspaceSeed.setReleaseMode({ projectId, enabled: true })
            const workflow = await workspaceSeed.validWorkflow({ world, scope })
            return {
                request: { method: 'POST', url: '/v1/workflow-releases/deploy-to-test', body: { projectId, workflowId: workflow.id } },
                state: { workflowId: workflow.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ testVersionId: string | null }>('workflow', { id: String(prepared.state?.workflowId) })
            expect(row?.testVersionId ?? null).toBeNull()
        },
    },
    {
        id: 'POST /v1/workflow-releases/rollback',
        access: { type: 'project', permission: Permission.PUBLISH_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const projectId = world.scopes[scope].project.id
            const workflow = await workspaceSeed.validWorkflow({ world, scope, published: true })
            return {
                request: { method: 'POST', url: '/v1/workflow-releases/rollback', body: { projectId, workflowId: workflow.id, versionId: workflow.versionId } },
                state: { workflowId: workflow.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await workspaceSeed.countRows({ entity: 'workflow_version', where: { workflowId: String(prepared.state?.workflowId) } })).toBe(1)
        },
    },
    {
        id: 'POST /v1/workflow-releases/environments',
        access: { type: 'project', permission: Permission.WRITE_PROJECT },
        prepare: async ({ world, scope }) => {
            const projectId = world.scopes[scope].project.id
            await workspaceSeed.setReleaseMode({ projectId, enabled: false })
            return {
                request: { method: 'POST', url: '/v1/workflow-releases/environments', body: { projectId, enabled: true, approverIds: [] } },
                state: { projectId },
            }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ releasesEnabled: boolean }>('project', { id: String(prepared.state?.projectId) })
            expect(row?.releasesEnabled).toBe(false)
        },
    },
]
