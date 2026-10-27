import { GenericStepOutput, StepOutputStatus, WorkflowActionType } from '@fema-ipaas/shared'
import { describe, expect, it } from 'vitest'
import { singleStepTestSteps } from '../../src/lib/helper/single-step-test-steps'

const succeeded = () => GenericStepOutput.create({
    type: WorkflowActionType.CODE,
    status: StepOutputStatus.SUCCEEDED,
    input: {},
    output: { ok: true },
})

describe('singleStepTestSteps.onlyTestedStep', () => {
    it('keeps only the tested step so primed upstream and downstream steps are not logged as run', () => {
        const steps = { trigger: succeeded(), http_1: succeeded(), script_1: succeeded(), ret: succeeded() }

        const result = singleStepTestSteps.onlyTestedStep({ steps, stepNameToTest: 'http_1' })

        expect(Object.keys(result)).toEqual(['http_1'])
        expect(result.http_1).toBe(steps.http_1)
    })

    it('returns every step when the run is not a single-step test', () => {
        const steps = { trigger: succeeded(), http_1: succeeded() }

        expect(singleStepTestSteps.onlyTestedStep({ steps, stepNameToTest: undefined })).toBe(steps)
    })

    it('returns no steps when the tested step never produced an output', () => {
        const steps = { trigger: succeeded() }

        expect(singleStepTestSteps.onlyTestedStep({ steps, stepNameToTest: 'http_1' })).toEqual({})
    })
})
