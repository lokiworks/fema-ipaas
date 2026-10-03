import { isNil } from '@fema-ipaas/core-utils'
import { errorHandlingUtils, ExecutionStatus, FailedStep } from '@fema-ipaas/workflow-core'
import { Issue, IssueKind, IssueSeverity } from './issue'
import { IssueFix, IssueFixKind, IssueInsight, IssueInsightCause, ReplayReason } from './issue-requests'

export const issueUtils = {
    classifyFailure,
    classifyDrift,
    severityOf,
    insightOf,
    isTransientHttpStatus,
    isAuthorizationHttpStatus,
    isRejectedByTargetHttpStatus,
    isRepeatAttempt,
}

function classifyFailure({ workflowId, executionStatus, failedStep }: ClassifyFailureParams): FailureClassification {
    const classified = errorHandlingUtils.classifyErrorMessage({
        message: failedStep.message,
        timedOut: executionStatus === ExecutionStatus.TIMEOUT,
    })
    if (!isNil(classified.connectionExternalId)) {
        return {
            kind: IssueKind.CONNECTION,
            signature: `conn:${classified.connectionExternalId}`,
            errorCode: classified.errorCode,
            connectionExternalId: classified.connectionExternalId,
            httpStatus: null,
            message: classified.message,
        }
    }
    return {
        kind: IssueKind.STEP,
        signature: `${workflowId}:${failedStep.name}:${classified.errorCode}`,
        errorCode: classified.errorCode,
        connectionExternalId: null,
        httpStatus: classified.httpStatus,
        message: classified.message,
    }
}

function classifyDrift({ workflowId, stepName, message }: { workflowId: string, stepName: string, message: string }): FailureClassification {
    return {
        kind: IssueKind.DRIFT,
        signature: `${workflowId}:${stepName}:${RESULT_MISMATCH_CODE}`,
        errorCode: RESULT_MISMATCH_CODE,
        connectionExternalId: null,
        httpStatus: null,
        message,
    }
}

function severityOf(issue: Pick<Issue, 'kind' | 'occurrences'>): IssueSeverity {
    if (issue.kind === IssueKind.CONNECTION || issue.kind === IssueKind.DRIFT || issue.occurrences >= HIGH_SEVERITY_OCCURRENCES) {
        return IssueSeverity.HIGH
    }
    if (issue.occurrences >= MEDIUM_SEVERITY_OCCURRENCES) {
        return IssueSeverity.MEDIUM
    }
    return IssueSeverity.LOW
}

function insightOf({ issue, connectionHealthy }: InsightOfParams): IssueInsight {
    if (issue.kind === IssueKind.DRIFT) {
        return {
            cause: IssueInsightCause.RESULT_MISMATCH,
            confidence: 0.9,
            httpStatus: null,
            fixes: [fix({ kind: IssueFixKind.OPEN_RUN }), fix({ kind: IssueFixKind.IGNORE })],
        }
    }
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
    if (isNil(httpStatus)) {
        return {
            cause: IssueInsightCause.STEP_ERROR,
            confidence: 0.4,
            httpStatus: null,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_INPUT }), fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP })],
        }
    }
    if (AUTHORIZATION_HTTP_STATUSES.includes(httpStatus)) {
        return {
            cause: IssueInsightCause.ACCESS_DENIED,
            confidence: 0.8,
            httpStatus,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_INPUT }), fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP })],
        }
    }
    if (httpStatus >= SERVER_ERROR_MIN_STATUS) {
        return {
            cause: IssueInsightCause.UPSTREAM_ERROR,
            confidence: 0.7,
            httpStatus,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_ERROR_HANDLING }), fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP })],
        }
    }
    return {
        cause: IssueInsightCause.REJECTED_INPUT,
        confidence: 0.68,
        httpStatus,
        fixes: [fix({ kind: IssueFixKind.OPEN_STEP_INPUT }), fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP })],
    }
}

function isTransientHttpStatus(errorCode: string | null | undefined): boolean {
    const status = httpStatusOf(errorCode)
    return !isNil(status) && TRANSIENT_HTTP_STATUSES.includes(status)
}

function isAuthorizationHttpStatus(errorCode: string | null | undefined): boolean {
    const status = httpStatusOf(errorCode)
    return !isNil(status) && AUTHORIZATION_HTTP_STATUSES.includes(status)
}

function isRejectedByTargetHttpStatus(errorCode: string | null | undefined): boolean {
    const status = httpStatusOf(errorCode)
    if (isNil(status) || status < 400 || status >= 500) {
        return false
    }
    return !TRANSIENT_HTTP_STATUSES.includes(status) && !AUTHORIZATION_HTTP_STATUSES.includes(status)
}

function isRepeatAttempt({ execution, existingIssueId }: IsRepeatAttemptParams): boolean {
    return !isNil(execution.rerunOfExecutionId) || (execution.inPlaceRetryCount ?? 0) > 0 || execution.issueId === existingIssueId
}

function httpStatusOf(errorCode: string | null | undefined): number | null {
    if (isNil(errorCode) || !errorCode.startsWith('HTTP_')) {
        return null
    }
    const status = Number(errorCode.slice('HTTP_'.length))
    return Number.isFinite(status) ? status : null
}

function fix({ kind, disabledReason }: { kind: IssueFixKind, disabledReason?: ReplayReason | null }): IssueFix {
    return { kind, disabledReason: disabledReason ?? null }
}

const STEP_TIMEOUT_CODE = 'STEP_TIMEOUT'
const RESULT_MISMATCH_CODE = 'RESULT_MISMATCH'
const HIGH_SEVERITY_OCCURRENCES = 10
const MEDIUM_SEVERITY_OCCURRENCES = 3
const TRANSIENT_HTTP_STATUSES = [429, 502, 503, 504, 529]
const AUTHORIZATION_HTTP_STATUSES = [401, 403]
const SERVER_ERROR_MIN_STATUS = 500

type IsRepeatAttemptParams = {
    execution: {
        rerunOfExecutionId?: string | null
        inPlaceRetryCount?: number
        issueId?: string | null
    }
    existingIssueId: string
}

type ClassifyFailureParams = {
    workflowId: string
    executionStatus: ExecutionStatus
    failedStep: FailedStep
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
