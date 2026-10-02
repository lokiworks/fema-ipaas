import { isNil, ProjectId, UserId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import {
    ConnectionStatus,
    IssueActivityType,
    IssueKind,
    IssueReplayResult,
    issueUtils,
    ReplayCategory,
    ReplayCheckResult,
    WorkflowRetryStrategy,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { In } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { mappingTableService } from '../mapping-table/mapping-table.service'
import { executionRepo, executionService } from '../workflows/execution/execution-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { ChainVerdict, issueReplayUtils, ReplayConnectionState } from './issue-replay-utils'
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
        const mappingUpdatedAt = await mappingTableService(log).lastUpdatedByWorkflow({ projectId })
        const connectionState = issue.kind === IssueKind.CONNECTION && !isNil(issue.connectionExternalId)
            ? await readConnectionState({ externalId: issue.connectionExternalId, projectId })
            : ReplayConnectionState.NOT_APPLICABLE
        const roots = [...new Set(executions.map((execution) => execution.rerunOfExecutionId ?? execution.id))]
        const chain = roots.length === 0 ? [] : await executionRepo().find({
            where: { rerunOfExecutionId: In(roots), projectId },
            select: ['id', 'status', 'rerunOfExecutionId'],
        })
        const verdicts = issueReplayUtils.chainVerdicts({ candidates: executions, chain })
        const items = executions.map((execution) => issueReplayUtils.classify({
            execution,
            verdict: verdicts.get(execution.id) ?? ChainVerdict.TARGET,
            workflowExists: workflowUpdatedAt.has(execution.workflowId),
            workflowChangedAfterFailure: dayjsUtil(workflowUpdatedAt.get(execution.workflowId)).isAfter(execution.finishTime ?? execution.created),
            mappingTableChangedAfterFailure: isAfterFailure({ changedAt: mappingUpdatedAt.get(execution.workflowId), execution }),
            connectionState,
            connectionExternalId: issue.connectionExternalId ?? null,
            transient: issueUtils.isTransientHttpStatus(issue.errorCode),
            authorization: issueUtils.isAuthorizationHttpStatus(issue.errorCode),
            rejectedByTarget: issueUtils.isRejectedByTargetHttpStatus(issue.errorCode),
        }))
        return { items }
    },

    async connectionHealthy({ externalId, projectId }: { externalId: string, projectId: ProjectId }): Promise<boolean> {
        return (await readConnectionState({ externalId, projectId })) === ReplayConnectionState.HEALTHY
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

async function readConnectionState({ externalId, projectId }: { externalId: string, projectId: ProjectId }): Promise<ReplayConnectionState> {
    const connections = await connectionsRepo().find({ where: { externalId }, select: ['id', 'status', 'projectIds'] })
    const connection = connections.find((candidate) => candidate.projectIds.includes(projectId))
    if (isNil(connection)) {
        return ReplayConnectionState.MISSING
    }
    return connection.status === ConnectionStatus.ACTIVE ? ReplayConnectionState.HEALTHY : ReplayConnectionState.BROKEN
}

function isAfterFailure({ changedAt, execution }: { changedAt: string | undefined, execution: { finishTime?: string | null, created: string } }): boolean {
    return !isNil(changedAt) && dayjsUtil(changedAt).isAfter(execution.finishTime ?? execution.created)
}

const MAX_REPLAY_CANDIDATES = 500
const REPLAY_CONCURRENCY = 3

type IssueRef = {
    id: string
    projectId: ProjectId
}

type ReplayParams = IssueRef & {
    strategy: WorkflowRetryStrategy
    includeDataProblems: boolean
    actorId: UserId
}
