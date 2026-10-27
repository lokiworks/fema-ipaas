import { isNil } from '@fema-ipaas/core-utils'
import { StepOutput } from '@fema-ipaas/shared'

function onlyTestedStep({ steps, stepNameToTest }: OnlyTestedStepParams): Readonly<Record<string, StepOutput>> {
    if (isNil(stepNameToTest)) {
        return steps
    }
    const tested = steps[stepNameToTest]
    return isNil(tested) ? {} : { [stepNameToTest]: tested }
}

export const singleStepTestSteps = {
    onlyTestedStep,
}

type OnlyTestedStepParams = {
    steps: Readonly<Record<string, StepOutput>>
    stepNameToTest: string | undefined
}
