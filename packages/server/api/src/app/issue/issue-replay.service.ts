import { isNil, ProjectId, UserId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import {
    ConnectionStatus,
    Execution,
    ExecutionStatus,
    IssueActivityType,
    IssueKind,
    IssueReplayResult,
    issueUtils,
    ReplayCategory,
    ReplayCheckItem,
    ReplayCheckResult,
    ReplayReason,
    WorkflowRetryStrategy,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { In } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { executionRepo, executionService } from '../workflows/execution/execution-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { issueService } from './issue.service'

export const issueReplayService = (log: FastifyBaseLogger) => ({
    async check({ id, projectId }: IssueRef): Promise<ReplayCheckResult> {
        const issue = await issueService(log).getOneOrThrow({ id, projectId })
        const executions = await executionRepo().find({
            where: { issueId: id, projectId },
            order: { created: 'DESC' },
            take: MAX_REPLAY_CANDIDATES,
        })
        const workflows = await workflowRepo().find({
            where: { id: In([...new Set(executions.map((execution) => execution.workflowId))]), projectId },
            select: ['id', 'updated'],
        })
        const workflowUpdatedAt = new Map(workflows.map((workflow) => [workflow.id, workflow.updated]))
        const connectionState = issue.kind === IssueKind.CONNECTION && !isNil(issue.connectionExternalId)
            ? await readConnectionState({ externalId: issue.connectionExternalId, projectId })
            : ConnectionState.NOT_APPLICABLE
        const items = executions.map((execution) => classify({
            execution,
            workflowUpdatedAt: workflowUpdatedAt.get(execution.workflowId),
            connectionState,
            connectionExternalId: issue.connectionExternalId ?? null,
            transient: issueUtils.isTransientHttpStatus(issue.errorCode),
        }))
        return { items }
    },

    async connectionHealthy({ externalId, projectId }: { externalId: string, projectId: ProjectId }): Promise<boolean> {
        return (await readConnectionState({ externalId, projectId })) === ConnectionState.HEALTHY
    },

    async replay({ id, projectId, strategy, includeDataProblems, actorId }: ReplayParams): Promise<IssueReplayResult> {
        const { items } = await this.check({ id, projectId })
        const selected = items
            .filter((item) => item.category === ReplayCategory.REPLAYABLE || (includeDataProblems && item.category === ReplayCategory.DATA_PROBLEM))
            .filter((item) => strategy !== WorkflowRetryStrategy.FROM_FAILED_STEP || !item.rawDataExpired)
        const limit = pLimit(REPLAY_CONCURRENCY)
        const results = await Promise.allSettled(selected.map((item) => limit(() => executionService(log).retry({
            executionId: item.executionId,
            strategy,
            projectId,
        }))))
        const queued = results.filter((result) => result.status === 'fulfilled').length
        await issueService(log).recordActivity({
            issue: { id, projectId },
            type: IssueActivityType.REPLAYED,
            actorId,
            data: { strategy, queued, skipped: items.length - queued },
        })
        return { queued, skipped: items.length - queued }
    },
})

function classify({ execution, workflowUpdatedAt, connectionState, connectionExternalId, transient }: ClassifyParams): ReplayCheckItem {
    const item = (category: ReplayCategory, reason: ReplayReason): ReplayCheckItem => ({
        executionId: execution.id,
        category,
        reason,
        connectionExternalId,
        rawDataExpired: isNil(execution.logsFileId) && !isNil(execution.displayLogsFileId),
    })
    if (isNil(workflowUpdatedAt)) {
        return item(ReplayCategory.NOT_NEEDED, ReplayReason.WORKFLOW_DELETED)
    }
    if (!FAILED_STATUSES.includes(execution.status)) {
        return item(ReplayCategory.NOT_NEEDED, ReplayReason.ALREADY_RETRIED)
    }
    switch (connectionState) {
        case ConnectionState.MISSING:
            return item(ReplayCategory.BLOCKED, ReplayReason.CONNECTION_DELETED)
        case ConnectionState.BROKEN:
            return item(ReplayCategory.BLOCKED, ReplayReason.CONNECTION_STILL_BROKEN)
        case ConnectionState.HEALTHY:
            return item(ReplayCategory.REPLAYABLE, ReplayReason.CONNECTION_RECOVERED)
        case ConnectionState.NOT_APPLICABLE:
            break
    }
    if (transient) {
        return item(ReplayCategory.REPLAYABLE, ReplayReason.TRANSIENT_ERROR)
    }
    const failedAt = execution.finishTime ?? execution.created
    if (dayjsUtil(workflowUpdatedAt).isAfter(failedAt)) {
        return item(ReplayCategory.REPLAYABLE, ReplayReason.WORKFLOW_CHANGED)
    }
    return item(ReplayCategory.DATA_PROBLEM, ReplayReason.UNCHANGED_SINCE_FAILURE)
}

async function readConnectionState({ externalId, projectId }: { externalId: string, projectId: ProjectId }): Promise<ConnectionState> {
    const connections = await connectionsRepo().find({ where: { externalId }, select: ['id', 'status', 'projectIds'] })
    const connection = connections.find((candidate) => candidate.projectIds.includes(projectId))
    if (isNil(connection)) {
        return ConnectionState.MISSING
    }
    return connection.status === ConnectionStatus.ACTIVE ? ConnectionState.HEALTHY : ConnectionState.BROKEN
}

enum ConnectionState {
    NOT_APPLICABLE = 'NOT_APPLICABLE',
    MISSING = 'MISSING',
    BROKEN = 'BROKEN',
    HEALTHY = 'HEALTHY',
}

const MAX_REPLAY_CANDIDATES = 500
const REPLAY_CONCURRENCY = 3
const FAILED_STATUSES: ExecutionStatus[] = [ExecutionStatus.FAILED, ExecutionStatus.TIMEOUT, ExecutionStatus.INTERNAL_ERROR, ExecutionStatus.MEMORY_LIMIT_EXCEEDED]

type IssueRef = {
    id: string
    projectId: ProjectId
}

type ReplayParams = IssueRef & {
    strategy: WorkflowRetryStrategy
    includeDataProblems: boolean
    actorId: UserId
}

type ClassifyParams = {
    execution: Execution
    workflowUpdatedAt: string | undefined
    connectionState: ConnectionState
    connectionExternalId: string | null
    transient: boolean
}
