import { ConnectorMetadataModel, PropertyType } from '@fema-ipaas/connector-sdk'
import { AgentMcpServerInfo, ApplicationError, dataMapping, ErrorCode, isNil, MappingIssueCode, MappingIssueSeverity, MappingSpec, ProjectId, TenantId } from '@fema-ipaas/core-utils'
import { connectionAccessUtils, WorkflowActionType, workflowConnectorUtil, workflowStructureUtil, WorkflowTriggerType, WorkflowVersion } from '@fema-ipaas/shared'
import deepEqual from 'deep-equal'
import { FastifyBaseLogger } from 'fastify'
import { connectionsRepo } from '../../connection/connection-service/connection-service'
import { connectorMetadataService } from '../../connectors/metadata/connector-metadata-service'
import { mappingTableService } from '../../mapping-table/mapping-table.service'
import { ConnectorSpec, ConnectorSpecStatus, OperationSpec, PublishValidationContext, workflowPublishValidator } from './workflow-publish-validator'

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
    const problems = await mappingProblems({ version, projectId, log })
    if (problems.length > 0) {
        throw new ApplicationError({
            code: ErrorCode.VALIDATION,
            params: { message: `字段映射还有问题，修好后才能发布。${problems.join('；')}` },
        })
    }
}

async function assertPublishable({ version, projectId, tenantId, log, checkConnections }: AssertPublishableParams): Promise<void> {
    assertNoPendingReview({ version })
    const [context, mappings] = await Promise.all([
        loadValidationContext({ version, projectId, tenantId, log, checkConnections }),
        mappingProblems({ version, projectId, log }),
    ])
    const problems = workflowPublishValidator.find({ version, context })
    if (problems.length === 0 && mappings.length === 0) {
        return
    }
    const base = problems.length > 0 ? workflowPublishValidator.describe(problems) : '流程还不能发布，修好后才能发布'
    throw new ApplicationError({
        code: ErrorCode.VALIDATION,
        params: { message: mappings.length > 0 ? `${base}。字段映射还有问题：${mappings.join('；')}` : base },
    })
}

async function loadValidationContext({ version, projectId, tenantId, log, checkConnections }: { version: WorkflowVersion, projectId: ProjectId, tenantId: TenantId, log: FastifyBaseLogger, checkConnections: boolean }): Promise<PublishValidationContext> {
    const refs = connectorRefsOf(version)
    const loaded = await Promise.all(refs.map(async (ref) => {
        const model = await connectorMetadataService(log).get({ name: ref.name, version: ref.version, projectId, tenantId })
        return [ref.name, isNil(model) ? MISSING_CONNECTOR : specOf(model)] satisfies [string, ConnectorSpec]
    }))
    const connectionIds = checkConnections ? await loadConnectionIds({ projectId, tenantId }) : null
    const mcpServers = checkConnections && hasAgentStep(version) ? await loadMcpServers({ projectId, tenantId, log }) : null
    return { connectors: Object.fromEntries(loaded), connectionIds, mcpServers }
}

async function loadMcpServers({ projectId, tenantId, log }: { projectId: ProjectId, tenantId: TenantId, log: FastifyBaseLogger }): Promise<AgentMcpServerInfo[]> {
    const { mcpServerService } = await import('../../mcp-server/mcp-server.service')
    return mcpServerService(log).infoForProject({ tenantId, projectId })
}

function hasAgentStep(version: WorkflowVersion): boolean {
    return workflowStructureUtil.getAllSteps(version.trigger).some((step) =>
        step.type === WorkflowActionType.CONNECTOR && step.settings.connectorName === AI_CONNECTOR && step.settings.actionName === AGENT_ACTION)
}

async function loadConnectionIds({ projectId, tenantId }: { projectId: ProjectId, tenantId: TenantId }): Promise<Set<string>> {
    const connections = await connectionsRepo().find({ where: { tenantId }, select: ['externalId', 'scope', 'projectIds', 'preSelectForNewProjects'] })
    return new Set(connections.filter((connection) => connectionAccessUtils.isAvailableInProject({ connection, projectId })).map((connection) => connection.externalId))
}

function connectorRefsOf(version: WorkflowVersion): { name: string, version: string }[] {
    const refs = workflowStructureUtil.getAllSteps(version.trigger).flatMap((step) =>
        step.type === WorkflowActionType.CONNECTOR || step.type === WorkflowTriggerType.CONNECTOR
            ? [{ name: step.settings.connectorName, version: workflowConnectorUtil.getExactVersion(step.settings.connectorVersion) }]
            : [],
    )
    return [...new Map(refs.map((ref) => [`${ref.name}@${ref.version}`, ref])).values()]
}

function specOf(model: ConnectorMetadataModel): ConnectorSpec {
    return {
        status: ConnectorSpecStatus.LOADED,
        requiresAuth: !isNil(model.auth),
        actions: operationsOf(model.actions),
        triggers: operationsOf(model.triggers),
    }
}

function operationsOf(operations: Record<string, RawOperation>): Record<string, OperationSpec> {
    return Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, {
        requiresAuth: operation.requireAuth !== false,
        props: Object.entries(operation.props)
            .filter(([, prop]) => !IGNORED_PROP_TYPES.includes(prop.type))
            .map(([propName, prop]) => ({ name: propName, displayName: prop.displayName, required: prop.required })),
    }]))
}

async function mappingProblems({ version, projectId, log }: { version: WorkflowVersion, projectId: ProjectId, log: FastifyBaseLogger }): Promise<string[]> {
    const mappingSteps = workflowStructureUtil.getAllSteps(version.trigger).flatMap((step) => {
        if (step.type !== WorkflowActionType.CONNECTOR || step.settings.connectorName !== DATA_MAPPER_CONNECTOR || step.settings.actionName !== MAP_FIELDS_ACTION || step.skip === true) {
            return []
        }
        const parsed = MappingSpec.safeParse(readMapping(step.settings.input))
        return parsed.success ? [{ displayName: step.displayName, spec: parsed.data }] : []
    })
    if (mappingSteps.length === 0) {
        return []
    }
    const knownTables = new Set((await mappingTableService(log).list({ projectId })).map((table) => table.id))
    return mappingSteps.flatMap(({ displayName, spec }) => [
        ...dataMapping.blockingIssues(dataMapping.validateSpec(spec)).map((found) => `${displayName}：${describeMappingIssue(found)}`),
        ...dataMapping.lookupTableIds(spec).filter((id) => !knownTables.has(id)).map(() => `${displayName}：${dataMapping.describeIssue({ code: MappingIssueCode.LOOKUP_TABLE_NOT_FOUND, rowId: null, target: '', severity: MAPPING_ERROR, params: {} })}`),
    ])
}

function describeMappingIssue(found: Parameters<typeof dataMapping.describeIssue>[0]): string {
    return found.target.length > 0 ? `字段「${found.target}」${dataMapping.describeIssue(found)}` : dataMapping.describeIssue(found)
}

function readMapping(input: unknown): unknown {
    return typeof input === 'object' && input !== null ? Reflect.get(input, 'mapping') : undefined
}

const AI_CONNECTOR = '@fema-ipaas/connector-ai'
const AGENT_ACTION = 'run_agent'
const DATA_MAPPER_CONNECTOR = '@fema-ipaas/connector-data-mapper'
const MAP_FIELDS_ACTION = 'map_fields'
const MAPPING_ERROR = MappingIssueSeverity.ERROR
const MISSING_CONNECTOR: ConnectorSpec = { status: ConnectorSpecStatus.MISSING }
const IGNORED_PROP_TYPES: PropertyType[] = [PropertyType.MARKDOWN, PropertyType.DYNAMIC, PropertyType.CHECKBOX]

export const workflowPublishUtils = { isSameTrigger, assertNoPendingReview, assertMappingsValid, assertPublishable }

type IsSameTriggerParams = {
    published: WorkflowVersion['trigger']
    toPublish: WorkflowVersion['trigger']
}

type AssertPublishableParams = {
    version: WorkflowVersion
    projectId: ProjectId
    tenantId: TenantId
    log: FastifyBaseLogger
    checkConnections: boolean
}

type RawOperation = {
    requireAuth?: boolean | undefined
    props: Record<string, { displayName: string, required: boolean, type: PropertyType }>
}
