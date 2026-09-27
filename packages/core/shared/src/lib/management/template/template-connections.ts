import { isNil } from '@fema-ipaas/core-utils'
import { Step, WorkflowActionType, workflowStructureUtil, WorkflowTrigger, WorkflowTriggerType } from '@fema-ipaas/workflow-core'

export const templateConnectionUtils = {
    stripTrigger(trigger: WorkflowTrigger): WorkflowTrigger {
        const cloned: WorkflowTrigger = JSON.parse(JSON.stringify(trigger))
        const nextAction = isNil(cloned.nextAction) ? cloned.nextAction : workflowStructureUtil.transferStep(cloned.nextAction, stripStep)
        if (cloned.type === WorkflowTriggerType.CONNECTOR) {
            return {
                ...cloned,
                nextAction,
                settings: { ...cloned.settings, input: stripInput(cloned.settings.input) },
            }
        }
        return { ...cloned, nextAction }
    },
    stripInput,
    hasConnectionReference(value: unknown): boolean {
        if (typeof value === 'string') {
            return CONNECTION_REFERENCE.test(value)
        }
        if (Array.isArray(value)) {
            return value.some((item) => templateConnectionUtils.hasConnectionReference(item))
        }
        if (isRecord(value)) {
            return Object.values(value).some((item) => templateConnectionUtils.hasConnectionReference(item))
        }
        return false
    },
}

function stripStep(step: Step): Step {
    switch (step.type) {
        case WorkflowActionType.CONNECTOR:
            return { ...step, settings: { ...step.settings, input: stripInput(step.settings.input) } }
        case WorkflowActionType.COMPONENT:
            return { ...step, settings: { ...step.settings, input: stripInput(step.settings.input) } }
        case WorkflowActionType.CODE:
            return { ...step, settings: { ...step.settings, input: stripInput(step.settings.input) } }
        default:
            return step
    }
}

function stripInput(input: Record<string, unknown>): Record<string, unknown> {
    if (isNil(input)) {
        return input
    }
    return Object.fromEntries(
        Object.entries(input)
            .filter(([key]) => key !== AUTH_INPUT_KEY)
            .map(([key, value]) => [key, stripValue(value)])
            .filter(([, value]) => value !== undefined),
    )
}

function stripValue(value: unknown): unknown {
    if (typeof value === 'string') {
        const stripped = value.replace(CONNECTION_REFERENCE_GLOBAL, '')
        return stripped === '' && value !== '' ? undefined : stripped
    }
    if (Array.isArray(value)) {
        return value.map((item) => stripValue(item)).filter((item) => item !== undefined)
    }
    if (isRecord(value)) {
        return stripInput(value)
    }
    return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const AUTH_INPUT_KEY = 'auth'
const CONNECTION_REFERENCE = /\{\{\s*connections\s*(\[|\.)[^}]*\}\}/
const CONNECTION_REFERENCE_GLOBAL = /\{\{\s*connections\s*(\[|\.)[^}]*\}\}/g
