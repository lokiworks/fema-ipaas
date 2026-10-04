import { blockedUntilMarker } from '@fema-ipaas/core-utils'
import {
    IssueFixKind,
    IssueInsightCause,
    IssueKind,
    IssueTitleCategory,
    issueUtils,
} from '../../src'

const RATE_LIMIT_MESSAGE = 'HTTP 429: Beisen API rate limit exceeded. Beisen stops answering this tenant for the rest of the day'

describe('issueUtils.connectionExternalIdOf', () => {
    it('finds the connection a trigger reads from its input', () => {
        expect(issueUtils.connectionExternalIdOf({ input: { auth: '{{connections[\'beisen-main\']}}', window: 5 } })).toBe('beisen-main')
    })

    it('finds a connection reference nested in arrays and objects', () => {
        expect(issueUtils.connectionExternalIdOf({ input: { options: [{ auth: '{{ connections[\'feishu-app\'] }}' }] } })).toBe('feishu-app')
    })

    it('returns null when the input names no connection', () => {
        expect(issueUtils.connectionExternalIdOf({ input: { window: 5, name: 'x' } })).toBeNull()
        expect(issueUtils.connectionExternalIdOf({ input: undefined })).toBeNull()
    })
})

describe('issueUtils.classifyTriggerFailure', () => {
    it('merges the same cause on the same connection across workflows', () => {
        const first = issueUtils.classifyTriggerFailure({ workflowId: 'wf1', triggerName: 'trigger', message: RATE_LIMIT_MESSAGE, connectionExternalId: 'beisen-main' })
        const second = issueUtils.classifyTriggerFailure({ workflowId: 'wf2', triggerName: 'trigger', message: RATE_LIMIT_MESSAGE, connectionExternalId: 'beisen-main' })
        expect(first.kind).toBe(IssueKind.TRIGGER)
        expect(first.signature).toBe('trigger:beisen-main:HTTP_429')
        expect(second.signature).toBe(first.signature)
    })

    it('keeps different causes on the same connection apart', () => {
        const rateLimited = issueUtils.classifyTriggerFailure({ workflowId: 'wf1', triggerName: 'trigger', message: RATE_LIMIT_MESSAGE, connectionExternalId: 'beisen-main' })
        const serverError = issueUtils.classifyTriggerFailure({ workflowId: 'wf1', triggerName: 'trigger', message: 'HTTP 500: upstream exploded', connectionExternalId: 'beisen-main' })
        expect(serverError.signature).toBe('trigger:beisen-main:HTTP_500')
        expect(serverError.signature).not.toBe(rateLimited.signature)
    })

    it('keeps the same cause on different connections apart', () => {
        const main = issueUtils.classifyTriggerFailure({ workflowId: 'wf1', triggerName: 'trigger', message: RATE_LIMIT_MESSAGE, connectionExternalId: 'beisen-main' })
        const other = issueUtils.classifyTriggerFailure({ workflowId: 'wf2', triggerName: 'trigger', message: RATE_LIMIT_MESSAGE, connectionExternalId: 'beisen-other' })
        expect(other.signature).not.toBe(main.signature)
    })

    it('falls back to one issue per workflow when the trigger uses no connection', () => {
        const classification = issueUtils.classifyTriggerFailure({ workflowId: 'wf1', triggerName: 'trigger', message: RATE_LIMIT_MESSAGE, connectionExternalId: null })
        expect(classification.kind).toBe(IssueKind.TRIGGER)
        expect(classification.signature).toBe('wf1:trigger:HTTP_429')
        expect(classification.connectionExternalId).toBeNull()
    })

    it('still groups an expired connection as a connection issue', () => {
        const classification = issueUtils.classifyTriggerFailure({ workflowId: 'wf1', triggerName: 'trigger', message: 'connection (beisen-main) expired, reconnect again', connectionExternalId: 'beisen-main' })
        expect(classification.kind).toBe(IssueKind.CONNECTION)
        expect(classification.signature).toBe('conn:beisen-main')
    })
})

describe('issueUtils issue titles', () => {
    it('names the cause category and the key object instead of the raw error', () => {
        const title = issueUtils.titleOf({ kind: IssueKind.TRIGGER, errorCode: 'HTTP_429', message: blockedUntilMarker.attach({ message: RATE_LIMIT_MESSAGE, until: new Date('2030-01-01T00:00:00Z') }), object: '北森主连接' })
        expect(title).toBe('Rate limited: 北森主连接')
        expect(title.length).toBeLessThan(60)
    })

    it('classifies status codes into categories', () => {
        const categoryOf = (errorCode: string, message = 'x') => issueUtils.titleCategoryOf({ kind: IssueKind.STEP, errorCode, message })
        expect(categoryOf('HTTP_401')).toBe(IssueTitleCategory.ACCESS_DENIED)
        expect(categoryOf('HTTP_404')).toBe(IssueTitleCategory.NOT_FOUND)
        expect(categoryOf('HTTP_422')).toBe(IssueTitleCategory.REQUEST_REJECTED)
        expect(categoryOf('HTTP_502')).toBe(IssueTitleCategory.SERVER_ERROR)
        expect(categoryOf('HTTP_504')).toBe(IssueTitleCategory.TIMED_OUT)
        expect(categoryOf('STEP_TIMEOUT')).toBe(IssueTitleCategory.TIMED_OUT)
        expect(categoryOf('STEP_FAILED')).toBe(IssueTitleCategory.STEP_FAILED)
        expect(categoryOf('STEP_FAILED', '"20399" 不在映射表「部门对照」里')).toBe(IssueTitleCategory.MAPPING_MISSING)
    })

    it('calls a trigger failure without a status a trigger check failure', () => {
        expect(issueUtils.titleCategoryOf({ kind: IssueKind.TRIGGER, errorCode: 'STEP_FAILED', message: 'boom' })).toBe(IssueTitleCategory.TRIGGER_FAILED)
    })

    it('reads the category back from a stored title', () => {
        expect(issueUtils.titleCategoryOfTitle({ title: 'Access denied: 飞书主连接' })).toEqual({ category: IssueTitleCategory.ACCESS_DENIED, object: '飞书主连接' })
        expect(issueUtils.titleCategoryOfTitle({ title: 'Some old raw error text' })).toBeNull()
    })
})

describe('issueUtils.insightOf for trigger issues', () => {
    const base = { connectionHealthy: true }

    it('offers no replay for a rate limited trigger shared across workflows', () => {
        const insight = issueUtils.insightOf({ ...base, issue: { kind: IssueKind.TRIGGER, errorCode: 'HTTP_429', connectionExternalId: 'beisen-main', message: 'HTTP 429' } })
        expect(insight.cause).toBe(IssueInsightCause.RATE_LIMITED)
        expect(insight.fixes.map((item) => item.kind)).toEqual([IssueFixKind.IGNORE])
    })

    it('sends an access denied trigger to the connection', () => {
        const insight = issueUtils.insightOf({ ...base, issue: { kind: IssueKind.TRIGGER, errorCode: 'HTTP_403', connectionExternalId: 'feishu-app', message: 'HTTP 403' } })
        expect(insight.fixes.map((item) => item.kind)).toEqual([IssueFixKind.REAUTHORIZE_CONNECTION, IssueFixKind.IGNORE])
    })

    it('keeps opening the workflow for a trigger that belongs to one workflow', () => {
        const insight = issueUtils.insightOf({ ...base, issue: { kind: IssueKind.TRIGGER, errorCode: 'HTTP_500', connectionExternalId: null, message: 'HTTP 500' } })
        expect(insight.fixes.map((item) => item.kind)).toContain(IssueFixKind.OPEN_STEP_ERROR_HANDLING)
        expect(insight.fixes.map((item) => item.kind)).not.toContain(IssueFixKind.REPLAY_FROM_FAILED_STEP)
    })
})
