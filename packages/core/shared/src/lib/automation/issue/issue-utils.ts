import { blockedUntilMarker, fixOwnerMarker, isNil } from '@fema-ipaas/core-utils'
import { errorHandlingUtils, ExecutionStatus, FailedStep, retrySafety } from '@fema-ipaas/workflow-core'
import { Issue, IssueKind, IssueSeverity, IssueTitleCategory } from './issue'
import { IssueFix, IssueFixKind, IssueFixOwner, IssueInsight, IssueInsightCause, ReplayReason } from './issue-requests'

export const issueUtils = {
    classifyFailure,
    classifyTriggerFailure,
    classifyDrift,
    connectionExternalIdOf,
    titleCategoryOf,
    titleOf,
    titleCategoryOfTitle,
    severityOf,
    insightOf,
    isTransientHttpStatus: retrySafety.isTransientHttpStatus,
    isAuthorizationHttpStatus: retrySafety.isAuthorizationHttpStatus,
    isRejectedByTargetHttpStatus: retrySafety.isRejectedByTargetHttpStatus,
    isRepeatAttempt,
    activeBlockedUntil,
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

function classifyTriggerFailure({ workflowId, triggerName, message, connectionExternalId }: ClassifyTriggerFailureParams): FailureClassification {
    const base = classifyFailure({ workflowId, executionStatus: ExecutionStatus.FAILED, failedStep: { name: triggerName, displayName: triggerName, message } })
    if (base.kind === IssueKind.CONNECTION) {
        return base
    }
    const shared = !isNil(connectionExternalId)
    return {
        kind: IssueKind.TRIGGER,
        signature: shared ? `${TRIGGER_SIGNATURE_PREFIX}${connectionExternalId}:${base.errorCode}` : base.signature,
        errorCode: base.errorCode,
        connectionExternalId: connectionExternalId ?? null,
        httpStatus: base.httpStatus,
        message: base.message,
    }
}

function connectionExternalIdOf({ input }: { input: unknown }): string | null {
    if (typeof input === 'string') {
        return CONNECTION_REFERENCE_PATTERN.exec(input)?.[1] ?? null
    }
    if (Array.isArray(input)) {
        return input.map((item) => connectionExternalIdOf({ input: item })).find((id) => !isNil(id)) ?? null
    }
    if (typeof input === 'object' && input !== null) {
        return Object.values(input).map((value) => connectionExternalIdOf({ input: value })).find((id) => !isNil(id)) ?? null
    }
    return null
}

function titleCategoryOf({ kind, errorCode, message }: TitleCategoryOfParams): IssueTitleCategory {
    if (isMappingMiss({ message })) {
        return IssueTitleCategory.MAPPING_MISSING
    }
    const status = retrySafety.httpStatusOf(errorCode)
    if (!isNil(blockedUntilMarker.parse(message)) || status === 429 || status === 529) {
        return IssueTitleCategory.RATE_LIMITED
    }
    if (errorCode === STEP_TIMEOUT_CODE || status === 504) {
        return IssueTitleCategory.TIMED_OUT
    }
    if (isNil(status)) {
        return kind === IssueKind.TRIGGER ? IssueTitleCategory.TRIGGER_FAILED : IssueTitleCategory.STEP_FAILED
    }
    if (retrySafety.isAuthorizationHttpStatus(`HTTP_${status}`)) {
        return IssueTitleCategory.ACCESS_DENIED
    }
    if (status === 404) {
        return IssueTitleCategory.NOT_FOUND
    }
    return status >= SERVER_ERROR_MIN_STATUS ? IssueTitleCategory.SERVER_ERROR : IssueTitleCategory.REQUEST_REJECTED
}

function titleOf({ kind, errorCode, message, object }: TitleCategoryOfParams & { object: string }): string {
    const category = ISSUE_TITLE_CATEGORY_ENGLISH[titleCategoryOf({ kind, errorCode, message })]
    return object.length === 0 ? category : `${category}: ${object}`
}

function titleCategoryOfTitle({ title }: { title: string }): { category: IssueTitleCategory, object: string } | null {
    const match = Object.values(IssueTitleCategory).find((category) => title === ISSUE_TITLE_CATEGORY_ENGLISH[category] || title.startsWith(`${ISSUE_TITLE_CATEGORY_ENGLISH[category]}: `))
    if (isNil(match)) {
        return null
    }
    return { category: match, object: title.slice(ISSUE_TITLE_CATEGORY_ENGLISH[match].length).replace(/^: /, '') }
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
    if (issue.kind === IssueKind.CONNECTION || (issue.kind === IssueKind.DRIFT || issue.kind === IssueKind.RECONCILIATION) || issue.occurrences >= HIGH_SEVERITY_OCCURRENCES) {
        return IssueSeverity.HIGH
    }
    if (issue.occurrences >= MEDIUM_SEVERITY_OCCURRENCES) {
        return IssueSeverity.MEDIUM
    }
    return IssueSeverity.LOW
}

function insightOf(params: InsightOfParams): IssueInsight {
    const insight = withRawDataExpiry({ insight: baseInsightOf(params), rawDataExpired: params.rawDataExpired === true })
    const owner = fixOwnerMarker.parse(params.issue.message)
    if (isNil(owner) || insight.cause === IssueInsightCause.BLOCKED_UNTIL || params.issue.kind === IssueKind.CONNECTION || (params.issue.kind === IssueKind.DRIFT || params.issue.kind === IssueKind.RECONCILIATION)) {
        return insight
    }
    return { ...insight, owner: IssueFixOwner[owner], confidence: 0.9 }
}

function withRawDataExpiry({ insight, rawDataExpired }: { insight: IssueInsight, rawDataExpired: boolean }): IssueInsight {
    if (!rawDataExpired) {
        return insight
    }
    return {
        ...insight,
        fixes: insight.fixes.map((item) => REPLAY_FIXES.includes(item.kind) && isNil(item.disabledReason) ? { ...item, disabledReason: ReplayReason.RAW_DATA_EXPIRED } : item),
    }
}

function baseInsightOf({ issue, connectionHealthy, connectionMissing = false, now = new Date() }: InsightOfParams): IssueInsight {
    if (issue.kind === IssueKind.TRIGGER) {
        return triggerInsightOf({ issue, connectionHealthy, connectionMissing, now })
    }
    if ((issue.kind === IssueKind.DRIFT || issue.kind === IssueKind.RECONCILIATION)) {
        return {
            cause: IssueInsightCause.RESULT_MISMATCH,
            owner: IssueFixOwner.WORKFLOW_OWNER,
            confidence: 0.9,
            httpStatus: null,
            fixes: [fix({ kind: IssueFixKind.OPEN_RUN }), fix({ kind: IssueFixKind.IGNORE })],
        }
    }
    if (issue.kind === IssueKind.CONNECTION) {
        const replayBlocked = connectionMissing ? ReplayReason.CONNECTION_DELETED : connectionHealthy ? null : ReplayReason.CONNECTION_STILL_BROKEN
        return {
            cause: IssueInsightCause.CONNECTION_AUTH,
            owner: IssueFixOwner.CONNECTION_OWNER,
            confidence: 0.96,
            httpStatus: null,
            fixes: [
                ...(connectionHealthy || connectionMissing ? [] : [fix({ kind: IssueFixKind.REAUTHORIZE_CONNECTION })]),
                fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP, disabledReason: replayBlocked }),
            ],
        }
    }
    const blockedUntil = activeBlockedUntil({ message: issue.message, now })
    if (!isNil(blockedUntil)) {
        return {
            cause: IssueInsightCause.BLOCKED_UNTIL,
            owner: IssueFixOwner.WAIT,
            confidence: 0.95,
            httpStatus: retrySafety.httpStatusOf(issue.errorCode),
            blockedUntil: blockedUntil.toISOString(),
            fixes: [fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP, disabledReason: ReplayReason.BLOCKED_UNTIL }), fix({ kind: IssueFixKind.IGNORE })],
        }
    }
    if (issue.errorCode === STEP_TIMEOUT_CODE) {
        return {
            cause: IssueInsightCause.STEP_TIMEOUT,
            owner: IssueFixOwner.WORKFLOW_OWNER,
            confidence: 0.72,
            httpStatus: null,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_INPUT }), fix({ kind: IssueFixKind.OPEN_STEP_ERROR_HANDLING })],
        }
    }
    if (isMappingMiss({ message: issue.message })) {
        return {
            cause: IssueInsightCause.MAPPING_MISSING,
            owner: IssueFixOwner.MAPPING_OWNER,
            confidence: 0.95,
            httpStatus: null,
            fixes: [fix({ kind: IssueFixKind.OPEN_MAPPING_TABLES }), fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP })],
        }
    }
    const httpStatus = retrySafety.httpStatusOf(issue.errorCode)
    if (httpStatus === 429 || httpStatus === 529) {
        return {
            cause: IssueInsightCause.RATE_LIMITED,
            owner: IssueFixOwner.WAIT,
            confidence: 0.83,
            httpStatus,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_ERROR_HANDLING }), fix({ kind: IssueFixKind.IGNORE })],
        }
    }
    if (httpStatus === 404) {
        return {
            cause: IssueInsightCause.NOT_FOUND,
            owner: IssueFixOwner.WORKFLOW_OWNER,
            confidence: 0.78,
            httpStatus,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_ERROR_HANDLING }), fix({ kind: IssueFixKind.IGNORE })],
        }
    }
    if (httpStatus === 504) {
        return {
            cause: IssueInsightCause.UPSTREAM_TIMEOUT,
            owner: IssueFixOwner.WAIT,
            confidence: 0.7,
            httpStatus,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_ERROR_HANDLING }), fix({ kind: IssueFixKind.REPLAY_FULL })],
        }
    }
    if (isNil(httpStatus)) {
        return {
            cause: IssueInsightCause.STEP_ERROR,
            owner: IssueFixOwner.WORKFLOW_OWNER,
            confidence: 0.4,
            httpStatus: null,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_INPUT }), fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP })],
        }
    }
    if (retrySafety.isAuthorizationHttpStatus(`HTTP_${httpStatus}`)) {
        return {
            cause: IssueInsightCause.ACCESS_DENIED,
            owner: IssueFixOwner.TARGET_ADMIN,
            confidence: 0.8,
            httpStatus,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_INPUT }), fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP })],
        }
    }
    if (httpStatus >= SERVER_ERROR_MIN_STATUS) {
        return {
            cause: IssueInsightCause.UPSTREAM_ERROR,
            owner: IssueFixOwner.WAIT,
            confidence: 0.7,
            httpStatus,
            fixes: [fix({ kind: IssueFixKind.OPEN_STEP_ERROR_HANDLING }), fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP })],
        }
    }
    return {
        cause: IssueInsightCause.REJECTED_INPUT,
        owner: IssueFixOwner.WORKFLOW_OWNER,
        confidence: 0.68,
        httpStatus,
        fixes: [fix({ kind: IssueFixKind.OPEN_STEP_INPUT }), fix({ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP })],
    }
}

function triggerInsightOf({ issue, connectionHealthy, connectionMissing, now }: InsightOfParams): IssueInsight {
    const insight = insightOf({ issue: { ...issue, kind: IssueKind.STEP }, connectionHealthy, connectionMissing, now })
    const sharedAcrossWorkflows = !isNil(issue.connectionExternalId)
    const supported = insight.fixes.filter((item) => !TRIGGER_UNSUPPORTED_FIXES.includes(item.kind) && !(sharedAcrossWorkflows && WORKFLOW_FIXES.includes(item.kind)))
    const reauthorize = insight.cause === IssueInsightCause.ACCESS_DENIED && sharedAcrossWorkflows ? [fix({ kind: IssueFixKind.REAUTHORIZE_CONNECTION })] : []
    const fixes = [...reauthorize, ...supported]
    return { ...insight, fixes: fixes.some((item) => item.kind === IssueFixKind.IGNORE) ? fixes : [...fixes, fix({ kind: IssueFixKind.IGNORE })] }
}

function isMappingMiss({ message }: { message: string | null | undefined }): boolean {
    return !isNil(message) && MAPPING_MISS_PATTERN.test(message)
}

function activeBlockedUntil({ message, now }: { message: string | null | undefined, now: Date }): Date | null {
    const until = blockedUntilMarker.parse(message)
    return !isNil(until) && until.getTime() > now.getTime() ? until : null
}

function isRepeatAttempt({ execution, existingIssueId }: IsRepeatAttemptParams): boolean {
    return !isNil(execution.rerunOfExecutionId) || (execution.inPlaceRetryCount ?? 0) > 0 || execution.issueId === existingIssueId
}

function fix({ kind, disabledReason }: { kind: IssueFixKind, disabledReason?: ReplayReason | null }): IssueFix {
    return { kind, disabledReason: disabledReason ?? null }
}

const TRIGGER_SIGNATURE_PREFIX = 'trigger:'
const TRIGGER_UNSUPPORTED_FIXES = [IssueFixKind.REPLAY_FROM_FAILED_STEP, IssueFixKind.REPLAY_FULL, IssueFixKind.OPEN_MAPPING_TABLES, IssueFixKind.OPEN_RUN]
const REPLAY_FIXES = [IssueFixKind.REPLAY_FROM_FAILED_STEP, IssueFixKind.REPLAY_FULL]
const WORKFLOW_FIXES = [IssueFixKind.OPEN_STEP_INPUT, IssueFixKind.OPEN_STEP_ERROR_HANDLING]
const CONNECTION_REFERENCE_PATTERN = /\{\{\s*connections\['([^']+)'\]\s*\}\}/
const MAPPING_MISS_PATTERN = /不在映射表「[^」]*」里/
const STEP_TIMEOUT_CODE = 'STEP_TIMEOUT'
const RESULT_MISMATCH_CODE = 'RESULT_MISMATCH'
const HIGH_SEVERITY_OCCURRENCES = 10
const MEDIUM_SEVERITY_OCCURRENCES = 3
const SERVER_ERROR_MIN_STATUS = 500

type ClassifyTriggerFailureParams = {
    workflowId: string
    triggerName: string
    message: string
    connectionExternalId: string | null
}

type TitleCategoryOfParams = {
    kind: IssueKind
    errorCode: string | null | undefined
    message: string | null | undefined
}

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
    issue: Pick<Issue, 'kind' | 'errorCode'> & Partial<Pick<Issue, 'message' | 'connectionExternalId'>>
    connectionHealthy: boolean
    connectionMissing?: boolean
    rawDataExpired?: boolean
    now?: Date
}

export type FailureClassification = {
    kind: IssueKind
    signature: string
    errorCode: string
    connectionExternalId: string | null
    httpStatus: number | null
    message: string
}

export const ISSUE_TITLE_CATEGORY_ENGLISH: Record<IssueTitleCategory, string> = {
    [IssueTitleCategory.RATE_LIMITED]: 'Rate limited',
    [IssueTitleCategory.ACCESS_DENIED]: 'Access denied',
    [IssueTitleCategory.NOT_FOUND]: 'Not found',
    [IssueTitleCategory.SERVER_ERROR]: 'Server error',
    [IssueTitleCategory.TIMED_OUT]: 'Timed out',
    [IssueTitleCategory.REQUEST_REJECTED]: 'Rejected by the other system',
    [IssueTitleCategory.MAPPING_MISSING]: 'Missing mapping value',
    [IssueTitleCategory.TRIGGER_FAILED]: 'Trigger check failed',
    [IssueTitleCategory.STEP_FAILED]: 'Step failed',
}
