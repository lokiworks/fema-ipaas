import { ErrorCode } from '@fema-ipaas/core-utils'
import { RunEnvironment, WorkflowStatus } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { runEnvironmentUtils } from '../../src/app/workflows/execution/run-environment'

describe('runEnvironmentUtils.assertManualTriggerAllowed', () => {
    it('rejects a manual run on the published version when the workflow is stopped', () => {
        expect(() => runEnvironmentUtils.assertManualTriggerAllowed({
            workflowVersionId: 'v1',
            publishedVersionId: 'v1',
            workflowStatus: WorkflowStatus.DISABLED,
        })).toThrowError(expect.objectContaining({ error: expect.objectContaining({ code: ErrorCode.WORKFLOW_OPERATION_INVALID }) }))
    })

    it('allows a manual run on the published version when the workflow is enabled', () => {
        expect(() => runEnvironmentUtils.assertManualTriggerAllowed({
            workflowVersionId: 'v1',
            publishedVersionId: 'v1',
            workflowStatus: WorkflowStatus.ENABLED,
        })).not.toThrow()
    })

    it('allows a debug run on a draft version even when the workflow is stopped', () => {
        expect(() => runEnvironmentUtils.assertManualTriggerAllowed({
            workflowVersionId: 'v2',
            publishedVersionId: 'v1',
            workflowStatus: WorkflowStatus.DISABLED,
        })).not.toThrow()
    })

    it('runs a draft version in the testing environment', () => {
        expect(runEnvironmentUtils.forManualTrigger({ workflowVersionId: 'v2', publishedVersionId: 'v1' })).toBe(RunEnvironment.TESTING)
    })
})
