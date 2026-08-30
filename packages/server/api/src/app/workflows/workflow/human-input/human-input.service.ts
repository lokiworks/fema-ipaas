import { ApplicationError, ErrorCode, isNil, WorkflowId } from '@fema-ipaas/core-utils'
import { ChatUIResponse, FormInputType, FormResponse, PopulatedWorkflow } from '@fema-ipaas/shared'
import { FastifyBaseLogger } from 'fastify'
import { connectorMetadataService } from '../../../connectors/metadata/connector-metadata-service'
import { projectService } from '../../../project/project-service'
import { tenantService } from '../../../tenant/tenant.service'
import { workflowVersionService } from '../../workflow-version/workflow-version.service'
import { workflowRepo } from '../workflow.repo'

const FORMS_CONNECTOR_NAME = '@fema-ipaas/connector-forms'
const FORM_TRIIGGER = 'form_submission'
const FILE_TRIGGER = 'file_submission'
const SIMPLE_FILE_PROPS = {
    inputs: [
        {
            displayName: 'File',
            description: '',
            type: FormInputType.FILE,
            required: true,
        },
    ],
    waitForResponse: true,
}
const FORMS_TRIGGER_NAMES = [
    FORM_TRIIGGER,
    FILE_TRIGGER,
]

function isFormTrigger(workflow: PopulatedWorkflow | null): workflow is PopulatedWorkflow {
    if (isNil(workflow)) {
        return false
    }
    const triggerSettings = workflow.version.trigger.settings
    return triggerSettings.connectorName === FORMS_CONNECTOR_NAME && FORMS_TRIGGER_NAMES.includes(triggerSettings.triggerName)
}

export const humanInputService = (log: FastifyBaseLogger) => ({
    getFormByWorkflowIdOrThrow: async (workflowId: string, useDraft: boolean): Promise<FormResponse> => {
        const workflow = await getPopulatedWorkflowById(log, workflowId, useDraft)
        if (!isFormTrigger(workflow)) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'workflow_form',
                    entityId: workflowId,
                    message: 'Workflow form not found in draft version of workflow.',
                },
            })
        }
        const connectorVersion = await connectorMetadataService(log).resolveExactVersion({
            name: FORMS_CONNECTOR_NAME,
            version: workflow.version.trigger.settings.connectorVersion,
            tenantId: await projectService(log).getTenantId(workflow.projectId),
        })
        const triggerSettings = workflow.version.trigger.settings
        return {
            id: workflow.id,
            title: workflow.version.displayName,
            props: triggerSettings.triggerName === FILE_TRIGGER ? SIMPLE_FILE_PROPS : triggerSettings.input,
            projectId: workflow.projectId,
            version: connectorVersion,
        }
    },
    getChatUIByWorkflowIdOrThrow: async (workflowId: string, useDraft: boolean): Promise<ChatUIResponse> => {
        const workflow = await getPopulatedWorkflowById(log, workflowId, useDraft)
        if (!workflow
            || workflow.version.trigger.settings.triggerName !== 'chat_submission'
            || workflow.version.trigger.settings.connectorName !== FORMS_CONNECTOR_NAME) {
            throw new ApplicationError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'workflow_form',
                    entityId: workflowId,
                    message: 'Workflow chat ui not found in draft version of workflow.',
                },
            })
        }
        const tenantId = await projectService(log).getTenantId(workflow.projectId)
        const tenant = await tenantService(log).getOneOrThrow(tenantId)
        return {
            id: workflow.id,
            title: workflow.version.displayName,
            props: workflow.version.trigger.settings.input,
            projectId: workflow.projectId,
            tenantLogoUrl: tenant.logoIconUrl,
            tenantName: tenant.name,
        }
    },
})

async function getPopulatedWorkflowById(log: FastifyBaseLogger, id: WorkflowId, useDraft: boolean): Promise<PopulatedWorkflow | null> {
    const workflow = await workflowRepo().findOneBy({ id })
    if (isNil(workflow) || (isNil(workflow.publishedVersionId) && !useDraft)) {
        return null
    }
    const workflowVersion = await workflowVersionService(log).getWorkflowVersionOrThrow({
        workflowId: id,
        versionId: useDraft ? undefined : workflow.publishedVersionId!,
    })
    return {
        ...workflow,
        version: workflowVersion,
    }
}