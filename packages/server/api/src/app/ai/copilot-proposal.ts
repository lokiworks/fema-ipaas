import {
    CopilotChange,
    CopilotChangeKind,
    CopilotProposal,
    isNil,
    Step,
    StepLocationRelativeToParent,
    tryCatchSync,
    UpdateActionRequest,
    WorkflowAction,
    WorkflowActionType,
    WorkflowOperationRequest,
    workflowOperations,
    WorkflowOperationType,
    workflowStructureUtil,
    WorkflowTriggerType,
    WorkflowVersion,
} from '@fema-ipaas/shared'
import { z } from 'zod'

function parseDraft(text: string): ProposalDraft | null {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) {
        return null
    }
    const { data } = tryCatchSync(() => JSON.parse(text.slice(start, end + 1)))
    const parsed = ProposalDraft.safeParse(data)
    return parsed.success ? parsed.data : null
}

function build({ draft, version, catalog, connectorVersions, connections }: BuildParams): CopilotProposal {
    const initial: ProposalState = {
        version,
        operations: [],
        changes: [],
        affected: [],
        rejected: [],
    }
    const result = draft.changes.reduce<ProposalState>((state, change) => {
        const planned = planChange({ change, version: state.version, catalog, connectorVersions, connections })
        if ('reason' in planned) {
            return { ...state, rejected: [...state.rejected, planned.reason] }
        }
        const applied = tryCatchSync(() => planned.operations.reduce(
            (current, operation) => workflowOperations.apply(current, operation),
            state.version,
        ))
        if (!isNil(applied.error) || isNil(applied.data)) {
            return { ...state, rejected: [...state.rejected, `${describe(change)}: ${String(applied.error)}`] }
        }
        return {
            version: applied.data,
            operations: [...state.operations, ...planned.operations],
            changes: [...state.changes, planned.change],
            affected: planned.change.kind === CopilotChangeKind.DELETE_STEP ? state.affected : [...state.affected, planned.change.stepName],
            rejected: state.rejected,
        }
    }, initial)
    const deleted = result.changes
        .filter((change) => change.kind === CopilotChangeKind.DELETE_STEP)
        .map((change) => change.stepName)
    return {
        summary: draft.summary,
        changes: result.changes,
        operations: result.operations,
        affectedStepNames: [...new Set([...result.affected, ...deleted])],
        rejected: result.rejected,
        unsupported: draft.unsupported ?? null,
    }
}

function planChange({ change, version, catalog, connectorVersions, connections }: PlanChangeParams): PlannedChange | RejectedChange {
    switch (change.type) {
        case 'ADD_STEP':
            return planAdd({ change, version, catalog, connectorVersions, connections })
        case 'UPDATE_INPUT':
            return planUpdateInput({ change, version, catalog })
        case 'DELETE_STEP':
            return planDelete({ change, version })
        case 'RENAME_STEP':
            return planRename({ change, version })
    }
}

function planAdd({ change, version, catalog, connectorVersions, connections }: {
    change: AddDraft
    version: WorkflowVersion
    catalog: CatalogConnector[]
    connectorVersions: Map<string, string>
    connections: ConnectionOption[]
}): PlannedChange | RejectedChange {
    const parent = workflowStructureUtil.getStep(change.after, version.trigger)
    if (isNil(parent)) {
        return { reason: `${describe(change)}: step ${change.after} does not exist` }
    }
    const connector = catalog.find((candidate) => candidate.name === change.connector)
    const operation = connector?.suggestedActions?.find((candidate) => candidate.name === change.action)
    const connectorVersion = connectorVersions.get(change.connector)
    if (isNil(connector) || isNil(operation) || isNil(connectorVersion)) {
        return { reason: `${describe(change)}: ${change.connector} / ${change.action} is not available in this project` }
    }
    const name = workflowStructureUtil.findUnusedName(version.trigger)
    const displayName = clipName(change.displayName.trim().length > 0 ? change.displayName : operation.displayName)
    const input = Object.fromEntries(Object.entries(change.input ?? {}).filter(([key]) => key !== AUTH_PROPERTY && key in operation.props))
    const connection = isNil(connector.auth) ? undefined : connections.find((candidate) => candidate.connectorName === connector.name)
    const operationRequest: WorkflowOperationRequest = {
        type: WorkflowOperationType.ADD_ACTION,
        request: {
            parentStep: parent.name,
            stepLocationRelativeToParent: StepLocationRelativeToParent.AFTER,
            action: {
                name,
                type: WorkflowActionType.CONNECTOR,
                displayName,
                valid: false,
                settings: {
                    connectorName: connector.name,
                    connectorVersion,
                    actionName: operation.name,
                    input: isNil(connection) ? input : { ...input, auth: `{{connections['${connection.externalId}']}}` },
                    propertySettings: {},
                    errorHandlingOptions: { continueOnFailure: { value: false }, retryOnFailure: { value: false } },
                    pendingReview: true,
                },
            },
        },
    }
    return {
        operations: [operationRequest],
        change: { kind: CopilotChangeKind.ADD_STEP, stepName: name, displayName, detail: `${connector.displayName} · ${operation.displayName}` },
    }
}

function planUpdateInput({ change, version, catalog }: {
    change: UpdateInputDraft
    version: WorkflowVersion
    catalog: CatalogConnector[]
}): PlannedChange | RejectedChange {
    const step = workflowStructureUtil.getStep(change.step, version.trigger)
    if (isNil(step) || step.type !== WorkflowActionType.CONNECTOR) {
        return { reason: `${describe(change)}: only inputs of app steps can be changed` }
    }
    const operation = catalog
        .find((candidate) => candidate.name === step.settings.connectorName)
        ?.suggestedActions?.find((candidate) => candidate.name === step.settings.actionName)
    const allowed = Object.entries(change.input).filter(([key]) => key !== AUTH_PROPERTY && !isNil(operation) && key in operation.props)
    if (allowed.length === 0) {
        return { reason: `${describe(change)}: none of the fields exist on this step` }
    }
    const request = actionRequest({
        step,
        displayName: step.displayName,
        input: { ...step.settings.input, ...Object.fromEntries(allowed) },
    })
    return {
        operations: [{ type: WorkflowOperationType.UPDATE_ACTION, request }],
        change: { kind: CopilotChangeKind.UPDATE_INPUT, stepName: step.name, displayName: step.displayName, detail: allowed.map(([key]) => operation?.props[key]?.displayName ?? key).join(', ') },
    }
}

function planDelete({ change, version }: { change: DeleteDraft, version: WorkflowVersion }): PlannedChange | RejectedChange {
    const step = workflowStructureUtil.getStep(change.step, version.trigger)
    if (isNil(step) || workflowStructureUtil.isTrigger(step.type)) {
        return { reason: `${describe(change)}: the step does not exist or is the trigger` }
    }
    return {
        operations: [{ type: WorkflowOperationType.DELETE_ACTION, request: { names: [step.name] } }],
        change: { kind: CopilotChangeKind.DELETE_STEP, stepName: step.name, displayName: step.displayName, detail: '' },
    }
}

function planRename({ change, version }: { change: RenameDraft, version: WorkflowVersion }): PlannedChange | RejectedChange {
    const step = workflowStructureUtil.getStep(change.step, version.trigger)
    const displayName = clipName(change.displayName.trim())
    if (isNil(step) || displayName.length === 0) {
        return { reason: `${describe(change)}: the step does not exist or the name is empty` }
    }
    const operation = renameOperation({ step, displayName })
    if (isNil(operation)) {
        return { reason: `${describe(change)}: this step cannot be renamed` }
    }
    return {
        operations: [operation],
        change: { kind: CopilotChangeKind.RENAME_STEP, stepName: step.name, displayName, detail: step.displayName },
    }
}

function renameOperation({ step, displayName }: { step: Step, displayName: string }): WorkflowOperationRequest | null {
    if (step.type === WorkflowTriggerType.EMPTY) {
        return null
    }
    if (step.type === WorkflowTriggerType.CONNECTOR) {
        const { nextAction: _nextAction, lastUpdatedDate: _date, ...trigger } = step
        return {
            type: WorkflowOperationType.UPDATE_TRIGGER,
            request: { ...trigger, displayName, settings: { ...trigger.settings, pendingReview: true } },
        }
    }
    return { type: WorkflowOperationType.UPDATE_ACTION, request: actionRequest({ step, displayName, input: undefined }) }
}

function actionRequest({ step, displayName, input }: { step: WorkflowAction, displayName: string, input: Record<string, unknown> | undefined }): UpdateActionRequest {
    const base = { name: step.name, displayName, valid: step.valid, skip: step.skip }
    switch (step.type) {
        case WorkflowActionType.CONNECTOR:
            return { ...base, type: step.type, settings: { ...step.settings, input: input ?? step.settings.input, pendingReview: true } }
        case WorkflowActionType.CODE:
            return { ...base, type: step.type, settings: { ...step.settings, pendingReview: true } }
        case WorkflowActionType.COMPONENT:
            return { ...base, type: step.type, settings: { ...step.settings, pendingReview: true } }
        case WorkflowActionType.LOOP_ON_ITEMS:
            return { ...base, type: step.type, settings: { ...step.settings, pendingReview: true } }
        case WorkflowActionType.ROUTER:
            return { ...base, type: step.type, settings: { ...step.settings, pendingReview: true } }
        case WorkflowActionType.PARALLEL:
            return { ...base, type: step.type, settings: { ...step.settings, pendingReview: true } }
    }
}

function describe(change: ChangeDraft): string {
    switch (change.type) {
        case 'ADD_STEP':
            return `Add ${change.connector}/${change.action} after ${change.after}`
        case 'UPDATE_INPUT':
            return `Update ${change.step}`
        case 'DELETE_STEP':
            return `Delete ${change.step}`
        case 'RENAME_STEP':
            return `Rename ${change.step}`
    }
}

function clipName(name: string): string {
    return name.slice(0, MAX_NAME_LENGTH)
}

export const copilotProposal = {
    parseDraft,
    build,
}

const AUTH_PROPERTY = 'auth'
const MAX_NAME_LENGTH = 100
const MAX_CHANGES = 10

const AddDraft = z.object({
    type: z.literal('ADD_STEP'),
    after: z.string(),
    connector: z.string(),
    action: z.string(),
    displayName: z.string().default(''),
    input: z.record(z.string(), z.unknown()).optional(),
})
type AddDraft = z.infer<typeof AddDraft>

const UpdateInputDraft = z.object({
    type: z.literal('UPDATE_INPUT'),
    step: z.string(),
    input: z.record(z.string(), z.unknown()),
})
type UpdateInputDraft = z.infer<typeof UpdateInputDraft>

const DeleteDraft = z.object({
    type: z.literal('DELETE_STEP'),
    step: z.string(),
})
type DeleteDraft = z.infer<typeof DeleteDraft>

const RenameDraft = z.object({
    type: z.literal('RENAME_STEP'),
    step: z.string(),
    displayName: z.string(),
})
type RenameDraft = z.infer<typeof RenameDraft>

const ChangeDraft = z.discriminatedUnion('type', [AddDraft, UpdateInputDraft, DeleteDraft, RenameDraft])
type ChangeDraft = z.infer<typeof ChangeDraft>

const ProposalDraft = z.object({
    summary: z.string().default(''),
    unsupported: z.string().nullish(),
    changes: z.array(ChangeDraft).max(MAX_CHANGES).default([]),
})

export type ProposalDraft = z.infer<typeof ProposalDraft>

export type CatalogConnector = {
    name: string
    displayName: string
    auth?: unknown
    suggestedActions?: {
        name: string
        displayName: string
        props: Record<string, { displayName: string }>
    }[]
}

export type ConnectionOption = {
    externalId: string
    connectorName: string
}

type BuildParams = {
    draft: ProposalDraft
    version: WorkflowVersion
    catalog: CatalogConnector[]
    connectorVersions: Map<string, string>
    connections: ConnectionOption[]
}

type PlanChangeParams = Omit<BuildParams, 'draft'> & {
    change: ChangeDraft
}

type PlannedChange = {
    operations: WorkflowOperationRequest[]
    change: CopilotChange
}

type RejectedChange = {
    reason: string
}

type ProposalState = {
    version: WorkflowVersion
    operations: WorkflowOperationRequest[]
    changes: CopilotChange[]
    affected: string[]
    rejected: string[]
}
