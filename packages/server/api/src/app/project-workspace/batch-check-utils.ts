import { BatchPublishCheckItem, BatchPublishCheckStatus } from '@fema-ipaas/shared'

export const batchCheckUtils = {
    classify({ target, workflow }: { target: BatchTarget, workflow: BatchCheckInput }): BatchPublishCheckItem {
        const base = { workflowId: workflow.id, displayName: workflow.displayName }
        if (workflow.lockedByOther) {
            return { ...base, status: BatchPublishCheckStatus.INVALID, reasons: ['workflowLockedByAnotherEditor'] }
        }
        if (!workflow.valid) {
            return { ...base, status: BatchPublishCheckStatus.INVALID, reasons: ['workflowHasValidationErrors'] }
        }
        const deployedVersionId = target === 'TEST' ? workflow.testVersionId : workflow.publishedVersionId
        if (workflow.latestVersionLocked && deployedVersionId === workflow.latestVersionId) {
            return { ...base, status: BatchPublishCheckStatus.UNCHANGED, reasons: ['workflowHasNoChanges'] }
        }
        if (workflow.unhealthyConnections > 0) {
            return { ...base, status: BatchPublishCheckStatus.WARNING, reasons: ['workflowUsesUnhealthyConnections'] }
        }
        return { ...base, status: BatchPublishCheckStatus.READY, reasons: [] }
    },
}

export type BatchTarget = 'PRODUCTION' | 'TEST'

export type BatchCheckInput = {
    id: string
    displayName: string
    valid: boolean
    latestVersionId: string
    latestVersionLocked: boolean
    publishedVersionId: string | null
    testVersionId: string | null
    unhealthyConnections: number
    lockedByOther: boolean
}
