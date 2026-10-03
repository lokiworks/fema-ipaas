import { DEFAULT_NOTIFICATION_PREFERENCES, NotificationType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { notificationPreferenceUtils } from '../../../../src/app/notification/notification-preference-utils'
import { notificationUtils } from '../../../../src/app/notification/notification-utils'
import { weeklyDigestUtils } from '../../../../src/app/notification/weekly-digest-utils'

describe('notificationUtils.resolveRecipients', () => {
    it('drops empty ids, duplicates and the actor who caused the notification', () => {
        expect(notificationUtils.resolveRecipients({ recipientIds: ['a', 'b', 'a', null, undefined, '', 'actor'], actorId: 'actor' })).toEqual(['a', 'b'])
    })

    it('keeps everyone when there is no actor', () => {
        expect(notificationUtils.resolveRecipients({ recipientIds: ['a', 'b'], actorId: null })).toEqual(['a', 'b'])
    })
})

describe('notificationUtils.buildRows', () => {
    it('creates one unread row per recipient, scoped to the tenant and project', () => {
        let counter = 0
        const rows = notificationUtils.buildRows({
            input: {
                tenantId: 't1',
                projectId: 'p1',
                recipientIds: ['a', 'b'],
                type: NotificationType.RELEASE_REQUESTED,
                title: 'Sync orders',
                body: 'please review',
                link: '/projects/p1/releases/r1',
            },
            recipientIds: ['a', 'b'],
            actorName: 'Lee',
            now: '2026-09-27T00:00:00.000Z',
            generateId: () => {
                counter += 1
                return `n${counter}`
            },
        })
        expect(rows).toHaveLength(2)
        expect(rows.map((row) => row.recipientId)).toEqual(['a', 'b'])
        expect(rows.every((row) => !row.read && row.tenantId === 't1' && row.projectId === 'p1' && row.actorName === 'Lee')).toBe(true)
        expect(new Set(rows.map((row) => row.id)).size).toBe(2)
    })

    it('truncates very long titles and defaults optional fields to null', () => {
        const [row] = notificationUtils.buildRows({
            input: { tenantId: 't1', recipientIds: ['a'], type: NotificationType.ISSUE_ASSIGNED, title: 'x'.repeat(500) },
            recipientIds: ['a'],
            actorName: null,
            now: '2026-09-27T00:00:00.000Z',
            generateId: () => 'n1',
        })
        expect(row.title.length).toBe(200)
        expect(row.projectId).toBeNull()
        expect(row.body).toBeNull()
        expect(row.link).toBeNull()
    })
})

describe('notificationUtils.retentionCutoff', () => {
    it('subtracts the retention window', () => {
        expect(notificationUtils.retentionCutoff({ now: new Date('2026-09-27T00:00:00.000Z'), days: 90 })).toBe('2026-06-29T00:00:00.000Z')
    })
})

describe('notificationPreferenceUtils', () => {
    it('falls back to defaults for missing or malformed values', () => {
        expect(notificationPreferenceUtils.resolve(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
        expect(notificationPreferenceUtils.resolve({ runFailed: { email: 'yes' } }).runFailed).toEqual(DEFAULT_NOTIFICATION_PREFERENCES.runFailed)
    })

    it('keeps the stored booleans', () => {
        const resolved = notificationPreferenceUtils.resolve({ weeklyDigest: { email: true }, runFailed: { email: false, im: true } })
        expect(resolved.weeklyDigest).toEqual({ im: false, email: true })
        expect(resolved.runFailed).toEqual({ im: true, email: false })
        expect(notificationPreferenceUtils.allows({ preferences: { runFailed: { email: false } }, event: 'runFailed', channel: 'email' })).toBe(false)
        expect(notificationPreferenceUtils.allows({ preferences: null, event: 'projectMemberAdded', channel: 'email' })).toBe(true)
    })
})

describe('weeklyDigestUtils', () => {
    it('summarises the week', () => {
        const message = weeklyDigestUtils.compose({ runs: 12, failedRuns: 1, openIssues: 2, newIssues: 1, projectCount: 1 })
        expect(message.title).toBe('每周摘要：12 次运行，1 次失败')
        expect(message.body).toContain('你参与的 1 个项目')
        expect(message.body).toContain('新增问题 1 个，仍未解决 2 个')
    })

    it('skips users without projects', () => {
        expect(weeklyDigestUtils.isWorthSending({ runs: 0, failedRuns: 0, openIssues: 0, newIssues: 0, projectCount: 0 })).toBe(false)
    })
})
