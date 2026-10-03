import { AgentApprovalStatus, ExecutionStatus, IssueStatus, WorkflowRetryStrategy } from '@fema-ipaas/shared'
import { FastifyInstance } from 'fastify'
import { db } from '../../../helpers/db'
import { setupTestEnvironment } from '../../../helpers/test-setup'
import { runtimeChecks } from '../support/runtime-checks'
import { runtimeSeed } from '../support/runtime-seed'
import { securityWorld, World, WorldRequest } from '../support/world'

let world: World | null = null

beforeAll(async () => {
    const app: FastifyInstance = await setupTestEnvironment()
    world = await securityWorld.build({ app })
})

function currentWorld(): World {
    if (world === null) {
        throw new Error('world is not ready')
    }
    return world
}

function isDenied(status: number): boolean {
    return status === 401 || status === 403 || status === 404
}

describe('runs: ids from another project never act on that project', () => {
    it('bulk archive with the caller own projectId ignores a run id of another project', async () => {
        const w = currentWorld()
        const foreignRun = await runtimeSeed.run({ world: w, scope: 'B' })
        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: '/v1/executions/archive', body: { projectId: w.scopes.A.project.id, executionIds: [foreignRun.id] } },
        })
        expect(response.status).toBeLessThan(300)
        expect(await runtimeChecks.column({ entity: 'execution', id: foreignRun.id, name: 'archivedAt' })).toBeNull()
    })

    it('bulk cancel with the caller own projectId ignores a queued run of another project', async () => {
        const w = currentWorld()
        const foreignRun = await runtimeSeed.run({ world: w, scope: 'B', status: ExecutionStatus.QUEUED })
        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: '/v1/executions/cancel', body: { projectId: w.scopes.A.project.id, executionIds: [foreignRun.id], status: [ExecutionStatus.QUEUED] } },
        })
        expect(response.status).toBeLessThan(300)
        expect(await runtimeChecks.column({ entity: 'execution', id: foreignRun.id, name: 'status' })).toBe(ExecutionStatus.QUEUED)
    })

    it('bulk retry with the caller own projectId does not rerun a run of another project', async () => {
        const w = currentWorld()
        const foreignRun = await runtimeSeed.run({ world: w, scope: 'B' })
        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: '/v1/executions/retry', body: { projectId: w.scopes.A.project.id, executionIds: [foreignRun.id], strategy: WorkflowRetryStrategy.ON_LATEST_VERSION } },
        })
        expect(response.status).toBeLessThan(300)
        expect(await runtimeChecks.rowExists({ entity: 'execution', where: { rerunOfExecutionId: foreignRun.id } })).toBe(false)
    })

    it('single retry of a run in project B is denied for a project A admin even when the body names project A', async () => {
        const w = currentWorld()
        const foreignRun = await runtimeSeed.run({ world: w, scope: 'B' })
        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: `/v1/executions/${foreignRun.id}/retry`, body: { projectId: w.scopes.A.project.id, strategy: WorkflowRetryStrategy.ON_LATEST_VERSION } },
        })
        expect(isDenied(response.status)).toBe(true)
        expect(await runtimeChecks.rowExists({ entity: 'execution', where: { rerunOfExecutionId: foreignRun.id } })).toBe(false)
    })

    it('single retry by a project B admin of a run in project B does nothing when the body names project A', async () => {
        const w = currentWorld()
        const foreignRun = await runtimeSeed.run({ world: w, scope: 'B' })
        const response = await w.send({
            identity: 'foreignProjectAdmin',
            request: { method: 'POST', url: `/v1/executions/${foreignRun.id}/retry`, body: { projectId: w.scopes.A.project.id, strategy: WorkflowRetryStrategy.ON_LATEST_VERSION } },
        })
        expect(isDenied(response.status)).toBe(true)
        expect(await runtimeChecks.rowExists({ entity: 'execution', where: { rerunOfExecutionId: foreignRun.id } })).toBe(false)
    })

    it('terminate and detail of a run in project B are denied for a project A admin', async () => {
        const w = currentWorld()
        const foreignRun = await runtimeSeed.run({ world: w, scope: 'B', status: ExecutionStatus.QUEUED })
        const terminate = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: `/v1/run-logs/${foreignRun.id}/terminate`, body: { stopChildRuns: true } },
        })
        const detail = await w.send({ identity: 'projectAdmin', request: { method: 'GET', url: `/v1/run-logs/${foreignRun.id}` } })
        expect(isDenied(terminate.status)).toBe(true)
        expect(isDenied(detail.status)).toBe(true)
        expect(await runtimeChecks.column({ entity: 'execution', id: foreignRun.id, name: 'status' })).toBe(ExecutionStatus.QUEUED)
    })

    it('the run list filter and runIds cannot pull runs of a project the caller is not in', async () => {
        const w = currentWorld()
        const own = await runtimeSeed.run({ world: w, scope: 'A' })
        const foreignRun = await runtimeSeed.run({ world: w, scope: 'B' })
        const response = await w.send({
            identity: 'viewer',
            request: { method: 'GET', url: '/v1/run-logs', query: { projectId: [w.scopes.B.project.id, w.scopes.A.project.id], runIds: [foreignRun.id, own.id], time: '7d' } },
        })
        expect(response.status).toBe(200)
        expect(response.text).toContain(own.id)
        expect(response.text).not.toContain(foreignRun.id)
        expect(response.text).not.toContain(w.scopes.B.project.id)
    })

    it('the execution list of a project never returns ids of another project passed in executionIds', async () => {
        const w = currentWorld()
        const foreignRun = await runtimeSeed.run({ world: w, scope: 'B' })
        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'GET', url: '/v1/executions', query: { projectId: w.scopes.A.project.id, executionIds: [foreignRun.id] } },
        })
        expect(response.status).toBe(200)
        expect(response.text).not.toContain(foreignRun.id)
    })

    it('a viewer rerun through the run log list is reported as view only and queues nothing', async () => {
        const w = currentWorld()
        const run = await runtimeSeed.run({ world: w, scope: 'A' })
        const response = await w.send({
            identity: 'viewer',
            request: { method: 'POST', url: '/v1/run-logs/rerun', body: { executionIds: [run.id], strategy: WorkflowRetryStrategy.ON_LATEST_VERSION } },
        })
        expect(response.status).toBe(200)
        expect(response.text).toContain('VIEW_ONLY')
        expect(await runtimeChecks.rowExists({ entity: 'execution', where: { rerunOfExecutionId: run.id } })).toBe(false)
    })

    it('a user outside every project gets nothing from the run log rerun of a run in project A', async () => {
        const w = currentWorld()
        const run = await runtimeSeed.run({ world: w, scope: 'A' })
        const response = await w.send({
            identity: 'nonMember',
            request: { method: 'POST', url: '/v1/run-logs/rerun', body: { executionIds: [run.id], strategy: WorkflowRetryStrategy.ON_LATEST_VERSION } },
        })
        expect(response.status).toBe(200)
        expect(response.text).toContain('Workflow run not found')
        expect(await runtimeChecks.rowExists({ entity: 'execution', where: { rerunOfExecutionId: run.id } })).toBe(false)
    })

    it('only a tenant admin can reveal raw payloads under the default privacy settings', async () => {
        const w = currentWorld()
        const run = await runtimeSeed.run({ world: w, scope: 'A' })
        const denied = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: `/v1/executions/${run.id}/reveal`, body: { stepName: 'step_1', reason: 'security audit' } },
        })
        expect(denied.status).toBe(403)
    })
})

describe('issues: ids from another project never act on that project', () => {
    it('batch update with the caller own projectId leaves an issue of another project alone', async () => {
        const w = currentWorld()
        const foreignIssue = await runtimeSeed.issue({ world: w, scope: 'B' })
        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: '/v1/issues/batch', body: { projectId: w.scopes.A.project.id, ids: [foreignIssue.id], status: IssueStatus.RESOLVED } },
        })
        expect(response.status).toBe(204)
        expect(await runtimeChecks.column({ entity: 'issue', id: foreignIssue.id, name: 'status' })).toBe(IssueStatus.OPEN)
    })

    it('update, note, replay and read of an issue in project B are denied for a project A admin', async () => {
        const w = currentWorld()
        const foreignIssue = await runtimeSeed.issueWithRun({ world: w, scope: 'B' })
        const requests: WorldRequest[] = [
            { method: 'POST', url: `/v1/issues/${foreignIssue.id}`, body: { status: IssueStatus.RESOLVED } },
            { method: 'POST', url: `/v1/issues/${foreignIssue.id}/notes`, body: { text: 'cross project' } },
            { method: 'POST', url: `/v1/issues/${foreignIssue.id}/replay`, body: { strategy: WorkflowRetryStrategy.ON_LATEST_VERSION } },
            { method: 'POST', url: `/v1/issues/${foreignIssue.id}/replay-check` },
            { method: 'GET', url: `/v1/issues/${foreignIssue.id}` },
            { method: 'GET', url: `/v1/issues/${foreignIssue.id}/alerts` },
            { method: 'GET', url: `/v1/issues/${foreignIssue.id}/executions` },
        ]
        const statuses = await Promise.all(requests.map(async (request) => (await w.send({ identity: 'projectAdmin', request })).status))
        expect(statuses.every(isDenied)).toBe(true)
        expect(await runtimeChecks.column({ entity: 'issue', id: foreignIssue.id, name: 'status' })).toBe(IssueStatus.OPEN)
        expect(await runtimeChecks.rowExists({ entity: 'issue_activity', where: { issueId: foreignIssue.id } })).toBe(false)
    })

    it('an issue cannot be assigned to someone who cannot manage issues in that project', async () => {
        const w = currentWorld()
        const issue = await runtimeSeed.issue({ world: w, scope: 'A' })
        const outsiders = [w.actors.nonMember, w.actors.foreignProjectAdmin, w.actors.viewer, w.actors.otherTenantAdmin]
        const statuses = await Promise.all(outsiders.map(async (actor) => (await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: `/v1/issues/${issue.id}`, body: { assigneeId: actor.userId } },
        })).status))
        expect(statuses.every((status) => status >= 400)).toBe(true)
        expect(await runtimeChecks.column({ entity: 'issue', id: issue.id, name: 'assigneeId' })).toBeNull()
    })

    it('the issue overview narrowed to project B shows nothing of project B to a user who is only in project A', async () => {
        const w = currentWorld()
        await runtimeSeed.issue({ world: w, scope: 'B' })
        const response = await w.send({ identity: 'viewer', request: { method: 'GET', url: '/v1/issues/overview', query: { projectId: w.scopes.B.project.id } } })
        expect(response.status).toBe(200)
        expect(response.text).not.toContain(w.scopes.B.project.id)
    })

    it('the alerts of an issue shown to a viewer carry no channel address or secret', async () => {
        const w = currentWorld()
        const issue = await runtimeSeed.issue({ world: w, scope: 'A' })
        const channel = await w.send({
            identity: 'tenantAdmin',
            request: { method: 'POST', url: '/v1/alerts/channels', body: { name: runtimeSeed.shortName({ world: w, prefix: 'sec-secret' }), type: 'WEBHOOK', url: 'https://hooks.example.com/services/TOKEN-ABC123', secret: 'SECRET-XYZ789' } },
        })
        expect(channel.status).toBe(201)
        const channelId = String(runtimeChecks.field({ value: channel.json(), key: 'id' }))
        const policyId = await runtimeSeed.alertPolicyFor({ world: w, identity: 'tenantAdmin', channelId })
        await runtimeSeed.alertRecord({ world: w, scope: 'A', policyId, issueId: issue.id })
        const response = await w.send({ identity: 'viewer', request: { method: 'GET', url: `/v1/issues/${issue.id}/alerts` } })
        expect(response.status).toBe(200)
        expect(response.text).not.toContain('TOKEN-ABC123')
        expect(response.text).not.toContain('SECRET-XYZ789')
        expect(response.text).not.toContain('hooks.example.com')
    })
})

describe('agent approvals: only a writer who is also an approver can decide', () => {
    it('an approval of project B cannot be decided by a project A admin and stays pending', async () => {
        const w = currentWorld()
        const approval = await runtimeSeed.agentApproval({ world: w, scope: 'B', approverIds: runtimeSeed.everyUserId({ world: w }) })
        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'POST', url: `/v1/agent-approvals/${approval.id}/decide`, body: { approved: false, comment: 'cross project' } },
        })
        expect(isDenied(response.status)).toBe(true)
        expect(await runtimeChecks.column({ entity: 'agent_approval', id: approval.id, name: 'status' })).toBe(AgentApprovalStatus.PENDING)
    })

    it('a member with write access who is not on the approver list is refused', async () => {
        const w = currentWorld()
        const approval = await runtimeSeed.agentApproval({ world: w, scope: 'A', approverIds: [w.scopes.A.ownerId] })
        const response = await w.send({
            identity: 'operator',
            request: { method: 'POST', url: `/v1/agent-approvals/${approval.id}/decide`, body: { approved: false, comment: 'not my call' } },
        })
        expect(isDenied(response.status)).toBe(true)
        expect(await runtimeChecks.column({ entity: 'agent_approval', id: approval.id, name: 'status' })).toBe(AgentApprovalStatus.PENDING)
    })

    it('a viewer on the approver list is told they cannot decide in the list response and is refused when they try', async () => {
        const w = currentWorld()
        const viewerId = w.actors.viewer.userId
        if (viewerId === null) {
            throw new Error('viewer has no user')
        }
        const approval = await runtimeSeed.agentApproval({ world: w, scope: 'A', approverIds: [viewerId] })
        const list = await w.send({ identity: 'viewer', request: { method: 'GET', url: '/v1/agent-approvals', query: { projectId: w.scopes.A.project.id } } })
        const rows: unknown = list.json()
        const row: unknown = Array.isArray(rows) ? rows.find((candidate) => runtimeChecks.field({ value: candidate, key: 'id' }) === approval.id) : undefined
        expect(row).toBeDefined()
        expect(runtimeChecks.field({ value: row, key: 'canDecide' })).toBe(false)
        const decide = await w.send({
            identity: 'viewer',
            request: { method: 'POST', url: `/v1/agent-approvals/${approval.id}/decide`, body: { approved: true } },
        })
        expect(isDenied(decide.status)).toBe(true)
        expect(await runtimeChecks.column({ entity: 'agent_approval', id: approval.id, name: 'status' })).toBe(AgentApprovalStatus.PENDING)
    })

    it('listing with the caller own projectId and the run id of another project returns nothing of that project', async () => {
        const w = currentWorld()
        const approval = await runtimeSeed.agentApproval({ world: w, scope: 'B', approverIds: runtimeSeed.everyUserId({ world: w }) })
        const response = await w.send({
            identity: 'projectAdmin',
            request: { method: 'GET', url: '/v1/agent-approvals', query: { projectId: w.scopes.A.project.id, executionId: approval.executionId } },
        })
        expect(response.status).toBe(200)
        expect(response.text).not.toContain(approval.id)
    })
})

describe('tenant level settings never cross tenants', () => {
    it('a tenant admin cannot change the limits of a project of another tenant', async () => {
        const w = currentWorld()
        const statuses = await Promise.all([
            w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: `/v1/limits/projects/${w.scopes.T2.project.id}`, body: { workflowsLimit: null, monthlyRunsLimit: 1 } } }),
            w.send({ identity: 'otherTenantAdmin', request: { method: 'POST', url: `/v1/limits/projects/${w.scopes.A.project.id}`, body: { workflowsLimit: null, monthlyRunsLimit: 1 } } }),
        ])
        expect(statuses.every((response) => isDenied(response.status))).toBe(true)
        expect(await runtimeChecks.column({ entity: 'project', id: w.scopes.T2.project.id, name: 'monthlyRunsLimit' })).toBeNull()
        expect(await runtimeChecks.column({ entity: 'project', id: w.scopes.A.project.id, name: 'monthlyRunsLimit' })).toBeNull()
    })

    it('a tenant admin cannot touch alert channels or policies of another tenant', async () => {
        const w = currentWorld()
        const foreignChannelId = await runtimeSeed.alertChannelFor({ world: w, identity: 'otherTenantAdmin' })
        const foreignPolicyId = await runtimeSeed.alertPolicyFor({ world: w, identity: 'otherTenantAdmin', channelId: foreignChannelId })
        const responses = await Promise.all([
            w.send({ identity: 'tenantAdmin', request: { method: 'DELETE', url: `/v1/alerts/channels/${foreignChannelId}` } }),
            w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: `/v1/alerts/channels/${foreignChannelId}/test` } }),
            w.send({ identity: 'tenantAdmin', request: { method: 'DELETE', url: `/v1/alerts/policies/${foreignPolicyId}` } }),
            w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: `/v1/alerts/policies/${foreignPolicyId}`, body: runtimeSeed.policyBody({ world: w, channelId: foreignChannelId }) } }),
        ])
        expect(responses.every((response) => isDenied(response.status))).toBe(true)
        expect(await runtimeChecks.rowExists({ entity: 'notification_channel', where: { id: foreignChannelId } })).toBe(true)
        expect(await runtimeChecks.rowExists({ entity: 'alert_policy', where: { id: foreignPolicyId } })).toBe(true)
    })

    it('a policy cannot point at a channel or a project of another tenant', async () => {
        const w = currentWorld()
        const foreignChannelId = await runtimeSeed.alertChannelFor({ world: w, identity: 'otherTenantAdmin' })
        const ownChannelId = await runtimeSeed.alertChannelFor({ world: w, identity: 'tenantAdmin' })
        const channelBase = runtimeSeed.policyBody({ world: w, channelId: ownChannelId })
        const projectBase = runtimeSeed.policyBody({ world: w, channelId: ownChannelId })
        const withForeignChannel = { ...channelBase, channelIds: [foreignChannelId] }
        const withForeignProject = { ...projectBase, projectIds: [w.scopes.T2.project.id] }
        const responses = await Promise.all([
            w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: '/v1/alerts/policies', body: withForeignChannel } }),
            w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: '/v1/alerts/policies', body: withForeignProject } }),
        ])
        expect(responses.every((response) => response.status >= 400)).toBe(true)
        expect(await runtimeChecks.rowExists({ entity: 'alert_policy', where: { name: channelBase['name'] } })).toBe(false)
        expect(await runtimeChecks.rowExists({ entity: 'alert_policy', where: { name: projectBase['name'] } })).toBe(false)
    })

    it('testing a channel whose address is a private network address is blocked before any request leaves', async () => {
        const w = currentWorld()
        const channelId = await runtimeSeed.alertChannelFor({ world: w, identity: 'tenantAdmin', url: 'http://169.254.169.254/latest/meta-data' })
        const response = await w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: `/v1/alerts/channels/${channelId}/test` } })
        expect(response.status).toBe(200)
        expect(runtimeChecks.field({ value: response.json(), key: 'success' })).toBe(false)
    })

    it('the audit log of one tenant never lists events of another tenant, even when filtered by its project', async () => {
        const w = currentWorld()
        const now = new Date().toISOString()
        await db.save('audit_event', {
            id: w.newId(),
            created: now,
            updated: now,
            tenantId: w.scopes.T2.tenant.id,
            projectId: w.scopes.T2.project.id,
            projectDisplayName: null,
            userId: null,
            userEmail: null,
            ip: null,
            action: 'workflow.created',
            data: {},
        })
        const response = await w.send({ identity: 'tenantAdmin', request: { method: 'GET', url: '/v1/audit-events', query: { projectId: w.scopes.T2.project.id } } })
        expect(response.status).toBe(200)
        expect(response.text).not.toContain(w.scopes.T2.project.id)
    })

    it('the run monitor narrowed to a project of another tenant or to a project the user is not in returns no runs', async () => {
        const w = currentWorld()
        await runtimeSeed.runsInEveryScope({ world: w })
        const foreign = await w.send({ identity: 'tenantAdmin', request: { method: 'GET', url: '/v1/run-monitor/summary', query: { projectIds: [w.scopes.T2.project.id] } } })
        const outsider = await w.send({ identity: 'nonMember', request: { method: 'GET', url: '/v1/run-monitor/summary', query: { projectIds: [w.scopes.A.project.id] } } })
        expect(foreign.status).toBe(200)
        expect(outsider.status).toBe(200)
        expect(foreign.text).not.toContain(w.scopes.T2.project.id)
        expect(outsider.text).not.toContain(w.scopes.A.project.id)
        expect(runtimeChecks.field({ value: runtimeChecks.field({ value: outsider.json(), key: 'stats' }), key: 'runs' })).toBe(0)
    })

    it('a user cannot change or delete the saved run monitor view of a colleague', async () => {
        const w = currentWorld()
        const viewId = await runtimeSeed.monitorViewFor({ world: w, identity: 'viewer' })
        const update = await w.send({ identity: 'tenantAdmin', request: { method: 'POST', url: `/v1/run-monitor/views/${viewId}`, body: { name: 'taken-over' } } })
        const remove = await w.send({ identity: 'tenantAdmin', request: { method: 'DELETE', url: `/v1/run-monitor/views/${viewId}` } })
        expect(isDenied(update.status)).toBe(true)
        expect(isDenied(remove.status)).toBe(true)
        expect(await runtimeChecks.rowExists({ entity: 'run_monitor_view', where: { id: viewId } })).toBe(true)
    })
})
