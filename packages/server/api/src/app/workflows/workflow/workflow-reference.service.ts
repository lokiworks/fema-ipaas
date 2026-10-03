import { ApplicationError, ErrorCode, isNil } from '@fema-ipaas/core-utils'
import { McpToolSourceType, PopulatedWorkflow, WorkflowActionType, workflowStructureUtil, WorkflowTrigger } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../../core/db/repo-factory'
import { McpServiceEntity } from '../../mcp-service/mcp-service.entity'
import { workflowService } from './workflow.service'

const mcpServiceRepo = repoFactory(McpServiceEntity)

export const workflowReferenceService = (log: FastifyBaseLogger) => ({
    async assertNotReferenced({ workflow, ignoredCallerIds = [] }: AssertNotReferencedParams): Promise<void> {
        const [callers, mcpServices] = await Promise.all([
            this.callerWorkflows({ workflow, ignoredCallerIds }),
            this.mcpServiceNames({ workflow }),
        ])
        const message = workflowReferenceUtils.blockingMessage({
            callerNames: callers.map((caller) => caller.version.displayName),
            mcpServiceNames: mcpServices,
        })
        if (!isNil(message)) {
            throw new ApplicationError({ code: ErrorCode.VALIDATION, params: { message } })
        }
    },

    async callerWorkflows({ workflow, ignoredCallerIds = [] }: AssertNotReferencedParams): Promise<PopulatedWorkflow[]> {
        const page = await workflowService(log).list({ projectIds: [workflow.projectId], cursorRequest: null, includeTriggerSource: false })
        return page.data.filter((candidate) => candidate.id !== workflow.id && !ignoredCallerIds.includes(candidate.id) && workflowReferenceUtils.callsSubflow({ candidate, target: workflow }))
    },

    async mcpServiceNames({ workflow }: AssertNotReferencedParams): Promise<string[]> {
        const services = await mcpServiceRepo()
            .createQueryBuilder('service')
            .where('service."projectId" = :projectId', { projectId: workflow.projectId })
            .andWhere('EXISTS (SELECT 1 FROM jsonb_array_elements(service.tools) AS tool WHERE tool->\'source\'->>\'type\' = :sourceType AND tool->\'source\'->>\'workflowId\' = :workflowId)', {
                sourceType: McpToolSourceType.WORKFLOW,
                workflowId: workflow.id,
            })
            .select(['service.id', 'service.name'])
            .getMany()
        return services.map((service) => service.name)
    },
})

export const workflowReferenceUtils = {
    callsSubflow({ candidate, target }: { candidate: { version: { trigger: WorkflowTrigger } }, target: { externalId: string } }): boolean {
        return workflowStructureUtil.getAllSteps(candidate.version.trigger).some((step) =>
            step.type === WorkflowActionType.CONNECTOR
            && step.settings.connectorName === SUBFLOWS_CONNECTOR
            && readTargetId(step.settings.input) === target.externalId,
        )
    },

    blockingMessage({ callerNames, mcpServiceNames }: BlockingParams): string | null {
        const parts = [
            callerNames.length > 0 ? `called by workflows ${callerNames.join(', ')}` : null,
            mcpServiceNames.length > 0 ? `used as a tool by MCP services ${mcpServiceNames.join(', ')}` : null,
        ].filter((part): part is string => !isNil(part))
        return parts.length === 0 ? null : `This workflow is ${parts.join(' and ')}. Remove those references before deleting it`
    },
}

function readTargetId(input: unknown): unknown {
    return typeof input === 'object' && input !== null && 'workflowId' in input ? input.workflowId : undefined
}

const SUBFLOWS_CONNECTOR = '@fema-ipaas/connector-subflows'

type AssertNotReferencedParams = {
    workflow: PopulatedWorkflow
    ignoredCallerIds?: string[]
}

type BlockingParams = {
    callerNames: string[]
    mcpServiceNames: string[]
}
