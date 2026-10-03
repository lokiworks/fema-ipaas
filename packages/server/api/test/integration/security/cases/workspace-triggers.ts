import { Permission } from '@fema-ipaas/core-utils'
import { TriggerTestStrategy } from '@fema-ipaas/shared'
import { MatrixCase } from '../support/matrix'
import { seed } from '../support/seed'
import { workspaceSeed } from '../support/workspace-seed'

export const workspaceTriggerCases: MatrixCase[] = [
    {
        id: 'GET /v1/sample-data',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return {
                request: {
                    method: 'GET',
                    url: '/v1/sample-data',
                    query: { projectId: world.scopes[scope].project.id, workflowId: workflow.id, workflowVersionId: workflow.versionId, stepName: 'trigger', type: 'OUTPUT' },
                },
            }
        },
    },
    {
        id: 'POST /v1/sample-data/test-step',
        label: 'running a step uses real connections and rewrites sample data, so it is an edit',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await workspaceSeed.validWorkflow({ world, scope })
            return {
                request: { method: 'POST', url: '/v1/sample-data/test-step', body: { projectId: world.scopes[scope].project.id, workflowVersionId: workflow.versionId, stepName: 'step_1' } },
                state: { workflowId: workflow.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await workspaceSeed.countRows({ entity: 'execution', where: { workflowId: String(prepared.state?.workflowId) } })).toBe(0)
        },
    },
    {
        id: 'POST /v1/test-trigger',
        label: 'testing a trigger calls the third party with the workflow connections',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return {
                request: {
                    method: 'POST',
                    url: '/v1/test-trigger',
                    body: { projectId: world.scopes[scope].project.id, workflowId: workflow.id, workflowVersionId: workflow.versionId, testStrategy: TriggerTestStrategy.TEST_FUNCTION },
                },
            }
        },
    },
    {
        id: 'DELETE /v1/test-trigger',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return { request: { method: 'DELETE', url: '/v1/test-trigger', body: { projectId: world.scopes[scope].project.id, workflowId: workflow.id } } }
        },
    },
    {
        id: 'POST /v1/trigger-events',
        access: { type: 'project', permission: Permission.WRITE_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return {
                request: { method: 'POST', url: '/v1/trigger-events', body: { projectId: world.scopes[scope].project.id, workflowId: workflow.id, mockData: { planted: true } } },
                state: { workflowId: workflow.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            expect(await workspaceSeed.countRows({ entity: 'trigger_event', where: { workflowId: String(prepared.state?.workflowId) } })).toBe(0)
        },
    },
    {
        id: 'GET /v1/trigger-events',
        access: { type: 'project', permission: Permission.READ_WORKFLOW },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: '/v1/trigger-events', query: { projectId: world.scopes[scope].project.id, workflowId: workflow.id } } }
        },
    },
    {
        id: 'GET /v1/deduped-events',
        access: { type: 'project', permission: Permission.READ_RUN },
        scopedRead: true,
        prepare: async ({ world, scope }) => ({
            request: { method: 'GET', url: '/v1/deduped-events', query: { projectId: world.scopes[scope].project.id } },
        }),
    },
    {
        id: 'GET /v1/deduped-events/stats',
        access: { type: 'project', permission: Permission.READ_RUN },
        prepare: async ({ world, scope }) => {
            const workflow = await seed.workflow({ world, scope })
            return { request: { method: 'GET', url: '/v1/deduped-events/stats', query: { projectId: world.scopes[scope].project.id, workflowId: workflow.id } } }
        },
    },
    {
        id: 'GET /v1/trigger-runs/status',
        label: 'tenant-wide connector run counters, no project data',
        access: { type: 'authenticated' },
        prepare: async () => ({ request: { method: 'GET', url: '/v1/trigger-runs/status' } }),
    },
]
