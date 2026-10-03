import { generateId } from '@fema-ipaas/core-utils'
import {
    AgentApprovalStatus,
    AlertRecordKind,
    AlertRecordStatus,
    ExecutionStatus,
    IssueKind,
    IssueStatus,
    NotificationType,
    RunEnvironment,
    RunMonitorChartMode,
    RunMonitorMetric,
    RunMonitorRange,
} from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { db } from '../../../helpers/db'
import { createMockExecution } from '../../../helpers/mocks'
import { seed } from './seed'
import { Identity, Scope, World } from './world'

const ALL_SCOPES: readonly Scope[] = ['A', 'B', 'T2']
const NOTIFICATION_TITLE_PREFIX = 'sec-notif-for-'
const OWNER_IDENTITIES: readonly Identity[] = ['projectAdmin', 'developer', 'operator', 'viewer', 'tenantAdmin', 'nonMember', 'foreignProjectAdmin', 'otherTenantAdmin']

async function run({ world, scope, status, ageMinutes }: RunParams): Promise<SeededRun> {
    const info = world.scopes[scope]
    const seededWorkflow = await seed.workflow({ world, scope })
    const created = dayjs().subtract(ageMinutes ?? 5, 'minute').toISOString()
    const execution = {
        ...createMockExecution({
            projectId: info.project.id,
            workflowId: seededWorkflow.id,
            workflowVersionId: seededWorkflow.versionId,
            status: status ?? ExecutionStatus.FAILED,
            environment: RunEnvironment.PRODUCTION,
            created,
            startTime: created,
            finishTime: dayjs().toISOString(),
        }),
        failedStep: (status ?? ExecutionStatus.FAILED) === ExecutionStatus.FAILED
            ? { name: 'step_1', displayName: 'Create account', message: JSON.stringify({ message: 'Unprocessable entity', status: 422 }) }
            : undefined,
    }
    await db.save('execution', execution)
    return { id: execution.id, workflowId: seededWorkflow.id, versionId: seededWorkflow.versionId, projectId: info.project.id }
}

async function runsInEveryScope({ world, status }: { world: World, status?: ExecutionStatus }): Promise<Record<Scope, SeededRun>> {
    const [a, b, t2] = await Promise.all(ALL_SCOPES.map((scope) => run({ world, scope, status })))
    return { A: a, B: b, T2: t2 }
}

async function issue({ world, scope, assigneeId }: { world: World, scope: Scope, assigneeId?: string }): Promise<SeededIssue> {
    const info = world.scopes[scope]
    const now = dayjs().toISOString()
    const id = generateId()
    await db.save('issue', {
        id,
        created: now,
        updated: now,
        projectId: info.project.id,
        kind: IssueKind.STEP,
        signature: `sec-${id}`,
        workflowId: null,
        stepName: 'step_1',
        stepDisplayName: 'Create account',
        connectionExternalId: null,
        errorCode: '422',
        title: `sec-issue-${id}`,
        message: 'Unprocessable entity',
        status: IssueStatus.OPEN,
        reopened: false,
        assigneeId: assigneeId ?? null,
        mutedUntil: null,
        occurrences: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        resolvedAt: null,
        resolvedById: null,
    })
    return { id, projectId: info.project.id }
}

async function issueWithRun({ world, scope }: { world: World, scope: Scope }): Promise<SeededIssue & { runId: string }> {
    const seededIssue = await issue({ world, scope })
    const seededRun = await run({ world, scope })
    await db.update('execution', seededRun.id, { issueId: seededIssue.id })
    return { ...seededIssue, runId: seededRun.id }
}

async function issuesInEveryScope({ world }: { world: World }): Promise<Record<Scope, SeededIssue>> {
    const [a, b, t2] = await Promise.all(ALL_SCOPES.map((scope) => issue({ world, scope })))
    return { A: a, B: b, T2: t2 }
}

async function agentApproval({ world, scope, approverIds }: { world: World, scope: Scope, approverIds: string[] }): Promise<SeededApproval> {
    const info = world.scopes[scope]
    const seededRun = await run({ world, scope, status: ExecutionStatus.PAUSED })
    const now = dayjs().toISOString()
    const id = generateId()
    await db.save('agent_approval', {
        id,
        created: now,
        updated: now,
        projectId: info.project.id,
        workflowId: seededRun.workflowId,
        executionId: seededRun.id,
        stepName: 'agent',
        waitpointId: generateId(),
        tool: 'send_message',
        arguments: {},
        message: 'Send a message',
        status: AgentApprovalStatus.PENDING,
        approverIds,
        decidedById: null,
        decidedAt: null,
        comment: null,
        expiresAt: dayjs().add(6, 'hour').toISOString(),
    })
    return { id, projectId: info.project.id, executionId: seededRun.id }
}

function everyUserId({ world }: { world: World }): string[] {
    return Object.values(world.actors).flatMap((actor) => (actor.userId === null ? [] : [actor.userId]))
}

async function notificationFor({ world, identity }: { world: World, identity: Identity }): Promise<string> {
    const actor = world.actors[identity]
    const tenantId = identity === 'otherTenantAdmin' ? world.scopes.T2.tenant.id : world.scopes.A.tenant.id
    const now = dayjs().toISOString()
    const id = generateId()
    await db.save('notification', {
        id,
        created: now,
        updated: now,
        tenantId,
        projectId: null,
        recipientId: actor.userId,
        type: NotificationType.RUN_FAILED,
        title: `${NOTIFICATION_TITLE_PREFIX}${identity}-${id}`,
        body: null,
        link: null,
        actorName: null,
        read: false,
    })
    return id
}

async function monitorViewFor({ world, identity }: { world: World, identity: Identity }): Promise<string> {
    await databaseConnection().getRepository('run_monitor_view').delete({ userId: world.actors[identity].userId })
    const actor = world.actors[identity]
    const tenantId = identity === 'otherTenantAdmin' ? world.scopes.T2.tenant.id : world.scopes.A.tenant.id
    const now = dayjs().toISOString()
    const id = generateId()
    await db.save('run_monitor_view', {
        id,
        created: now,
        updated: now,
        tenantId,
        userId: actor.userId,
        name: `${viewMarker({ identity })}${id.slice(0, 8)}`,
        config: { range: RunMonitorRange.LAST_7_DAYS, projectIds: [], workflowIds: [], metric: RunMonitorMetric.ALL, chartMode: RunMonitorChartMode.CHART },
    })
    return id
}

async function alertRecord({ world, scope, policyId, issueId }: { world: World, scope: Scope, policyId: string, issueId?: string }): Promise<string> {
    const info = world.scopes[scope]
    const now = dayjs().toISOString()
    const id = generateId()
    await db.save('alert_record', {
        id,
        created: now,
        updated: now,
        tenantId: info.tenant.id,
        policyId,
        projectId: info.project.id,
        issueId: issueId ?? null,
        kind: AlertRecordKind.NEW,
        channelIds: [],
        mergedCount: 1,
        status: AlertRecordStatus.SENT,
        scheduledAt: now,
        sentAt: now,
        error: null,
        summary: `sec-alert-${id}`,
    })
    return id
}

async function alertChannelFor({ world, identity, url }: { world: World, identity: Identity, url?: string }): Promise<string> {
    const response = await world.send({
        identity,
        request: { method: 'POST', url: '/v1/alerts/channels', body: { name: shortName({ world, prefix: 'sec-ch' }), type: 'WEBHOOK', url: url ?? 'https://example.com/hook' } },
    })
    return readId({ text: response.text })
}

async function alertPolicyFor({ world, identity, channelId }: { world: World, identity: Identity, channelId: string }): Promise<string> {
    const response = await world.send({
        identity,
        request: { method: 'POST', url: '/v1/alerts/policies', body: policyBody({ world, channelId }) },
    })
    return readId({ text: response.text })
}

function policyBody({ world, channelId }: { world: World, channelId: string }): Record<string, unknown> {
    return {
        name: shortName({ world, prefix: 'sec-po' }),
        enabled: true,
        projectIds: [],
        workflowIds: [],
        events: ['ISSUE_NEW'],
        failureRate: null,
        capacityThresholdPercent: null,
        groupWindowMinutes: 30,
        quietHours: { enabled: false, from: '22:00', to: '08:00', timezone: 'UTC' },
        escalation: { enabled: false, afterMinutes: 30, channelId: null },
        channelIds: [channelId],
    }
}

function shortName({ world, prefix }: { world: World, prefix: string }): string {
    return `${prefix}-${world.newId().slice(0, 12)}`
}

function readId({ text }: { text: string }): string {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && 'id' in parsed && typeof parsed.id === 'string') {
        return parsed.id
    }
    throw new Error(`response without id: ${text.slice(0, 200)}`)
}

function visibleOnlyTo({ world, identity }: { world: World, identity: Identity }): string[] {
    const a = world.scopes.A.project.id
    const b = world.scopes.B.project.id
    const t2Project = world.scopes.T2.project.id
    const t2Tenant = world.scopes.T2.tenant.id
    const tenantOne = world.scopes.A.tenant.id
    switch (identity) {
        case 'projectAdmin':
        case 'developer':
        case 'operator':
        case 'viewer':
            return [b, t2Project, t2Tenant]
        case 'tenantAdmin':
            return [t2Project, t2Tenant]
        case 'nonMember':
            return [a, b, t2Project, t2Tenant]
        case 'foreignProjectAdmin':
            return [a, t2Project, t2Tenant]
        case 'otherTenantAdmin':
            return [a, b, tenantOne]
        case 'anonymous':
            return [a, b, t2Project, t2Tenant, tenantOne]
    }
}

function viewMarker({ identity }: { identity: Identity }): string {
    return `vw${OWNER_IDENTITIES.indexOf(identity)}-`
}

function othersMarkers({ identity, kind }: { identity: Identity, kind: 'notification' | 'view' }): string[] {
    return OWNER_IDENTITIES.filter((owner) => owner !== identity).map((owner) => (kind === 'notification' ? `${NOTIFICATION_TITLE_PREFIX}${owner}-` : viewMarker({ identity: owner })))
}

async function clearMonitorViews(): Promise<void> {
    await databaseConnection().getRepository('run_monitor_view').createQueryBuilder().delete().execute()
}

async function seedForEveryOwner({ world, kind }: { world: World, kind: 'notification' | 'view' }): Promise<void> {
    if (kind === 'view') {
        await clearMonitorViews()
    }
    await Promise.all(OWNER_IDENTITIES.map((identity) => (kind === 'notification' ? notificationFor({ world, identity }) : monitorViewFor({ world, identity }))))
}

async function makeFirstTenantPrimary({ world }: { world: World }): Promise<void> {
    await db.update('tenant', world.scopes.A.tenant.id, { created: new Date(0).toISOString() })
    await db.update('tenant', world.scopes.T2.tenant.id, { created: dayjs().toISOString() })
}

export const runtimeSeed = {
    run,
    runsInEveryScope,
    issue,
    issueWithRun,
    issuesInEveryScope,
    agentApproval,
    everyUserId,
    notificationFor,
    monitorViewFor,
    alertRecord,
    alertChannelFor,
    alertPolicyFor,
    policyBody,
    shortName,
    visibleOnlyTo,
    othersMarkers,
    seedForEveryOwner,
    clearMonitorViews,
    makeFirstTenantPrimary,
}

export type RunParams = {
    world: World
    scope: Scope
    status?: ExecutionStatus
    ageMinutes?: number
}

export type SeededRun = {
    id: string
    workflowId: string
    versionId: string
    projectId: string
}

export type SeededIssue = {
    id: string
    projectId: string
}

export type SeededApproval = {
    id: string
    projectId: string
    executionId: string
}
