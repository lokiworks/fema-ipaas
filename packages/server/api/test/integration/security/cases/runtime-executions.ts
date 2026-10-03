import { Permission } from '@fema-ipaas/core-utils'
import { ExecutionStatus, WorkflowRetryStrategy } from '@fema-ipaas/shared'
import { MatrixCase } from '../support/matrix'
import { runtimeChecks } from '../support/runtime-checks'
import { runtimeSeed } from '../support/runtime-seed'

const OLD_RUN_AGE_MINUTES = 60 * 24 * 400

export const runtimeExecutionCases: MatrixCase[] = [
    {
        id: 'GET /v1/executions',
        access: { type: 'project', permission: Permission.READ_RUN },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await runtimeSeed.runsInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/executions', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/executions/:id',
        access: { type: 'project', permission: Permission.READ_RUN },
        prepare: async ({ world, scope }) => {
            const run = await runtimeSeed.run({ world, scope })
            return { request: { method: 'GET', url: `/v1/executions/${run.id}` } }
        },
    },
    {
        id: 'GET /v1/executions/count-by-status',
        access: { type: 'project', permission: Permission.READ_RUN },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await runtimeSeed.runsInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/executions/count-by-status', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/executions/overview',
        access: { type: 'project', permission: Permission.READ_RUN },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await runtimeSeed.runsInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/executions/overview', query: { projectId: world.scopes[scope].project.id, days: 7 } } }
        },
    },
    {
        id: 'POST /v1/executions/:id/retry',
        access: { type: 'project', permission: Permission.WRITE_RUN },
        expectOk: [410],
        prepare: async ({ world, scope }) => {
            const run = await runtimeSeed.run({ world, scope, ageMinutes: OLD_RUN_AGE_MINUTES })
            return {
                request: { method: 'POST', url: `/v1/executions/${run.id}/retry`, body: { strategy: WorkflowRetryStrategy.ON_LATEST_VERSION, projectId: world.scopes[scope].project.id } },
                state: { runId: run.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const runId = runtimeChecks.stateString({ prepared, key: 'runId' })
            expect(await runtimeChecks.column({ entity: 'execution', id: runId, name: 'status' })).toBe(ExecutionStatus.FAILED)
        },
    },
    {
        id: 'POST /v1/executions/:id/reveal',
        access: { type: 'custom', allow: ['tenantAdmin'] },
        expectOk: [200, 409],
        prepare: async ({ world, scope }) => {
            const run = await runtimeSeed.run({ world, scope })
            return { request: { method: 'POST', url: `/v1/executions/${run.id}/reveal`, body: { stepName: 'step_1', reason: 'security audit' } } }
        },
    },
    {
        id: 'POST /v1/executions/archive',
        access: { type: 'project', permission: Permission.WRITE_RUN },
        prepare: async ({ world, scope }) => {
            const run = await runtimeSeed.run({ world, scope })
            return {
                request: { method: 'POST', url: '/v1/executions/archive', body: { projectId: world.scopes[scope].project.id, executionIds: [run.id] } },
                state: { runId: run.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const runId = runtimeChecks.stateString({ prepared, key: 'runId' })
            expect(await runtimeChecks.column({ entity: 'execution', id: runId, name: 'archivedAt' })).toBeNull()
        },
        afterAllowed: async ({ prepared }) => {
            const runId = runtimeChecks.stateString({ prepared, key: 'runId' })
            expect(await runtimeChecks.column({ entity: 'execution', id: runId, name: 'archivedAt' })).not.toBeNull()
        },
    },
    {
        id: 'POST /v1/executions/cancel',
        access: { type: 'project', permission: Permission.WRITE_RUN },
        prepare: async ({ world, scope }) => {
            const run = await runtimeSeed.run({ world, scope, status: ExecutionStatus.QUEUED })
            return {
                request: { method: 'POST', url: '/v1/executions/cancel', body: { projectId: world.scopes[scope].project.id, executionIds: [run.id], status: [ExecutionStatus.QUEUED] } },
                state: { runId: run.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const runId = runtimeChecks.stateString({ prepared, key: 'runId' })
            expect(await runtimeChecks.column({ entity: 'execution', id: runId, name: 'status' })).toBe(ExecutionStatus.QUEUED)
        },
    },
    {
        id: 'POST /v1/executions/retry',
        access: { type: 'project', permission: Permission.WRITE_RUN },
        prepare: async ({ world, scope }) => {
            const run = await runtimeSeed.run({ world, scope, ageMinutes: OLD_RUN_AGE_MINUTES })
            return {
                request: {
                    method: 'POST',
                    url: '/v1/executions/retry',
                    body: { projectId: world.scopes[scope].project.id, executionIds: [run.id], strategy: WorkflowRetryStrategy.ON_LATEST_VERSION },
                },
                state: { runId: run.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const runId = runtimeChecks.stateString({ prepared, key: 'runId' })
            expect(await runtimeChecks.rowExists({ entity: 'execution', where: { rerunOfExecutionId: runId } })).toBe(false)
        },
    },
]
