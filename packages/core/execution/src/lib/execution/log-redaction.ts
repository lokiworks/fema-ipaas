import { BuiltinMaskDetector, MASKED_PLACEHOLDER, MaskRuleType, PayloadLevel, privacyMasking } from '@fema-ipaas/core-utils'
import { z } from 'zod'
import { WorkflowActionType } from '../workflows/actions/action'
import { errorSanitizer } from './error-sanitizer'
import { StepOutputType } from './state/step-output'

export const logRedaction = {
    redactSteps,
}

function redactSteps({ steps, privacy }: RedactStepsParams): RedactedSteps {
    const sensitive = new Set(privacy.sensitiveStepNames ?? [])
    const literals = sensitive.size === 0 ? [] : sensitiveLiterals({ steps, sensitive })
    return redactStepMap({ steps, privacy, sensitive, literals })
}

function redactStepMap({ steps, privacy, sensitive, literals }: RedactStepMapParams): RedactedSteps {
    return Object.entries(steps).reduce<RedactedSteps>((acc, [stepName, step]) => {
        const redacted = redactStep({ step, privacy, sensitive, literals, isSensitive: sensitive.has(stepName) })
        return { steps: { ...acc.steps, [stepName]: redacted.value }, maskedCount: acc.maskedCount + redacted.maskedCount }
    }, { steps: {}, maskedCount: 0 })
}

function redactStep({ step: raw, privacy, sensitive, literals, isSensitive }: RedactStepParams): Redacted {
    const parsed = LoggedStep.safeParse(raw)
    if (!parsed.success) {
        return { value: raw, maskedCount: 0 }
    }
    const step = parsed.data
    const error = redactError({ errorMessage: step.errorMessage, privacy, literals })
    if (privacy.payloadLevel !== PayloadLevel.FULL) {
        return {
            value: { ...step, input: null, output: null, outputType: undefined, errorMessage: error.value },
            maskedCount: error.maskedCount,
        }
    }
    const input = scrubLiterals({ masked: privacyMasking.maskDeep({ value: step.input, rules: privacy.maskRules, maskAll: false }), literals })
    const output = redactOutput({ step, privacy, sensitive, literals, isSensitive })
    return {
        value: { ...step, input: input.value, output: output.value, outputType: output.outputType, errorMessage: error.value },
        maskedCount: input.maskedCount + output.maskedCount + error.maskedCount,
    }
}

function redactOutput({ step, privacy, sensitive, literals, isSensitive }: RedactOutputParams): RedactedOutput {
    if (step.outputType === StepOutputType.SLICE) {
        const ref = SliceRef.safeParse(step.output)
        const size = ref.success ? ref.data.size : 0
        return { value: `${OMITTED_OUTPUT_PREFIX}${Math.ceil(size / BYTES_PER_KB)} KB`, outputType: undefined, maskedCount: 1 }
    }
    const loop = step.type === WorkflowActionType.LOOP_ON_ITEMS ? LoopOutput.safeParse(step.output) : null
    if (loop?.success) {
        const item = scrubLiterals({ masked: privacyMasking.maskDeep({ value: loop.data.item, rules: privacy.maskRules, maskAll: false }), literals })
        const iterations = loop.data.iterations.map((iteration) => redactStepMap({ steps: iteration, privacy, sensitive, literals }))
        return {
            value: { ...loop.data, item: item.value, iterations: iterations.map((iteration) => iteration.steps) },
            outputType: undefined,
            maskedCount: item.maskedCount + iterations.reduce((sum, iteration) => sum + iteration.maskedCount, 0),
        }
    }
    const masked = scrubLiterals({ masked: privacyMasking.maskDeep({ value: step.output, rules: privacy.maskRules, maskAll: isSensitive }), literals })
    return { value: masked.value, outputType: undefined, maskedCount: masked.maskedCount }
}

function redactError({ errorMessage, privacy, literals }: { errorMessage: unknown, privacy: LogPrivacy, literals: string[] }): Redacted {
    if (typeof errorMessage !== 'string') {
        return { value: errorMessage, maskedCount: 0 }
    }
    if (privacy.payloadLevel === PayloadLevel.NONE) {
        return { value: undefined, maskedCount: 0 }
    }
    const masked = privacyMasking.maskText({ text: errorSanitizer.stripLocalDetails({ text: errorMessage }), rules: privacy.maskRules })
    return scrubLiterals({ masked, literals })
}

function sensitiveLiterals({ steps, sensitive }: { steps: Record<string, unknown>, sensitive: ReadonlySet<string> }): string[] {
    const found = Object.entries(steps).flatMap(([stepName, step]) => {
        const parsed = LoggedStep.safeParse(step)
        if (!parsed.success) {
            return []
        }
        const loop = parsed.data.type === WorkflowActionType.LOOP_ON_ITEMS ? LoopOutput.safeParse(parsed.data.output) : null
        const nested = loop?.success ? loop.data.iterations.flatMap((iteration) => sensitiveLiterals({ steps: iteration, sensitive })) : []
        const own = sensitive.has(stepName) && parsed.data.outputType !== StepOutputType.SLICE ? leafValues({ value: parsed.data.output }) : []
        return [...own, ...nested]
    })
    return [...new Set(found)].sort((a, b) => b.length - a.length)
}

function leafValues({ value }: { value: unknown }): string[] {
    if (Array.isArray(value)) {
        return value.flatMap((item) => leafValues({ value: item }))
    }
    if (typeof value === 'object' && value !== null) {
        return Object.values(value).flatMap((item) => leafValues({ value: item }))
    }
    if (typeof value === 'string' || typeof value === 'number') {
        const text = String(value)
        return text.length >= MIN_LITERAL_LENGTH ? [text] : []
    }
    return []
}

function scrubLiterals({ masked, literals }: { masked: Redacted, literals: string[] }): Redacted {
    if (literals.length === 0) {
        return masked
    }
    const scrubbed = scrubValue({ value: masked.value, literals })
    return { value: scrubbed.value, maskedCount: masked.maskedCount + scrubbed.maskedCount }
}

function scrubValue({ value, literals }: { value: unknown, literals: string[] }): Redacted {
    if (Array.isArray(value)) {
        return value.reduce<Redacted>((acc, item) => {
            const child = scrubValue({ value: item, literals })
            return { value: [...(Array.isArray(acc.value) ? acc.value : []), child.value], maskedCount: acc.maskedCount + child.maskedCount }
        }, { value: [], maskedCount: 0 })
    }
    if (typeof value === 'object' && value !== null) {
        return Object.entries(value).reduce<Redacted>((acc, [key, item]) => {
            const child = scrubValue({ value: item, literals })
            return { value: { ...(typeof acc.value === 'object' && acc.value !== null ? acc.value : {}), [key]: child.value }, maskedCount: acc.maskedCount + child.maskedCount }
        }, { value: {}, maskedCount: 0 })
    }
    if (typeof value === 'number') {
        return literals.includes(String(value)) ? { value: MASKED_PLACEHOLDER, maskedCount: 1 } : { value, maskedCount: 0 }
    }
    if (typeof value !== 'string') {
        return { value, maskedCount: 0 }
    }
    return literals.reduce<{ value: string, maskedCount: number }>((acc, literal) => {
        const parts = acc.value.split(literal)
        return parts.length === 1 ? acc : { value: parts.join(MASKED_PLACEHOLDER), maskedCount: acc.maskedCount + parts.length - 1 }
    }, { value, maskedCount: 0 })
}

const BYTES_PER_KB = 1024
const MIN_LITERAL_LENGTH = 4
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
    sensitiveStepNames: z.array(z.string()).optional(),
})
export type LogPrivacy = z.infer<typeof LogPrivacy>

type RedactStepsParams = {
    steps: Record<string, unknown>
    privacy: LogPrivacy
}

type RedactStepMapParams = RedactStepsParams & {
    sensitive: ReadonlySet<string>
    literals: string[]
}

type RedactStepParams = Omit<RedactStepMapParams, 'steps'> & {
    step: unknown
    isSensitive: boolean
}

type RedactOutputParams = Omit<RedactStepMapParams, 'steps'> & {
    step: LoggedStep
    isSensitive: boolean
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
