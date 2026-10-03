import { Permission } from '@fema-ipaas/core-utils'
import { WORKFLOW_EXPORT_FORMAT, WORKFLOW_EXPORT_VERSION } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { db } from '../../../helpers/db'
import { MatrixCase } from '../support/matrix'
import { seed } from '../support/seed'
import { workspaceSeed } from '../support/workspace-seed'

async function workflowCount({ projectId }: { projectId: string }): Promise<number> {
    return workspaceSeed.countRows({ entity: 'workflow', where: { projectId } })
}

export const workspaceFolderCases: MatrixCase[] = [
    {
        id: 'GET /v1/folders',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await workspaceSeed.folder({ world, scope })
            return { request: { method: 'GET', url: '/v1/folders', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/folders/:id',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const folder = await workspaceSeed.folder({ world, scope })
            return { request: { method: 'GET', url: `/v1/folders/${folder.id}` } }
        },
    },
    {
        id: 'POST /v1/folders',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const displayName = workspaceSeed.uniqueName({ prefix: 'sec-created' })
            return {
                request: { method: 'POST', url: '/v1/folders', body: { projectId: world.scopes[scope].project.id, displayName } },
                state: { displayName },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('folder', { displayName: String(prepared.state?.displayName) })).toBeNull()
        },
    },
    {
        id: 'POST /v1/folders/:id',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const folder = await workspaceSeed.folder({ world, scope })
            const displayName = workspaceSeed.uniqueName({ prefix: 'sec-renamed' })
            return {
                request: { method: 'POST', url: `/v1/folders/${folder.id}`, body: { displayName } },
                state: { folderId: folder.id, displayName },
            }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ displayName: string }>('folder', { id: String(prepared.state?.folderId) })
            expect(row?.displayName).not.toBe(String(prepared.state?.displayName))
        },
    },
    {
        id: 'DELETE /v1/folders/:id',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const folder = await workspaceSeed.folder({ world, scope })
            return { request: { method: 'DELETE', url: `/v1/folders/${folder.id}` }, state: { folderId: folder.id } }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('folder', { id: String(prepared.state?.folderId) })).not.toBeNull()
        },
    },
]

export const workspaceBatchCases: MatrixCase[] = [
    {
        id: 'GET /v1/project-workspace/tree',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await workspaceSeed.folder({ world, scope })
            await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: '/v1/project-workspace/tree', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/project-workspace/stats',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: '/v1/project-workspace/stats', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/project-workspace/workflows/:id/export',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: `/v1/project-workspace/workflows/${workflow.id}/export` } }
        },
    },
    {
        id: 'POST /v1/project-workspace/batch/publish-check',
        access: { type: 'project', permission: Permission.PUBLISH_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await workspaceSeed.validWorkflow({ world, scope })
            return { request: { method: 'POST', url: '/v1/project-workspace/batch/publish-check', body: { projectId: world.scopes[scope].project.id, workflowIds: [workflow.id] } } }
        },
    },
    {
        id: 'POST /v1/project-workspace/batch/publish',
        access: { type: 'project', permission: Permission.PUBLISH_WORKFLOW },
        prepare: async ({ world, scope }) => {
            await workspaceSeed.setReleaseMode({ projectId: world.scopes[scope].project.id, enabled: false })
            const workflow = await workspaceSeed.validWorkflow({ world, scope })
            return {
                request: { method: 'POST', url: '/v1/project-workspace/batch/publish', body: { projectId: world.scopes[scope].project.id, workflowIds: [workflow.id] } },
                state: { workflowId: workflow.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ publishedVersionId: string | null }>('workflow', { id: String(prepared.state?.workflowId) })
            expect(row?.publishedVersionId ?? null).toBeNull()
        },
    },
    {
        id: 'POST /v1/project-workspace/batch/move',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            const folder = await workspaceSeed.folder({ world, scope })
            return {
                request: { method: 'POST', url: '/v1/project-workspace/batch/move', body: { projectId: world.scopes[scope].project.id, workflowIds: [workflow.id], folderId: folder.id } },
                state: { workflowId: workflow.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ folderId: string | null }>('workflow', { id: String(prepared.state?.workflowId) })
            expect(row?.folderId ?? null).toBeNull()
        },
    },
    {
        id: 'DELETE /v1/project-workspace/batch',
        access: { type: 'project', permission: Permission.DELETE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return {
                request: { method: 'DELETE', url: '/v1/project-workspace/batch', body: { projectId: world.scopes[scope].project.id, workflowIds: [workflow.id] } },
                state: { workflowId: workflow.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const row = await db.findOneBy<{ operationStatus: string }>('workflow', { id: String(prepared.state?.workflowId) })
            expect(row?.operationStatus).toBe('NONE')
        },
    },
    {
        id: 'POST /v1/project-workspace/workflows/import',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const projectId = world.scopes[scope].project.id
            const name = workspaceSeed.uniqueName({ prefix: 'sec-imported' })
            return {
                request: {
                    method: 'POST',
                    url: '/v1/project-workspace/workflows/import',
                    body: {
                        projectId,
                        file: {
                            format: WORKFLOW_EXPORT_FORMAT,
                            version: WORKFLOW_EXPORT_VERSION,
                            exportedAt: dayjs().toISOString(),
                            workflow: { name, trigger: workspaceSeed.emptyValidTrigger(), schemaVersion: null },
                        },
                    },
                },
                state: { projectId, name },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await db.findOneBy('workflow_version', { displayName: String(prepared.state?.name) })).toBeNull()
        },
    },
    {
        id: 'POST /v1/project-workspace/workflows/:id/copy',
        label: 'copy inside the same project needs write access to it',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [201],
        prepare: async ({ world, scope }) => {
            const projectId = world.scopes[scope].project.id
            const workflow = await workspaceSeed.validWorkflow({ world, scope })
            return {
                request: { method: 'POST', url: `/v1/project-workspace/workflows/${workflow.id}/copy`, body: { projectId, targetProjectId: projectId } },
                state: { projectId, before: await workflowCount({ projectId }) },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await workflowCount({ projectId: String(prepared.state?.projectId) })).toBe(Number(prepared.state?.before))
        },
    },
]
