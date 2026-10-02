import { ExecutionStatus, ReplayCategory, ReplayReason } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { ChainVerdict, issueReplayUtils, ReplayConnectionState } from '../../src/app/issue/issue-replay-utils'

const base = {
    execution: { id: 'e1', status: ExecutionStatus.FAILED, logsFileId: 'f', displayLogsFileId: 'f' },
    verdict: ChainVerdict.TARGET,
    workflowExists: true,
    workflowChangedAfterFailure: false,
    connectionState: ReplayConnectionState.NOT_APPLICABLE,
    connectionExternalId: null,
    transient: false,
    authorization: false,
    rejectedByTarget: false,
}

describe('issueReplayUtils.classify', () => {
    it('does not call a data problem fixed just because the workflow was edited', () => {
        const result = issueReplayUtils.classify({ ...base, rejectedByTarget: true, workflowChangedAfterFailure: true })
        expect(result.category).toBe(ReplayCategory.DATA_PROBLEM)
        expect(result.reason).toBe(ReplayReason.REJECTED_BY_TARGET)
    })

    it('replays after the workflow changed when the failure was not a data problem', () => {
        const result = issueReplayUtils.classify({ ...base, workflowChangedAfterFailure: true })
        expect(result.category).toBe(ReplayCategory.REPLAYABLE)
        expect(result.reason).toBe(ReplayReason.WORKFLOW_CHANGED)
    })

    it('flags an untouched workflow as likely to fail again', () => {
        const result = issueReplayUtils.classify(base)
        expect(result.category).toBe(ReplayCategory.DATA_PROBLEM)
        expect(result.reason).toBe(ReplayReason.UNCHANGED_SINCE_FAILURE)
    })

    it('blocks while the connection is still broken and replays once it recovered', () => {
        expect(issueReplayUtils.classify({ ...base, connectionState: ReplayConnectionState.BROKEN }).reason).toBe(ReplayReason.CONNECTION_STILL_BROKEN)
        expect(issueReplayUtils.classify({ ...base, connectionState: ReplayConnectionState.HEALTHY }).reason).toBe(ReplayReason.CONNECTION_RECOVERED)
    })

    it('skips an attempt that was superseded or already retried successfully', () => {
        expect(issueReplayUtils.classify({ ...base, verdict: ChainVerdict.DUPLICATE }).reason).toBe(ReplayReason.DUPLICATE_ATTEMPT)
        expect(issueReplayUtils.classify({ ...base, verdict: ChainVerdict.RETRIED }).reason).toBe(ReplayReason.ALREADY_RETRIED)
    })

    it('skips runs whose workflow is gone', () => {
        expect(issueReplayUtils.classify({ ...base, workflowExists: false }).reason).toBe(ReplayReason.WORKFLOW_DELETED)
    })
})

describe('issueReplayUtils.chainVerdicts', () => {
    it('keeps only the latest attempt of one trigger and marks the others as duplicates', () => {
        const verdicts = issueReplayUtils.chainVerdicts({
            candidates: [
                { id: 'root', created: '2026-10-01T01:00:00Z' },
                { id: 'rerun1', rerunOfExecutionId: 'root', created: '2026-10-01T02:00:00Z' },
            ],
            chain: [],
        })
        expect(verdicts.get('rerun1')).toBe(ChainVerdict.TARGET)
        expect(verdicts.get('root')).toBe(ChainVerdict.DUPLICATE)
    })

    it('treats the whole chain as retried when a rerun succeeded or is still running', () => {
        const succeeded = issueReplayUtils.chainVerdicts({
            candidates: [{ id: 'root', created: '2026-10-01T01:00:00Z' }],
            chain: [{ status: ExecutionStatus.SUCCEEDED, rerunOfExecutionId: 'root' }],
        })
        const running = issueReplayUtils.chainVerdicts({
            candidates: [{ id: 'root', created: '2026-10-01T01:00:00Z' }],
            chain: [{ status: ExecutionStatus.RUNNING, rerunOfExecutionId: 'root' }],
        })
        expect(succeeded.get('root')).toBe(ChainVerdict.RETRIED)
        expect(running.get('root')).toBe(ChainVerdict.RETRIED)
    })

    it('keeps separate triggers independent', () => {
        const verdicts = issueReplayUtils.chainVerdicts({
            candidates: [
                { id: 'a', created: '2026-10-01T01:00:00Z' },
                { id: 'b', created: '2026-10-01T02:00:00Z' },
            ],
            chain: [{ status: ExecutionStatus.SUCCEEDED, rerunOfExecutionId: 'a' }],
        })
        expect(verdicts.get('a')).toBe(ChainVerdict.RETRIED)
        expect(verdicts.get('b')).toBe(ChainVerdict.TARGET)
    })
})
