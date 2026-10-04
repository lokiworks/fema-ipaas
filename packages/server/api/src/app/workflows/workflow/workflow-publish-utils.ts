import { ApplicationError, dataMapping, ErrorCode, MappingIssueCode, MappingIssueSeverity, MappingSpec, ProjectId } from '@fema-ipaas/core-utils'
import { WorkflowActionType, WorkflowTriggerType, workflowStructureUtil, WorkflowVersion } from '@fema-ipaas/shared'
import deepEqual from 'deep-equal'
import { FastifyBaseLogger } from 'fastify'
import { mappingTableService } from '../../mapping-table/mapping-table.service'

function isSameTrigger({ published, toPublish }: IsSameTriggerParams): boolean {
    return published.type === WorkflowTriggerType.CONNECTOR
        && toPublish.type === WorkflowTriggerType.CONNECTOR
        && published.settings.connectorName === toPublish.settings.connectorName
        && published.settings.triggerName === toPublish.settings.triggerName
        && deepEqual(published.settings.input, toPublish.settings.input)
}

function assertNoPendingReview({ version }: { version: WorkflowVersion }): void {
    const pending = workflowStructureUtil.getAllSteps(version.trigger)
        .filter((step) => step.type !== WorkflowTriggerType.EMPTY && step.settings.pendingReview === true)
        .map((step) => step.displayName)
    if (pending.length > 0) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: `Confirm every AI-generated step before publishing. Not confirmed yet: ${pending.join(', ')}` },
        })
    }
}

async function assertMappingsValid({ version, projectId, log }: { version: WorkflowVersion, projectId: ProjectId, log: FastifyBaseLogger }): Promise<void> {
    const mappingSteps = workflowStructureUtil.getAllSteps(version.trigger).flatMap((step) => {
        if (step.type !== WorkflowActionType.CONNECTOR || step.settings.connectorName !== DATA_MAPPER_CONNECTOR || step.settings.actionName !== MAP_FIELDS_ACTION || step.skip === true) {
            return []
        }
        const parsed = MappingSpec.safeParse(readMapping(step.settings.input))
        return parsed.success ? [{ displayName: step.displayName, spec: parsed.data }] : []
    })
    if (mappingSteps.length === 0) {
        return
    }
    const knownTables = new Set((await mappingTableService(log).list({ projectId })).map((table) => table.id))
    const problems = mappingSteps.flatMap(({ displayName, spec }) => [
        ...dataMapping.blockingIssues(dataMapping.validateSpec(spec)).map((found) => `${displayName}：${describeMappingIssue(found)}`),
        ...dataMapping.lookupTableIds(spec).filter((id) => !knownTables.has(id)).map(() => `${displayName}：${dataMapping.describeIssue({ code: MappingIssueCode.LOOKUP_TABLE_NOT_FOUND, rowId: null, target: '', severity: MAPPING_ERROR, params: {} })}`),
    ])
    if (problems.length > 0) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: `字段映射还有问题，修好后才能发布。${problems.join('；')}` },
        })
    }
}

function describeMappingIssue(found: Parameters<typeof dataMapping.describeIssue>[0]): string {
    return found.target.length > 0 ? `字段「${found.target}」${dataMapping.describeIssue(found)}` : dataMapping.describeIssue(found)
}

function readMapping(input: unknown): unknown {
    return typeof input === 'object' && input !== null ? Reflect.get(input, 'mapping') : undefined
}

const DATA_MAPPER_CONNECTOR = '@fema-ipaas/connector-data-mapper'
const MAP_FIELDS_ACTION = 'map_fields'
const MAPPING_ERROR = MappingIssueSeverity.ERROR

export const workflowPublishUtils = { isSameTrigger, assertNoPendingReview, assertMappingsValid }

type IsSameTriggerParams = {
    published: WorkflowVersion['trigger']
    toPublish: WorkflowVersion['trigger']
}
