import { isNil, PlanRemovedStep, WorkflowPlanStep, workflowPlanUtils } from '@fema-ipaas/shared'
import { aiReferences } from './ai-references'

export const aiPlanSteps = {
    resolve,
    assemble,
}

function assemble({ trigger, steps, catalog, connections, excluded = [] }: AssembleParams): AssembledSteps {
    const resolvedTrigger = resolve({ step: trigger, catalog, connections, kind: 'trigger' })
    const excludedKeys = new Set(excluded)
    const resolvedSteps = steps.map((step) => resolve({ step, catalog, connections, kind: 'action' }))
    const isExcluded = (step: WorkflowPlanStep): boolean => excludedKeys.has(workflowPlanUtils.stepKey(step))
    const kept = resolvedSteps.flatMap((step, index) => (isNil(step) || isExcluded(step) ? [] : [{ step, original: index + 1 }]))
    const indexMap = new Map(kept.map((entry, position) => [entry.original, position + 1]))
    const droppedIndexes = resolvedSteps.flatMap((step, index) => (isNil(step) || isExcluded(step) ? [index + 1] : []))
    return {
        trigger: resolvedTrigger,
        steps: kept.map(({ step }) => ({ ...step, input: renumberInput({ input: step.input, indexMap }) })),
        omittedSteps: resolvedSteps.filter((step) => isNil(step)).length,
        removedSteps: resolvedSteps.flatMap((step): PlanRemovedStep[] => (!isNil(step) && isExcluded(step) ? [{ key: workflowPlanUtils.stepKey(step), displayName: step.displayName }] : [])),
        brokenReferences: kept.filter(({ step }) => droppedIndexes.some((index) => aiReferences.referencesStep({ value: step.input, index }))).map(({ step }) => step.displayName),
    }
}

function renumberInput({ input, indexMap }: { input: Record<string, unknown>, indexMap: Map<number, number> }): Record<string, unknown> {
    return Object.fromEntries(Object.entries(input).map(([name, value]) => [name, aiReferences.renumber({ value, indexMap })]))
}

function resolve({ step, catalog, connections, kind }: ResolveParams): WorkflowPlanStep | null {
    const connector = catalog.find((candidate) => candidate.name === step.connector)
    const operations = kind === 'trigger' ? connector?.suggestedTriggers : connector?.suggestedActions
    const operation = operations?.find((candidate) => candidate.name === step.name)
    if (isNil(connector) || isNil(operation)) {
        return null
    }
    const requiresConnection = !isNil(connector.auth)
    const connection = requiresConnection ? connections.find((candidate) => candidate.connectorName === connector.name) : undefined
    return {
        connectorName: connector.name,
        connectorDisplayName: connector.displayName,
        operationName: operation.name,
        operationDisplayName: operation.displayName,
        displayName: (step.displayName.trim().length > 0 ? step.displayName : operation.displayName).slice(0, MAX_NAME_LENGTH),
        input: Object.fromEntries(Object.entries(step.input ?? {}).filter(([name]) => name !== 'auth' && name in operation.props).map(([name, value]) => [name, aiReferences.canonicalize(value)])),
        requiresConnection,
        connectionExternalId: connection?.externalId ?? null,
        connectionDisplayName: connection?.displayName ?? null,
    }
}

export const MAX_NAME_LENGTH = 120

export type CatalogOperation = {
    name: string
    displayName: string
    props: Record<string, unknown>
}

export type CatalogEntry = {
    name: string
    displayName: string
    auth?: unknown
    suggestedTriggers?: CatalogOperation[] | undefined
    suggestedActions?: CatalogOperation[] | undefined
}

export type StepDraft = {
    connector: string
    name: string
    displayName: string
    input?: Record<string, unknown> | undefined
}

export type ConnectionRef = {
    externalId: string
    connectorName: string
    displayName: string
}

export type AssembledSteps = {
    trigger: WorkflowPlanStep | null
    steps: WorkflowPlanStep[]
    omittedSteps: number
    removedSteps: PlanRemovedStep[]
    brokenReferences: string[]
}

type AssembleParams = {
    trigger: StepDraft
    steps: StepDraft[]
    catalog: CatalogEntry[]
    connections: ConnectionRef[]
    excluded?: string[] | undefined
}

type ResolveParams = {
    step: StepDraft
    catalog: CatalogEntry[]
    connections: ConnectionRef[]
    kind: 'trigger' | 'action'
}
