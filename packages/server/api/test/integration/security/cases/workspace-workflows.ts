import { Permission } from '@fema-ipaas/core-utils'
import { WorkflowOperationType, WorkflowStatus } from '@fema-ipaas/shared'
import { db } from '../../../helpers/db'
import { MatrixCase, MatrixHookParams } from '../support/matrix'
import { seed } from '../support/seed'
import { workspaceSeed } from '../support/workspace-seed'
import { Scope, World } from '../support/world'

function operationCase({ label, permission, expectOk, buildRequest, assertUnchanged }: OperationCaseParams): MatrixCase {
    return {
        id: 'POST /v1/workflows/:id',
        label,
        access: { type: 'project', permission },
        expectOk,
        prepare: async ({ world, scope }) => {
            const workflow = await workspaceSeed.validWorkflow({ world, scope })
            const request = await buildRequest({ world, scope })
            return { request: { method: 'POST', url: `/v1/workflows/${workflow.id}`, body: request }, state: { workflowId: workflow.id } }
        },
        afterDenied: async (params) => {
            await assertUnchanged({ ...params, workflowId: String(params.prepared.state?.workflowId) })
        },
    }
}

async function workflowRow({ workflowId }: { workflowId: string }): Promise<WorkflowRow | null> {
    return db.findOneBy<WorkflowRow>('workflow', { id: workflowId })
}

async function latestVersionName({ workflowId }: { workflowId: string }): Promise<string | null> {
    const row = await db.findOneBy<{ displayName: string }>('workflow_version', { workflowId })
    return row?.displayName ?? null
}

const operationCases: MatrixCase[] = [
    operationCase({
        label: 'CHANGE_NAME',
        permission: Permission.WRITE_WORKFLOW,
        buildRequest: async () => ({ type: WorkflowOperationType.CHANGE_NAME, request: { displayName: 'renamed-by-matrix' } }),
        assertUnchanged: async ({ workflowId }) => {
            expect(await latestVersionName({ workflowId })).not.toBe('renamed-by-matrix')
        },
    }),
    operationCase({
        label: 'CHANGE_FOLDER',
        permission: Permission.WRITE_WORKFLOW,
        buildRequest: async ({ world, scope }) => {
            const folder = await workspaceSeed.folder({ world, scope })
            return { type: WorkflowOperationType.CHANGE_FOLDER, request: { folderId: folder.id } }
        },
        assertUnchanged: async ({ workflowId }) => {
            expect((await workflowRow({ workflowId }))?.folderId ?? null).toBeNull()
        },
    }),
    operationCase({
        label: 'UPDATE_METADATA',
        permission: Permission.WRITE_WORKFLOW,
        buildRequest: async () => ({ type: WorkflowOperationType.UPDATE_METADATA, request: { metadata: { description: 'changed-by-matrix' } } }),
        assertUnchanged: async ({ workflowId }) => {
            expect(JSON.stringify((await workflowRow({ workflowId }))?.metadata ?? null)).not.toContain('changed-by-matrix')
        },
    }),
    operationCase({
        label: 'UPDATE_MINUTES_SAVED',
        permission: Permission.WRITE_WORKFLOW,
        buildRequest: async () => ({ type: WorkflowOperationType.UPDATE_MINUTES_SAVED, request: { timeSavedPerRun: 7 } }),
        assertUnchanged: async ({ workflowId }) => {
            expect((await workflowRow({ workflowId }))?.timeSavedPerRun ?? null).not.toBe(7)
        },
    }),
    operationCase({
        label: 'UPDATE_OWNER',
        permission: Permission.WRITE_WORKFLOW,
        buildRequest: async ({ world }) => ({ type: WorkflowOperationType.UPDATE_OWNER, request: { ownerId: world.actors.developer.userId } }),
        assertUnchanged: async ({ workflowId, world }) => {
            expect((await workflowRow({ workflowId }))?.ownerId ?? null).not.toBe(world.actors.developer.userId)
        },
    }),
    operationCase({
        label: 'IMPORT_WORKFLOW',
        permission: Permission.WRITE_WORKFLOW,
        buildRequest: async () => ({
            type: WorkflowOperationType.IMPORT_WORKFLOW,
            request: { displayName: 'imported-by-matrix', trigger: workspaceSeed.emptyValidTrigger(), schemaVersion: null, notes: null },
        }),
        assertUnchanged: async ({ workflowId }) => {
            expect(await latestVersionName({ workflowId })).not.toBe('imported-by-matrix')
        },
    }),
    operationCase({
        label: 'LOCK_AND_PUBLISH',
        permission: Permission.PUBLISH_WORKFLOW,
        buildRequest: async ({ world, scope }) => {
            await workspaceSeed.setReleaseMode({ projectId: world.scopes[scope].project.id, enabled: false })
            return { type: WorkflowOperationType.LOCK_AND_PUBLISH, request: { status: WorkflowStatus.DISABLED } }
        },
        assertUnchanged: async ({ workflowId }) => {
            expect((await workflowRow({ workflowId }))?.publishedVersionId ?? null).toBeNull()
        },
    }),
]

export const workspaceWorkflowCases: MatrixCase[] = [
    ...operationCases,
    {
        id: 'GET /v1/workflows/count',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: '/v1/workflows/count', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/workflows/:id/template',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: `/v1/workflows/${workflow.id}/template` } }
        },
    },
    {
        id: 'GET /v1/workflows/:workflowId/versions',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: `/v1/workflows/${workflow.id}/versions` } }
        },
    },
]

type WorkflowRow = {
    id: string
    folderId: string | null
    ownerId: string | null
    metadata: unknown
    timeSavedPerRun: number | null
    publishedVersionId: string | null
}

type AssertUnchangedParams = MatrixHookParams & { workflowId: string }

type OperationCaseParams = {
    label: string
    permission: Permission
    expectOk?: readonly number[]
    buildRequest: (params: { world: World, scope: Scope }) => Promise<Record<string, unknown>>
    assertUnchanged: (params: AssertUnchangedParams) => Promise<void>
}
