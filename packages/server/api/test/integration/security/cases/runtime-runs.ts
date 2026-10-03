import { Permission } from '@fema-ipaas/core-utils'
import { AgentApprovalStatus, ExecutionStatus, RunLogTimeRange, WorkflowRetryStrategy } from '@fema-ipaas/shared'
import { MatrixCase } from '../support/matrix'
import { runtimeChecks } from '../support/runtime-checks'
import { runtimeSeed } from '../support/runtime-seed'

const ROLES_WITHOUT_RERUN: readonly string[] = ['viewer', 'nonMember', 'foreignProjectAdmin', 'otherTenantAdmin']

export const runtimeRunCases: MatrixCase[] = [
    {
        id: 'GET /v1/run-logs',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => runtimeSeed.visibleOnlyTo({ world, identity }),
        prepare: async ({ world }) => {
            await runtimeSeed.runsInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/run-logs', query: { time: RunLogTimeRange.DAYS_7, limit: 100 } } }
        },
    },
    {
        id: 'GET /v1/run-logs/scope',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => runtimeSeed.visibleOnlyTo({ world, identity }),
        prepare: async ({ world }) => {
            await runtimeSeed.runsInEveryScope({ world })
            return { request: { method: 'GET', url: '/v1/run-logs/scope' } }
        },
    },
    {
        id: 'POST /v1/run-logs/rerun',
        access: { type: 'authenticated' },
        forbiddenIds: ({ world, identity }) => runtimeSeed.visibleOnlyTo({ world, identity }),
        prepare: async ({ world }) => {
            const runs = await runtimeSeed.runsInEveryScope({ world })
            return {
                request: {
                    method: 'POST',
                    url: '/v1/run-logs/rerun',
                    body: { executionIds: [runs.A.id, runs.B.id, runs.T2.id], strategy: WorkflowRetryStrategy.ON_LATEST_VERSION },
                },
                state: { runIdA: runs.A.id, runIdB: runs.B.id, runIdT2: runs.T2.id },
            }
        },
        afterAllowed: async ({ prepared, response, identity }) => {
            const runIdB = runtimeChecks.stateString({ prepared, key: 'runIdB' })
            const runIdT2 = runtimeChecks.stateString({ prepared, key: 'runIdT2' })
            const runIdA = runtimeChecks.stateString({ prepared, key: 'runIdA' })
            expect(await runtimeChecks.rowExists({ entity: 'execution', where: { rerunOfExecutionId: runIdB } })).toBe(false)
            expect(await runtimeChecks.rowExists({ entity: 'execution', where: { rerunOfExecutionId: runIdT2 } })).toBe(false)
            if (ROLES_WITHOUT_RERUN.includes(identity)) {
                expect(await runtimeChecks.rowExists({ entity: 'execution', where: { rerunOfExecutionId: runIdA } })).toBe(false)
                expect(response.text).not.toContain('"rerunExecutionId":"')
            }
        },
    },
    {
        id: 'GET /v1/run-logs/:id',
        access: { type: 'project', permission: Permission.READ_RUN },
        prepare: async ({ world, scope }) => {
            const run = await runtimeSeed.run({ world, scope })
            return { request: { method: 'GET', url: `/v1/run-logs/${run.id}` } }
        },
    },
    {
        id: 'POST /v1/run-logs/:id/terminate',
        access: { type: 'project', permission: Permission.WRITE_RUN },
        expectOk: [204],
        prepare: async ({ world, scope }) => {
            const run = await runtimeSeed.run({ world, scope, status: ExecutionStatus.QUEUED })
            return {
                request: { method: 'POST', url: `/v1/run-logs/${run.id}/terminate`, body: { stopChildRuns: false } },
                state: { runId: run.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const runId = runtimeChecks.stateString({ prepared, key: 'runId' })
            expect(await runtimeChecks.column({ entity: 'execution', id: runId, name: 'status' })).toBe(ExecutionStatus.QUEUED)
        },
    },
    {
        id: 'GET /v1/agent-approvals',
        access: { type: 'project', permission: Permission.READ_RUN },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            const approverIds = runtimeSeed.everyUserId({ world })
            await runtimeSeed.agentApproval({ world, scope: 'A', approverIds })
            await runtimeSeed.agentApproval({ world, scope: 'B', approverIds })
            await runtimeSeed.agentApproval({ world, scope: 'T2', approverIds })
            return { request: { method: 'GET', url: '/v1/agent-approvals', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'GET /v1/agent-approvals/pending-count',
        access: { type: 'project', permission: Permission.READ_RUN },
        scopedRead: true,
        prepare: async ({ world, scope }) => {
            await runtimeSeed.agentApproval({ world, scope, approverIds: runtimeSeed.everyUserId({ world }) })
            return { request: { method: 'GET', url: '/v1/agent-approvals/pending-count', query: { projectId: world.scopes[scope].project.id } } }
        },
    },
    {
        id: 'POST /v1/agent-approvals/:id/decide',
        access: { type: 'project', permission: Permission.WRITE_RUN },
        expectOk: [200, 409],
        prepare: async ({ world, scope }) => {
            const approval = await runtimeSeed.agentApproval({ world, scope, approverIds: runtimeSeed.everyUserId({ world }) })
            return {
                request: { method: 'POST', url: `/v1/agent-approvals/${approval.id}/decide`, body: { approved: false, comment: 'security audit' } },
                state: { approvalId: approval.id },
            }
        },
        afterDenied: async ({ prepared }) => {
            const approvalId = runtimeChecks.stateString({ prepared, key: 'approvalId' })
            expect(await runtimeChecks.column({ entity: 'agent_approval', id: approvalId, name: 'status' })).toBe(AgentApprovalStatus.PENDING)
        },
    },
    {
        id: 'POST /v1/verification/run',
        access: { type: 'project', permission: Permission.WRITE_ISSUE },
        prepare: async ({ world, scope }) => ({
            request: { method: 'POST', url: '/v1/verification/run', body: { projectId: world.scopes[scope].project.id } },
        }),
    },
]
