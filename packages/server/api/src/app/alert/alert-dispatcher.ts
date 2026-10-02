import { generateId, isNil, TenantId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import {
    AlertRecordKind,
    AlertRecordStatus,
    AlertTriggerEvent,
    Issue,
    IssueActivityType,
    IssueKind,
    IssueStatus,
    NotificationType,
    QuietHours,
    RunEnvironment,
    TenantRole,
    UserStatus,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull, LessThanOrEqual, MoreThanOrEqual } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { domainHelper } from '../helper/domain-helper'
import { IssueRecordEvent, issueRepo, issueService } from '../issue/issue.service'
import { instanceLimits } from '../limits/instance-limits'
import { runQuotaUtils } from '../limits/run-quota-utils'
import { runQuota } from '../limits/run-quota.service'
import { notificationService } from '../notification/notification.service'
import { projectRepo } from '../project/project-repo'
import { projectStatsUtils } from '../project-workspace/project-stats-utils'
import { userRepo } from '../user/user-service'
import { executionRepo } from '../workflows/execution/execution-service'
import { alertPolicyService } from './alert-policy.service'
import { AlertPolicySchema, AlertRecordEntity, AlertRecordSchema } from './alert.entity'
import { AlertMessage } from './notification-channel-sender'
import { notificationChannelService } from './notification-channel.service'

export const alertRecordRepo = repoFactory(AlertRecordEntity)

export const alertDispatcher = (log: FastifyBaseLogger) => ({
    async onIssueRecorded({ issue, event, counted, tenantId }: OnIssueRecordedParams): Promise<void> {
        if (isMuted(issue) || issue.status === IssueStatus.IGNORED) {
            return
        }
        if (event === IssueRecordEvent.OCCURRED && !counted) {
            return
        }
        const policies = (await alertPolicyService(log).listEnabled({ tenantId })).filter((policy) => policyCoversIssue({ policy, issue }))
        for (const policy of policies) {
            const kind = kindFor({ policy, issue, event })
            if (isNil(kind)) {
                continue
            }
            const merged = await mergeIntoOpenWindow({ policy, issue })
            if (merged) {
                continue
            }
            await createAndDeliver({ policy, tenantId, issue, kind, channelIds: policy.channelIds, log })
        }
    },

    async runScheduledWork(): Promise<void> {
        await flushPending({ log })
        const policies = await alertPolicyService(log).listEnabledAcrossTenants()
        for (const policy of policies) {
            await escalate({ policy, log })
            await checkFailureRate({ policy })
            await checkCapacity({ policy, log })
        }
    },
})

function kindFor({ policy, issue, event }: { policy: AlertPolicySchema, issue: Issue, event: IssueRecordEvent }): AlertRecordKind | null {
    switch (event) {
        case IssueRecordEvent.NEW: {
            const connectionEvent = issue.kind === IssueKind.CONNECTION && policy.events.includes(AlertTriggerEvent.CONNECTION_INVALID)
            return policy.events.includes(AlertTriggerEvent.ISSUE_NEW) || connectionEvent ? AlertRecordKind.NEW : null
        }
        case IssueRecordEvent.REOPENED:
            return policy.events.includes(AlertTriggerEvent.ISSUE_REOPENED) ? AlertRecordKind.REOPENED : null
        case IssueRecordEvent.OCCURRED:
            return policy.events.includes(AlertTriggerEvent.ISSUE_NEW) ? AlertRecordKind.STILL_FAILING : null
    }
}

function policyCoversIssue({ policy, issue }: { policy: AlertPolicySchema, issue: Issue }): boolean {
    const projectMatches = policy.projectIds.length === 0 || policy.projectIds.includes(issue.projectId)
    const workflowMatches = policy.workflowIds.length === 0 || (!isNil(issue.workflowId) && policy.workflowIds.includes(issue.workflowId))
    return projectMatches && workflowMatches
}

async function mergeIntoOpenWindow({ policy, issue }: { policy: AlertPolicySchema, issue: Issue }): Promise<boolean> {
    const windowStart = dayjsUtil().subtract(policy.groupWindowMinutes, 'minute').toISOString()
    const recent = await alertRecordRepo().findOne({
        where: { policyId: policy.id, issueId: issue.id, created: MoreThanOrEqual(windowStart) },
        order: { created: 'DESC' },
    })
    if (isNil(recent)) {
        return false
    }
    await alertRecordRepo().update({ id: recent.id }, { mergedCount: recent.mergedCount + 1 })
    return true
}

async function createAndDeliver({ policy, tenantId, issue, kind, channelIds, log }: CreateAndDeliverParams): Promise<void> {
    const quietUntil = kind === AlertRecordKind.ESCALATED ? null : quietHoursEnd({ quietHours: policy.quietHours, now: new Date() })
    const id = generateId()
    const record: Omit<AlertRecordSchema, 'created' | 'updated'> = {
        id,
        tenantId,
        policyId: policy.id,
        projectId: issue?.projectId ?? null,
        issueId: issue?.id ?? null,
        kind,
        channelIds,
        mergedCount: 1,
        status: AlertRecordStatus.PENDING,
        scheduledAt: (quietUntil ?? new Date()).toISOString(),
        sentAt: null,
        error: null,
        summary: summarize({ kind, issue, policy }),
    }
    await alertRecordRepo().insert(record)
    if (isNil(quietUntil)) {
        await deliver({ recordId: id, log })
    }
}

async function deliver({ recordId, log }: { recordId: string, log: FastifyBaseLogger }): Promise<void> {
    const record = await alertRecordRepo().findOneBy({ id: recordId })
    if (isNil(record) || record.status !== AlertRecordStatus.PENDING) {
        return
    }
    const issue = isNil(record.issueId) ? null : await issueRepo().findOneBy({ id: record.issueId })
    const message = await buildMessage({ record, issue })
    const channels = await notificationChannelService(log).findByIds({ ids: record.channelIds, tenantId: record.tenantId })
    const usable = channels.filter((channel) => notificationChannelService(log).isAvailable(channel))
    const results = await Promise.all(usable.map((channel) => notificationChannelService(log).deliver({ channel, message })))
    const failures = results.filter((result) => !result.success).map((result) => result.error ?? 'unknown error')
    const allFailed = usable.length === 0 || failures.length === usable.length
    await alertRecordRepo().update({ id: record.id }, {
        status: allFailed ? AlertRecordStatus.FAILED : AlertRecordStatus.SENT,
        sentAt: new Date().toISOString(),
        error: failures.length === 0 ? (usable.length === 0 ? 'No usable channel' : null) : failures.join('; ').slice(0, MAX_ERROR_LENGTH),
    })
    if (!isNil(issue)) {
        await issueService(log).recordActivity({
            issue,
            type: IssueActivityType.ALERT_SENT,
            actorId: null,
            data: { recordId: record.id, kind: record.kind, channelIds: record.channelIds, success: !allFailed },
        })
    }
}

async function flushPending({ log }: { log: FastifyBaseLogger }): Promise<void> {
    const due = await alertRecordRepo().find({
        where: { status: AlertRecordStatus.PENDING, scheduledAt: LessThanOrEqual(new Date().toISOString()) },
        order: { scheduledAt: 'ASC' },
        take: FLUSH_BATCH_SIZE,
    })
    for (const record of due) {
        await deliver({ recordId: record.id, log })
    }
}

async function escalate({ policy, log }: { policy: AlertPolicySchema, log: FastifyBaseLogger }): Promise<void> {
    if (!policy.escalation.enabled || isNil(policy.escalation.channelId)) {
        return
    }
    const threshold = dayjsUtil().subtract(policy.escalation.afterMinutes, 'minute').toISOString()
    const candidates = await alertRecordRepo().find({
        where: {
            policyId: policy.id,
            kind: In([AlertRecordKind.NEW, AlertRecordKind.REOPENED]),
            status: AlertRecordStatus.SENT,
            sentAt: LessThanOrEqual(threshold),
            created: MoreThanOrEqual(dayjsUtil().subtract(ESCALATION_LOOKBACK_HOURS, 'hour').toISOString()),
        },
        take: FLUSH_BATCH_SIZE,
    })
    for (const candidate of candidates) {
        if (isNil(candidate.issueId)) {
            continue
        }
        const issue = await issueRepo().findOneBy({ id: candidate.issueId, status: IssueStatus.OPEN, assigneeId: IsNull() })
        if (isNil(issue) || isMuted(issue)) {
            continue
        }
        const alreadyEscalated = await alertRecordRepo().exists({
            where: { policyId: policy.id, issueId: issue.id, kind: AlertRecordKind.ESCALATED, created: MoreThanOrEqual(candidate.created) },
        })
        if (alreadyEscalated) {
            continue
        }
        await createAndDeliver({ policy, tenantId: policy.tenantId, issue, kind: AlertRecordKind.ESCALATED, channelIds: [policy.escalation.channelId], log })
    }
}

async function checkFailureRate({ policy }: { policy: AlertPolicySchema }): Promise<void> {
    if (!policy.events.includes(AlertTriggerEvent.FAILURE_RATE) || isNil(policy.failureRate)) {
        return
    }
    const projectIds = policy.projectIds.length > 0
        ? policy.projectIds
        : (await projectRepo().find({ where: { tenantId: policy.tenantId }, select: ['id'] })).map((project) => project.id)
    if (projectIds.length === 0) {
        return
    }
    const since = dayjsUtil().subtract(policy.failureRate.windowMinutes, 'minute').toISOString()
    const builder = executionRepo().createQueryBuilder('execution')
        .select('execution."projectId"', 'projectId')
        .addSelect('COUNT(*)', 'total')
        .addSelect('SUM(CASE WHEN execution.status IN (:...failed) THEN 1 ELSE 0 END)', 'failed')
        .where('execution."projectId" IN (:...projectIds)', { projectIds })
        .andWhere('execution.environment = :environment', { environment: RunEnvironment.PRODUCTION })
        .andWhere('execution.created >= :since', { since })
        .setParameter('failed', FAILED_STATUSES)
        .groupBy('execution."projectId"')
    const scoped = policy.workflowIds.length > 0 ? builder.andWhere('execution."workflowId" IN (:...workflowIds)', { workflowIds: policy.workflowIds }) : builder
    const rows = await scoped.getRawMany<{ projectId: string, total: string, failed: string }>()
    const threshold = policy.failureRate.thresholdPercent
    for (const row of rows) {
        const total = Number(row.total)
        const rate = total === 0 ? 0 : (Number(row.failed) / total) * 100
        if (total < MIN_RUNS_FOR_RATE || rate < threshold) {
            continue
        }
        const windowStart = dayjsUtil().subtract(policy.groupWindowMinutes, 'minute').toISOString()
        const recent = await alertRecordRepo().exists({
            where: { policyId: policy.id, projectId: row.projectId, kind: AlertRecordKind.THRESHOLD, created: MoreThanOrEqual(windowStart) },
        })
        if (recent) {
            continue
        }
        const id = generateId()
        await alertRecordRepo().insert({
            id,
            tenantId: policy.tenantId,
            policyId: policy.id,
            projectId: row.projectId,
            issueId: null,
            kind: AlertRecordKind.THRESHOLD,
            channelIds: policy.channelIds,
            mergedCount: Number(row.failed),
            status: AlertRecordStatus.PENDING,
            scheduledAt: (quietHoursEnd({ quietHours: policy.quietHours, now: new Date() }) ?? new Date()).toISOString(),
            sentAt: null,
            error: null,
            summary: `失败率 ${rate.toFixed(1)}%（${row.failed}/${total}），超过阈值 ${threshold}%`,
        })
    }
}

async function checkCapacity({ policy, log }: { policy: AlertPolicySchema, log: FastifyBaseLogger }): Promise<void> {
    const threshold = policy.capacityThresholdPercent
    if (!policy.events.includes(AlertTriggerEvent.CAPACITY) || isNil(threshold)) {
        return
    }
    const projects = await projectRepo().find({
        where: policy.projectIds.length > 0 ? { tenantId: policy.tenantId, id: In(policy.projectIds) } : { tenantId: policy.tenantId },
        select: ['id', 'displayName', 'ownerId', 'monthlyRunsLimit'],
    })
    if (projects.length === 0) {
        return
    }
    const usage = await runQuota(log).usageThisMonth({ projectIds: projects.map((project) => project.id) })
    const monthStart = runQuotaUtils.monthStart(dayjsUtil())
    for (const project of projects) {
        const used = usage.get(project.id) ?? 0
        const limit = project.monthlyRunsLimit ?? instanceLimits.runsPerMonth()
        if (!runQuotaUtils.crossedThreshold({ used, limit, thresholdPercent: threshold })) {
            continue
        }
        const alreadyAlerted = await alertRecordRepo().exists({
            where: { policyId: policy.id, projectId: project.id, kind: AlertRecordKind.CAPACITY, created: MoreThanOrEqual(monthStart) },
        })
        if (alreadyAlerted) {
            continue
        }
        const percent = ((runQuotaUtils.usageRatio({ used, limit }) ?? 0) * 100).toFixed(1)
        await alertRecordRepo().insert({
            id: generateId(),
            tenantId: policy.tenantId,
            policyId: policy.id,
            projectId: project.id,
            issueId: null,
            kind: AlertRecordKind.CAPACITY,
            channelIds: policy.channelIds,
            mergedCount: 1,
            status: AlertRecordStatus.PENDING,
            scheduledAt: (quietHoursEnd({ quietHours: policy.quietHours, now: new Date() }) ?? new Date()).toISOString(),
            sentAt: null,
            error: null,
            summary: `本月运行 ${used.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} 次（${percent}%），达到容量告警阈值 ${threshold}%`,
        })
        await notifyCapacityInApp({ tenantId: policy.tenantId, project, used, limit, percent, log })
    }
}

async function notifyCapacityInApp({ tenantId, project, used, limit, percent, log }: NotifyCapacityParams): Promise<void> {
    const admins = await userRepo().find({ where: { tenantId, tenantRole: TenantRole.ADMIN, status: UserStatus.ACTIVE }, select: ['id'] })
    const adminIds = admins.map((admin) => admin.id)
    const content = {
        tenantId,
        projectId: project.id,
        type: NotificationType.CAPACITY_THRESHOLD,
        title: project.displayName,
        body: `${used.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} (${percent}%)`,
    }
    await notificationService(log).notify({ ...content, recipientIds: adminIds, link: '/tenant/limits/usage' })
    await notificationService(log).notify({
        ...content,
        recipientIds: [project.ownerId].filter((ownerId) => !adminIds.includes(ownerId)),
        link: `/projects/${project.id}/automations`,
    })
}

async function buildMessage({ record, issue }: { record: AlertRecordSchema, issue: Issue | null }): Promise<AlertMessage> {
    const path = linkPath({ record, issue })
    const link = isNil(path) ? null : await domainHelper.getPublicUrl({ path })
    const project = isNil(record.projectId) ? null : await projectRepo().findOne({ where: { id: record.projectId }, select: ['id', 'displayName'] })
    const lines = [
        isNil(project) ? null : `项目：${project.displayName}`,
        isNil(issue) ? null : `累计失败：${issue.occurrences} 次`,
        record.mergedCount > 1 ? `本次告警合并了 ${record.mergedCount} 次失败` : null,
        isNil(issue) ? null : `原因：${issue.message.slice(0, MAX_MESSAGE_PREVIEW)}`,
    ].filter((line): line is string => !isNil(line))
    return { title: `【${KIND_LABELS[record.kind]}】${record.summary}`, body: lines.join('\n'), link }
}

function linkPath({ record, issue }: { record: AlertRecordSchema, issue: Issue | null }): string | null {
    if (record.kind === AlertRecordKind.CAPACITY) {
        return 'tenant/limits/usage'
    }
    if (!isNil(issue)) {
        return `projects/${issue.projectId}/issues/${issue.id}`
    }
    return isNil(record.projectId) ? null : `projects/${record.projectId}/issues`
}

function summarize({ kind, issue, policy }: { kind: AlertRecordKind, issue: Issue | null, policy: AlertPolicySchema }): string {
    if (isNil(issue)) {
        return policy.name
    }
    const subject = issue.kind === IssueKind.CONNECTION ? `连接 ${issue.connectionExternalId ?? ''} 认证失败` : issue.title
    return kind === AlertRecordKind.ESCALATED ? `${subject}（${policy.escalation.afterMinutes} 分钟无人处理）` : subject
}

function isMuted(issue: Pick<Issue, 'mutedUntil'>): boolean {
    return !isNil(issue.mutedUntil) && dayjsUtil(issue.mutedUntil).isAfter(dayjsUtil())
}

function quietHoursEnd({ quietHours, now }: { quietHours: QuietHours, now: Date }): Date | null {
    if (!quietHours.enabled) {
        return null
    }
    const current = minutesOfDay({ date: now, timezone: quietHours.timezone })
    const from = parseTimeOfDay(quietHours.from)
    const to = parseTimeOfDay(quietHours.to)
    const inQuiet = from <= to ? current >= from && current < to : current >= from || current < to
    if (!inQuiet) {
        return null
    }
    const minutesLeft = (to - current + MINUTES_PER_DAY) % MINUTES_PER_DAY
    return new Date(now.getTime() + minutesLeft * 60_000)
}

function minutesOfDay({ date, timezone }: { date: Date, timezone: string }): number {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: safeTimezone(timezone), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
    const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
    const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
    return hour * 60 + minute
}

function safeTimezone(timezone: string): string {
    try {
        new Intl.DateTimeFormat('en-GB', { timeZone: timezone })
        return timezone
    }
    catch {
        return 'UTC'
    }
}

function parseTimeOfDay(value: string): number {
    const [hour, minute] = value.split(':').map(Number)
    return hour * 60 + minute
}

const FAILED_STATUSES = projectStatsUtils.FAILED_STATUSES
const FLUSH_BATCH_SIZE = 100
const ESCALATION_LOOKBACK_HOURS = 48
const MIN_RUNS_FOR_RATE = 5
const MAX_ERROR_LENGTH = 1000
const MAX_MESSAGE_PREVIEW = 300
const MINUTES_PER_DAY = 1440
const KIND_LABELS: Record<AlertRecordKind, string> = {
    [AlertRecordKind.NEW]: '新问题',
    [AlertRecordKind.REOPENED]: '问题复发',
    [AlertRecordKind.THRESHOLD]: '失败率超阈值',
    [AlertRecordKind.ESCALATED]: '已升级',
    [AlertRecordKind.STILL_FAILING]: '仍在失败',
    [AlertRecordKind.CAPACITY]: '容量告警',
}

type OnIssueRecordedParams = {
    issue: Issue
    event: IssueRecordEvent
    counted: boolean
    tenantId: TenantId
}

type CreateAndDeliverParams = {
    policy: AlertPolicySchema
    tenantId: TenantId
    issue: Issue | null
    kind: AlertRecordKind
    channelIds: string[]
    log: FastifyBaseLogger
}

type NotifyCapacityParams = {
    tenantId: TenantId
    project: { id: string, displayName: string, ownerId: string }
    used: number
    limit: number
    percent: string
    log: FastifyBaseLogger
}
