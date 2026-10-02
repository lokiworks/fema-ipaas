import { isNil } from '@fema-ipaas/core-utils'
import {
    SOLUTION_PACKAGE_FORMAT,
    SOLUTION_PACKAGE_VERSION,
    SolutionCheck,
    SolutionCheckKind,
    SolutionConfigItem,
    SolutionConnectionSlot,
    SolutionMappingTable,
    SolutionPackage,
    solutionUtils,
    SolutionWorkflow,
    workflowStructureUtil,
    WorkflowTrigger,
} from '@fema-ipaas/shared'
import { workflowTransferUtils } from '../project-workspace/workflow-transfer-utils'

export const solutionPackageUtils = {
    buildPackage,
    instantiate,
    connectorSlots,
    sanitizeTrigger,
}

function buildPackage({ workflows, tables, manualChecks }: BuildPackageParams): SolutionPackage {
    const tableKeyById = new Map(tables.map((table) => [table.id, table.key]))
    const sanitized = workflows.map((workflow): SolutionWorkflow => ({
        ...workflow,
        trigger: sanitizeTrigger({ trigger: workflow.trigger, tableKeyById }),
    }))
    const usedTableKeys = new Set(sanitized.flatMap((workflow) => referencedTableKeys(workflow.trigger)))
    const slots = connectorSlots({ workflows: workflows.map((workflow) => ({ key: workflow.key, trigger: workflow.trigger })) })
    return {
        format: SOLUTION_PACKAGE_FORMAT,
        version: SOLUTION_PACKAGE_VERSION,
        connections: slots,
        workflows: sanitized,
        mappingTables: tables.filter((table) => usedTableKeys.has(table.key)).map(({ id: _id, ...table }) => table),
        config: [],
        checks: [
            ...slots.map((slot): SolutionCheck => ({
                key: `connection:${slot.connectorName}`,
                label: `Connection for ${slot.connectorName} works`,
                kind: SolutionCheckKind.CONNECTION,
                blocking: true,
                connectorName: slot.connectorName,
                fixSteps: [],
            })),
            ...manualChecks.map((check, index): SolutionCheck => ({
                key: `manual:${index + 1}`,
                label: check.label,
                kind: SolutionCheckKind.MANUAL,
                blocking: false,
                detail: check.detail,
                who: check.who,
                fixSteps: [],
            })),
        ],
    }
}

function sanitizeTrigger({ trigger, tableKeyById }: { trigger: WorkflowTrigger, tableKeyById: Map<string, string> }): WorkflowTrigger {
    const withoutConnections = workflowTransferUtils.stripUnavailableConnections({
        trigger: workflowTransferUtils.clearSampleData(trigger),
        isAvailable: () => false,
    }).trigger
    const idMap = new Map([...tableKeyById.entries()].map(([id, key]) => [id, solutionUtils.tablePlaceholder(key)]))
    return workflowTransferUtils.remapIds({ trigger: withoutConnections, idMap })
}

function referencedTableKeys(trigger: WorkflowTrigger): string[] {
    return workflowStructureUtil.getAllSteps(trigger).flatMap((step) => collectPlaceholders(step.settings?.input))
}

function collectPlaceholders(value: unknown): string[] {
    if (typeof value === 'string') {
        return solutionUtils.isTablePlaceholder(value) ? [value.slice('table:'.length)] : []
    }
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectPlaceholders(item))
    }
    if (typeof value === 'object' && value !== null) {
        return Object.values(value).flatMap((item) => collectPlaceholders(item))
    }
    return []
}

function connectorSlots({ workflows }: { workflows: { key: string, trigger: WorkflowTrigger }[] }): SolutionConnectionSlot[] {
    const usage = workflows.flatMap((workflow) => workflowStructureUtil.getAllSteps(workflow.trigger)
        .filter((step) => workflowTransferUtils.referencedConnectionIds(step.settings?.input?.auth).length > 0 || hasAuthPlaceholder(step.settings?.input?.auth))
        .map((step) => ({ connectorName: connectorNameOf(step.settings), workflowKey: workflow.key })))
        .filter((entry): entry is { connectorName: string, workflowKey: string } => !isNil(entry.connectorName))
    const names = [...new Set(usage.map((entry) => entry.connectorName))]
    return names.map((connectorName) => ({
        connectorName,
        usedBy: [...new Set(usage.filter((entry) => entry.connectorName === connectorName).map((entry) => entry.workflowKey))],
    }))
}

function hasAuthPlaceholder(auth: unknown): boolean {
    return typeof auth === 'string' && auth.includes('{{connections')
}

function connectorNameOf(settings: unknown): string | null {
    if (typeof settings !== 'object' || settings === null || !('connectorName' in settings)) {
        return null
    }
    return typeof settings.connectorName === 'string' ? settings.connectorName : null
}

function instantiate({ workflow, items, config, connections, tableIdByKey }: InstantiateParams): WorkflowTrigger {
    const idMap = new Map([...tableIdByKey.entries()].map(([key, id]) => [solutionUtils.tablePlaceholder(key), id]))
    const withTables = workflowTransferUtils.remapIds({ trigger: workflow.trigger, idMap })
    const patches = items.flatMap((item) => item.patches
        .filter((patch) => patch.workflowKey === workflow.key)
        .map((patch) => ({ patch, selected: config[item.key] ?? item.defaultValue })))
    const transformed = workflowStructureUtil.transferStep(structuredClone(withTables), (step) => {
        const settings = step.settings
        if (typeof settings !== 'object' || settings === null || !('input' in settings) || typeof settings.input !== 'object' || settings.input === null) {
            return step
        }
        const connectorName = connectorNameOf(settings)
        const externalId = isNil(connectorName) ? undefined : connections[connectorName]
        const patched = patches
            .filter(({ patch }) => patch.stepName === step.name)
            .reduce<Record<string, unknown>>((input, { patch, selected }) => ({ ...input, [patch.inputKey]: solutionUtils.patchValue({ patch, selected }) }), { ...settings.input })
        const withAuth = isNil(externalId) || !wantsAuth(step) ? patched : { ...patched, auth: `{{connections['${externalId}']}}` }
        return { ...step, settings: { ...settings, input: withAuth } }
    })
    return workflowTransferUtils.asTrigger({ original: workflow.trigger, candidate: transformed })
}

function wantsAuth(step: { settings?: unknown }): boolean {
    return typeof step.settings === 'object' && step.settings !== null && 'connectorName' in step.settings
}

type BuildPackageParams = {
    workflows: SolutionWorkflow[]
    tables: (SolutionMappingTable & { id: string })[]
    manualChecks: { label: string, detail?: string, who?: string }[]
}

type InstantiateParams = {
    workflow: SolutionWorkflow
    items: SolutionConfigItem[]
    config: Record<string, string>
    connections: Record<string, string>
    tableIdByKey: Map<string, string>
}
