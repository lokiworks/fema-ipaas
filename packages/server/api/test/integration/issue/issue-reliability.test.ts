import { ExecutionStatus, IssueStatus, RunEnvironment, RunMonitorRange, WorkflowStatus, WorkflowVersionState } from '@fema-ipaas/shared'
import dayjs from 'dayjs'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { runMonitorUtils } from '../../../src/app/run-monitor/run-monitor-utils'
import { executionHooks } from '../../../src/app/workflows/execution/execution-hooks'
import { issueSideEffects } from '../../../src/app/issue/issue-side-effects'
import { issueRepo, issueService } from '../../../src/app/issue/issue.service'
import { db } from '../../helpers/db'
import { createMockExecution, createMockProject, createMockWorkflow, createMockWorkflowVersion } from '../../helpers/mocks'
import { createTestContext, TestContext } from '../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function seedWorkflow({ ctx, projectId }: { ctx: TestContext, projectId?: string }): Promise<{ workflowId: string, versionId: string }> {
    const workflow = createMockWorkflow({ projectId: projectId ?? ctx.project.id, status: WorkflowStatus.ENABLED })
    await db.save('workflow', workflow)
    const version = createMockWorkflowVersion({ workflowId: workflow.id, state: WorkflowVersionState.LOCKED, valid: true })
    await db.save('workflow_version', version)
    return { workflowId: workflow.id, versionId: version.id }
}

async function seedFailedExecution({ ctx, workflowId, versionId, rerunOfExecutionId, status, projectId }: SeedExecutionParams): Promise<string> {
    const execution = {
        ...createMockExecution({
            projectId: projectId ?? ctx.project.id,
            workflowId,
            workflowVersionId: versionId,
            status: status ?? ExecutionStatus.FAILED,
            environment: RunEnvironment.PRODUCTION,
            created: dayjs().subtract(1, 'minute').toISOString(),
            startTime: dayjs().subtract(1, 'minute').toISOString(),
            finishTime: dayjs().toISOString(),
        }),
        failedStep: { name: 'step_1', displayName: 'Create account', message: JSON.stringify({ message: 'Unprocessable entity', status: 422 }) },
        rerunOfExecutionId: rerunOfExecutionId ?? null,
    }
    await db.save('execution', execution)
    return execution.id
}

async function recordFailureOf({ executionId }: { executionId: string }): Promise<void> {
    const execution = await db.findOneByOrFail<Parameters<ReturnType<typeof issueSideEffects>['onProductionFailure']>[0]['execution']>('execution', { id: executionId })
    await issueSideEffects(app!.log).onProductionFailure({ execution, workflowVersion: null })
}

async function createPolicy({ ctx, projectId }: { ctx: TestContext, projectId: string }): Promise<string> {
    const channel = await ctx.post('/v1/alerts/channels', { name: 'hook', type: 'WEBHOOK', url: 'https://example.com/hook' })
    expect(channel.statusCode).toBe(StatusCodes.CREATED)
    const policy = await ctx.post('/v1/alerts/policies', {
        name: 'p1',
        enabled: true,
        projectIds: [projectId],
        workflowIds: [],
        events: ['ISSUE_NEW'],
        failureRate: null,
        capacityThresholdPercent: null,
        groupWindowMinutes: 60,
        quietHours: { enabled: true, from: '00:00', to: '23:59', timezone: 'UTC' },
        escalation: { enabled: false, afterMinutes: 30, channelId: null },
        channelIds: [channel.json().id],
    })
    expect(policy.statusCode).toBe(StatusCodes.CREATED)
    return policy.json().id
}

describe('Alert records never cover more failures than the issue counted', () => {
    it('does not merge the same execution recorded twice into one alert', async () => {
        const ctx = await createTestContext(app!)
        await createPolicy({ ctx, projectId: ctx.project.id })
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedFailedExecution({ ctx, workflowId, versionId })

        await recordFailureOf({ executionId })
        await recordFailureOf({ executionId })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        const records = (await ctx.get('/v1/alerts/records')).json().data
        expect(issues).toHaveLength(1)
        expect(issues[0].occurrences).toBe(1)
        expect(records).toHaveLength(1)
        expect(records[0].mergedCount).toBe(1)
    })

    it('does not merge a rerun that fails again, but merges a new trigger of the same problem', async () => {
        const ctx = await createTestContext(app!)
        await createPolicy({ ctx, projectId: ctx.project.id })
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const first = await seedFailedExecution({ ctx, workflowId, versionId })
        await recordFailureOf({ executionId: first })
        const rerun = await seedFailedExecution({ ctx, workflowId, versionId, rerunOfExecutionId: first })
        await recordFailureOf({ executionId: rerun })

        const afterRerun = await issueRepo().findBy({ projectId: ctx.project.id })
        const recordsAfterRerun = (await ctx.get('/v1/alerts/records')).json().data
        expect(afterRerun[0].occurrences).toBe(1)
        expect(recordsAfterRerun).toHaveLength(1)
        expect(recordsAfterRerun[0].mergedCount).toBe(1)

        const second = await seedFailedExecution({ ctx, workflowId, versionId })
        await recordFailureOf({ executionId: second })

        const afterSecond = await issueRepo().findBy({ projectId: ctx.project.id })
        const recordsAfterSecond = (await ctx.get('/v1/alerts/records')).json().data
        expect(afterSecond[0].occurrences).toBe(2)
        expect(recordsAfterSecond).toHaveLength(1)
        expect(recordsAfterSecond[0].mergedCount).toBe(2)
    })

    it('reports merged failures that never exceed the failures the issue counted', async () => {
        const ctx = await createTestContext(app!)
        await createPolicy({ ctx, projectId: ctx.project.id })
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedFailedExecution({ ctx, workflowId, versionId })
        await recordFailureOf({ executionId })
        await recordFailureOf({ executionId })

        const stats = (await ctx.get('/v1/alerts/records/stats', { timezone: 'Asia/Shanghai' })).json()
        const issues = await issueRepo().findBy({ projectId: ctx.project.id })

        expect(stats.alertsLast7Days).toBe(1)
        expect(stats.mergedFailuresLast7Days).toBeLessThanOrEqual(issues[0].occurrences)
    })
})

describe('Tenant alert stats follow the browser time zone', () => {
    it('counts the 7 calendar days of the requested zone, not of UTC', async () => {
        const ctx = await createTestContext(app!)
        const policyId = await createPolicy({ ctx, projectId: ctx.project.id })
        const now = Date.now()
        const zoneStart = runMonitorUtils.calendarDaysStart({ days: 7, now, timezone: 'Asia/Shanghai' })
        const utcStart = runMonitorUtils.calendarDaysStart({ days: 7, now, timezone: 'UTC' })
        const between = new Date((zoneStart + utcStart) / 2).toISOString()
        const base = { tenantId: ctx.tenant.id, policyId, projectId: ctx.project.id, issueId: null, kind: 'NEW', channelIds: [], mergedCount: 1, status: 'SENT', scheduledAt: between, sentAt: between, error: null, summary: 's' }
        await db.save('alert_record', { ...base, id: 'rl-alert-between', created: between, updated: between })

        const shanghai = (await ctx.get('/v1/alerts/records/stats', { timezone: 'Asia/Shanghai' })).json()
        const utc = (await ctx.get('/v1/alerts/records/stats', { timezone: 'UTC' })).json()
        const fallback = (await ctx.get('/v1/alerts/records/stats')).json()

        expect(shanghai.alertsLast7Days).toBe(zoneStart <= (zoneStart + utcStart) / 2 ? 1 : 0)
        expect(shanghai.alertsLast7Days).not.toBe(utc.alertsLast7Days)
        expect(fallback.alertsLast7Days).toBe(utc.alertsLast7Days)
    })
})

describe('Issue list views agree with the summary cards', () => {
    it('lists issues first seen today in the requested zone and leaves out muted ones, like the card', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedFailedExecution({ ctx, workflowId, versionId })
        await recordFailureOf({ executionId })
        const [issue] = await issueRepo().findBy({ projectId: ctx.project.id })
        const lateYesterdayInKiritimati = new Date(runMonitorUtils.calendarDaysStart({ days: 1, now: Date.now(), timezone: 'Pacific/Kiritimati' }) - 60 * 60 * 1000).toISOString()
        await issueRepo().update({ id: issue.id }, { firstSeenAt: lateYesterdayInKiritimati, lastSeenAt: lateYesterdayInKiritimati })

        const kiritimatiList = (await ctx.get('/v1/issues', { projectId: ctx.project.id, view: 'TODAY', timezone: 'Pacific/Kiritimati' })).json().data
        const kiritimatiCard = (await ctx.get('/v1/issues/summary', { projectId: ctx.project.id, timezone: 'Pacific/Kiritimati' })).json().newOrReopenedToday

        expect(kiritimatiList).toHaveLength(0)
        expect(kiritimatiCard).toBe(0)

        const freshTime = dayjs().toISOString()
        await issueRepo().update({ id: issue.id }, { firstSeenAt: freshTime, lastSeenAt: freshTime })
        const listToday = (await ctx.get('/v1/issues', { projectId: ctx.project.id, view: 'TODAY', timezone: 'Asia/Shanghai' })).json().data
        const cardToday = (await ctx.get('/v1/issues/summary', { projectId: ctx.project.id, timezone: 'Asia/Shanghai' })).json().newOrReopenedToday
        expect(listToday).toHaveLength(1)
        expect(cardToday).toBe(1)

        await ctx.post(`/v1/issues/${issue.id}`, { mutedForHours: 4 })
        const mutedList = (await ctx.get('/v1/issues', { projectId: ctx.project.id, view: 'TODAY', timezone: 'Asia/Shanghai' })).json().data
        const mutedCard = (await ctx.get('/v1/issues/summary', { projectId: ctx.project.id, timezone: 'Asia/Shanghai' })).json().newOrReopenedToday
        expect(mutedList).toHaveLength(mutedCard)
        expect(mutedCard).toBe(0)
    })

    it('does not list a muted investigating issue under the investigating card that skips it', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedFailedExecution({ ctx, workflowId, versionId })
        await recordFailureOf({ executionId })
        const [issue] = await issueRepo().findBy({ projectId: ctx.project.id })
        await ctx.post(`/v1/issues/${issue.id}`, { status: IssueStatus.INVESTIGATING, mutedForHours: 1 })

        const list = (await ctx.get('/v1/issues', { projectId: ctx.project.id, view: 'INVESTIGATING' })).json().data
        const card = (await ctx.get('/v1/issues/summary', { projectId: ctx.project.id })).json().investigating

        expect(list).toHaveLength(card)
        expect(card).toBe(0)
    })
})

describe('Issue trend buckets follow the browser time zone', () => {
    it('puts a failure into the local calendar day it happened in, and keeps every failure', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedFailedExecution({ ctx, workflowId, versionId })
        await recordFailureOf({ executionId })
        const [issue] = await issueRepo().findBy({ projectId: ctx.project.id })
        const localTodayStart = runMonitorUtils.bucketStarts({ range: RunMonitorRange.LAST_30_DAYS, now: Date.now(), timezone: 'Pacific/Kiritimati' }).at(-1) ?? 0
        const firstSecondOfLocalToday = new Date(localTodayStart + 1000).toISOString()
        await db.update('execution', executionId, { created: firstSecondOfLocalToday })

        const daily = (await ctx.get(`/v1/issues/${issue.id}/trend`, { granularity: 'DAY', timezone: 'Pacific/Kiritimati' })).json()
        const hourly = (await ctx.get(`/v1/issues/${issue.id}/trend`, { granularity: 'HOUR', timezone: 'Asia/Kolkata' })).json()

        expect(daily.buckets).toHaveLength(30)
        expect(daily.buckets.at(-1)).toEqual({ start: new Date(localTodayStart).toISOString(), count: 1 })
        expect(daily.buckets.reduce((sum: number, bucket: { count: number }) => sum + bucket.count, 0)).toBe(1)
        expect(hourly.buckets).toHaveLength(24)
        expect(hourly.buckets.every((bucket: { start: string }) => new Date(bucket.start).getUTCMinutes() === 30)).toBe(true)
    })
})

describe('Issue overview', () => {
    it('lists the latest issues of one project when asked, while every project keeps its counts', async () => {
        const ctx = await createTestContext(app!)
        const other = createMockProject({ ownerId: ctx.user.id, tenantId: ctx.tenant.id })
        await db.save('project', other)
        const first = await seedWorkflow({ ctx })
        const second = await seedWorkflow({ ctx, projectId: other.id })
        await recordFailureOf({ executionId: await seedFailedExecution({ ctx, workflowId: first.workflowId, versionId: first.versionId }) })
        await recordFailureOf({ executionId: await seedFailedExecution({ ctx, workflowId: second.workflowId, versionId: second.versionId, projectId: other.id }) })

        const everything = (await ctx.get('/v1/issues/overview')).json()
        const onlyOther = (await ctx.get('/v1/issues/overview', { projectId: other.id })).json()

        expect(everything.latest).toHaveLength(2)
        expect(onlyOther.latest.map((issue: { projectId: string }) => issue.projectId)).toEqual([other.id])
        expect(onlyOther.projects.map((project: { projectId: string }) => project.projectId).sort()).toEqual([ctx.project.id, other.id].sort())
    })

    it('ignores a project the user cannot see', async () => {
        const ctx = await createTestContext(app!)
        const stranger = await createTestContext(app!)
        const foreign = await seedWorkflow({ ctx: stranger })
        await recordFailureOf({ executionId: await seedFailedExecution({ ctx: stranger, workflowId: foreign.workflowId, versionId: foreign.versionId }) })

        const overview = (await ctx.get('/v1/issues/overview', { projectId: stranger.project.id })).json()

        expect(overview.latest).toEqual([])
    })
})

describe('Issues of a deleted workflow', () => {
    it('are resolved by the system instead of staying open forever', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedFailedExecution({ ctx, workflowId, versionId })
        await recordFailureOf({ executionId })
        const [issue] = await issueRepo().findBy({ projectId: ctx.project.id })
        await ctx.post(`/v1/issues/${issue.id}`, { status: IssueStatus.INVESTIGATING })

        await issueService(app!.log).onWorkflowDeleted({ workflowId, projectId: ctx.project.id })

        const after = await issueRepo().findOneByOrFail({ id: issue.id })
        const activities = (await ctx.get(`/v1/issues/${issue.id}/activities`)).json()
        expect(after.status).toBe(IssueStatus.RESOLVED)
        expect(after.resolvedById).toBeNull()
        expect(activities.some((activity: { type: string, actorId: string | null, data: { to?: string } }) => activity.type === 'STATUS_CHANGED' && activity.actorId === null && activity.data.to === 'RESOLVED')).toBe(true)
    })

    it('leaves issues of other workflows and connection issues alone', async () => {
        const ctx = await createTestContext(app!)
        const first = await seedWorkflow({ ctx })
        const second = await seedWorkflow({ ctx })
        await recordFailureOf({ executionId: await seedFailedExecution({ ctx, workflowId: first.workflowId, versionId: first.versionId }) })
        await recordFailureOf({ executionId: await seedFailedExecution({ ctx, workflowId: second.workflowId, versionId: second.versionId }) })

        await issueService(app!.log).onWorkflowDeleted({ workflowId: first.workflowId, projectId: ctx.project.id })

        const open = await issueRepo().findBy({ projectId: ctx.project.id, status: IssueStatus.OPEN })
        expect(open.map((issue) => issue.workflowId)).toEqual([second.workflowId])
    })
})

describe('Runs cut off before the engine reported a failed step', () => {
    it('records a timed out production run as a step timeout issue', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedCutOffExecution({ ctx, workflowId, versionId, status: ExecutionStatus.TIMEOUT, environment: RunEnvironment.PRODUCTION })

        await finishRun({ executionId })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        const run = await db.findOneByOrFail<{ failedStep: { name: string } | null, issueId: string | null }>('execution', { id: executionId })
        expect(issues).toHaveLength(1)
        expect(issues[0].errorCode).toBe('STEP_TIMEOUT')
        expect(issues[0].workflowId).toBe(workflowId)
        expect(run.failedStep?.name).toBe(issues[0].stepName)
        expect(run.issueId).toBe(issues[0].id)
    })

    it('records a run that ran out of memory as an issue of its own', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedCutOffExecution({ ctx, workflowId, versionId, status: ExecutionStatus.MEMORY_LIMIT_EXCEEDED, environment: RunEnvironment.PRODUCTION })

        await finishRun({ executionId })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(issues).toHaveLength(1)
        expect(issues[0].message).toContain('out of memory')
    })

    it('groups repeated timeouts of the same workflow into one issue', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const first = await seedCutOffExecution({ ctx, workflowId, versionId, status: ExecutionStatus.TIMEOUT, environment: RunEnvironment.PRODUCTION })
        const second = await seedCutOffExecution({ ctx, workflowId, versionId, status: ExecutionStatus.TIMEOUT, environment: RunEnvironment.PRODUCTION })

        await finishRun({ executionId: first })
        await finishRun({ executionId: second })

        const issues = await issueRepo().findBy({ projectId: ctx.project.id })
        expect(issues).toHaveLength(1)
        expect(issues[0].occurrences).toBe(2)
    })

    it('leaves debug runs out of the issue center', async () => {
        const ctx = await createTestContext(app!)
        const { workflowId, versionId } = await seedWorkflow({ ctx })
        const executionId = await seedCutOffExecution({ ctx, workflowId, versionId, status: ExecutionStatus.TIMEOUT, environment: RunEnvironment.TESTING })

        await finishRun({ executionId })

        expect(await issueRepo().findBy({ projectId: ctx.project.id })).toHaveLength(0)
    })
})

async function seedCutOffExecution({ ctx, workflowId, versionId, status, environment }: SeedCutOffParams): Promise<string> {
    const execution = createMockExecution({
        projectId: ctx.project.id,
        workflowId,
        workflowVersionId: versionId,
        status,
        environment,
        created: dayjs().subtract(2, 'minute').toISOString(),
        startTime: dayjs().subtract(2, 'minute').toISOString(),
        finishTime: dayjs().toISOString(),
    })
    await db.save('execution', execution)
    return execution.id
}

async function finishRun({ executionId }: { executionId: string }): Promise<void> {
    const execution = await db.findOneByOrFail<Parameters<ReturnType<typeof executionHooks>['onFinish']>[0]>('execution', { id: executionId })
    await executionHooks(app!.log).onFinish(execution)
}

type SeedCutOffParams = {
    ctx: TestContext
    workflowId: string
    versionId: string
    status: ExecutionStatus
    environment: RunEnvironment
}

type SeedExecutionParams = {
    ctx: TestContext
    projectId?: string
    workflowId: string
    versionId: string
    rerunOfExecutionId?: string
    status?: ExecutionStatus
}
