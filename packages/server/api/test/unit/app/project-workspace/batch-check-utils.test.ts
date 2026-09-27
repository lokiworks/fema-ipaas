import { BatchPublishCheckStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { BatchCheckInput, batchCheckUtils } from '../../../../src/app/project-workspace/batch-check-utils'

const base: BatchCheckInput = {
    id: 'wf1',
    displayName: '入职开通账号',
    valid: true,
    latestVersionId: 'v2',
    latestVersionLocked: false,
    publishedVersionId: 'v1',
    testVersionId: null,
    unhealthyConnections: 0,
    lockedByOther: false,
}

describe('batchCheckUtils.classify', () => {
    it('takes out workflows someone else is editing', () => {
        expect(batchCheckUtils.classify({ target: 'PRODUCTION', workflow: { ...base, lockedByOther: true } })).toMatchObject({
            status: BatchPublishCheckStatus.INVALID,
            reasons: ['workflowLockedByAnotherEditor'],
        })
    })

    it('marks invalid drafts as not publishable', () => {
        const item = batchCheckUtils.classify({ target: 'PRODUCTION', workflow: { ...base, valid: false } })
        expect(item.status).toBe(BatchPublishCheckStatus.INVALID)
    })

    it('treats a locked latest version already deployed to the target as unchanged', () => {
        const unchanged = { ...base, latestVersionLocked: true, latestVersionId: 'v1' }
        expect(batchCheckUtils.classify({ target: 'PRODUCTION', workflow: unchanged }).status).toBe(BatchPublishCheckStatus.UNCHANGED)
        expect(batchCheckUtils.classify({ target: 'TEST', workflow: unchanged }).status).toBe(BatchPublishCheckStatus.READY)
    })

    it('compares against the test deployment in dual-environment projects', () => {
        const deployedToTest = { ...base, latestVersionLocked: true, latestVersionId: 'v3', testVersionId: 'v3' }
        expect(batchCheckUtils.classify({ target: 'TEST', workflow: deployedToTest }).status).toBe(BatchPublishCheckStatus.UNCHANGED)
    })

    it('warns when a referenced connection is not healthy', () => {
        const item = batchCheckUtils.classify({ target: 'PRODUCTION', workflow: { ...base, unhealthyConnections: 2 } })
        expect(item.status).toBe(BatchPublishCheckStatus.WARNING)
        expect(item.reasons).toEqual(['workflowUsesUnhealthyConnections'])
    })

    it('is ready otherwise', () => {
        expect(batchCheckUtils.classify({ target: 'PRODUCTION', workflow: base })).toEqual({
            workflowId: 'wf1',
            displayName: '入职开通账号',
            status: BatchPublishCheckStatus.READY,
            reasons: [],
        })
    })
})
