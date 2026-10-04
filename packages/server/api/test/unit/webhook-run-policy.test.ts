import { WorkflowStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { webhookRunPolicy } from '../../src/app/webhooks/webhook-run-policy'

describe('webhookRunPolicy.shouldExecute', () => {
    it('lets the test deployment run while the workflow is still disabled in production', () => {
        expect(webhookRunPolicy.shouldExecute({ workflowStatus: WorkflowStatus.DISABLED, isTestDeployment: true, execute: true })).toBe(true)
    })

    it('keeps a disabled workflow from running on the production path', () => {
        expect(webhookRunPolicy.shouldExecute({ workflowStatus: WorkflowStatus.DISABLED, isTestDeployment: false, execute: true })).toBe(false)
    })

    it('runs an enabled workflow on every path', () => {
        expect(webhookRunPolicy.shouldExecute({ workflowStatus: WorkflowStatus.ENABLED, isTestDeployment: false, execute: true })).toBe(true)
    })

    it('never runs when the caller only wants to save sample data', () => {
        expect(webhookRunPolicy.shouldExecute({ workflowStatus: WorkflowStatus.ENABLED, isTestDeployment: true, execute: false })).toBe(false)
    })
})
