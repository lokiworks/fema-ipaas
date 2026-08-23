import { ApplicationError, ErrorCode, sanitizeObjectForPostgresql, TenantId } from '@fema-ipaas/core-utils'
import { workflowConnectorUtil, WorkflowOperationRequest, workflowOperations, WorkflowOperationType, WorkflowVersion, WorkflowVersionState, WorkflowVersionTemplate } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { workflowVersionValidationUtil } from '../workflows/workflow-version/workflow-version-validator-util'

function createMinimalWorkflowVersion(template: WorkflowVersionTemplate): WorkflowVersion {
    return {
        ...template,
        id: 'temp-id',
        workflowId: 'temp-workflow-id',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        state: WorkflowVersionState.DRAFT,
        updatedBy: null,
        agentIds: [],
        connectionIds: [],
        backupFiles: null,
        notes: template.notes ?? [],
    }
}

type PreparedTemplate = {
    workflows: WorkflowVersionTemplate[]
    connectors: string[]
}

export const templateValidator = {
    async validateAndPrepare({ workflows, tenantId, log }: ValidateParams): Promise<PreparedTemplate> {
        if (!workflows || workflows.length === 0) {
            throw new ApplicationError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: 'Workflows are required',
                },
            })
        }
        
        await Promise.all(workflows.map(async (workflow) => {
            const minimalWorkflowVersion = createMinimalWorkflowVersion(workflow)
            
            const importRequest = {
                displayName: workflow.displayName,
                trigger: workflow.trigger,
                schemaVersion: workflow.schemaVersion,
            }

            const importOperation: WorkflowOperationRequest = { 
                type: WorkflowOperationType.IMPORT_WORKFLOW, 
                request: importRequest, 
            }

            const validator = workflowVersionValidationUtil(log)

            await validator.prepareRequest({ tenantId, request: importOperation, userId: null })
            
            workflowOperations.apply(minimalWorkflowVersion, importOperation)
        }))

        const sanitizedWorkflows = workflows.map((workflow) => sanitizeObjectForPostgresql(workflow))
        const connectors = Array.from(new Set(sanitizedWorkflows.map((workflow) => workflowConnectorUtil.getUsedConnectors(workflow.trigger)).flat()))

        return {
            workflows: sanitizedWorkflows,
            connectors,
        }
    },
}

type ValidateParams = {
    workflows: WorkflowVersionTemplate[] | undefined
    tenantId?: TenantId
    log: FastifyBaseLogger
}