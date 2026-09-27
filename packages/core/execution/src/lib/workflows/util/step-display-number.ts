import { isNil } from '@fema-ipaas/core-utils'
import { WorkflowActionType } from '../actions/action'
import { WorkflowTrigger, WorkflowTriggerType } from '../triggers/trigger'
import { Step, workflowStructureUtil } from './workflow-structure-util'

function prefixOf(step: Step): string {
    switch (step.type) {
        case WorkflowTriggerType.EMPTY:
            return 'trigger'
        case WorkflowTriggerType.CONNECTOR:
            return `${connectorSlug(step.settings.connectorName)}-trigger`
        case WorkflowActionType.ROUTER:
        case WorkflowActionType.PARALLEL:
            return 'branch'
        case WorkflowActionType.LOOP_ON_ITEMS:
            return 'loop'
        case WorkflowActionType.CODE:
            return 'script'
        case WorkflowActionType.COMPONENT:
            return slug(step.settings.componentType) || 'component'
        case WorkflowActionType.CONNECTOR: {
            if (step.settings.connectorName === AI_CONNECTOR && step.settings.actionName === AGENT_ACTION) {
                return 'agent'
            }
            return connectorSlug(step.settings.connectorName)
        }
    }
}

function numberOf({ displayNumber, prefix }: { displayNumber: string | undefined, prefix: string }): number {
    if (isNil(displayNumber) || !displayNumber.startsWith(`${prefix}-`)) {
        return 0
    }
    const value = Number(displayNumber.slice(prefix.length + 1))
    return Number.isInteger(value) && value > 0 ? value : 0
}

function computeNumbers(trigger: WorkflowTrigger): Record<string, string> {
    const steps = workflowStructureUtil.getAllSteps(trigger).map((step) => ({
        name: step.name,
        prefix: prefixOf(step),
        displayNumber: readDisplayNumber(step),
    }))
    const highest = steps.reduce<Record<string, number>>((acc, step) => ({
        ...acc,
        [step.prefix]: Math.max(acc[step.prefix] ?? 0, numberOf(step)),
    }), {})
    const initial: NumberingState = { next: highest, seen: [], numbers: {} }
    const result = steps.reduce<NumberingState>((state, step) => {
        const keep = numberOf(step) > 0 && !isNil(step.displayNumber) && !state.seen.includes(step.displayNumber)
        if (keep && !isNil(step.displayNumber)) {
            return {
                next: state.next,
                seen: [...state.seen, step.displayNumber],
                numbers: { ...state.numbers, [step.name]: step.displayNumber },
            }
        }
        const nextValue = (state.next[step.prefix] ?? 0) + 1
        const assigned = `${step.prefix}-${nextValue}`
        return {
            next: { ...state.next, [step.prefix]: nextValue },
            seen: [...state.seen, assigned],
            numbers: { ...state.numbers, [step.name]: assigned },
        }
    }, initial)
    return result.numbers
}

function assign(trigger: WorkflowTrigger): WorkflowTrigger {
    const numbers = computeNumbers(trigger)
    const cloned: WorkflowTrigger = JSON.parse(JSON.stringify(trigger))
    const transferred = workflowStructureUtil.transferStep<Step>(cloned, (step) => {
        const displayNumber = numbers[step.name]
        if (isNil(displayNumber) || readDisplayNumber(step) === displayNumber || step.type === WorkflowTriggerType.EMPTY) {
            return step
        }
        step.settings.displayNumber = displayNumber
        return step
    })
    return toTrigger(transferred) ?? trigger
}

function toTrigger(step: Step): WorkflowTrigger | null {
    if (step.type === WorkflowTriggerType.CONNECTOR || step.type === WorkflowTriggerType.EMPTY) {
        return step
    }
    return null
}

function readDisplayNumber(step: Step): string | undefined {
    if (step.type === WorkflowTriggerType.EMPTY) {
        return undefined
    }
    return step.settings.displayNumber
}

function connectorSlug(connectorName: string): string {
    const withoutScope = connectorName.includes('/') ? connectorName.slice(connectorName.lastIndexOf('/') + 1) : connectorName
    const withoutPrefix = withoutScope.startsWith(CONNECTOR_PREFIX) ? withoutScope.slice(CONNECTOR_PREFIX.length) : withoutScope
    return slug(withoutPrefix) || 'action'
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export const stepDisplayNumberUtil = {
    prefixOf,
    computeNumbers,
    assign,
}

const AI_CONNECTOR = '@fema-ipaas/connector-ai'
const AGENT_ACTION = 'run_agent'
const CONNECTOR_PREFIX = 'connector-'

type NumberingState = {
    next: Record<string, number>
    seen: string[]
    numbers: Record<string, string>
}
