import { BuiltinMaskDetector, MaskRuleType, PayloadLevel, privacyMasking } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { WorkflowActionType } from '../workflows/actions/action'
import { StepOutputType } from './state/step-output'

export const logRedaction = {
    redactSteps,
}

function redactSteps({ steps, privacy }: RedactStepsParams): RedactedSteps {
    return Object.entries(steps).reduce<RedactedSteps>((acc, [stepName, step]) => {
        const redacted = redactStep({ step, privacy })
        return { steps: { ...acc.steps, [stepName]: redacted.value }, maskedCount: acc.maskedCount + redacted.maskedCount }
    }, { steps: {}, maskedCount: 0 })
}

function redactStep({ step: raw, privacy }: { step: unknown, privacy: LogPrivacy }): Redacted {
    const parsed = LoggedStep.safeParse(raw)
    if (!parsed.success) {
        return { value: raw, maskedCount: 0 }
    }
    const step = parsed.data
    const error = redactError({ errorMessage: step.errorMessage, privacy })
    if (privacy.payloadLevel !== PayloadLevel.FULL) {
        return {
            value: { ...step, input: null, output: null, outputType: undefined, errorMessage: error.value },
            maskedCount: error.maskedCount,
        }
    }
    const input = privacyMasking.maskDeep({ value: step.input, rules: privacy.maskRules, maskAll: false })
    const output = redactOutput({ step, privacy })
    return {
        value: { ...step, input: input.value, output: output.value, outputType: output.outputType, errorMessage: error.value },
        maskedCount: input.maskedCount + output.maskedCount + error.maskedCount,
    }
}

function redactOutput({ step, privacy }: { step: LoggedStep, privacy: LogPrivacy }): RedactedOutput {
    if (step.outputType === StepOutputType.SLICE) {
        const ref = SliceRef.safeParse(step.output)
        const size = ref.success ? ref.data.size : 0
        return { value: `${OMITTED_OUTPUT_PREFIX}${Math.ceil(size / BYTES_PER_KB)} KB`, outputType: undefined, maskedCount: 1 }
    }
    const loop = step.type === WorkflowActionType.LOOP_ON_ITEMS ? LoopOutput.safeParse(step.output) : null
    if (loop?.success) {
        const item = privacyMasking.maskDeep({ value: loop.data.item, rules: privacy.maskRules, maskAll: false })
        const iterations = loop.data.iterations.map((iteration) => redactSteps({ steps: iteration, privacy }))
        return {
            value: { ...loop.data, item: item.value, iterations: iterations.map((iteration) => iteration.steps) },
            outputType: undefined,
            maskedCount: item.maskedCount + iterations.reduce((sum, iteration) => sum + iteration.maskedCount, 0),
        }
    }
    const masked = privacyMasking.maskDeep({ value: step.output, rules: privacy.maskRules, maskAll: false })
    return { value: masked.value, outputType: undefined, maskedCount: masked.maskedCount }
}

function redactError({ errorMessage, privacy }: { errorMessage: unknown, privacy: LogPrivacy }): Redacted {
    if (typeof errorMessage !== 'string') {
        return { value: errorMessage, maskedCount: 0 }
    }
    if (privacy.payloadLevel === PayloadLevel.NONE) {
        return { value: undefined, maskedCount: 0 }
    }
    const masked = maskText({ text: errorMessage, privacy })
    return { value: masked.value, maskedCount: masked.maskedCount }
}

function maskText({ text, privacy }: { text: string, privacy: LogPrivacy }): { value: string, maskedCount: number } {
    const words = text.split(WORD_SEPARATOR)
    const masked = words.map((word) => privacyMasking.maskDeep({ value: word, rules: privacy.maskRules, maskAll: false }))
    return {
        value: masked.map((part) => (typeof part.value === 'string' ? part.value : String(part.value))).join(''),
        maskedCount: masked.reduce((sum, part) => sum + part.maskedCount, 0),
    }
}

const BYTES_PER_KB = 1024
const WORD_SEPARATOR = /(\s+|[,;:"'()[\]{}<>，；：“”（）])/
const OMITTED_OUTPUT_PREFIX = 'Output hidden in the masked log. View the original to see it. Size: '

const LoggedStep = z.looseObject({
    type: z.string().optional(),
    input: z.unknown(),
    output: z.unknown(),
    outputType: z.string().optional(),
    errorMessage: z.unknown(),
})
type LoggedStep = z.infer<typeof LoggedStep>

const SliceRef = z.looseObject({ size: z.number() })

const LoopOutput = z.looseObject({
    item: z.unknown(),
    iterations: z.array(z.record(z.string(), z.unknown())),
})

export const LogPrivacy = z.object({
    payloadLevel: z.enum(PayloadLevel),
    maskRules: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(MaskRuleType),
        detector: z.enum(BuiltinMaskDetector).nullable(),
        pattern: z.string().nullable(),
        enabled: z.boolean(),
    })),
    displayLogsFileId: z.string(),
})
export type LogPrivacy = z.infer<typeof LogPrivacy>

type RedactStepsParams = {
    steps: Record<string, unknown>
    privacy: LogPrivacy
}

type Redacted = {
    value: unknown
    maskedCount: number
}

type RedactedOutput = Redacted & {
    outputType: undefined
}

export type RedactedSteps = {
    steps: Record<string, unknown>
    maskedCount: number
}
