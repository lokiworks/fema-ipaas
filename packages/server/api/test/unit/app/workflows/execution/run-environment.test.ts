import { RunEnvironment } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { runEnvironmentUtils } from '../../../../../src/app/workflows/execution/run-environment'

describe('runEnvironmentUtils.forManualTrigger', () => {
    it('records a run of the published version as a production run', () => {
        const environment = runEnvironmentUtils.forManualTrigger({ workflowVersionId: 'v1', publishedVersionId: 'v1' })
        expect(environment).toBe(RunEnvironment.PRODUCTION)
    })

    it('records a run of an unpublished draft as a debug run', () => {
        const environment = runEnvironmentUtils.forManualTrigger({ workflowVersionId: 'draft', publishedVersionId: null })
        expect(environment).toBe(RunEnvironment.TESTING)
    })

    it('records a run of a draft edited after publishing as a debug run', () => {
        const environment = runEnvironmentUtils.forManualTrigger({ workflowVersionId: 'draft', publishedVersionId: 'v1' })
        expect(environment).toBe(RunEnvironment.TESTING)
    })

    it('treats a missing published version as a debug run', () => {
        const environment = runEnvironmentUtils.forManualTrigger({ workflowVersionId: 'v1', publishedVersionId: undefined })
        expect(environment).toBe(RunEnvironment.TESTING)
    })
})
