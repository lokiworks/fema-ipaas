import { ApplicationError, ErrorCode, isNil, unique } from '@fema-ipaas/core-utils'
import { connectionAccessUtils, ConnectionMcpServiceReference, ConnectionProjectConfigReference, ConnectionProjectRef, ConnectionReferences, ConnectionWorkflowReference, PopulatedWorkflow } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { In, IsNull } from 'typeorm'
import { repoFactory } from '../core/db/repo-factory'
import { McpServiceEntity } from '../mcp-service/mcp-service.entity'
import { projectRepo } from '../project/project-repo'
import { ConnectionReplacementEntity } from '../release/release.entity'
import { workflowService } from '../workflows/workflow/workflow.service'
import { ConnectionSchema } from './connection.entity'

const mcpServiceReferenceRepo = repoFactory(McpServiceEntity)
const connectionReplacementReferenceRepo = repoFactory(ConnectionReplacementEntity)

export const connectionReferenceService = (log: FastifyBaseLogger) => ({
    async workflowReferences({ tenantId, connections }: WorkflowReferencesParams): Promise<Map<string, ConnectionWorkflowReference[]>> {
        const externalIds = unique(connections.map((connection) => connection.externalId))
        if (externalIds.length === 0) {
            return new Map()
        }
        const page = await workflowService(log).list({
            tenantId,
            cursorRequest: null,
            connectionExternalIds: externalIds,
            includeTriggerSource: false,
        })
        const projects = await this.projectRefs({ tenantId, projectIds: unique(page.data.map((workflow) => workflow.projectId)) })
        return new Map(connections.map((connection) => [connection.id, page.data
            .filter((workflow) => referencesConnection({ workflow, connection }))
            .map((workflow) => ({
                workflowId: workflow.id,
                displayName: workflow.version.displayName,
                projectId: workflow.projectId,
                projectDisplayName: projects.get(workflow.projectId)?.displayName ?? '',
            }))]))
    },

    async projectRefs({ tenantId, projectIds }: { tenantId: string, projectIds: string[] }): Promise<Map<string, ConnectionProjectRef>> {
        if (projectIds.length === 0) {
            return new Map()
        }
        const projects = await projectRepo().find({
            where: { id: In(projectIds), tenantId, deleted: IsNull() },
            select: ['id', 'displayName'],
        })
        return new Map(projects.map((project) => [project.id, { id: project.id, displayName: project.displayName }]))
    },

    async references({ tenantId, connection, memberProjectIds }: ReferencesParams): Promise<ConnectionReferences> {
        const workflows = (await this.workflowReferences({ tenantId, connections: [connection] })).get(connection.id) ?? []
        const visibleWorkflows = workflows.filter((workflow) => memberProjectIds.includes(workflow.projectId))
        const [mcpServices, projectConfigs] = await Promise.all([
            this.mcpServiceReferences({ tenantId, connection }),
            this.projectConfigReferences({ tenantId, connection }),
        ])
        const visibleMcpServices = mcpServices.filter((service) => memberProjectIds.includes(service.projectId))
        const visibleProjectConfigs = projectConfigs.filter((config) => memberProjectIds.includes(config.projectId))
        return {
            workflows: visibleWorkflows,
            hiddenWorkflowCount: workflows.length - visibleWorkflows.length,
            mcpServices: visibleMcpServices,
            hiddenMcpServiceCount: mcpServices.length - visibleMcpServices.length,
            projectConfigs: visibleProjectConfigs,
            hiddenProjectConfigCount: projectConfigs.length - visibleProjectConfigs.length,
        }
    },

    async assertUnreferenced({ tenantId, connection }: AssertUnreferencedParams): Promise<void> {
        const [workflowsByConnection, mcpServices, replacements] = await Promise.all([
            this.workflowReferences({ tenantId, connections: [connection] }),
            this.mcpServiceReferences({ tenantId, connection }),
            connectionReplacementReferenceRepo().find({
                where: [{ sourceConnectionId: connection.id }, { targetConnectionId: connection.id }],
            }),
        ])
        const message = connectionReferenceUtils.blockingMessage({
            workflowCount: (workflowsByConnection.get(connection.id) ?? []).length,
            mcpServiceCount: mcpServices.length,
            environmentReplacementCount: replacements.length,
        })
        if (!isNil(message)) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
        }
    },

    async mcpServiceReferences({ tenantId, connection }: { tenantId: string, connection: ReferenceConnection }): Promise<ConnectionMcpServiceReference[]> {
        const services = await mcpServiceReferenceRepo()
            .createQueryBuilder('service')
            .innerJoin('project', 'project', 'project.id = service."projectId"')
            .where('project."tenantId" = :tenantId', { tenantId })
            .andWhere('EXISTS (SELECT 1 FROM jsonb_each_text(service."fixedConnections") AS fixed WHERE fixed.value = :externalId)', { externalId: connection.externalId })
            .select(['service.id', 'service.name', 'service.projectId'])
            .getMany()
        return services
            .filter((service) => connectionAccessUtils.isAvailableInProject({ connection, projectId: service.projectId }))
            .map((service) => ({ serviceId: service.id, name: service.name, projectId: service.projectId }))
    },

    async projectConfigReferences({ tenantId, connection }: { tenantId: string, connection: ReferenceConnection }): Promise<ConnectionProjectConfigReference[]> {
        const replacements = await connectionReplacementReferenceRepo().find({
            where: [
                { sourceConnectionId: connection.id },
                { targetConnectionId: connection.id },
            ],
        })
        const projects = await this.projectRefs({ tenantId, projectIds: unique(replacements.map((replacement) => replacement.projectId)) })
        return replacements.map((replacement) => ({
            id: replacement.id,
            projectId: replacement.projectId,
            projectDisplayName: projects.get(replacement.projectId)?.displayName ?? '',
            role: replacement.sourceConnectionId === connection.id ? 'SOURCE' : 'TARGET',
        }))
    },
})

export const connectionReferenceUtils = {
    blockingMessage({ workflowCount, mcpServiceCount, environmentReplacementCount }: BlockingCounts): string | null {
        const parts = [
            workflowCount > 0 ? `${workflowCount} workflows` : null,
            mcpServiceCount > 0 ? `${mcpServiceCount} MCP services` : null,
            environmentReplacementCount > 0 ? `${environmentReplacementCount} environment connection replacements` : null,
        ].filter((part): part is string => !isNil(part))
        return parts.length === 0 ? null : `Connection is still used by ${parts.join(', ')}. Replace it there before deleting it`
    },
}

function referencesConnection({ workflow, connection }: { workflow: PopulatedWorkflow, connection: ReferenceConnection }): boolean {
    const connectionIds = workflow.version?.connectionIds
    if (isNil(connectionIds) || !connectionIds.includes(connection.externalId)) {
        return false
    }
    return connectionAccessUtils.isAvailableInProject({ connection, projectId: workflow.projectId })
}

type BlockingCounts = {
    workflowCount: number
    mcpServiceCount: number
    environmentReplacementCount: number
}

type AssertUnreferencedParams = {
    tenantId: string
    connection: ReferenceConnection
}

type ReferenceConnection = Pick<ConnectionSchema, 'id' | 'externalId' | 'scope' | 'projectIds' | 'preSelectForNewProjects'>

type WorkflowReferencesParams = {
    tenantId: string
    connections: ReferenceConnection[]
}

type ReferencesParams = {
    tenantId: string
    connection: ReferenceConnection
    memberProjectIds: string[]
}
