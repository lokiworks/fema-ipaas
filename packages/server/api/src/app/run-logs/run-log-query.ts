import { isNil } from '@fema-ipaas/core-utils'
import {
    Execution,
    ListRunLogsRequestQuery,
    RunEnvironment,
    RunLogDurationOperator,
    runLogFilterUtils,
    RunLogMatch,
    RunLogTimeRange,
    RunLogType,
} from '@fema-ipaas/shared'
import { Brackets, SelectQueryBuilder, WhereExpressionBuilder } from 'typeorm'
import { likePatternUtils } from '../helper/like-pattern'
import { runMonitorUtils } from '../run-monitor/run-monitor-utils'
import { executionRepo } from '../workflows/execution/execution-service'
import { RunLogAccessProject } from './run-log-access'

export const runLogQuery = {
    sinceOf,
    build({ query, projects, now, exactMatches }: BuildParams): SelectQueryBuilder<Execution> | null {
        if (projects.length === 0) {
            return null
        }
        const scopedIds = projects.map((project) => project.id)
        const retentionGroups = groupByRetention({ projects, now })
        const since = sinceOf({ query, now })
        const builder = executionRepo()
            .createQueryBuilder('execution')
            .where('execution."projectId" IN (:...scopedIds)', { scopedIds })
            .andWhere('execution."archivedAt" IS NULL')
            .andWhere(new Brackets((qb) => {
                retentionGroups.forEach((group, index) => {
                    qb.orWhere(`(execution."projectId" IN (:...retentionProjects${index}) AND execution.created >= :retentionSince${index})`, {
                        [`retentionProjects${index}`]: group.projectIds,
                        [`retentionSince${index}`]: group.since,
                    })
                })
            }))
            .andWhere('execution.created >= :since', { since })
        const withBefore = isNil(query.createdBefore) ? builder : builder.andWhere('execution.created <= :before', { before: query.createdBefore })
        const withType = applyType({ builder: withBefore, type: query.type ?? RunLogType.RUN })
        const withIds = isNil(query.runIds) || query.runIds.length === 0
            ? withType
            : withType.andWhere('execution.id IN (:...runIds)', { runIds: query.runIds })
        const predicates = conditionPredicates({ query, scopedIds, exactMatches: exactMatches ?? EMPTY_EXACT_MATCHES })
        if (predicates.length === 0) {
            return withIds
        }
        const matchAny = query.match === RunLogMatch.ANY && predicates.length > 1
        return withIds.andWhere(new Brackets((qb) => {
            predicates.forEach((predicate, index) => {
                const bracket = new Brackets((inner) => predicate(inner))
                if (index === 0) {
                    qb.where(bracket)
                    return
                }
                if (matchAny) {
                    qb.orWhere(bracket)
                    return
                }
                qb.andWhere(bracket)
            })
        }))
    },
}

function applyType({ builder, type }: { builder: SelectQueryBuilder<Execution>, type: RunLogType }): SelectQueryBuilder<Execution> {
    switch (type) {
        case RunLogType.RUN:
            return builder.andWhere('execution.environment = :runEnvironment', { runEnvironment: RunEnvironment.PRODUCTION })
        case RunLogType.DEBUG:
            return builder.andWhere('execution.environment = :runEnvironment', { runEnvironment: RunEnvironment.TESTING })
        case RunLogType.ALL:
            return builder
    }
}

function searchHashSql(parameter: string): string {
    return `execution."searchHashes" && ARRAY[:...${parameter}]::character varying[]`
}

function groupByRetention({ projects, now }: { projects: RunLogAccessProject[], now: Date }): RetentionGroup[] {
    const byDays = projects.reduce((acc, project) => {
        const existing = acc.get(project.retentionDays) ?? []
        return new Map(acc).set(project.retentionDays, [...existing, project.id])
    }, new Map<number, string[]>())
    return [...byDays.entries()].map(([days, projectIds]) => ({
        projectIds,
        since: new Date(now.getTime() - days * DAY_MS).toISOString(),
    }))
}

function conditionPredicates({ query, scopedIds, exactMatches }: { query: ListRunLogsRequestQuery, scopedIds: string[], exactMatches: ExactMatches }): Predicate[] {
    const projectFilter = isNil(query.projectId) || query.projectId.length === 0
        ? []
        : [projectPredicate({ requested: query.projectId, scopedIds })]
    const workflowFilter = isNil(query.workflowId) || query.workflowId.length === 0
        ? []
        : [(qb: WhereExpressionBuilder): WhereExpressionBuilder => qb.where('execution."workflowId" IN (:...conditionWorkflowIds)', { conditionWorkflowIds: query.workflowId })]
    const statusFilter = isNil(query.status) || query.status.length === 0
        ? []
        : [(qb: WhereExpressionBuilder): WhereExpressionBuilder => qb.where('execution.status IN (:...conditionStatuses)', { conditionStatuses: query.status })]
    const connectorFilter = isNil(query.connector) || query.connector.length === 0
        ? []
        : [(qb: WhereExpressionBuilder): WhereExpressionBuilder => qb.where(CONNECTOR_SQL, { conditionConnectors: query.connector })]
    const content = query.content?.trim() ?? ''
    const contentFilter = content.length === 0
        ? []
        : [(qb: WhereExpressionBuilder): WhereExpressionBuilder => qb.where(exactMatches.content.length === 0 ? CONTENT_SQL : `(${CONTENT_SQL} OR ${searchHashSql('conditionContentHashes')})`, {
            conditionContent: `%${likePatternUtils.escape(content)}%`,
            ...(exactMatches.content.length === 0 ? {} : { conditionContentHashes: exactMatches.content }),
        })]
    const businessKey = query.businessKey?.trim() ?? ''
    const businessKeyFilter = businessKey.length === 0
        ? []
        : [(qb: WhereExpressionBuilder): WhereExpressionBuilder => qb.where(exactMatches.businessKey.length === 0 ? BUSINESS_KEY_SQL : `(${BUSINESS_KEY_SQL} OR ${searchHashSql('conditionBusinessKeyHashes')})`, {
            conditionBusinessKey: `%${likePatternUtils.escape(businessKey)}%`,
            ...(exactMatches.businessKey.length === 0 ? {} : { conditionBusinessKeyHashes: exactMatches.businessKey }),
        })]
    const handledFilter = isNil(query.handled) || query.handled.length === 0
        ? []
        : [(qb: WhereExpressionBuilder): WhereExpressionBuilder => qb.where(HANDLED_SQL, { conditionHandled: query.handled })]
    const durationFilter = isNil(query.durationSeconds)
        ? []
        : [durationPredicate({ operator: query.durationOperator ?? RunLogDurationOperator.GTE, seconds: query.durationSeconds })]
    return [...projectFilter, ...workflowFilter, ...statusFilter, ...connectorFilter, ...contentFilter, ...businessKeyFilter, ...handledFilter, ...durationFilter]
}

function projectPredicate({ requested, scopedIds }: { requested: string[], scopedIds: string[] }): Predicate {
    const allowed = requested.filter((projectId) => scopedIds.includes(projectId))
    if (allowed.length === 0) {
        return (qb) => qb.where('1 = 0')
    }
    return (qb) => qb.where('execution."projectId" IN (:...conditionProjectIds)', { conditionProjectIds: allowed })
}

function durationPredicate({ operator, seconds }: { operator: RunLogDurationOperator, seconds: number }): Predicate {
    const comparator = operator === RunLogDurationOperator.GTE ? '>=' : '<='
    return (qb) => qb.where(
        `execution."startTime" IS NOT NULL AND execution."finishTime" IS NOT NULL AND EXTRACT(EPOCH FROM (execution."finishTime" - execution."startTime")) ${comparator} :conditionDurationSeconds`,
        { conditionDurationSeconds: seconds },
    )
}

const DAY_MS = 24 * 60 * 60 * 1000

const CONNECTOR_SQL = `EXISTS (
    SELECT 1 FROM workflow_version run_version
    CROSS JOIN LATERAL jsonb_path_query(run_version."trigger", 'lax $.**.connectorName') AS connector_name
    WHERE run_version.id = execution."workflowVersionId" AND connector_name #>> '{}' IN (:...conditionConnectors)
)`

const HANDLED_SQL = `EXISTS (
    SELECT 1 FROM run_reliability_event run_event
    WHERE run_event."executionId" = execution.id AND run_event.kind IN (:...conditionHandled)
)`

const BUSINESS_KEY_SQL = 'execution."businessKey" ILIKE :conditionBusinessKey'

const EMPTY_EXACT_MATCHES: ExactMatches = { content: [], businessKey: [] }

const CONTENT_SQL = `(
    execution.id ILIKE :conditionContent
    OR execution."failedStep"->>'message' ILIKE :conditionContent
    OR execution."failedStep"->>'displayName' ILIKE :conditionContent
    OR EXISTS (SELECT 1 FROM issue run_issue WHERE run_issue.id = execution."issueId" AND run_issue."errorCode" ILIKE :conditionContent)
    OR execution."businessKey" ILIKE :conditionContent
    OR EXISTS (SELECT 1 FROM deduped_event run_dedupe WHERE run_dedupe."firstExecutionId" = execution.id AND run_dedupe."keyPreview" ILIKE :conditionContent)
)`

type Predicate = (qb: WhereExpressionBuilder) => WhereExpressionBuilder

type RetentionGroup = {
    projectIds: string[]
    since: string
}

function sinceOf({ query, now }: { query: ListRunLogsRequestQuery, now: Date }): string {
    if (!isNil(query.createdAfter)) {
        return query.createdAfter
    }
    const time = query.time ?? RunLogTimeRange.HOURS_24
    const calendarDays = CALENDAR_DAYS[time]
    if (isNil(calendarDays)) {
        return new Date(now.getTime() - runLogFilterUtils.timeRangeMs(time)).toISOString()
    }
    return new Date(runMonitorUtils.calendarDaysStart({
        days: calendarDays,
        now: now.getTime(),
        timezone: runMonitorUtils.safeTimezone(query.timezone),
    })).toISOString()
}

const CALENDAR_DAYS: Partial<Record<RunLogTimeRange, number>> = {
    [RunLogTimeRange.DAYS_3]: 3,
    [RunLogTimeRange.DAYS_7]: 7,
    [RunLogTimeRange.DAYS_15]: 15,
    [RunLogTimeRange.DAYS_30]: 30,
}

type ExactMatches = {
    content: string[]
    businessKey: string[]
}

type BuildParams = {
    query: ListRunLogsRequestQuery
    projects: RunLogAccessProject[]
    now: Date
    exactMatches?: ExactMatches
}
