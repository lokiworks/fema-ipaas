import { WorkflowAction, workflowStructureUtil, WorkflowTrigger } from '@fema-ipaas/shared'

function hasContentChanges({ before, after }: { before: ComparableVersion, after: ComparableVersion }): boolean {
    if (before.displayName !== after.displayName) {
        return true
    }
    const beforeSteps = workflowStructureUtil.getAllSteps(before.trigger)
    const afterSteps = workflowStructureUtil.getAllSteps(after.trigger)
    if (beforeSteps.map((step) => step.name).join('|') !== afterSteps.map((step) => step.name).join('|')) {
        return true
    }
    const beforeByName = new Map(beforeSteps.map((step) => [step.name, step]))
    return afterSteps.some((step) => {
        const previous = beforeByName.get(step.name)
        return previous === undefined || signature(previous) !== signature(step)
    })
}

function signature(step: WorkflowTrigger | WorkflowAction): string {
    const { sampleData: _sampleData, displayNumber: _displayNumber, pendingReview: _pendingReview, ...settings } = readRecord(step.settings)
    return JSON.stringify(sortKeys({
        type: step.type,
        displayName: step.displayName,
        settings,
        skip: 'skip' in step ? step.skip : undefined,
    }))
}

function sortKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortKeys)
    }
    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
            Object.entries(value)
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => [key, sortKeys(child)]),
        )
    }
    return value
}

function readRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value))
        : {}
}

export const draftContentUtils = { hasContentChanges }

export type ComparableVersion = {
    displayName: string
    trigger: WorkflowTrigger
}
