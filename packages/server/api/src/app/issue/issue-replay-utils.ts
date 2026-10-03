import { isNil } from '@fema-ipaas/core-utils'
import { ExecutionStatus, ReplayCategory, ReplayReason } from '@fema-ipaas/shared'

export const issueReplayUtils = {
    chainVerdicts,
    classify,
}

function chainVerdicts({ candidates, chain }: ChainVerdictsParams): Map<string, ChainVerdict> {
    const rootOf = (candidate: ChainCandidate): string => candidate.rerunOfExecutionId ?? candidate.id
    const byRoot = candidates.reduce((acc, candidate) => {
        const root = rootOf(candidate)
        return acc.set(root, [...(acc.get(root) ?? []), candidate])
    }, new Map<string, ChainCandidate[]>())
    const verdicts = new Map<string, ChainVerdict>()
    byRoot.forEach((members, root) => {
        const reruns = chain.filter((member) => member.rerunOfExecutionId === root)
        const retried = reruns.some((member) => member.status === ExecutionStatus.SUCCEEDED || IN_FLIGHT_STATUSES.includes(member.status))
        const latest = members.reduce((best, member) => (member.created > best.created ? member : best), members[0])
        members.forEach((member) => {
            verdicts.set(member.id, retried ? ChainVerdict.RETRIED : member.id === latest.id ? ChainVerdict.TARGET : ChainVerdict.DUPLICATE)
        })
    })
    return verdicts
}

function classify({ execution, verdict, workflowExists, connectionState, connectionExternalId, transient, authorization, rejectedByTarget, workflowChangedAfterFailure, mappingTableChangedAfterFailure, blockedUntil = null }: ClassifyParams): ClassifiedReplay {
    const item = (category: ReplayCategory, reason: ReplayReason): ClassifiedReplay => ({
        executionId: execution.id,
        category,
        reason,
        connectionExternalId,
        rawDataExpired: isNil(execution.logsFileId) && !isNil(execution.displayLogsFileId),
        blockedUntil: reason === ReplayReason.BLOCKED_UNTIL ? blockedUntil?.toISOString() ?? null : null,
    })
    if (!workflowExists) {
        return item(ReplayCategory.NOT_NEEDED, ReplayReason.WORKFLOW_DELETED)
    }
    if (!FAILED_STATUSES.includes(execution.status) || verdict === ChainVerdict.RETRIED) {
        return item(ReplayCategory.NOT_NEEDED, ReplayReason.ALREADY_RETRIED)
    }
    if (verdict === ChainVerdict.DUPLICATE) {
        return item(ReplayCategory.NOT_NEEDED, ReplayReason.DUPLICATE_ATTEMPT)
    }
    switch (connectionState) {
        case ReplayConnectionState.MISSING:
            return item(ReplayCategory.BLOCKED, ReplayReason.CONNECTION_DELETED)
        case ReplayConnectionState.BROKEN:
            return item(ReplayCategory.BLOCKED, ReplayReason.CONNECTION_STILL_BROKEN)
        case ReplayConnectionState.HEALTHY:
            return item(ReplayCategory.REPLAYABLE, ReplayReason.CONNECTION_RECOVERED)
        case ReplayConnectionState.NOT_APPLICABLE:
            break
    }
    if (!isNil(blockedUntil)) {
        return item(ReplayCategory.BLOCKED, ReplayReason.BLOCKED_UNTIL)
    }
    if (transient) {
        return item(ReplayCategory.REPLAYABLE, ReplayReason.TRANSIENT_ERROR)
    }
    if (authorization) {
        return item(ReplayCategory.REPLAYABLE, ReplayReason.AUTHORIZATION_ERROR)
    }
    if (rejectedByTarget) {
        return item(ReplayCategory.DATA_PROBLEM, ReplayReason.REJECTED_BY_TARGET)
    }
    if (workflowChangedAfterFailure) {
        return item(ReplayCategory.REPLAYABLE, ReplayReason.WORKFLOW_CHANGED)
    }
    if (mappingTableChangedAfterFailure) {
        return item(ReplayCategory.REPLAYABLE, ReplayReason.MAPPING_TABLE_CHANGED)
    }
    return item(ReplayCategory.DATA_PROBLEM, ReplayReason.UNCHANGED_SINCE_FAILURE)
}

export enum ChainVerdict {
    TARGET = 'TARGET',
    DUPLICATE = 'DUPLICATE',
    RETRIED = 'RETRIED',
}

export enum ReplayConnectionState {
    NOT_APPLICABLE = 'NOT_APPLICABLE',
    MISSING = 'MISSING',
    BROKEN = 'BROKEN',
    HEALTHY = 'HEALTHY',
}

const FAILED_STATUSES: ExecutionStatus[] = [ExecutionStatus.FAILED, ExecutionStatus.TIMEOUT, ExecutionStatus.INTERNAL_ERROR, ExecutionStatus.MEMORY_LIMIT_EXCEEDED]
const IN_FLIGHT_STATUSES: ExecutionStatus[] = [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING, ExecutionStatus.PAUSED]

type ChainCandidate = {
    id: string
    rerunOfExecutionId?: string | null
    created: string
}

type ChainMember = {
    status: ExecutionStatus
    rerunOfExecutionId?: string | null
}

type ChainVerdictsParams = {
    candidates: ChainCandidate[]
    chain: ChainMember[]
}

type ClassifyParams = {
    execution: {
        id: string
        status: ExecutionStatus
        logsFileId?: string | null
        displayLogsFileId?: string | null
    }
    verdict: ChainVerdict
    workflowExists: boolean
    workflowChangedAfterFailure: boolean
    mappingTableChangedAfterFailure: boolean
    connectionState: ReplayConnectionState
    connectionExternalId: string | null
    transient: boolean
    authorization: boolean
    rejectedByTarget: boolean
    blockedUntil?: Date | null
}

type ClassifiedReplay = {
    executionId: string
    category: ReplayCategory
    reason: ReplayReason
    connectionExternalId: string | null
    rawDataExpired: boolean
    blockedUntil: string | null
}
