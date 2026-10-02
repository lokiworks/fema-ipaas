import { ApplicationError, ErrorCode, generateId, isNil, Permission, ProjectId, SeekPage, UserId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import {
    Execution,
    Issue,
    IssueActivity,
    IssueActivityData,
    IssueActivityType,
    IssueKind,
    IssueListView,
    IssueOverview,
    IssueOverviewItem,
    IssueOverviewProject,
    IssueSeverity,
    IssueSort,
    IssueStatus,
    IssueSummary,
    IssueTrend,
    IssueTrendGranularity,
    issueUtils,
    IssueWithSeverity,
    ListIssuesRequestQuery,
    RunMonitorRange,
    UpdateIssueRequestBody,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { Brackets, In, SelectQueryBuilder } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { databaseConnection } from '../database/database-connection'
import { distributedLock } from '../database/redis-connections'
import { projectAccess } from '../project/project-access'
import { runMonitorUtils } from '../run-monitor/run-monitor-utils'
import { executionRepo } from '../workflows/execution/execution-service'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { issueAssignmentSideEffects } from './issue-assignment-side-effects'
import { IssueActivityEntity, IssueEntity } from './issue.entity'

export const issueRepo = repoFactory(IssueEntity)
export const issueActivityRepo = repoFactory(IssueActivityEntity)

export const issueService = (log: FastifyBaseLogger) => ({
    async recordFailure({ execution, workflowVersion }: RecordFailureParams): Promise<RecordFailureResult | null> {
        if (isNil(execution.failedStep)) {
            return null
        }
        const classification = issueUtils.classifyFailure({
            workflowId: execution.workflowId,
            executionStatus: execution.status,
            failedStep: execution.failedStep,
        })
        const now = dayjsUtil().toISOString()
        const outcome = await distributedLock(log).runExclusive({
            key: `issue:${execution.projectId}:${classification.signature}`,
            timeoutInSeconds: 15,
            fn: async (): Promise<RecordFailureResult> => {
                const existing = await issueRepo().findOneBy({ projectId: execution.projectId, signature: classification.signature })
                if (isNil(existing)) {
                    const created = await insertIssue({ execution, workflowVersion, classification, now })
                    await recordActivity({ issue: created, type: IssueActivityType.FIRST_SEEN, actorId: null, data: { executionId: execution.id } })
                    return { issue: created, event: IssueRecordEvent.NEW, counted: true }
                }
                const reopening = existing.status === IssueStatus.RESOLVED
                const repeatAttempt = issueUtils.isRepeatAttempt({ execution, existingIssueId: existing.id })
                await issueRepo().update({ id: existing.id, projectId: existing.projectId }, {
                    occurrences: repeatAttempt ? existing.occurrences : existing.occurrences + 1,
                    lastSeenAt: now,
                    message: classification.message,
                    ...(reopening ? { status: IssueStatus.OPEN, reopened: true, resolvedAt: null, resolvedById: null } : {}),
                })
                const updated = await getOneOrThrow({ id: existing.id, projectId: existing.projectId })
                if (reopening) {
                    await recordActivity({ issue: updated, type: IssueActivityType.REOPENED, actorId: null, data: { executionId: execution.id } })
                }
                return { issue: updated, event: reopening ? IssueRecordEvent.REOPENED : IssueRecordEvent.OCCURRED, counted: !repeatAttempt }
            },
        })
        await executionRepo().update({ id: execution.id, projectId: execution.projectId }, { issueId: outcome.issue.id })
        log.info({ issue: { id: outcome.issue.id, event: outcome.event }, execution: { id: execution.id } }, '[issueService#recordFailure] Failure recorded')
        return outcome
    },

    async list({ query, currentUserId }: ListParams): Promise<SeekPage<IssueWithSeverity>> {
        const limit = query.limit ?? DEFAULT_PAGE_SIZE
        const offset = decodeOffset(query.cursor)
        const builder = applyListFilters({
            builder: issueRepo().createQueryBuilder('issue').where('issue."projectId" = :projectId', { projectId: query.projectId }),
            query,
            currentUserId,
        })
        const rows = await applySort({ builder, sort: query.sort ?? IssueSort.LAST_SEEN })
            .skip(offset)
            .take(limit + 1)
            .getMany()
        const page = rows.slice(0, limit)
        const data = await withSeverity({ issues: page, projectId: query.projectId, log })
        return {
            data,
            next: rows.length > limit ? String(offset + limit) : null,
            previous: offset > 0 ? String(Math.max(0, offset - limit)) : null,
        }
    },

    async summary({ projectId, currentUserId, timezone }: SummaryParams): Promise<IssueSummary> {
        const issues = await issueRepo().find({ where: { projectId }, select: ['id', 'kind', 'status', 'occurrences', 'assigneeId', 'mutedUntil', 'firstSeenAt', 'lastSeenAt', 'reopened'] })
        const now = dayjsUtil()
        const zone = runMonitorUtils.safeTimezone(timezone)
        const startOfDay = dayjsUtil(runMonitorUtils.calendarDaysStart({ days: 1, now: now.valueOf(), timezone: zone }))
        const weekAgo = dayjsUtil(runMonitorUtils.calendarDaysStart({ days: 7, now: now.valueOf(), timezone: zone }))
        const muted = issues.filter((issue) => isMuted({ issue, now: now.toISOString() }))
        const active = issues.filter((issue) => !isMuted({ issue, now: now.toISOString() }))
        const open = active.filter((issue) => issue.status === IssueStatus.OPEN)
        const investigating = active.filter((issue) => issue.status === IssueStatus.INVESTIGATING)
        const failuresLast7Days = await executionRepo().createQueryBuilder('execution')
            .innerJoin('issue', 'issue', 'issue.id = execution."issueId"')
            .where('issue."projectId" = :projectId', { projectId })
            .andWhere('execution."rerunOfExecutionId" IS NULL')
            .andWhere('execution.created >= :since', { since: weekAgo.toISOString() })
            .getCount()
        return {
            open: open.length,
            openHighSeverity: open.filter((issue) => issueUtils.severityOf(issue) === IssueSeverity.HIGH).length,
            investigating: investigating.length,
            investigatingAssignedToMe: investigating.filter((issue) => issue.assigneeId === currentUserId).length,
            newOrReopenedToday: active.filter((issue) => isNewOrReopenedSince({ issue, since: startOfDay.toISOString() })).length,
            muted: muted.length,
            failuresLast7Days,
            issuesLast7Days: issues.filter((issue) => !dayjsUtil(issue.lastSeenAt).isBefore(weekAgo)).length,
            alertsLast7Days: 0,
        }
    },

    async overview({ userId, tenantId, projectId }: OverviewParams): Promise<IssueOverview> {
        const projects = await projectAccess(log).projectsWithPermission({ userId, tenantId, permission: Permission.READ_ISSUE })
        if (projects.length === 0) {
            return { projects: [], latest: [] }
        }
        const projectIds = projects.map((project) => project.id)
        const now = dayjsUtil().toISOString()
        const unresolved = await applySort({
            builder: applyView({
                builder: issueRepo().createQueryBuilder('issue').where('issue."projectId" IN (:...projectIds)', { projectIds }),
                view: IssueListView.UNRESOLVED,
                now,
                todayStart: now,
            }),
            sort: IssueSort.LAST_SEEN,
        }).getMany()
        const active = unresolved.filter((issue) => !isMuted({ issue, now }))
        const latest = active.filter((issue) => isNil(projectId) || issue.projectId === projectId).slice(0, OVERVIEW_LATEST_LIMIT)
        const nameByProject = new Map(projects.map((project) => [project.id, project.displayName]))
        const latestWithSeverity = await withSeverityAcrossProjects({ issues: latest, log })
        return {
            projects: projects
                .map((project) => overviewProject({ project, issues: active.filter((issue) => issue.projectId === project.id) }))
                .filter((project) => project.open + project.investigating > 0),
            latest: latestWithSeverity.map((issue): IssueOverviewItem => ({ ...issue, projectDisplayName: nameByProject.get(issue.projectId) ?? '' })),
        }
    },

    async getOneOrThrow({ id, projectId }: IssueRef): Promise<IssueWithSeverity> {
        const issue = await getOneOrThrow({ id, projectId })
        const [withDetails] = await withSeverity({ issues: [issue], projectId, log })
        return withDetails
    },

    async update({ id, projectId, request, actorId }: UpdateParams): Promise<IssueWithSeverity> {
        const issue = await getOneOrThrow({ id, projectId })
        await applyUpdate({ issue, request, actorId, log })
        return this.getOneOrThrow({ id, projectId })
    },

    async batchUpdate({ ids, projectId, request, actorId }: BatchUpdateParams): Promise<void> {
        const issues = await issueRepo().findBy({ id: In(ids), projectId })
        for (const issue of issues) {
            await applyUpdate({ issue, request, actorId, log })
        }
    },

    async listActivities({ id, projectId }: IssueRef): Promise<IssueActivity[]> {
        await getOneOrThrow({ id, projectId })
        return issueActivityRepo().find({
            where: { issueId: id, projectId },
            order: { created: 'DESC' },
            take: MAX_ACTIVITIES,
        })
    },

    async addNote({ id, projectId, text, actorId }: AddNoteParams): Promise<IssueActivity> {
        const issue = await getOneOrThrow({ id, projectId })
        return recordActivity({ issue, type: IssueActivityType.NOTE, actorId, data: { text } })
    },

    async recordActivity(params: RecordActivityParams): Promise<IssueActivity> {
        return recordActivity(params)
    },

    async listExecutions({ id, projectId, cursor, limit }: ListExecutionsParams): Promise<SeekPage<Execution>> {
        await getOneOrThrow({ id, projectId })
        const pageSize = limit ?? DEFAULT_PAGE_SIZE
        const offset = decodeOffset(cursor)
        const rows = await executionRepo().find({
            where: { issueId: id, projectId },
            order: { created: 'DESC' },
            skip: offset,
            take: pageSize + 1,
        })
        return {
            data: rows.slice(0, pageSize),
            next: rows.length > pageSize ? String(offset + pageSize) : null,
            previous: offset > 0 ? String(Math.max(0, offset - pageSize)) : null,
        }
    },

    async trend({ id, projectId, granularity, timezone }: TrendParams): Promise<IssueTrend> {
        await getOneOrThrow({ id, projectId })
        const resolved = granularity ?? IssueTrendGranularity.DAY
        const starts = runMonitorUtils.bucketStarts({
            range: resolved === IssueTrendGranularity.HOUR ? RunMonitorRange.LAST_24_HOURS : RunMonitorRange.LAST_30_DAYS,
            now: Date.now(),
            timezone: runMonitorUtils.safeTimezone(timezone),
        })
        const rows: { bucket: number | string, count: string }[] = await databaseConnection().query(
            `SELECT width_bucket(e.created, $3::timestamptz[]) AS bucket, COUNT(*) AS count
            FROM "execution" e
            WHERE e."issueId" = $1 AND e."projectId" = $2 AND e."rerunOfExecutionId" IS NULL AND e.created >= $4
            GROUP BY 1`,
            [id, projectId, starts.map((start) => new Date(start).toISOString()), new Date(starts[0]).toISOString()],
        )
        const counts = new Map(rows.map((row) => [Number(row.bucket), Number(row.count)]))
        return {
            granularity: resolved,
            buckets: starts.map((start, index) => ({ start: new Date(start).toISOString(), count: counts.get(index + 1) ?? 0 })),
        }
    },

    async onWorkflowDeleted({ workflowId, projectId }: { workflowId: string, projectId: ProjectId }): Promise<void> {
        const stale = await issueRepo().find({
            where: { workflowId, projectId, status: In([IssueStatus.OPEN, IssueStatus.INVESTIGATING]) },
            select: ['id', 'status'],
        })
        if (stale.length === 0) {
            return
        }
        await issueRepo().update({ id: In(stale.map((issue) => issue.id)), projectId }, {
            status: IssueStatus.RESOLVED,
            resolvedAt: dayjsUtil().toISOString(),
            resolvedById: null,
            reopened: false,
        })
        await issueActivityRepo().insert(stale.map((issue) => ({
            id: generateId(),
            issueId: issue.id,
            projectId,
            type: IssueActivityType.STATUS_CHANGED,
            actorId: null,
            data: { from: issue.status, to: IssueStatus.RESOLVED },
        })))
    },

    async affectedWorkflowIds({ id, projectId }: IssueRef): Promise<string[]> {
        const rows = await executionRepo().createQueryBuilder('execution')
            .select('DISTINCT execution."workflowId"', 'workflowId')
            .where('execution."issueId" = :id', { id })
            .andWhere('execution."projectId" = :projectId', { projectId })
            .getRawMany<{ workflowId: string }>()
        return rows.map((row) => row.workflowId)
    },
})

async function insertIssue({ execution, workflowVersion, classification, now }: InsertIssueParams): Promise<Issue> {
    const id = generateId()
    const failedStep = execution.failedStep
    await issueRepo().insert({
        id,
        projectId: execution.projectId,
        kind: classification.kind,
        signature: classification.signature,
        workflowId: classification.kind === IssueKind.CONNECTION ? null : execution.workflowId,
        stepName: classification.kind === IssueKind.CONNECTION ? null : failedStep?.name ?? null,
        stepDisplayName: classification.kind === IssueKind.CONNECTION ? null : failedStep?.displayName ?? null,
        connectionExternalId: classification.connectionExternalId,
        errorCode: classification.errorCode,
        title: titleFor({ classification, workflowVersion, stepDisplayName: failedStep?.displayName ?? '' }),
        message: classification.message,
        status: IssueStatus.OPEN,
        reopened: false,
        assigneeId: null,
        mutedUntil: null,
        occurrences: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        resolvedAt: null,
        resolvedById: null,
    })
    return getOneOrThrow({ id, projectId: execution.projectId })
}

function titleFor({ classification, workflowVersion, stepDisplayName }: TitleForParams): string {
    if (classification.kind === IssueKind.CONNECTION) {
        return classification.connectionExternalId ?? classification.errorCode
    }
    const firstLine = classification.message.split('\n')[0].slice(0, MAX_TITLE_LENGTH)
    const prefix = isNil(workflowVersion) ? stepDisplayName : `${workflowVersion.displayName} · ${stepDisplayName}`
    return firstLine.length > 0 ? `${prefix}: ${firstLine}` : prefix
}

async function applyUpdate({ issue, request, actorId, log }: ApplyUpdateParams): Promise<void> {
    const now = dayjsUtil()
    if (!isNil(request.assigneeId)) {
        await assertAssignable({ userId: request.assigneeId, projectId: issue.projectId, log })
    }
    const statusChanged = !isNil(request.status) && request.status !== issue.status
    const assigneeChanged = request.assigneeId !== undefined && request.assigneeId !== issue.assigneeId
    const muteChanged = request.mutedForHours !== undefined
    await issueRepo().update({ id: issue.id, projectId: issue.projectId }, {
        ...(statusChanged ? statusPatch({ status: request.status ?? issue.status, actorId, now: now.toISOString() }) : {}),
        ...(assigneeChanged ? { assigneeId: request.assigneeId ?? null } : {}),
        ...(muteChanged ? { mutedUntil: isNil(request.mutedForHours) ? null : now.add(request.mutedForHours, 'hour').toISOString() } : {}),
    })
    if (statusChanged) {
        await recordActivity({ issue, type: IssueActivityType.STATUS_CHANGED, actorId, data: { from: issue.status, to: request.status ?? issue.status } })
    }
    if (assigneeChanged) {
        await recordActivity({ issue, type: IssueActivityType.ASSIGNED, actorId, data: { assigneeId: request.assigneeId ?? null } })
        await issueAssignmentSideEffects(log).onAssigned({ issue, assigneeId: request.assigneeId ?? null, actorId })
    }
    if (muteChanged) {
        await recordActivity({ issue, type: IssueActivityType.MUTED, actorId, data: { hours: request.mutedForHours ?? null } })
    }
}

function statusPatch({ status, actorId, now }: { status: IssueStatus, actorId: UserId, now: string }): Partial<Issue> {
    if (status === IssueStatus.RESOLVED) {
        return { status, resolvedAt: now, resolvedById: actorId, reopened: false }
    }
    return { status, resolvedAt: null, resolvedById: null }
}

async function assertAssignable({ userId, projectId, log }: { userId: UserId, projectId: ProjectId, log: FastifyBaseLogger }): Promise<void> {
    const role = await projectAccess(log).resolveRole({ userId, projectId })
    if (isNil(role) || !role.permissions.includes(Permission.WRITE_ISSUE)) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: 'Assignee must be able to manage issues in this project' },
        })
    }
}

async function recordActivity({ issue, type, actorId, data }: RecordActivityParams): Promise<IssueActivity> {
    const id = generateId()
    await issueActivityRepo().insert({ id, issueId: issue.id, projectId: issue.projectId, type, actorId, data })
    return issueActivityRepo().findOneByOrFail({ id })
}

async function getOneOrThrow({ id, projectId }: IssueRef): Promise<Issue> {
    const issue = await issueRepo().findOneBy({ id, projectId })
    if (isNil(issue)) {
        throw new ApplicationError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: { entityId: id, entityType: 'Issue' },
        })
    }
    return issue
}

async function withSeverity({ issues, projectId, log }: WithSeverityParams): Promise<IssueWithSeverity[]> {
    const workflowIds = [...new Set(issues.map((issue) => issue.workflowId).filter((id): id is string => !isNil(id)))]
    const versions = workflowIds.length === 0 ? new Map<string, WorkflowVersion>() : await workflowVersionService(log).getLatestVersionsByWorkflowIds(workflowIds, projectId)
    const affected = await countAffectedWorkflows(issues.map((issue) => issue.id))
    return issues.map((issue) => ({
        ...issue,
        severity: issueUtils.severityOf(issue),
        workflowDisplayName: isNil(issue.workflowId) ? null : versions.get(issue.workflowId)?.displayName ?? null,
        affectedWorkflows: affected.get(issue.id) ?? (isNil(issue.workflowId) ? 0 : 1),
    }))
}

async function withSeverityAcrossProjects({ issues, log }: { issues: Issue[], log: FastifyBaseLogger }): Promise<IssueWithSeverity[]> {
    const projectIds = [...new Set(issues.map((issue) => issue.projectId))]
    const perProject = await Promise.all(projectIds.map((projectId) => withSeverity({ issues: issues.filter((issue) => issue.projectId === projectId), projectId, log })))
    const byId = new Map(perProject.flat().map((issue) => [issue.id, issue]))
    return issues.map((issue) => byId.get(issue.id)).filter((issue): issue is IssueWithSeverity => !isNil(issue))
}

function overviewProject({ project, issues }: { project: { id: string, displayName: string }, issues: Issue[] }): IssueOverviewProject {
    const open = issues.filter((issue) => issue.status === IssueStatus.OPEN)
    return {
        projectId: project.id,
        projectDisplayName: project.displayName,
        open: open.length,
        openHighSeverity: open.filter((issue) => issueUtils.severityOf(issue) === IssueSeverity.HIGH).length,
        investigating: issues.filter((issue) => issue.status === IssueStatus.INVESTIGATING).length,
    }
}

async function countAffectedWorkflows(issueIds: string[]): Promise<Map<string, number>> {
    if (issueIds.length === 0) {
        return new Map()
    }
    const rows = await executionRepo().createQueryBuilder('execution')
        .select('execution."issueId"', 'issueId')
        .addSelect('COUNT(DISTINCT execution."workflowId")', 'count')
        .where({ issueId: In(issueIds) })
        .groupBy('execution."issueId"')
        .getRawMany<{ issueId: string, count: string }>()
    return new Map(rows.map((row) => [row.issueId, Number(row.count)]))
}

function applyListFilters({ builder, query, currentUserId }: ApplyListFiltersParams): SelectQueryBuilder<Issue> {
    const now = dayjsUtil().toISOString()
    const todayStart = new Date(runMonitorUtils.calendarDaysStart({ days: 1, now: Date.now(), timezone: runMonitorUtils.safeTimezone(query.timezone) })).toISOString()
    const withView = applyView({ builder, view: query.view ?? IssueListView.UNRESOLVED, now, todayStart })
    const withSeverityFilter = isNil(query.severity) ? withView : applySeverityFilter({ builder: withView, severity: query.severity })
    const withAssignee = isNil(query.assignee) ? withSeverityFilter : applyAssigneeFilter({ builder: withSeverityFilter, assignee: query.assignee, currentUserId })
    const withWorkflow = isNil(query.workflowId) ? withAssignee : withAssignee.andWhere('issue."workflowId" = :workflowId', { workflowId: query.workflowId })
    if (isNil(query.search) || query.search.trim().length === 0) {
        return withWorkflow
    }
    const search = `%${query.search.trim()}%`
    return withWorkflow.andWhere(new Brackets((qb) => {
        qb.where('issue.title ILIKE :search', { search })
            .orWhere('issue.message ILIKE :search', { search })
            .orWhere('issue."stepDisplayName" ILIKE :search', { search })
    }))
}

function applyView({ builder, view, now, todayStart }: { builder: SelectQueryBuilder<Issue>, view: IssueListView, now: string, todayStart: string }): SelectQueryBuilder<Issue> {
    const notMuted = '(issue."mutedUntil" IS NULL OR issue."mutedUntil" <= :now)'
    switch (view) {
        case IssueListView.UNRESOLVED:
            return builder.andWhere('issue.status IN (:...statuses)', { statuses: [IssueStatus.OPEN, IssueStatus.INVESTIGATING] })
        case IssueListView.OPEN:
            return builder.andWhere('issue.status = :status', { status: IssueStatus.OPEN }).andWhere(notMuted, { now })
        case IssueListView.REOPENED:
            return builder.andWhere('issue.reopened = true').andWhere('issue.status = :status', { status: IssueStatus.OPEN })
        case IssueListView.INVESTIGATING:
            return builder.andWhere('issue.status = :status', { status: IssueStatus.INVESTIGATING }).andWhere(notMuted, { now })
        case IssueListView.TODAY:
            return builder.andWhere(notMuted, { now }).andWhere(new Brackets((qb) => {
                qb.where('issue."firstSeenAt" >= :today', { today: todayStart })
                    .orWhere(new Brackets((inner) => {
                        inner.where('issue.reopened = true').andWhere('issue."lastSeenAt" >= :today', { today: todayStart })
                    }))
            }))
        case IssueListView.MUTED:
            return builder.andWhere('issue."mutedUntil" > :now', { now })
        case IssueListView.RESOLVED:
            return builder.andWhere('issue.status = :status', { status: IssueStatus.RESOLVED })
        case IssueListView.IGNORED:
            return builder.andWhere('issue.status = :status', { status: IssueStatus.IGNORED })
        case IssueListView.ALL:
            return builder
    }
}

function applySeverityFilter({ builder, severity }: { builder: SelectQueryBuilder<Issue>, severity: IssueSeverity }): SelectQueryBuilder<Issue> {
    switch (severity) {
        case IssueSeverity.HIGH:
            return builder.andWhere(new Brackets((qb) => {
                qb.where('issue.kind = :connectionKind', { connectionKind: IssueKind.CONNECTION }).orWhere('issue.occurrences >= 10')
            }))
        case IssueSeverity.MEDIUM:
            return builder.andWhere('issue.kind = :stepKind', { stepKind: IssueKind.STEP }).andWhere('issue.occurrences >= 3').andWhere('issue.occurrences < 10')
        case IssueSeverity.LOW:
            return builder.andWhere('issue.kind = :stepKind', { stepKind: IssueKind.STEP }).andWhere('issue.occurrences < 3')
    }
}

function applyAssigneeFilter({ builder, assignee, currentUserId }: { builder: SelectQueryBuilder<Issue>, assignee: string, currentUserId: UserId }): SelectQueryBuilder<Issue> {
    if (assignee === ASSIGNEE_UNASSIGNED) {
        return builder.andWhere('issue."assigneeId" IS NULL')
    }
    const assigneeId = assignee === ASSIGNEE_ME ? currentUserId : assignee
    return builder.andWhere('issue."assigneeId" = :assigneeId', { assigneeId })
}

function applySort({ builder, sort }: { builder: SelectQueryBuilder<Issue>, sort: IssueSort }): SelectQueryBuilder<Issue> {
    switch (sort) {
        case IssueSort.OCCURRENCES:
            return builder.orderBy('issue.occurrences', 'DESC').addOrderBy('issue."lastSeenAt"', 'DESC')
        case IssueSort.SEVERITY:
            return builder
                .orderBy(`CASE WHEN issue.kind = '${IssueKind.CONNECTION}' OR issue.occurrences >= 10 THEN 0 WHEN issue.occurrences >= 3 THEN 1 ELSE 2 END`, 'ASC')
                .addOrderBy('issue."lastSeenAt"', 'DESC')
        case IssueSort.LAST_SEEN:
            return builder.orderBy('issue."lastSeenAt"', 'DESC')
    }
}

function isMuted({ issue, now }: { issue: Pick<Issue, 'mutedUntil'>, now: string }): boolean {
    return !isNil(issue.mutedUntil) && dayjsUtil(issue.mutedUntil).isAfter(now)
}

function isNewOrReopenedSince({ issue, since }: { issue: Pick<Issue, 'firstSeenAt' | 'lastSeenAt' | 'reopened'>, since: string }): boolean {
    return dayjsUtil(issue.firstSeenAt).isAfter(since) || (issue.reopened && dayjsUtil(issue.lastSeenAt).isAfter(since))
}

function decodeOffset(cursor: string | undefined): number {
    const parsed = Number(cursor)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

const DEFAULT_PAGE_SIZE = 20
const OVERVIEW_LATEST_LIMIT = 50
const MAX_ACTIVITIES = 200
const MAX_TITLE_LENGTH = 200
const ASSIGNEE_ME = 'me'
const ASSIGNEE_UNASSIGNED = 'unassigned'

export enum IssueRecordEvent {
    NEW = 'NEW',
    REOPENED = 'REOPENED',
    OCCURRED = 'OCCURRED',
}

export type RecordFailureResult = {
    issue: Issue
    event: IssueRecordEvent
    counted: boolean
}

type RecordFailureParams = {
    execution: Execution
    workflowVersion: WorkflowVersion | null
}

type InsertIssueParams = {
    execution: Execution
    workflowVersion: WorkflowVersion | null
    classification: ReturnType<typeof issueUtils.classifyFailure>
    now: string
}

type TitleForParams = {
    classification: ReturnType<typeof issueUtils.classifyFailure>
    workflowVersion: WorkflowVersion | null
    stepDisplayName: string
}

type IssueRef = {
    id: string
    projectId: ProjectId
}

type ListParams = {
    query: ListIssuesRequestQuery
    currentUserId: UserId
}

type OverviewParams = {
    userId: UserId
    tenantId: string
    projectId: ProjectId | undefined
}

type SummaryParams = {
    projectId: ProjectId
    currentUserId: UserId
    timezone?: string
}

type UpdateParams = IssueRef & {
    request: UpdateIssueRequestBody
    actorId: UserId
}

type BatchUpdateParams = {
    ids: string[]
    projectId: ProjectId
    request: UpdateIssueRequestBody
    actorId: UserId
}

type ApplyUpdateParams = {
    issue: Issue
    request: UpdateIssueRequestBody
    actorId: UserId
    log: FastifyBaseLogger
}

type AddNoteParams = IssueRef & {
    text: string
    actorId: UserId
}

type RecordActivityParams = {
    issue: Pick<Issue, 'id' | 'projectId'>
    type: IssueActivityType
    actorId: UserId | null
    data: IssueActivityData
}

type ListExecutionsParams = IssueRef & {
    cursor: string | undefined
    limit: number | undefined
}

type TrendParams = IssueRef & {
    granularity: IssueTrendGranularity | undefined
    timezone: string | undefined
}

type WithSeverityParams = {
    issues: Issue[]
    projectId: ProjectId
    log: FastifyBaseLogger
}

type ApplyListFiltersParams = {
    builder: SelectQueryBuilder<Issue>
    query: ListIssuesRequestQuery
    currentUserId: UserId
}
