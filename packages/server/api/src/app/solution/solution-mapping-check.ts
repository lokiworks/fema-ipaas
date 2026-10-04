import { dataMapping, MappingSpec } from '@fema-ipaas/core-utils'
import { SolutionPackage, solutionUtils, WorkflowActionType, workflowStructureUtil } from '@fema-ipaas/shared'

export const solutionMappingCheck = {
    problems,
}

function problems({ pkg }: { pkg: SolutionPackage }): string[] {
    const knownTables = new Set(pkg.mappingTables.map((table) => solutionUtils.tablePlaceholder(table.key)))
    return pkg.workflows.flatMap((workflow) => workflowStructureUtil.getAllSteps(workflow.trigger).flatMap((step) => {
        if (step.type !== WorkflowActionType.CONNECTOR || step.settings.connectorName !== DATA_MAPPER_CONNECTOR || step.settings.actionName !== MAP_FIELDS_ACTION || step.skip === true) {
            return []
        }
        const parsed = MappingSpec.safeParse(readMapping(step.settings.input))
        if (!parsed.success) {
            return []
        }
        const where = `${workflow.name} · ${step.displayName}`
        return [
            ...dataMapping.blockingIssues(dataMapping.validateSpec(parsed.data)).map((found) => `${where}：${describe(found)}`),
            ...dataMapping.lookupTableIds(parsed.data).filter((id) => !knownTables.has(id)).map(() => `${where}：映射表不在方案里`),
        ]
    }))
}

function describe(found: Parameters<typeof dataMapping.describeIssue>[0]): string {
    return found.target.length > 0 ? `字段「${found.target}」${dataMapping.describeIssue(found)}` : dataMapping.describeIssue(found)
}

function readMapping(input: unknown): unknown {
    return typeof input === 'object' && input !== null ? Reflect.get(input, 'mapping') : undefined
}

const DATA_MAPPER_CONNECTOR = '@fema-ipaas/connector-data-mapper'
const MAP_FIELDS_ACTION = 'map_fields'
