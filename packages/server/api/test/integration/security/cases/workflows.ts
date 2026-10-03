import { Permission } from '@fema-ipaas/core-utils'
import { WorkflowOperationType, WorkflowStatus } from '@fema-ipaas/shared'
import { MatrixCase } from '../support/matrix'
import { seed } from '../support/seed'

export const workflowCases: MatrixCase[] = [
    {
        id: 'GET /v1/workflows',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: '/v1/workflows', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/workflows/:id',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: `/v1/workflows/${workflow.id}` } }
        },
    },
    {
        id: 'POST /v1/workflows',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        expectOk: [201],
        prepare: async ({ world, scope }) => ({
            request: { method: 'POST', url: '/v1/workflows', body: { displayName: 'sec-matrix', projectId: world.scopes[scope].project.id } },
        }),
    },
    {
        id: 'POST /v1/workflows/:id',
        label: 'CHANGE_STATUS',
        access: { type: 'project', permission: Permission.UPDATE_WORKFLOW_STATUS },
        expectOk: [200, 400, 409],
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return { request: { method: 'POST', url: `/v1/workflows/${workflow.id}`, body: { type: WorkflowOperationType.CHANGE_STATUS, request: { status: WorkflowStatus.DISABLED } } } }
        },
    },
    {
        id: 'DELETE /v1/workflows/:id',
        access: { type: 'project', permission: Permission.DELETE_WORKFLOW },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return { request: { method: 'DELETE', url: `/v1/workflows/${workflow.id}` } }
        },
    },
]
