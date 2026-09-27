import { isNil } from '@fema-ipaas/core-utils'
import { WorkflowTrigger, workflowStructureUtil } from '@fema-ipaas/shared'

function referencedConnectionIds(auth: unknown): string[] {
    if (typeof auth !== 'string') {
        return []
    }
    const match = auth.match(/{{connections\['([^']*(?:'\s*,\s*'[^']*)*)'\]}}/)
    if (isNil(match) || isNil(match[1])) {
        return []
    }
    return match[1].split(/'\s*,\s*'/).map((id) => id.trim()).filter((id) => id.length > 0)
}

function shouldClear({ auth, isAvailable }: { auth: unknown, isAvailable: (externalId: string) => boolean }): boolean {
    if (isNil(auth) || auth === '') {
        return false
    }
    const ids = referencedConnectionIds(auth)
    return ids.length === 0 ? typeof auth === 'string' && auth.includes('{{connections') : ids.some((id) => !isAvailable(id))
}

function cloneTrigger(trigger: WorkflowTrigger): WorkflowTrigger {
    return workflowTransferUtils.asTrigger({ original: trigger, candidate: JSON.parse(JSON.stringify(trigger)) })
}

function replaceExactStrings({ value, replacements }: { value: unknown, replacements: Map<string, string> }): unknown {
    if (typeof value === 'string') {
        return replacements.get(value) ?? value
    }
    if (Array.isArray(value)) {
        return value.map((item) => replaceExactStrings({ value: item, replacements }))
    }
    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceExactStrings({ value: item, replacements })]))
    }
    return value
}

export const workflowTransferUtils = {
    referencedConnectionIds,
    stripUnavailableConnections({ trigger, isAvailable }: StripParams): StripResult {
        const cleared = workflowStructureUtil.getAllSteps(trigger)
            .filter((step) => shouldClear({ auth: step.settings?.input?.auth, isAvailable }))
            .length
        if (cleared === 0) {
            return { trigger, cleared }
        }
        const stripped = workflowStructureUtil.transferStep(cloneTrigger(trigger), (step) => {
            const input = step.settings?.input
            if (isNil(input) || !shouldClear({ auth: input.auth, isAvailable })) {
                return step
            }
            const { auth: _auth, ...rest } = input
            return { ...step, settings: { ...step.settings, input: rest } }
        })
        return { trigger: workflowTransferUtils.asTrigger({ original: trigger, candidate: stripped }), cleared }
    },
    remapIds({ trigger, idMap }: { trigger: WorkflowTrigger, idMap: Map<string, string> }): WorkflowTrigger {
        if (idMap.size === 0) {
            return trigger
        }
        const remapped = workflowStructureUtil.transferStep(cloneTrigger(trigger), (step) => {
            const input = step.settings?.input
            if (isNil(input)) {
                return step
            }
            const nextInput = replaceExactStrings({ value: input, replacements: idMap })
            return { ...step, settings: { ...step.settings, input: nextInput } }
        })
        return workflowTransferUtils.asTrigger({ original: trigger, candidate: remapped })
    },
    collectConnectionIds(trigger: WorkflowTrigger): string[] {
        return workflowStructureUtil.getAllSteps(trigger).flatMap((step) => referencedConnectionIds(step.settings?.input?.auth))
    },
    clearSampleData(trigger: WorkflowTrigger): WorkflowTrigger {
        const cleaned = workflowStructureUtil.transferStep(cloneTrigger(trigger), (step) => {
            const sampleData = step.settings?.sampleData
            if (isNil(sampleData)) {
                return step
            }
            return {
                ...step,
                settings: {
                    ...step.settings,
                    sampleData: { ...sampleData, sampleDataFileId: undefined, sampleDataInputFileId: undefined, lastTestDate: undefined },
                },
            }
        })
        return workflowTransferUtils.asTrigger({ original: trigger, candidate: cleaned })
    },
    asTrigger({ original, candidate }: { original: WorkflowTrigger, candidate: unknown }): WorkflowTrigger {
        const parsed = WorkflowTrigger.safeParse(candidate)
        return parsed.success ? parsed.data : original
    },
}

type StripParams = {
    trigger: WorkflowTrigger
    isAvailable: (externalId: string) => boolean
}

type StripResult = {
    trigger: WorkflowTrigger
    cleared: number
}
