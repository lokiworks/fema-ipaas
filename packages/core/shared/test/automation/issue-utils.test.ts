import {
    ExecutionStatus,
    IssueFixKind,
    IssueInsightCause,
    IssueKind,
    IssueSeverity,
    issueUtils,
    ReplayReason,
} from '../../src'

describe('issueUtils.classifyFailure', () => {
    it('groups connection failures by connection across workflows', () => {
        const first = issueUtils.classifyFailure({
            workflowId: 'wf1',
            executionStatus: ExecutionStatus.FAILED,
            failedStep: { name: 'step_1', displayName: '保存订单', message: JSON.stringify({ message: 'connection (kingdee-prod) expired, reconnect again' }) },
        })
        const second = issueUtils.classifyFailure({
            workflowId: 'wf2',
            executionStatus: ExecutionStatus.FAILED,
            failedStep: { name: 'step_9', displayName: '查询物料', message: JSON.stringify({ message: 'connection (kingdee-prod) expired, reconnect again' }) },
        })
        expect(first.kind).toBe(IssueKind.CONNECTION)
        expect(first.signature).toBe('conn:kingdee-prod')
        expect(second.signature).toBe(first.signature)
        expect(first.errorCode).toBe('CONNECTION_EXPIRED')
        expect(first.connectionExternalId).toBe('kingdee-prod')
    })

    it('separates step failures by workflow, step and error code', () => {
        const rateLimited = issueUtils.classifyFailure({
            workflowId: 'wf1',
            executionStatus: ExecutionStatus.FAILED,
            failedStep: { name: 'step_2', displayName: '创建线索', message: 'Request failed with status code 429' },
        })
        const rejected = issueUtils.classifyFailure({
            workflowId: 'wf1',
            executionStatus: ExecutionStatus.FAILED,
            failedStep: { name: 'step_2', displayName: '创建线索', message: 'Request failed with status code 422' },
        })
        expect(rateLimited.kind).toBe(IssueKind.STEP)
        expect(rateLimited.signature).toBe('wf1:step_2:HTTP_429')
        expect(rejected.signature).toBe('wf1:step_2:HTTP_422')
    })

    it('treats timeouts as their own error code', () => {
        const timeout = issueUtils.classifyFailure({
            workflowId: 'wf1',
            executionStatus: ExecutionStatus.TIMEOUT,
            failedStep: { name: 'step_3', displayName: '查询考勤', message: 'took too long' },
        })
        expect(timeout.errorCode).toBe('STEP_TIMEOUT')
    })
})

describe('issueUtils.severityOf', () => {
    it('ranks connection issues and frequent failures as high', () => {
        expect(issueUtils.severityOf({ kind: IssueKind.CONNECTION, occurrences: 1 })).toBe(IssueSeverity.HIGH)
        expect(issueUtils.severityOf({ kind: IssueKind.STEP, occurrences: 10 })).toBe(IssueSeverity.HIGH)
        expect(issueUtils.severityOf({ kind: IssueKind.STEP, occurrences: 3 })).toBe(IssueSeverity.MEDIUM)
        expect(issueUtils.severityOf({ kind: IssueKind.STEP, occurrences: 2 })).toBe(IssueSeverity.LOW)
    })
})

describe('issueUtils.insightOf', () => {
    it('blocks replay until a broken connection is fixed', () => {
        const insight = issueUtils.insightOf({ issue: { kind: IssueKind.CONNECTION, errorCode: 'CONNECTION_EXPIRED' }, connectionHealthy: false })
        expect(insight.cause).toBe(IssueInsightCause.CONNECTION_AUTH)
        expect(insight.fixes.map((fix) => fix.kind)).toEqual([IssueFixKind.REAUTHORIZE_CONNECTION, IssueFixKind.REPLAY_FROM_FAILED_STEP])
        expect(insight.fixes[1].disabledReason).toBe(ReplayReason.CONNECTION_STILL_BROKEN)
    })

    it('allows replay once the connection is healthy again', () => {
        const insight = issueUtils.insightOf({ issue: { kind: IssueKind.CONNECTION, errorCode: 'CONNECTION_EXPIRED' }, connectionHealthy: true })
        expect(insight.fixes).toEqual([{ kind: IssueFixKind.REPLAY_FROM_FAILED_STEP, disabledReason: null }])
    })

    it('maps http statuses to causes', () => {
        expect(issueUtils.insightOf({ issue: { kind: IssueKind.STEP, errorCode: 'HTTP_429' }, connectionHealthy: true }).cause).toBe(IssueInsightCause.RATE_LIMITED)
        expect(issueUtils.insightOf({ issue: { kind: IssueKind.STEP, errorCode: 'HTTP_404' }, connectionHealthy: true }).cause).toBe(IssueInsightCause.NOT_FOUND)
        expect(issueUtils.insightOf({ issue: { kind: IssueKind.STEP, errorCode: 'HTTP_504' }, connectionHealthy: true }).cause).toBe(IssueInsightCause.UPSTREAM_TIMEOUT)
        expect(issueUtils.insightOf({ issue: { kind: IssueKind.STEP, errorCode: 'STEP_FAILED' }, connectionHealthy: true }).cause).toBe(IssueInsightCause.REJECTED_INPUT)
    })

    it('recognises transient statuses', () => {
        expect(issueUtils.isTransientHttpStatus('HTTP_503')).toBe(true)
        expect(issueUtils.isTransientHttpStatus('HTTP_422')).toBe(false)
        expect(issueUtils.isTransientHttpStatus(null)).toBe(false)
    })
})

describe('issueUtils.isRejectedByTargetHttpStatus', () => {
    it('treats client errors other than auth and rate limits as data problems', () => {
        expect(issueUtils.isRejectedByTargetHttpStatus('HTTP_422')).toBe(true)
        expect(issueUtils.isRejectedByTargetHttpStatus('HTTP_400')).toBe(true)
        expect(issueUtils.isRejectedByTargetHttpStatus('HTTP_404')).toBe(true)
    })

    it('leaves authorization, rate limits, server errors and non-http codes alone', () => {
        expect(issueUtils.isRejectedByTargetHttpStatus('HTTP_401')).toBe(false)
        expect(issueUtils.isRejectedByTargetHttpStatus('HTTP_403')).toBe(false)
        expect(issueUtils.isRejectedByTargetHttpStatus('HTTP_429')).toBe(false)
        expect(issueUtils.isRejectedByTargetHttpStatus('HTTP_503')).toBe(false)
        expect(issueUtils.isRejectedByTargetHttpStatus('STEP_TIMEOUT')).toBe(false)
        expect(issueUtils.isRejectedByTargetHttpStatus(null)).toBe(false)
    })
})

describe('issueUtils.isRepeatAttempt', () => {
    it('does not count a rerun of an already counted trigger as a new failure', () => {
        expect(issueUtils.isRepeatAttempt({ execution: { rerunOfExecutionId: 'root1' }, existingIssueId: 'i1' })).toBe(true)
    })

    it('does not count an in-place retry that fails again', () => {
        expect(issueUtils.isRepeatAttempt({ execution: { inPlaceRetryCount: 1 }, existingIssueId: 'i1' })).toBe(true)
    })

    it('does not count the same execution twice for the same issue', () => {
        expect(issueUtils.isRepeatAttempt({ execution: { issueId: 'i1' }, existingIssueId: 'i1' })).toBe(true)
    })

    it('counts a first failure of a fresh trigger', () => {
        expect(issueUtils.isRepeatAttempt({ execution: { rerunOfExecutionId: null, inPlaceRetryCount: 0, issueId: null }, existingIssueId: 'i1' })).toBe(false)
        expect(issueUtils.isRepeatAttempt({ execution: { issueId: 'other' }, existingIssueId: 'i1' })).toBe(false)
    })
})
