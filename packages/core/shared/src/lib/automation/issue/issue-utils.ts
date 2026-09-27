import { isNil } from '@fema-ipaas/core-utils'
import { ExecutionStatus, FailedStep } from '@fema-ipaas/workflow-core'
import { Issue, IssueKind, IssueSeverity } from './issue'
import { IssueFix, IssueFixKind, IssueInsight, IssueInsightCause, ReplayReason } from './issue-requests'

export const issueUtils = {
    classifyFailure,
    severityOf,
    insightOf,
    readableMessage,
    isTransientHttpStatus,
}

function classifyFailure({ workflowId, executionStatus, failedStep }: ClassifyFailureParams): FailureClassification {
    const message = readableMessage(failedStep.message)
    const connection = matchConnectionFailure(message)
    if (!isNil(connection)) {
        return {
            kind: IssueKind.CONNECTION,
            signature: `conn:${connection.externalId}`,
            errorCode: connection.errorCode,
            connectionExternalId: connection.externalId,
            httpStatus: null,
            message,
        }
    }
    const httpStatus = extractHttpStatus(message)
    const errorCode = executionStatus === ExecutionStatus.TIMEOUT
        ? STEP_TIMEOUT_CODE
        : isNil(httpStatus) ? STEP_FAILED_CODE : `HTTP_${httpStatus}`
    return {
        kind: IssueKind.STEP,
        signature: `${workflowId}:${failedStep.name}:${errorCode}`,
        errorCode,
        connectionExternalId: null,
        httpStatus,
        message,
    }
}

function severityOf(issue: Pick<Issue, 'kind' | 'occurrences'>): IssueSeverity {
    if (issue.kind === IssueKind.CONNECTION || issue.occurrences >= HIGH_SEVERITY_OCCURRENCES) {
        return IssueSeverity.HIGH
    }
    if (issue.occurrences >= MEDIUM_SEVERITY_OCCURRENCES) {
        return IssueSeverity.MEDIUM
    }
    return IssueSeverity.LOW
}

function insightOf({ issue, connectionHealthy }: InsightOfParams): IssueInsight {
    if (issue.kind === IssueKind.CONNECTION) {
        const replayBlocked = connectionHealthy ? null : ReplayReason.CONNECTION_STILL_BROKEN
        return {
            cause: IssueInsightCause.CONNECTION_AUTH,
            confidence: 0.96,
            httpStatus: null,
            fixes: [
                ...(connectionHealthy ? [] : [fix({ kind: IssueFixKind.REAUTHORIZE_CONNECTION })]),
                fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP, disabledReason: replayBlocked }),
            ],
        }
    }
    if (issue.errorCode === STEP_TIMEOUT_CODE) {
        return {
            cause: IssueInsightCause.STEP_TIMEOUT,
            confidence: 0.72,
            httpStatus: null,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_INPUT }), fix({ kind: IssueFixKind.OPEN_STEP_ERROR_HANDLING })],
        }
    }
    const httpStatus = httpStatusOf(issue.errorCode)
    if (httpStatus === 429 || httpStatus === 529) {
        return {
            cause: IssueInsightCause.RATE_LIMITED,
            confidence: 0.83,
            httpStatus,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_ERROR_HANDLING }), fix({ kind: IssueFixKind.IGNORE })],
        }
    }
    if (httpStatus === 404) {
        return {
            cause: IssueInsightCause.NOT_FOUND,
            confidence: 0.78,
            httpStatus,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_ERROR_HANDLING }), fix({ kind: IssueFixKind.IGNORE })],
        }
    }
    if (httpStatus === 504) {
        return {
            cause: IssueInsightCause.UPSTREAM_TIMEOUT,
            confidence: 0.7,
            httpStatus,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_ERROR_HANDLING }), fix({ kind: IssueFixKind.REPLAY_FULL })],
        }
    }
    return {
        cause: IssueInsightCause.REJECTED_INPUT,
        confidence: 0.68,
        httpStatus,
        fixes: [fix({ kind: IssueFixKind.OPEN_STEP_INPUT }), fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP })],
    }
}

function readableMessage(raw: string | undefined): string {
    if (isNil(raw) || raw.trim().length === 0) {
        return ''
    }
    const parsed = safeParseJson(raw)
    if (typeof parsed === 'object' && parsed !== null && 'message' in parsed && typeof parsed.message === 'string') {
        return parsed.message
    }
    return raw
}

function isTransientHttpStatus(errorCode: string | null | undefined): boolean {
    const status = httpStatusOf(errorCode)
    return !isNil(status) && TRANSIENT_HTTP_STATUSES.includes(status)
}

function matchConnectionFailure(message: string): ConnectionFailure | null {
    const expired = CONNECTION_EXPIRED_PATTERN.exec(message)
    if (!isNil(expired)) {
        return { externalId: expired[1], errorCode: 'CONNECTION_EXPIRED' }
    }
    const notFound = CONNECTION_NOT_FOUND_PATTERN.exec(message)
    if (!isNil(notFound)) {
        return { externalId: notFound[1], errorCode: 'CONNECTION_NOT_FOUND' }
    }
    const loading = CONNECTION_LOADING_PATTERN.exec(message)
    if (!isNil(loading)) {
        return { externalId: loading[1], errorCode: 'CONNECTION_LOADING_FAILED' }
    }
    return null
}

function extractHttpStatus(message: string): number | null {
    const match = HTTP_STATUS_PATTERN.exec(message)
    return isNil(match) ? null : Number(match[1])
}

function httpStatusOf(errorCode: string | null | undefined): number | null {
    if (isNil(errorCode) || !errorCode.startsWith('HTTP_')) {
        return null
    }
    const status = Number(errorCode.slice('HTTP_'.length))
    return Number.isFinite(status) ? status : null
}

function safeParseJson(raw: string): unknown {
    try {
        return JSON.parse(raw)
    }
    catch {
        return null
    }
}

function fix({ kind, disabledReason }: { kind: IssueFixKind, disabledReason?: ReplayReason | null }): IssueFix {
    return { kind, disabledReason: disabledReason ?? null }
}

const STEP_TIMEOUT_CODE = 'STEP_TIMEOUT'
const STEP_FAILED_CODE = 'STEP_FAILED'
const HIGH_SEVERITY_OCCURRENCES = 10
const MEDIUM_SEVERITY_OCCURRENCES = 3
const TRANSIENT_HTTP_STATUSES = [429, 502, 503, 504, 529]
const CONNECTION_EXPIRED_PATTERN = /connection \(([^)]+)\) expired/
const CONNECTION_NOT_FOUND_PATTERN = /connection \(([^)]+)\) not found/
const CONNECTION_LOADING_PATTERN = /Failed to load connection \(([^)]+)\)/
const HTTP_STATUS_PATTERN = /\b([45]\d\d)\b/

type ClassifyFailureParams = {
    workflowId: string
    executionStatus: ExecutionStatus
    failedStep: FailedStep
}

type ConnectionFailure = {
    externalId: string
    errorCode: string
}

type InsightOfParams = {
    issue: Pick<Issue, 'kind' | 'errorCode'>
    connectionHealthy: boolean
}

export type FailureClassification = {
    kind: IssueKind
    signature: string
    errorCode: string
    connectionExternalId: string | null
    httpStatus: number | null
    message: string
}
