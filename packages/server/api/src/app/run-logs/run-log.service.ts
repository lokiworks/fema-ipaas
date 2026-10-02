import { ApplicationError, ErrorCode, isNil, SeekPage, unique } from '@fema-ipaas/core-utils'
import {
    ApplicationEventName,
    errorHandlingUtils,
    Execution,
    ExecutionStatus,
    ListRunLogsRequestQuery,
    RerunRunLogResult,
    RerunRunLogsResponse,
    RunEnvironment,
    RunLogConnectionSummary,
    RunLogDetail,
    RunLogRow,
    RunLogScope,
    RunLogType,
    RunRerunBlockReason,
    runRerunUtils,
    WorkflowRetryStrategy,
    WorkflowStatus,
    WorkflowVersionState,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { In } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { databaseConnection } from '../database/database-connection'
import { applicationEvents, MetaInformation } from '../helper/application-events'
import { buildPaginator } from '../helper/pagination/build-paginator'
import { paginationHelper } from '../helper/pagination/pagination-utils'
import { Order } from '../helper/pagination/paginator'
import { issueRepo } from '../issue/issue.service'
import { projectStatsUtils } from '../project-workspace/project-stats-utils'
import { dedupedEventRepo } from '../trigger/deduped-event/deduped-event.service'
import { ExecutionEntity } from '../workflows/execution/execution-entity'
import { executionRepo, executionService } from '../workflows/execution/execution-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { RunLogAccess, runLogAccess, RunLogAccessProject } from './run-log-access'
import { runLogQuery } from './run-log-query'

export const runLogService = (log: FastifyBaseLogger) => ({
    async list({ userId, tenantId, query }: ListParams): Promise<SeekPage<RunLogRow>> {
        const access = await runLogAccess(log).resolve({ userId, tenantId })
        const builder = runLogQuery.build({ query, projects: access.projects, now: new Date() })
        if (isNil(builder)) {
            return paginationHelper.createPage<RunLogRow>([], null)
        }
        const decodedCursor = paginationHelper.decodeCursor(query.cursor ?? null)
        const paginator = buildPaginator<Execution>({
            entity: ExecutionEntity,
            query: {
                limit: query.limit ?? DEFAULT_LIMIT,
                orderBy: [
                    { field: 'created', order: Order.DESC },
                    { field: 'id', order: Order.DESC },
                ],
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const { data, cursor } = await paginator.paginate(builder)
        const rows = await enrich({ executions: data, access })
        return paginationHelper.createPage<RunLogRow>(rows, cursor)
    },

    async scope({ userId, tenantId }: UserRef): Promise<RunLogScope> {
        const access = await runLogAccess(log).resolve({ userId, tenantId })
        const projectIds = access.projects.map((project) => project.id)
        if (projectIds.length === 0) {
            return { projects: [], workflows: [], connectors: [], tenantRetentionDays: access.tenantRetentionDays, canManagePrivacy: access.isTenantAdmin }
        }
        const [workflowRows, connectorRows]: [ScopeWorkflowRow[], ConnectorRow[]] = await Promise.all([
            databaseConnection().query(SCOPE_WORKFLOWS_SQL, [projectIds]),
            databaseConnection().query(SCOPE_CONNECTORS_SQL, [projectIds]),
        ])
        return {
            projects: access.projects,
            workflows: workflowRows.map((row) => ({ id: row.id, projectId: row.projectId, displayName: row.displayName ?? row.id })),
            connectors: connectorRows.map((row) => row.connectorName).sort(),
            tenantRetentionDays: access.tenantRetentionDays,
            canManagePrivacy: access.isTenantAdmin,
        }
    },

    async detail({ id, projectId, userId, tenantId }: DetailParams): Promise<RunLogDetail> {
        const access = await runLogAccess(log).resolve({ userId, tenantId })
        const execution = await executionRepo().findOneBy({ id, projectId })
        if (isNil(execution) || !access.projects.some((project) => project.id === projectId)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityType: 'execution', entityId: id, message: 'Workflow run not found' },
            })
        }
        const [row] = await enrich({ executions: [execution], access })
        const root = execution.rerunOfExecutionId ?? execution.id
        const [issue, dedupe, reruns, cancellableChildRuns, connection] = await Promise.all([
            isNil(execution.issueId) ? Promise.resolve(null) : issueRepo().findOneBy({ id: execution.issueId, projectId }),
            dedupedEventRepo().findOne({ where: { firstExecutionId: execution.id, projectId }, order: { created: 'DESC' } }),
            executionRepo().find({
                where: { rerunOfExecutionId: root, projectId },
                select: ['id', 'status', 'created'],
                order: { created: 'DESC' },
            }),
            executionService(log).countCancellableChildRuns({ executionId: execution.id }),
            connectionOf({ execution, tenantId }),
        ])
        const project = access.projects.find((candidate) => candidate.id === projectId)
        return {
            row,
            issue: isNil(issue) ? null : {
                id: issue.id,
                title: issue.title,
                errorCode: issue.errorCode,
                occurrences: issue.occurrences,
                assigneeId: issue.assigneeId,
            },
            connection,
            dedupeKey: dedupe?.keyPreview ?? null,
            reruns: reruns.map((rerun) => ({ id: rerun.id, status: rerun.status, created: isoOf(rerun.created) })),
            cancellableChildRuns,
            canTerminate: (project?.canRerun ?? false)
                && execution.environment === RunEnvironment.PRODUCTION
                && TERMINABLE_STATUSES.includes(execution.status),
        }
    },

    async rerun({ userId, tenantId, executionIds, strategy, ip }: RerunParams): Promise<RerunRunLogsResponse> {
        const access = await runLogAccess(log).resolve({ userId, tenantId })
        const projectIds = access.projects.map((project) => project.id)
        const executions = projectIds.length === 0
            ? []
            : await executionRepo().find({ where: { id: In(unique(executionIds)), projectId: In(projectIds) } })
        const rows = await enrich({ executions, access })
        const rowById = new Map(rows.map((row) => [row.id, row]))
        const plan = planReruns({ executionIds: unique(executionIds), rowById, strategy })
        const limit = pLimit(RERUN_CONCURRENCY)
        const results = await Promise.all(plan.map((item) => limit(async (): Promise<RerunRunLogResult> => {
            if (item.kind === 'skip') {
                return item.result
            }
            try {
                const rerun = await executionService(log).retry({ executionId: item.row.id, strategy, projectId: item.row.projectId })
                return { executionId: item.row.id, rerunExecutionId: rerun.id, blockReason: null, error: null }
            }
            catch (error) {
                const message = error instanceof ApplicationError ? error.message : 'Internal server error'
                log.warn({ execution: { id: item.row.id }, error }, '[runLogService#rerun] Rerun failed')
                return { executionId: item.row.id, rerunExecutionId: null, blockReason: null, error: message }
            }
        })))
        auditReruns({ results, rowById, strategy, meta: { tenantId, userId, ip }, log })
        return { results }
    },

    async terminate({ id, projectId, tenantId, stopChildRuns }: TerminateParams): Promise<void> {
        const execution = await executionRepo().findOneBy({ id, projectId })
        if (isNil(execution) || execution.environment !== RunEnvironment.PRODUCTION || !TERMINABLE_STATUSES.includes(execution.status)) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: { message: 'Only queued or waiting production runs can be terminated' },
            })
        }
        await executionService(log).cancel({
            projectId,
            tenantId,
            executionIds: [id],
            status: TERMINABLE_STATUSES,
            includeChildRuns: stopChildRuns,
        })
    },
})

async function enrich({ executions, access }: { executions: Execution[], access: RunLogAccess }): Promise<RunLogRow[]> {
    if (executions.length === 0) {
        return []
    }
    const workflowIds = unique(executions.map((execution) => execution.workflowId))
    const versionIds = unique(executions.map((execution) => execution.workflowVersionId))
    const roots = unique(executions.map((execution) => execution.rerunOfExecutionId ?? execution.id))
    const projectIds = access.projects.map((project) => project.id)
    const [workflows, workflowNames, versions, chain]: [WorkflowRow[], WorkflowNameRow[], VersionRow[], ChainRow[]] = await Promise.all([
        workflowRepo().find({ where: { id: In(workflowIds) }, select: ['id', 'status', 'publishedVersionId'] }),
        databaseConnection().query(WORKFLOW_NAMES_SQL, [workflowIds]),
        databaseConnection().query(VERSION_NUMBERS_SQL, [versionIds, WorkflowVersionState.LOCKED]),
        executionRepo().createQueryBuilder('execution')
            .select(['execution.id', 'execution.status', 'execution.rerunOfExecutionId', 'execution.inPlaceRetryCount', 'execution.created'])
            .where('(execution.id IN (:...roots) OR execution."rerunOfExecutionId" IN (:...roots))', { roots })
            .andWhere('execution."projectId" IN (:...projectIds)', { projectIds: projectIds.length === 0 ? [''] : projectIds })
            .getMany(),
    ])
    const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]))
    const nameByWorkflow = new Map(workflowNames.map((row) => [row.workflowId, row.displayName]))
    const versionById = new Map(versions.map((row) => [row.id, row]))
    const projectById = new Map(access.projects.map((project) => [project.id, project]))
    return executions.map((execution) => toRow({
        execution,
        workflow: workflowById.get(execution.workflowId),
        workflowName: nameByWorkflow.get(execution.workflowId) ?? versionById.get(execution.workflowVersionId)?.displayName ?? null,
        version: versionById.get(execution.workflowVersionId),
        project: projectById.get(execution.projectId),
        chain,
    }))
}

function toRow({ execution, workflow, workflowName, version, project, chain }: ToRowParams): RunLogRow {
    const root = execution.rerunOfExecutionId ?? execution.id
    const isRoot = root === execution.id
    const others = chain.filter((member) => member.id !== execution.id && (member.id === root || member.rerunOfExecutionId === root))
    const chainRerunStatuses = others
        .filter((member) => !isNil(member.rerunOfExecutionId) || (member.inPlaceRetryCount ?? 0) > 0)
        .map((member) => member.status)
    const rerunsOfRoot = chain
        .filter((member) => member.rerunOfExecutionId === root)
        .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime())
    const inPlaceRetryCount = execution.inPlaceRetryCount ?? 0
    const runBlockReason = runRerunUtils.blockReason({
        environment: execution.environment,
        deduped: false,
        workflowExists: !isNil(workflow),
        parentRunId: execution.parentRunId,
        status: execution.status,
        inPlaceRetryCount,
        chainRerunStatuses,
        canWrite: project?.canRerun ?? false,
        workflowPublished: !isNil(workflow?.publishedVersionId),
        workflowEnabled: workflow?.status === WorkflowStatus.ENABLED,
    })
    const debug = execution.environment === RunEnvironment.TESTING
    return {
        id: execution.id,
        created: isoOf(execution.created),
        startTime: isNil(execution.startTime) ? null : isoOf(execution.startTime),
        finishTime: isNil(execution.finishTime) ? null : isoOf(execution.finishTime),
        projectId: execution.projectId,
        projectDisplayName: project?.displayName ?? '',
        workflowId: execution.workflowId,
        workflowDisplayName: workflowName,
        workflowExists: !isNil(workflow),
        workflowVersionId: execution.workflowVersionId,
        versionNumber: debug || isNil(version?.number) ? null : Number(version.number),
        environment: execution.environment,
        type: debug ? RunLogType.DEBUG : RunLogType.RUN,
        status: execution.status,
        durationMs: durationOf(execution),
        errorCount: projectStatsUtils.FAILED_STATUSES.includes(execution.status) ? 1 : 0,
        failedStep: execution.failedStep,
        parentRunId: execution.parentRunId ?? null,
        triggeredBy: execution.triggeredBy ?? null,
        issueId: execution.issueId ?? null,
        rerunOfExecutionId: execution.rerunOfExecutionId ?? null,
        businessKey: execution.businessKey ?? null,
        inPlaceRetryCount,
        rerunCount: (isRoot ? rerunsOfRoot.length : 0) + inPlaceRetryCount,
        latestRerunId: isRoot ? rerunsOfRoot[0]?.id ?? null : null,
        rerunBlockReason: runBlockReason,
        fromFailedStepBlockReason: runRerunUtils.fromFailedStepBlockReason({
            runBlockReason,
            hasFailedStep: !isNil(execution.failedStep),
            rawDataAvailable: !(isNil(execution.logsFileId) && !isNil(execution.displayLogsFileId)),
        }),
    }
}

function planReruns({ executionIds, rowById, strategy }: PlanParams): RerunPlanItem[] {
    return executionIds.reduce<{ items: RerunPlanItem[], roots: string[] }>((acc, executionId) => {
        const row = rowById.get(executionId)
        if (isNil(row)) {
            return { ...acc, items: [...acc.items, skip({ executionId, blockReason: null, error: 'Workflow run not found' })] }
        }
        const blockReason = strategy === WorkflowRetryStrategy.FROM_FAILED_STEP ? row.fromFailedStepBlockReason : row.rerunBlockReason
        if (!isNil(blockReason)) {
            return { ...acc, items: [...acc.items, skip({ executionId, blockReason, error: null })] }
        }
        const root = row.rerunOfExecutionId ?? row.id
        if (acc.roots.includes(root)) {
            return { ...acc, items: [...acc.items, skip({ executionId, blockReason: RunRerunBlockReason.RERUN_IN_PROGRESS, error: null })] }
        }
        return { items: [...acc.items, { kind: 'run', row }], roots: [...acc.roots, root] }
    }, { items: [], roots: [] }).items
}

function skip({ executionId, blockReason, error }: { executionId: string, blockReason: RunRerunBlockReason | null, error: string | null }): RerunPlanItem {
    return { kind: 'skip', result: { executionId, rerunExecutionId: null, blockReason, error } }
}

function auditReruns({ results, rowById, strategy, meta, log }: AuditParams): void {
    const succeeded = results.filter((result) => !isNil(result.rerunExecutionId))
    const byProject = succeeded.reduce((acc, result) => {
        const projectId = rowById.get(result.executionId)?.projectId
        if (isNil(projectId)) {
            return acc
        }
        return new Map(acc).set(projectId, [...(acc.get(projectId) ?? []), result.executionId])
    }, new Map<string, string[]>())
    byProject.forEach((ids, projectId) => {
        applicationEvents(log).sendUserEvent({ ...meta, projectId }, {
            action: ApplicationEventName.RUNS_RERUN,
            data: { strategy, count: ids.length, executionIds: ids },
        })
    })
}

async function connectionOf({ execution, tenantId }: { execution: Execution, tenantId: string }): Promise<RunLogConnectionSummary | null> {
    if (isNil(execution.failedStep?.message)) {
        return null
    }
    const { connectionExternalId } = errorHandlingUtils.classifyErrorMessage({
        message: execution.failedStep.message,
        timedOut: execution.status === ExecutionStatus.TIMEOUT,
    })
    if (isNil(connectionExternalId)) {
        return null
    }
    const candidates = await connectionsRepo().find({
        where: { externalId: connectionExternalId, tenantId },
        select: ['id', 'displayName', 'status', 'projectIds'],
    })
    const connection = candidates.find((candidate) => candidate.projectIds.includes(execution.projectId))
    return {
        externalId: connectionExternalId,
        displayName: connection?.displayName ?? null,
        status: connection?.status ?? null,
    }
}

function isoOf(value: string): string {
    return new Date(value).toISOString()
}

function durationOf(execution: Execution): number | null {
    if (isNil(execution.startTime) || isNil(execution.finishTime)) {
        return null
    }
    return Math.max(0, new Date(execution.finishTime).getTime() - new Date(execution.startTime).getTime())
}

const DEFAULT_LIMIT = 10
const RERUN_CONCURRENCY = 3
const TERMINABLE_STATUSES: ExecutionStatus[] = [ExecutionStatus.PAUSED, ExecutionStatus.QUEUED]

const WORKFLOW_NAMES_SQL = `SELECT DISTINCT ON (v."workflowId") v."workflowId" AS "workflowId", v."displayName" AS "displayName"
FROM workflow_version v
WHERE v."workflowId" = ANY($1)
ORDER BY v."workflowId", v.created DESC`

const VERSION_NUMBERS_SQL = `SELECT v.id AS id, v."displayName" AS "displayName",
    CASE WHEN v.state = $2 THEN (
        SELECT COUNT(*) FROM workflow_version v2 WHERE v2."workflowId" = v."workflowId" AND v2.state = $2 AND v2.created <= v.created
    )::int ELSE NULL END AS "number"
FROM workflow_version v
WHERE v.id = ANY($1)`

const SCOPE_WORKFLOWS_SQL = `SELECT DISTINCT ON (w.id) w.id AS id, w."projectId" AS "projectId", v."displayName" AS "displayName"
FROM workflow w
JOIN workflow_version v ON v."workflowId" = w.id
WHERE w."projectId" = ANY($1)
ORDER BY w.id, v.created DESC`

const SCOPE_CONNECTORS_SQL = `SELECT DISTINCT names.name AS "connectorName"
FROM workflow w
JOIN LATERAL (
    SELECT v."trigger" FROM workflow_version v WHERE v."workflowId" = w.id ORDER BY v.created DESC LIMIT 1
) latest ON true
CROSS JOIN LATERAL (SELECT value #>> '{}' AS name FROM jsonb_path_query(latest."trigger", 'lax $.**.connectorName') AS value) names
WHERE w."projectId" = ANY($1) AND names.name IS NOT NULL`

type UserRef = {
    userId: string
    tenantId: string
}

type ListParams = UserRef & {
    query: ListRunLogsRequestQuery
}

type DetailParams = UserRef & {
    id: string
    projectId: string
}

type RerunParams = UserRef & {
    executionIds: string[]
    strategy: WorkflowRetryStrategy
    ip: string | undefined
}

type TerminateParams = {
    id: string
    projectId: string
    tenantId: string
    stopChildRuns: boolean
}

type WorkflowRow = {
    id: string
    status: WorkflowStatus
    publishedVersionId?: string | null
}

type WorkflowNameRow = {
    workflowId: string
    displayName: string | null
}

type VersionRow = {
    id: string
    displayName: string | null
    number: number | string | null
}

type ChainRow = Pick<Execution, 'id' | 'status' | 'rerunOfExecutionId' | 'inPlaceRetryCount' | 'created'>

type ScopeWorkflowRow = {
    id: string
    projectId: string
    displayName: string | null
}

type ConnectorRow = {
    connectorName: string
}

type ToRowParams = {
    execution: Execution
    workflow: WorkflowRow | undefined
    workflowName: string | null
    version: VersionRow | undefined
    project: RunLogAccessProject | undefined
    chain: ChainRow[]
}

type RerunPlanItem =
    | { kind: 'skip', result: RerunRunLogResult }
    | { kind: 'run', row: RunLogRow }

type PlanParams = {
    executionIds: string[]
    rowById: Map<string, RunLogRow>
    strategy: WorkflowRetryStrategy
}

type AuditParams = {
    results: RerunRunLogResult[]
    rowById: Map<string, RunLogRow>
    strategy: WorkflowRetryStrategy
    meta: Omit<MetaInformation, 'projectId'>
    log: FastifyBaseLogger
}
