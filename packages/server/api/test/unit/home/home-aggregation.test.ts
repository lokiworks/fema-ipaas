import { ExecutionStatus, HomeTodo, HomeTodoType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { homeAggregation } from '../../../src/app/home/home-aggregation'

describe('homeAggregation.resolveSince', () => {
    const now = new Date('2026-09-27T10:00:00.000Z')

    it('keeps a local midnight within the last day', () => {
        expect(homeAggregation.resolveSince({ since: '2026-09-26T16:00:00.000Z', now }).toISOString()).toBe('2026-09-26T16:00:00.000Z')
    })

    it('falls back to the last 24 hours for future, stale or invalid values', () => {
        const fallback = '2026-09-26T10:00:00.000Z'
        expect(homeAggregation.resolveSince({ since: '2026-09-28T00:00:00.000Z', now }).toISOString()).toBe(fallback)
        expect(homeAggregation.resolveSince({ since: '2026-09-20T00:00:00.000Z', now }).toISOString()).toBe(fallback)
        expect(homeAggregation.resolveSince({ since: 'not-a-date', now }).toISOString()).toBe(fallback)
    })
})

describe('homeAggregation.summarizeStatusCounts', () => {
    it('counts failures and timeouts together and only finished runs for the success rate base', () => {
        const totals = homeAggregation.summarizeStatusCounts([
            { status: ExecutionStatus.SUCCEEDED, count: 8 },
            { status: ExecutionStatus.FAILED, count: 1 },
            { status: ExecutionStatus.TIMEOUT, count: 1 },
            { status: ExecutionStatus.RUNNING, count: 3 },
            { status: ExecutionStatus.CANCELED, count: 2 },
        ])
        expect(totals).toEqual({ total: 15, succeeded: 8, failedOrTimeout: 2, finished: 12 })
    })
})

describe('homeAggregation.summarizeByProject', () => {
    it('groups by project and sorts by run count', () => {
        const rows = homeAggregation.summarizeByProject([
            { projectId: 'a', status: ExecutionStatus.SUCCEEDED, count: 2 },
            { projectId: 'b', status: ExecutionStatus.SUCCEEDED, count: 5 },
            { projectId: 'a', status: ExecutionStatus.FAILED, count: 1 },
        ])
        expect(rows).toEqual([
            { projectId: 'b', total: 5, failedOrTimeout: 0 },
            { projectId: 'a', total: 3, failedOrTimeout: 1 },
        ])
    })
})

describe('homeAggregation.fillHourly', () => {
    it('returns 24 buckets and ignores out-of-range buckets', () => {
        const hourly = homeAggregation.fillHourly([
            { bucket: 0, count: 2 },
            { bucket: 9, count: 5 },
            { bucket: 24, count: 7 },
            { bucket: -1, count: 1 },
        ])
        expect(hourly).toHaveLength(24)
        expect(hourly[0]).toBe(2)
        expect(hourly[9]).toBe(5)
        expect(hourly.reduce((sum, value) => sum + value, 0)).toBe(7)
    })
})

describe('homeAggregation.canDecideRelease', () => {
    it('requires the user to be an approver', () => {
        expect(homeAggregation.canDecideRelease({ approverIds: ['x'], requestedById: 'r', userId: 'u' })).toBe(false)
    })

    it('blocks self-approval only when another approver exists', () => {
        expect(homeAggregation.canDecideRelease({ approverIds: ['u', 'x'], requestedById: 'u', userId: 'u' })).toBe(false)
        expect(homeAggregation.canDecideRelease({ approverIds: ['u'], requestedById: 'u', userId: 'u' })).toBe(true)
        expect(homeAggregation.canDecideRelease({ approverIds: ['u', 'x'], requestedById: 'x', userId: 'u' })).toBe(true)
    })
})

describe('homeAggregation.latestTodos', () => {
    it('keeps the newest items across both kinds', () => {
        const todo = (id: string, created: string, type: HomeTodoType): HomeTodo => ({
            type, id, projectId: 'p', workflowId: 'w', workflowDisplayName: 'W', executionId: null, requesterName: null, subject: null, created,
        })
        const result = homeAggregation.latestTodos({
            todos: [
                todo('r1', '2026-09-27T01:00:00.000Z', HomeTodoType.RELEASE),
                todo('a1', '2026-09-27T03:00:00.000Z', HomeTodoType.AGENT_APPROVAL),
                todo('r2', '2026-09-27T02:00:00.000Z', HomeTodoType.RELEASE),
            ],
            limit: 2,
        })
        expect(result.map((item) => item.id)).toEqual(['a1', 'r2'])
    })
})

describe('homeAggregation.countAffectedWorkflows', () => {
    it('counts distinct workflows using the connection in visible projects', () => {
        const usages = [
            { workflowId: 'w1', projectId: 'p1', connectionIds: ['c1', 'c2'] },
            { workflowId: 'w2', projectId: 'p1', connectionIds: ['c2'] },
            { workflowId: 'w3', projectId: 'p2', connectionIds: ['c1'] },
        ]
        expect(homeAggregation.countAffectedWorkflows({ usages, externalId: 'c1', projectIds: ['p1'] })).toBe(1)
        expect(homeAggregation.countAffectedWorkflows({ usages, externalId: 'c1', projectIds: ['p1', 'p2'] })).toBe(2)
        expect(homeAggregation.countAffectedWorkflows({ usages, externalId: 'c3', projectIds: ['p1'] })).toBe(0)
    })
})

describe('homeAggregation.displayName', () => {
    it('prefers the full name and falls back to the email', () => {
        expect(homeAggregation.displayName({ firstName: 'Ada', lastName: 'Lee', email: 'a@x.io' })).toBe('Ada Lee')
        expect(homeAggregation.displayName({ firstName: ' ', lastName: null, email: 'a@x.io' })).toBe('a@x.io')
        expect(homeAggregation.displayName({ firstName: null, lastName: null, email: null })).toBeNull()
    })
})
