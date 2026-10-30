import { ApplicationError, ErrorCode, isNil, ProjectId, UserId } from '@fema-ipaas/core-utils'
import { dayjsUtil } from '@fema-ipaas/server-utils'
import {
    ConnectionStatus,
    errorHandlingUtils,
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
    retrySafety,
    WorkflowActionType,
    WorkflowRetryStrategy,
    workflowStructureUtil,
    WorkflowVersionState,
} from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import pLimit from 'p-limit'
import { In } from 'typeorm'
import { connectionsRepo } from '../connection/connection-service/connection-service'
import { connectorMetadataService } from '../connectors/metadata/connector-metadata-service'
import { databaseConnection } from '../database/database-connection'
import { mappingTableService } from '../mapping-table/mapping-table.service'
import { privacyService } from '../privacy/privacy.service'
import { projectService } from '../project/project-service'
import { executionRepo, executionService } from '../workflows/execution/execution-service'
import { workflowRepo } from '../workflows/workflow/workflow.repo'
import { workflowVersionService } from '../workflows/workflow-version/workflow-version.service'
import { ChainVerdict, issueReplayUtils, ReplayConnectionState } from './issue-replay-utils'
import { issueRepo, issueService } from './issue.service'

export const issueReplayService = (log: FastifyBaseLogger) => ({
    async check({ id, projectId, strategy = WorkflowRetryStrategy.FROM_FAILED_STEP }: IssueRef & { strategy?: WorkflowRetryStrategy }): Promise<ReplayCheckResult> {
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
        const now = new Date()
        const versionNumbers = await versionNumbersOf({ versionIds: [...new Set(executions.map((execution) => execution.workflowVersionId))] })
        const classified = executions.map((execution) => issueReplayUtils.classify({
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
            blockedUntil: issueUtils.activeBlockedUntil({ message: execution.failedStep?.message, now }),
        }))
        const project = await projectService(log).getOneOrThrow(projectId)
        const tenantId = project.tenantId
        const retention = await privacyService(log).retentionFor({ tenantId, projectRetentionDays: project.executionDataRetentionDays })
        const limit = pLimit(REPLAY_CONCURRENCY)
        const items = await Promise.all(classified.map((item, index) => limit(async () => ({
            ...item,
            versionNumber: versionNumbers.get(item.workflowVersionId) ?? null,
            writeSteps: item.category === ReplayCategory.BLOCKED || item.category === ReplayCategory.NOT_NEEDED ? [] : await writeStepsFor({ execution: executions[index], strategy, projectId, tenantId, log }),
        }))))
        return {
            items,
            rawDataExpiredCount: items.filter((item) => item.reason === ReplayReason.RAW_DATA_EXPIRED).length,
            rawRetentionDays: retention.rawDays,
        }
    },

    async rawDataExpired({ id, projectId }: IssueRef): Promise<boolean> {
        const rows: RawDataStateRow[] = await databaseConnection().query(RAW_DATA_STATE_SQL, [id, projectId, REPLAYABLE_STATUSES])
        const available = Number(rows[0]?.available ?? 0)
        const expired = Number(rows[0]?.expired ?? 0)
        return available === 0 && expired > 0
    },

    async likelyToFailAgain({ executions }: { executions: Execution[] }): Promise<LikelyToFailAgain[]> {
        const candidates = executions.filter((execution) => !isNil(execution.issueId))
        if (candidates.length === 0) {
            return []
        }
        const projectIds = [...new Set(candidates.map((execution) => execution.projectId))]
        const [issues, workflows, mappingByProject] = await Promise.all([
            issueRepo().find({ where: { id: In([...new Set(candidates.map((execution) => execution.issueId ?? ''))]), projectId: In(projectIds) }, select: ['id', 'kind', 'errorCode', 'connectionExternalId'] }),
            workflowRepo().find({ where: { id: In([...new Set(candidates.map((execution) => execution.workflowId))]), projectId: In(projectIds) }, select: ['id', 'updated'] }),
            Promise.all(projectIds.map(async (projectId): Promise<[string, Map<string, string>]> => [projectId, await mappingTableService(log).lastUpdatedByWorkflow({ projectId })])),
        ])
        const issueById = new Map(issues.map((issue) => [issue.id, issue]))
        const workflowUpdatedAt = new Map(workflows.map((workflow) => [workflow.id, workflow.updated]))
        const mappingUpdatedAt = new Map(mappingByProject)
        const now = new Date()
        return candidates.flatMap((execution): LikelyToFailAgain[] => {
            const issue = issueById.get(execution.issueId ?? '')
            if (isNil(issue) || issue.kind === IssueKind.CONNECTION || !workflowUpdatedAt.has(execution.workflowId)) {
                return []
            }
            const classified = issueReplayUtils.classify({
                execution,
                verdict: ChainVerdict.TARGET,
                workflowExists: true,
                workflowChangedAfterFailure: dayjsUtil(workflowUpdatedAt.get(execution.workflowId)).isAfter(execution.finishTime ?? execution.created),
                mappingTableChangedAfterFailure: isAfterFailure({ changedAt: mappingUpdatedAt.get(execution.projectId)?.get(execution.workflowId), execution }),
                connectionState: ReplayConnectionState.NOT_APPLICABLE,
                connectionExternalId: null,
                transient: issueUtils.isTransientHttpStatus(issue.errorCode),
                authorization: issueUtils.isAuthorizationHttpStatus(issue.errorCode),
                rejectedByTarget: issueUtils.isRejectedByTargetHttpStatus(issue.errorCode),
                blockedUntil: issueUtils.activeBlockedUntil({ message: execution.failedStep?.message, now }),
            })
            return classified.category === ReplayCategory.DATA_PROBLEM ? [{ executionId: execution.id, reason: classified.reason }] : []
        })
    },

    async connectionHealth({ externalId, projectId }: { externalId: string, projectId: ProjectId }): Promise<{ healthy: boolean, missing: boolean }> {
        const state = await readConnectionState({ externalId, projectId })
        return { healthy: state === ReplayConnectionState.HEALTHY, missing: state === ReplayConnectionState.MISSING }
    },

    async replay({ id, projectId, strategy, includeDataProblems, confirmedUnsafeSteps = [], actorId }: ReplayParams): Promise<IssueReplayResult> {
        const { items } = await this.check({ id, projectId, strategy })
        const selected = items
            .filter((item) => item.category === ReplayCategory.REPLAYABLE || (includeDataProblems && item.category === ReplayCategory.DATA_PROBLEM))
            .filter((item) => !item.rawDataExpired)
        const missingConfirmations = selected.flatMap((item) => item.writeSteps.filter((step) => step.needsConfirmation && !confirmedUnsafeSteps.includes(`${item.executionId}:${step.stepName}`)))
        if (missingConfirmations.length > 0) {
            throw new ApplicationError({ code: ErrorCode.UNSAFE_REPLAY_NOT_CONFIRMED, params: { message: 'issues.replay.unsafeStepsNotConfirmed' } })
        }
        const limit = pLimit(REPLAY_CONCURRENCY)
        const results = await Promise.allSettled(selected.map((item) => limit(() => executionService(log).retry({
            executionId: item.executionId,
            strategy,
            projectId,
        }))))
        const queued = results.filter((result) => result.status === 'fulfilled').length
        if (issueReplayUtils.replayActivityShouldBeRecorded({ queued })) {
            await issueService(log).recordActivity({
                issue: { id, projectId },
                type: IssueActivityType.REPLAYED,
                actorId,
                data: { strategy, queued, skipped: items.length - queued },
            })
        }
        return { queued, skipped: items.length - queued }
    },
})

async function writeStepsFor({ execution, strategy, projectId, tenantId, log }: { execution: Execution, strategy: WorkflowRetryStrategy, projectId: string, tenantId: string, log: FastifyBaseLogger }): Promise<ReplayCheckItem['writeSteps']> {
    const workflow = await workflowRepo().findOneBy({ id: execution.workflowId, projectId })
    if (isNil(workflow)) {
        return []
    }
    const version = strategy === WorkflowRetryStrategy.ON_LATEST_VERSION
        ? await workflowVersionService(log).getLatestLockedVersionOrThrow(workflow.id)
        : await workflowVersionService(log).getOneOrThrow(execution.workflowVersionId)
    const steps = workflowStructureUtil.getAllSteps(version.trigger)
    const failedIndex = steps.findIndex((step) => step.name === execution.failedStep?.name)
    const writes = await Promise.all(steps.map(async (step, index): Promise<ReplayCheckItem['writeSteps']> => {
        if (step.type !== WorkflowActionType.CONNECTOR) {
            return []
        }
        const metadata = await connectorMetadataService(log).get({ name: step.settings.connectorName, version: step.settings.connectorVersion, tenantId, projectId })
        const action = metadata?.actions[step.settings.actionName ?? '']
        const isHttp = step.settings.connectorName === '@fema-ipaas/connector-http'
        const method = typeof step.settings.input['method'] === 'string' ? step.settings.input['method'].toUpperCase() : ''
        const literalKey = typeof step.settings.input['idempotencyKey'] === 'string' ? step.settings.input['idempotencyKey'].trim() : ''
        const safeHttp = isHttp && (['PUT', 'DELETE'].includes(method) || literalKey.length > 0 && !literalKey.includes('{{'))
        if (action?.classification === 'READ' || action?.classification === 'SEARCH' || isHttp && ['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            return []
        }
        const writeSafety = safeHttp ? 'IDEMPOTENT' : action?.reliability?.writeSafety ?? 'UNSAFE'
        const willRun = !step.skip && (strategy === WorkflowRetryStrategy.ON_LATEST_VERSION || failedIndex < 0 || index >= failedIndex)
        const decision = retrySafety.decide({
            classification: action?.classification,
            writeSafety,
            dedupeWindowSeconds: action?.reliability?.dedupeWindowSeconds,
            firstAttemptAt: new Date(execution.startTime ?? execution.created).getTime(),
            now: Date.now(),
            errorCode: index === failedIndex ? errorHandlingUtils.classifyErrorMessage({ message: execution.failedStep?.message }).errorCode : undefined,
            message: index === failedIndex ? execution.failedStep?.message : undefined,
        })
        return [{ stepName: step.name, displayName: step.displayName, writeSafety, willRun, needsConfirmation: willRun && !decision.allowed }]
    }))
    return writes.flat()
}

async function readConnectionState({ externalId, projectId }: { externalId: string, projectId: ProjectId }): Promise<ReplayConnectionState> {
    const connections = await connectionsRepo().find({ where: { externalId }, select: ['id', 'status', 'projectIds'] })
    const connection = connections.find((candidate) => candidate.projectIds.includes(projectId))
    if (isNil(connection)) {
        return ReplayConnectionState.MISSING
    }
    return connection.status === ConnectionStatus.ACTIVE ? ReplayConnectionState.HEALTHY : ReplayConnectionState.BROKEN
}

async function versionNumbersOf({ versionIds }: { versionIds: string[] }): Promise<Map<string, number>> {
    if (versionIds.length === 0) {
        return new Map()
    }
    const rows: VersionNumberRow[] = await databaseConnection().query(VERSION_NUMBERS_SQL, [versionIds, WorkflowVersionState.LOCKED])
    return new Map(rows.filter((row) => !isNil(row.number)).map((row) => [row.id, Number(row.number)]))
}

function isAfterFailure({ changedAt, execution }: { changedAt: string | undefined, execution: { finishTime?: string | null, created: string } }): boolean {
    return !isNil(changedAt) && dayjsUtil(changedAt).isAfter(execution.finishTime ?? execution.created)
}

const VERSION_NUMBERS_SQL = `SELECT v.id AS id,
    CASE WHEN v.state = $2 THEN (
        SELECT COUNT(*) FROM workflow_version v2 WHERE v2."workflowId" = v."workflowId" AND v2.state = $2 AND v2.created <= v.created
    )::int ELSE NULL END AS "number"
FROM workflow_version v
WHERE v.id = ANY($1)`
const RAW_DATA_STATE_SQL = `SELECT
    COUNT(*) FILTER (WHERE "logsFileId" IS NOT NULL) AS available,
    COUNT(*) FILTER (WHERE "logsFileId" IS NULL AND "displayLogsFileId" IS NOT NULL) AS expired
FROM execution
WHERE "issueId" = $1 AND "projectId" = $2 AND status = ANY($3)`
const REPLAYABLE_STATUSES: ExecutionStatus[] = [ExecutionStatus.FAILED, ExecutionStatus.TIMEOUT, ExecutionStatus.INTERNAL_ERROR, ExecutionStatus.MEMORY_LIMIT_EXCEEDED]
const MAX_REPLAY_CANDIDATES = 500
const REPLAY_CONCURRENCY = 3

type RawDataStateRow = {
    available: string | number
    expired: string | number
}

type VersionNumberRow = {
    id: string
    number: number | null
}

type LikelyToFailAgain = {
    executionId: string
    reason: ReplayReason
}

type IssueRef = {
    id: string
    projectId: ProjectId
}

type ReplayParams = IssueRef & {
    strategy: WorkflowRetryStrategy
    includeDataProblems: boolean
    confirmedUnsafeSteps?: string[]
    actorId: UserId
}
