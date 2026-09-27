import { ErasureSubjectKind, MASKED_PLACEHOLDER, StepOutputType } from '@fema-ipaas/shared'
import { z } from 'zod'

export const personalDataEraser = {
    normalize,
    hintOf,
    maskName,
    contains,
    eraseSteps,
    sliceRefs,
}

function normalize({ kind, value }: { kind: ErasureSubjectKind, value: string }): string {
    const trimmed = value.trim()
    return kind === ErasureSubjectKind.PHONE ? trimmed : trimmed.toLowerCase()
}

function hintOf({ kind, value }: { kind: ErasureSubjectKind, value: string }): string {
    switch (kind) {
        case ErasureSubjectKind.PHONE:
            return `${value.slice(0, 3)}****${value.slice(-4)}`
        case ErasureSubjectKind.EMAIL: {
            const [local, domain] = value.split('@')
            return `${local.slice(0, 1)}***@${domain ?? ''}`
        }
        case ErasureSubjectKind.EMPLOYEE_ID:
            return value.length <= 4 ? `${value.slice(0, 1)}***` : `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`
    }
}

function maskName(name: string | undefined): string | null {
    const trimmed = name?.trim() ?? ''
    if (trimmed.length === 0) {
        return null
    }
    return `${[...trimmed][0]}${'*'.repeat(Math.max(1, [...trimmed].length - 1))}`
}

function contains({ text, value }: { text: string, value: string }): boolean {
    return text.toLowerCase().includes(value.toLowerCase())
}

function eraseSteps({ steps, value, hitSliceFileIds }: EraseParams): ErasedSteps {
    return Object.entries(steps).reduce<ErasedSteps>((acc, [stepName, step]) => {
        const erased = eraseStep({ step, value, hitSliceFileIds })
        return { steps: { ...acc.steps, [stepName]: erased.value }, erased: acc.erased + erased.erased }
    }, { steps: {}, erased: 0 })
}

function sliceRefs(steps: Record<string, unknown>): SliceLocation[] {
    return Object.entries(steps).flatMap(([stepName, step]) => {
        const parsed = LoggedStep.safeParse(step)
        if (!parsed.success) {
            return []
        }
        const ref = SliceRef.safeParse(parsed.data.output)
        if (parsed.data.outputType === StepOutputType.SLICE && ref.success) {
            return [{ stepName, fileId: ref.data.fileId }]
        }
        const loop = LoopOutput.safeParse(parsed.data.output)
        return loop.success ? loop.data.iterations.flatMap(sliceRefs) : []
    })
}

function eraseStep({ step, value, hitSliceFileIds }: { step: unknown, value: string, hitSliceFileIds: ReadonlySet<string> }): { value: unknown, erased: number } {
    const parsed = LoggedStep.safeParse(step)
    if (!parsed.success) {
        return { value: step, erased: 0 }
    }
    const current = parsed.data
    const loop = LoopOutput.safeParse(current.output)
    const nested = loop.success ? loop.data.iterations.map((iteration) => eraseSteps({ steps: iteration, value, hitSliceFileIds })) : []
    const slice = current.outputType === StepOutputType.SLICE ? SliceRef.safeParse(current.output) : null
    const inputHit = contains({ text: JSON.stringify(current.input ?? null), value })
    const outputHit = slice?.success
        ? hitSliceFileIds.has(slice.data.fileId)
        : !loop.success && contains({ text: JSON.stringify(current.output ?? null), value })
    const errorHit = typeof current.errorMessage === 'string' && contains({ text: current.errorMessage, value })
    const nestedErased = nested.reduce((sum, iteration) => sum + iteration.erased, 0)
    if (!inputHit && !outputHit && !errorHit && nestedErased === 0) {
        return { value: step, erased: 0 }
    }
    return {
        value: {
            ...current,
            input: inputHit ? null : current.input,
            output: loop.success ? { ...loop.data, iterations: nested.map((iteration) => iteration.steps) } : outputHit ? null : current.output,
            outputType: outputHit ? undefined : current.outputType,
            errorMessage: errorHit && typeof current.errorMessage === 'string' ? replaceAll({ text: current.errorMessage, value }) : current.errorMessage,
            personalDataErased: true,
        },
        erased: 1 + nestedErased,
    }
}

function replaceAll({ text, value }: { text: string, value: string }): string {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return text.replace(new RegExp(escaped, 'gi'), MASKED_PLACEHOLDER)
}

const LoggedStep = z.looseObject({
    input: z.unknown(),
    output: z.unknown(),
    outputType: z.string().optional(),
    errorMessage: z.unknown(),
})

const SliceRef = z.looseObject({ fileId: z.string() })

const LoopOutput = z.looseObject({
    iterations: z.array(z.record(z.string(), z.unknown())),
})

type EraseParams = {
    steps: Record<string, unknown>
    value: string
    hitSliceFileIds: ReadonlySet<string>
}

export type ErasedSteps = {
    steps: Record<string, unknown>
    erased: number
}

export type SliceLocation = {
    stepName: string
    fileId: string
}
